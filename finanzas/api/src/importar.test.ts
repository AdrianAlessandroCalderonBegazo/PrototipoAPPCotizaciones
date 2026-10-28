/// <reference types="node" />
// Importación de las hojas de papel: borra lo anterior, carga los días, adjunta recibos, comprueba saldos y cierra.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyMigrations, pgliteDb, type Db } from "./db";
import { memoryStorage } from "./storage";
import { sinEspejo } from "./erp";
import { crearServicio } from "./service";
import { importarCaja, CLASIFICACION } from "./importar";

const mov = (id: string, fecha: string, orden: number, desc: string, p: Record<string, string> = {}, recibo?: object) => ({
  movimiento_id: id, fecha, orden, tipo: "", descripcion: desc, responsable: "Carlos", ciudad: "AQP", ingreso_efectivo: "0.00", ingreso_yape_transf: "0.00", salida_efectivo: "0.00", salida_yape_transf: "0.00",
  cta_cte_ingreso: "0.00", cta_cte_salida: "0.00", observacion: "", recibo: recibo ?? null, ...p,
});
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

async function carpeta(datos: object) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "imp-"));
  await fs.mkdir(path.join(dir, "imagenes/recibos"), { recursive: true });
  await fs.writeFile(path.join(dir, "imagenes/recibos/R1.jpg"), JPG);
  await fs.writeFile(path.join(dir, "datos.json"), JSON.stringify(datos));
  return dir;
}

CLASIFICACION["T-02"] = { categoria: "Material" };
CLASIFICACION["T-03"] = { interno: true };
const DATOS = (saldo2 = "528.00") => ({
  cajas: [
    { caja_id: "C1", fecha: "2026-10-01", responsable_caja: "", saldo_anterior: "100.00", total_efectivo_escrito: "", total_efectivo_calculado: "700.00", movimientos: [
      mov("T-01", "2026-10-01", 1, "Venta de panel", { ingreso_efectivo: "500.00", ingreso_yape_transf: "300.00" }),
      mov("T-02", "2026-10-01", 2, "Compra de cable", { salida_efectivo: "72.00" }, { recibo_id: "R1", tipo: "FACTURA_ELECTRONICA", imagen_recibo: "imagenes/recibos/R1.jpg", monto: "72.00" }),
    ] },
    { caja_id: "C2", fecha: "2026-10-05", responsable_caja: "Diego", saldo_anterior: saldo2, total_efectivo_escrito: "300.00", total_efectivo_calculado: "356.00", movimientos: [
      mov("T-03", "2026-10-05", 1, "Depósito ICR", { salida_efectivo: "172.00" }),
    ] },
  ],
});

async function base() {
  const db = await pgliteDb();
  await applyMigrations(db);
  const st = memoryStorage();
  const svc = crearServicio({ db, storage: st, mirror: sinEspejo, env: {}, hoy: () => "2026-10-28" });
  // datos "viejos" que deben desaparecer
  await db.query(`INSERT INTO caja_hoja (id, ciudad, fecha) VALUES ('00000000-0000-4000-8000-000000000001', 'MOQ', '2026-09-01')`);
  await db.query(`INSERT INTO caja_fila (hoja_id, tipo, descripcion, caja_ingreso_efectivo) VALUES ('00000000-0000-4000-8000-000000000001', 'VTA', 'prueba vieja', 5)`);
  await db.query(`UPDATE caja_config SET saldo_inicial_caja = 999, saldo_inicial_caja_chica = 50`);
  await db.query(`INSERT INTO caja_chica_mov (ciudad, fecha, tipo, descripcion, monto) VALUES ('MOQ', '2026-09-01', 'EGRESO', 'viejo', 3)`);
  await st.put("viejo", Buffer.from("x"));
  await db.query(`INSERT INTO caja_adjunto (id, fila_id, archivo, mime, bytes) SELECT '00000000-0000-4000-8000-0000000000aa', id, 'viejo', 'image/jpeg', 1 FROM caja_fila LIMIT 1`);
  return { db, st, svc };
}
const n = async (db: Db, t: string) => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`))[0].n);

test("simulacro: calcula todo y no cambia nada", async () => {
  const { db, st } = await base();
  const dir = await carpeta(DATOS());
  const r = await importarCaja({ db, storage: st, carpeta: dir, confirmar: false });
  assert.equal(r.filas, 3);
  assert.equal(await n(db, "caja_hoja"), 1, "la hoja vieja sigue ahí");
  assert.equal(await n(db, "caja_chica_mov"), 1);
  assert.ok(await st.get("viejo"));
  await db.close();
});

test("confirmar: borra lo anterior, carga los días, adjunta el recibo, comprueba saldos y cierra", async () => {
  const { db, st, svc } = await base();
  const dir = await carpeta(DATOS());
  const r = await importarCaja({ db, storage: st, carpeta: dir, confirmar: true });
  assert.deepEqual(r.borrado, { hojas: 1, filas: 1, chica: 1, fotos: 1 });
  // lo viejo ya no está
  assert.equal(await n(db, "caja_chica_mov"), 0);
  assert.equal(await st.get("viejo"), null);
  assert.equal((await db.query(`SELECT 1 FROM caja_fila WHERE descripcion = 'prueba vieja'`)).length, 0);
  // saldos iniciales: solo la caja de Arequipa arranca con el saldo de la primera hoja
  const cfg = await db.query<Record<string, number>>(`SELECT ciudad, saldo_inicial_caja::float8 AS c, saldo_inicial_caja_chica::float8 AS ch FROM caja_config ORDER BY ciudad`);
  assert.deepEqual(cfg.map((x) => [x.ciudad, x.c, x.ch]), [["AQP", 100, 0], ["MOQ", 0, 0]]);
  // los días: la Yape (300) no suma a la caja de efectivo
  assert.deepEqual(r.dias.map((d) => [d.fecha, d.saldoAnterior, d.saldoFinal, d.contado, d.diferencia]), [["2026-10-01", 100, 528, 528, 0], ["2026-10-05", 528, 356, 300, -56]]);
  // los dos días quedan cerrados, el segundo con diferencia (la hoja decía 300 y el sistema calcula 356)
  const hojas = (await svc.hojas({ ciudad: "AQP", desde: "2026-10-01", hasta: "2026-10-31" })).hojas as any[];
  assert.equal(hojas.length, 2);
  assert.ok(hojas.every((h) => h.cierre));
  assert.equal(hojas[1].cierre.diferencia, -56);
  assert.equal(hojas[0].cierre.nota, "La hoja de papel no tenía anotado el total; se usó el saldo calculado.");
  assert.equal(hojas[1].responsable_caja, "Diego");
  // comprobante, categoría e interno
  const f = hojas[0].filas;
  assert.equal(f[0].tipo, "OTRO");
  assert.equal(f[1].comprobante, "FACTURA");
  assert.equal(f[1].categoria, "Material");
  assert.equal(hojas[1].filas[0].interno, true);
  // el recibo está adjunto a su movimiento y se puede bajar
  assert.equal(f[1].adjuntos.length, 1);
  const foto = await svc.getAdjunto(f[1].adjuntos[0].id);
  assert.deepEqual(foto.bytes, JPG);
  // queda en el historial de cambios
  const aud = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM caja_auditoria WHERE usuario = 'Importación' AND accion = 'crear'`);
  assert.equal(aud[0].n, 3);
  // volver a importar da lo mismo (mismos ids), sin duplicar
  const otra = await importarCaja({ db, storage: st, carpeta: dir, confirmar: true });
  assert.equal(otra.borrado.hojas, 2);
  assert.equal(await n(db, "caja_fila"), 3);
  assert.equal(await n(db, "caja_adjunto"), 1);
  await db.close();
});

test("si el saldo anterior del papel no coincide, no se cambia nada", async () => {
  const { db, st } = await base();
  const dir = await carpeta(DATOS("999.00"));
  await assert.rejects(() => importarCaja({ db, storage: st, carpeta: dir, confirmar: true }), /no coincide/);
  assert.equal(await n(db, "caja_hoja"), 1, "la hoja vieja sigue ahí");
  assert.equal(await n(db, "caja_chica_mov"), 1);
  await db.close();
});

test("un gasto sin categoría se rechaza antes de tocar la base", async () => {
  const { db, st } = await base();
  const d: any = DATOS();
  d.cajas[0].movimientos.push(mov("T-99", "2026-10-01", 3, "Gasto raro", { salida_efectivo: "1.00" }));
  const dir = await carpeta(d);
  await assert.rejects(() => importarCaja({ db, storage: st, carpeta: dir, confirmar: true }), /falta su categoría/);
  assert.equal(await n(db, "caja_hoja"), 1);
  await db.close();
});
