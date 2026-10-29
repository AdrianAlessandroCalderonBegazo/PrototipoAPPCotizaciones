/// <reference types="node" />
// ERP · Fase 2 en Finanzas 1: gastos de proyecto (categoría «Gasto de proyecto» con un proyecto activo del ERP)
// y los fondos que llegan desde la cuenta principal (movimiento FONDO, solo lectura aquí).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { applyMigrations, pgliteDb, type Db } from "./db";
import { authDesdeEntorno } from "./auth";
import { memoryStorage } from "./storage";
import { sinEspejo } from "./erp";
import { crearServicio } from "./service";
import { crearServidor } from "./server";

const HOY = "2026-10-22";
let db: Db;
let base = "";
let server: ReturnType<typeof crearServidor>;

before(async () => {
  db = await pgliteDb();
  await applyMigrations(db);
  const env = { AUTH_MODE: "dev" } as NodeJS.ProcessEnv;
  server = crearServidor({ auth: authDesdeEntorno(env), svc: crearServicio({ db, storage: memoryStorage(), mirror: sinEspejo, env, hoy: () => HOY }) });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await db.close();
});

const CONTA = "dev:carla:contabilidad";
async function call(method: string, path: string, body?: unknown, user = CONTA) {
  const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${user}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, data: j.data, error: j.error };
}
let n = 0;
const uid = () => `30000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const gasto = (p: Record<string, unknown> = {}) => ({ ciudad: "AQP", fecha: HOY, descripcion: "Pernos", persona: "Luis", categoria: "Gasto de proyecto", monto: 45.5, ...p });

test("sin la tabla de proyectos del ERP la app sigue funcionando y lo dice", async () => {
  const r = await call("GET", "/caja/proyectos");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { disponible: false, proyectos: [] });
  const g = await call("PUT", `/caja-chica/movimientos/${uid()}`, gasto({ proyecto_id: 1 }));
  assert.equal(g.status, 503);
  // los demás gastos no se ven afectados
  assert.equal((await call("PUT", `/caja-chica/movimientos/${uid()}`, gasto({ categoria: "Movilidad" }))).status, 200);
});

test("la lista muestra solo los proyectos activos", async () => {
  await db.exec(`CREATE TABLE proyectos (id serial PRIMARY KEY, codigo text, nombre text, estado text);
    INSERT INTO proyectos (codigo, nombre, estado) VALUES ('PRY-001', 'Lácteos Characato', 'activo'), ('PRY-002', 'Hostal Los Tambos', 'pausado'), ('PRY-003', 'Granja', 'finalizado'), ('PRY-004', 'Clínica', 'activo');`);
  const r = await call("GET", "/caja/proyectos");
  assert.equal(r.data.disponible, true);
  assert.deepEqual(r.data.proyectos.map((p: any) => p.codigo), ["PRY-004", "PRY-001"]);
});

test("«Gasto de proyecto» exige un proyecto activo; se guarda con su nombre", async () => {
  assert.equal((await call("PUT", `/caja-chica/movimientos/${uid()}`, gasto())).error?.code, "FALTA_PROYECTO");
  assert.equal((await call("PUT", `/caja-chica/movimientos/${uid()}`, gasto({ proyecto_id: 99 }))).error?.code, "PROYECTO_NO_EXISTE");
  assert.equal((await call("PUT", `/caja-chica/movimientos/${uid()}`, gasto({ proyecto_id: 2 }))).error?.code, "PROYECTO_NO_ACTIVO");
  assert.equal((await call("PUT", `/caja-chica/movimientos/${uid()}`, gasto({ proyecto_id: 3 }))).status, 409);
  const id = uid();
  const r = await call("PUT", `/caja-chica/movimientos/${id}`, gasto({ proyecto_id: 1 }));
  assert.equal(r.status, 200, JSON.stringify(r.error));
  assert.equal(r.data.movimiento.proyecto_id, 1);
  assert.equal(r.data.movimiento.proyecto_nombre, "Lácteos Characato");
  // reintento idéntico: no cambia la versión
  const otra = await call("PUT", `/caja-chica/movimientos/${id}`, gasto({ proyecto_id: 1 }));
  assert.equal(otra.data.movimiento.version, r.data.movimiento.version);
  // si el proyecto se pausa después, el gasto se puede seguir corrigiendo sin perder su proyecto
  await db.exec(`UPDATE proyectos SET estado = 'pausado' WHERE id = 1`);
  const edit = await call("PUT", `/caja-chica/movimientos/${id}`, { ...gasto({ proyecto_id: 1, monto: 50 }), version: otra.data.movimiento.version });
  assert.equal(edit.status, 200, JSON.stringify(edit.error));
  assert.equal(edit.data.movimiento.monto, 50);
  await db.exec(`UPDATE proyectos SET estado = 'activo' WHERE id = 1`);
  // con otra categoría, el proyecto no se guarda
  const sin = await call("PUT", `/caja-chica/movimientos/${uid()}`, gasto({ categoria: "Oficina", proyecto_id: 1 }));
  assert.equal(sin.data.movimiento.proyecto_id, null);
  // el historial anota el proyecto
  const [c] = await db.query<any>(`SELECT despues FROM caja_auditoria WHERE entidad_id = $1 AND accion = 'crear'`, [id]);
  assert.equal(c.despues.proyecto_id, 1);
});

test("también en la caja diaria", async () => {
  const hoja = (await call("POST", "/caja/hojas/abrir", { ciudad: "MOQ", fecha: HOY })).data.hoja;
  const fila = { hoja_id: hoja.id, tipo: "OBRA", descripcion: "Cable 10mm", responsable: "Luis", comprobante: "BOLETA", caja_salida_efectivo: 300.4, categoria: "Gasto de proyecto" };
  assert.equal((await call("PUT", `/caja/filas/${uid()}`, fila)).error?.code, "FALTA_PROYECTO");
  const r = await call("PUT", `/caja/filas/${uid()}`, { ...fila, proyecto_id: 4 });
  assert.equal(r.status, 200, JSON.stringify(r.error));
  assert.equal(r.data.fila.proyecto_nombre, "Clínica");
  const h = (await call("GET", `/caja/hojas?ciudad=MOQ&desde=${HOY}&hasta=${HOY}`)).data.hojas[0];
  assert.equal(h.filas[0].proyecto_id, 4);
});

test("los fondos que llegan del ERP suman a la caja chica y no se editan ni borran aquí", async () => {
  const id = "40000000-0000-4000-8000-000000000001";
  const antes = (await call("GET", `/caja-chica/movimientos?ciudad=AQP&desde=${HOY}&hasta=${HOY}`)).data.saldo;
  await db.exec(`INSERT INTO caja_chica_mov (id, ciudad, fecha, tipo, descripcion, persona, monto, origen) VALUES ('${id}', 'AQP', '${HOY}', 'FONDO', 'Fondos de la cuenta principal · Reposición', 'Admin', 250.25, 'ERP')`);
  const r = (await call("GET", `/caja-chica/movimientos?ciudad=AQP&desde=${HOY}&hasta=${HOY}`)).data;
  assert.equal(Math.round((r.saldo - antes) * 100), 25025);
  assert.ok(r.movimientos.some((m: any) => m.id === id && m.tipo === "FONDO" && m.origen === "ERP"));
  const e = await call("PUT", `/caja-chica/movimientos/${id}`, gasto({ categoria: "Oficina" }));
  assert.equal(e.error?.code, "MOVIMIENTO_DEL_ERP");
  assert.equal((await call("DELETE", `/caja-chica/movimientos/${id}`)).error?.code, "MOVIMIENTO_DEL_ERP");
  // el saldo final ya es positivo (el fondo suma, no resta)
  assert.ok(r.saldo > 0);
});
