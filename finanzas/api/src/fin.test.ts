/// <reference types="node" />
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { MIGRACIONES_FIN, migrar, pgliteDb, type Db } from "./db";
import { authDesdeEntorno } from "./auth";
import { memoryStorage } from "./storage";
import { crearServicio } from "./service";
import { crearFin } from "./fin";
import { crearServidor } from "./server";
import { sinEspejo } from "./erp";
import type { Notificador } from "./telegram";
import { saldoCuenta } from "../../app2/src/lib/fin/calc";
import type { Cuenta, Mov } from "../../app2/src/lib/fin/types";

let db: Db;
let base = "";
let server: ReturnType<typeof crearServidor>;
const storage = memoryStorage();
const avisos: { chat: string; texto: string }[] = [];
let telegramCaido = false;
const notificar: Notificador = async ({ chat }, texto) => {
  if (!chat) return; // igual que el real: sin chat configurado no se manda nada
  if (telegramCaido) throw new Error("Telegram caído (simulado)");
  avisos.push({ chat, texto });
};

before(async () => {
  db = await pgliteDb();
  await migrar(db, MIGRACIONES_FIN);
  const env = { AUTH_MODE: "dev", ADMIN_ROLES: "ADMIN" } as NodeJS.ProcessEnv;
  server = crearServidor({
    modo: "fin",
    auth: authDesdeEntorno(env),
    svc: crearServicio({ db, storage, mirror: sinEspejo, env, hoy: () => "2026-10-28" }),
    fin: crearFin({ db, storage, env, notificar, hoy: () => "2026-10-28" }),
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await db.close();
});

type R = { status: number; data?: any; error?: { code: string; message: string } };
async function call(method: string, path: string, body?: unknown, user = "dev:ana:ADMIN", raw?: { mime: string; bytes: Buffer }): Promise<R> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), ...(raw ? { "Content-Type": raw.mime } : body ? { "Content-Type": "application/json" } : {}) },
    body: raw ? new Uint8Array(raw.bytes) : body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, data: j.data, error: j.error };
}

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const snap = async (desde = "2026-10-01", hasta = "2026-10-31") => (await call("GET", `/v2/snapshot?desde=${desde}&hasta=${hasta}`)).data;
const saldo = async (id: string, desde = "2026-10-01") => (await snap(desde)).cuentas.find((c: any) => c.id === id);

const BANCO = uid(), DIEGO = uid(), MILAGROS = uid();
const cuenta = (id: string, p: Record<string, unknown> = {}) => ({ nombre: "Cuenta", tipo: "YAPE", titular: "", referencia: "", saldo_inicial: 0, umbral: 0, aviso_whatsapp: "", aviso_telegram: "", activa: true, orden: 1, ...p });
const egreso = (p: Record<string, unknown> = {}) => ({ tipo: "EGRESO", fecha: "2026-10-27", hora: "10:00", cuenta_id: DIEGO, destino_id: null, monto: 8, categoria: "Viáticos", subcategoria: "Menú", concepto: "Menú", pagado_a: "Aurea Val*", pagado_a_id: null, para: [], nro_operacion: "", origen: "MANUAL", creado: "2026-10-27T10:00:00Z", ...p });
const putMov = (id: string, b: unknown, user?: string) => call("PUT", `/v2/mov/${id}`, b, user);

test("sin sesión no se entra a nada", async () => {
  assert.equal((await call("GET", "/v2/snapshot", undefined, "")).status, 401);
  assert.equal((await call("PUT", `/v2/mov/${uid()}`, egreso(), "")).status, 401);
});

test("cuentas: solo quien tiene permiso las crea o cambia; validan nombre, tipo y umbral", async () => {
  assert.equal((await call("PUT", `/v2/cuentas/${BANCO}`, cuenta(BANCO, { nombre: "Cta. cte. 2000", tipo: "BANCO", referencia: "2000", saldo_inicial: 5000 }))).status, 200);
  assert.equal((await call("PUT", `/v2/cuentas/${DIEGO}`, cuenta(DIEGO, { nombre: "Yape Diego", titular: "Diego", saldo_inicial: 300, umbral: 40, aviso_telegram: "111" }))).status, 200);
  assert.equal((await call("PUT", `/v2/cuentas/${MILAGROS}`, cuenta(MILAGROS, { nombre: "Yape Milagros", titular: "Milagros", saldo_inicial: 300 }))).status, 200);
  assert.equal((await call("PUT", `/v2/cuentas/${uid()}`, cuenta("x"), "dev:bob:encargado")).error?.code, "SIN_PERMISO");
  assert.equal((await call("PUT", `/v2/cuentas/${uid()}`, cuenta("x", { nombre: " " }))).status, 400);
  assert.equal((await call("PUT", `/v2/cuentas/${uid()}`, cuenta("x", { tipo: "CHEQUE" }))).status, 400);
  assert.equal((await call("PUT", `/v2/cuentas/${uid()}`, cuenta("x", { umbral: -1 }))).status, 400);
  assert.equal((await call("PUT", `/v2/cuentas/no-uuid`, cuenta("x"))).status, 400);
  const s = await snap();
  assert.deepEqual(s.cuentas.map((c: any) => [c.nombre, c.saldo_inicial, c.saldo_base]), [["Cta. cte. 2000", 5000, 5000], ["Yape Diego", 300, 300], ["Yape Milagros", 300, 300]]);
});

test("libreta: cualquiera con acceso a Finanzas la edita; alias y menú se guardan", async () => {
  const id = uid();
  const r = await call("PUT", `/v2/personas/${id}`, { nombre: "Ricardo Coaquira", tipo: "PRACTICANTE", alias: ["Ricardo Coa*", " "], menu_monto: 11, activa: true }, "dev:bob:encargado");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.persona.alias, ["Ricardo Coa*"]);
  assert.equal(r.data.persona.menu_monto, 11);
  assert.equal((await call("PUT", `/v2/personas/${uid()}`, { nombre: "X", tipo: "JEFE" })).status, 400);
  assert.equal((await call("PUT", `/v2/personas/${uid()}`, { nombre: "", tipo: "OBRA" })).status, 400);
  assert.equal((await snap()).personas.length, 1);
});

test("movimientos: ingreso, egreso y traspaso mueven los saldos como corresponde", async () => {
  assert.equal((await putMov(uid(), egreso({ monto: 12 }))).status, 200); // Diego gasta 12
  assert.equal((await putMov(uid(), { ...egreso(), tipo: "INGRESO", cuenta_id: BANCO, categoria: "Venta", subcategoria: "", monto: 1000, pagado_a: "" })).status, 200);
  assert.equal((await putMov(uid(), { ...egreso(), tipo: "TRASPASO", cuenta_id: BANCO, destino_id: DIEGO, categoria: "", subcategoria: "", monto: 200 })).status, 200);
  assert.equal((await putMov(uid(), { ...egreso(), tipo: "TRASPASO", cuenta_id: MILAGROS, destino_id: DIEGO, categoria: "", subcategoria: "", monto: 100, concepto: "gasolina" })).status, 200);
  // el saldo "base" de una ventana que empieza después de todo es el saldo actual de cada cuenta
  const s = await snap("2026-10-28", "2026-10-31");
  const por = (id: string) => s.cuentas.find((c: any) => c.id === id).saldo_base;
  assert.equal(por(DIEGO), 300 - 12 + 200 + 100);
  assert.equal(por(MILAGROS), 200);
  assert.equal(por(BANCO), 5000 + 1000 - 200);
  // los traspasos no cambian el total de la empresa
  assert.equal(por(DIEGO) + por(MILAGROS) + por(BANCO), 300 + 300 + 5000 + 1000 - 12);
  // y la ventana del 27 en adelante ve el movimiento, con el saldo base de antes
  const v = await snap("2026-10-27", "2026-10-31");
  assert.equal(v.cuentas.find((c: any) => c.id === DIEGO).saldo_base, 300);
  assert.equal(v.movs.length, 4);
  // fecha del futuro fuera de la ventana: no aparece
  assert.equal((await snap("2026-11-01", "2026-11-30")).movs.length, 0);
});

test("validación de movimientos", async () => {
  const id = () => uid();
  assert.equal((await putMov(id(), egreso({ monto: 0 }))).status, 400);
  assert.equal((await putMov(id(), egreso({ categoria: "" }))).status, 400);
  assert.equal((await putMov(id(), egreso({ categoria: "Gastos fijos", subcategoria: "" }))).status, 400);
  assert.equal((await putMov(id(), egreso({ categoria: "Material", subcategoria: "" }))).status, 200);
  assert.equal((await putMov(id(), egreso({ cuenta_id: uid() }))).status, 400); // la cuenta no existe
  assert.equal((await putMov(id(), egreso({ fecha: "2026-02-31" }))).status, 400);
  assert.equal((await putMov(id(), egreso({ hora: "25:00" }))).status, 400);
  assert.equal((await putMov(id(), egreso({ tipo: "OTRO" }))).status, 400);
  assert.equal((await putMov("no-uuid", egreso())).status, 400);
  const t = egreso({ tipo: "TRASPASO", categoria: "", subcategoria: "", destino_id: DIEGO });
  assert.equal((await putMov(id(), t)).status, 400); // origen = destino
  assert.equal((await putMov(id(), { ...t, destino_id: null })).status, 400); // falta el destino
  assert.equal((await putMov(id(), egreso({ monto: 20, para: [{ persona_id: uid(), monto: 15 }, { persona_id: uid(), monto: 10 }] }))).status, 400); // reparto mayor al monto
  const p = uid();
  assert.equal((await putMov(id(), egreso({ monto: 20, para: [{ persona_id: p, monto: 5 }, { persona_id: p, monto: 5 }] }))).status, 400); // persona repetida
});

test("para quién: el reparto se guarda y se puede corregir; idempotente", async () => {
  const id = uid(), a = uid(), b = uid();
  const cuerpo = egreso({ monto: 20, nro_operacion: "15961088", para: [{ persona_id: a, monto: 10 }, { persona_id: b, monto: 10 }] });
  const r1 = await putMov(id, cuerpo);
  assert.deepEqual(r1.data.mov.para.map((x: any) => x.monto), [10, 10]);
  assert.equal((await putMov(id, cuerpo)).status, 200); // reenviar no duplica
  const lista = (await snap()).movs.filter((m: any) => m.id === id);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].para.length, 2);
  const r2 = await putMov(id, { ...cuerpo, para: [{ persona_id: a, monto: 20 }] }); // se corrige: ahora solo para uno
  assert.deepEqual(r2.data.mov.para, [{ persona_id: a, monto: 20 }]);
  assert.equal(r2.data.mov.creado_por, "ana");
});

test("el número de operación no se registra dos veces en la misma cuenta", async () => {
  const a = uid();
  assert.equal((await putMov(a, egreso({ nro_operacion: "10470373" }))).status, 200);
  const dup = await putMov(uid(), egreso({ nro_operacion: "10470373" }));
  assert.equal(dup.status, 409);
  assert.equal(dup.error?.code, "OPERACION_DUPLICADA");
  assert.equal((await putMov(a, egreso({ nro_operacion: "10470373", concepto: "corregido" }))).status, 200); // el mismo movimiento sí se puede corregir
  assert.equal((await putMov(uid(), egreso({ nro_operacion: "10470373", cuenta_id: MILAGROS }))).status, 200); // otra cuenta: otra operación
  assert.equal((await putMov(uid(), egreso({ nro_operacion: "" }))).status, 200); // sin número no hay chequeo
  assert.equal((await putMov(uid(), egreso({ nro_operacion: "" }))).status, 200);
  // al borrar el primero, el número queda libre
  assert.equal((await call("DELETE", `/v2/mov/${a}`)).status, 200);
  assert.equal((await putMov(uid(), egreso({ nro_operacion: "10470373" }))).status, 200);
});

test("borrar: el movimiento sale de los saldos, es idempotente y no se puede revivir", async () => {
  const id = uid();
  const antes = (await saldo(DIEGO, "2026-10-28")).saldo_base;
  await putMov(id, egreso({ monto: 50 }));
  assert.equal((await saldo(DIEGO, "2026-10-28")).saldo_base, antes - 50);
  assert.equal((await call("DELETE", `/v2/mov/${id}`)).status, 200);
  assert.equal((await call("DELETE", `/v2/mov/${id}`)).status, 200); // otra vez: igual
  assert.equal((await call("DELETE", `/v2/mov/${uid()}`)).status, 200); // uno que nunca existió
  assert.equal((await saldo(DIEGO, "2026-10-28")).saldo_base, antes);
  assert.equal((await putMov(id, egreso({ monto: 50 }))).error?.code, "MOV_ELIMINADO");
});

test("fotos de comprobantes: subir (idempotente), bajar, quitar", async () => {
  const mov = uid(), foto = uid();
  await putMov(mov, egreso({ monto: 3 }));
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const ok = await call("PUT", `/v2/adjuntos/${foto}?mov_id=${mov}`, undefined, "dev:ana:ADMIN", { mime: "image/jpeg", bytes: jpg });
  assert.equal(ok.status, 200);
  assert.equal((await call("PUT", `/v2/adjuntos/${foto}?mov_id=${mov}`, undefined, "dev:ana:ADMIN", { mime: "image/jpeg", bytes: jpg })).status, 200);
  assert.equal((await snap()).movs.find((m: any) => m.id === mov).adjuntos.length, 1);
  const bajada = await fetch(`${base}/v2/adjuntos/${foto}`, { headers: { Authorization: "Bearer dev:ana" } });
  assert.equal(bajada.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await bajada.arrayBuffer()), jpg);
  assert.equal((await fetch(`${base}/v2/adjuntos/${foto}`)).status, 401);
  assert.equal((await call("PUT", `/v2/adjuntos/${uid()}?mov_id=${mov}`, undefined, "dev:ana:ADMIN", { mime: "application/pdf", bytes: jpg })).error?.code, "TIPO_NO_PERMITIDO");
  assert.equal((await call("PUT", `/v2/adjuntos/${uid()}?mov_id=${uid()}`, undefined, "dev:ana:ADMIN", { mime: "image/jpeg", bytes: jpg })).error?.code, "DUENO_NO_ENCONTRADO");
  assert.equal((await call("DELETE", `/v2/adjuntos/${foto}`)).status, 200);
  assert.equal((await snap()).movs.find((m: any) => m.id === mov).adjuntos.length, 0);
});

test("cuadre: el servidor pone el saldo de la app y la diferencia; reenviar no duplica", async () => {
  const antes = (await saldo(DIEGO, "2026-10-28")).saldo_base;
  const id = uid();
  const r = await call("POST", "/v2/cuadres", { id, cuenta_id: DIEGO, fecha: "2026-10-28", saldo_real: antes - 12.5, nota: "faltó un yapeo" });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.cuadre.saldo_sistema, r.data.cuadre.diferencia, r.data.cuadre.creado_por], [antes, -12.5, "ana"]);
  assert.equal((await call("POST", "/v2/cuadres", { id, cuenta_id: DIEGO, fecha: "2026-10-28", saldo_real: 0 })).data.cuadre.diferencia, -12.5); // idempotente: no se pisa
  assert.equal((await snap()).cuadres.filter((c: any) => c.id === id).length, 1);
  assert.equal((await call("POST", "/v2/cuadres", { id: uid(), cuenta_id: uid(), fecha: "2026-10-28", saldo_real: 1 })).status, 404);
  assert.equal((await call("POST", "/v2/cuadres", { id: uid(), cuenta_id: DIEGO, fecha: "2026-10-28", saldo_real: "x" })).status, 400);
});

test("aviso de reposición: una sola vez por bajada del umbral, se rearma al reponer, y un fallo se reintenta", async () => {
  const c = uid();
  await call("PUT", `/v2/cuentas/${c}`, cuenta(c, { nombre: "Yape Prueba", titular: "Prueba", saldo_inicial: 100, umbral: 40, aviso_telegram: "999" }));
  avisos.length = 0;
  await putMov(uid(), egreso({ cuenta_id: c, monto: 30, hora: "08:00" })); // 70: sigue arriba
  assert.equal(avisos.length, 0);
  await putMov(uid(), egreso({ cuenta_id: c, monto: 40, hora: "09:00", concepto: "gasolina", pagado_a: "Diego A Lazo J" })); // 30: baja
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].chat, "999");
  assert.match(avisos[0].texto, /Yape Prueba/);
  assert.match(avisos[0].texto, /Monto sugerido a reponer: S\/ 70\.00/);
  assert.match(avisos[0].texto, /gasolina · Diego A Lazo J · S\/ 40\.00/);
  await putMov(uid(), egreso({ cuenta_id: c, monto: 5, hora: "10:00" })); // 25: sigue bajo, no repite
  assert.equal(avisos.length, 1);
  // se repone: el aviso se rearma
  await putMov(uid(), { ...egreso(), tipo: "TRASPASO", cuenta_id: BANCO, destino_id: c, categoria: "", subcategoria: "", monto: 75, hora: "11:00" }); // 100
  assert.equal(avisos.length, 1);
  await putMov(uid(), egreso({ cuenta_id: c, monto: 70, hora: "12:00" })); // 30 de nuevo
  assert.equal(avisos.length, 2);
  assert.match(avisos[1].texto, /Monto sugerido a reponer: S\/ 70\.00/); // solo lo gastado desde la última reposición
  // Telegram caído: el movimiento se guarda igual y el aviso se reintenta en el siguiente
  await putMov(uid(), { ...egreso(), tipo: "TRASPASO", cuenta_id: BANCO, destino_id: c, categoria: "", subcategoria: "", monto: 70, hora: "13:00" }); // 100 → rearma
  telegramCaido = true;
  assert.equal((await putMov(uid(), egreso({ cuenta_id: c, monto: 75, hora: "14:00" }))).status, 200); // 25: debe avisar pero falla
  assert.equal(avisos.length, 2);
  telegramCaido = false;
  await putMov(uid(), egreso({ cuenta_id: c, monto: 1, hora: "15:00" }));
  assert.equal(avisos.length, 3);
  // si baja el saldo borrando un ingreso también avisa; sin chat configurado no manda nada
  const sin = uid();
  await call("PUT", `/v2/cuentas/${sin}`, cuenta(sin, { nombre: "Sin chat", saldo_inicial: 50, umbral: 40 }));
  await putMov(uid(), egreso({ cuenta_id: sin, monto: 20 }));
  assert.equal(avisos.length, 3);
});

test("mensaje de prueba del aviso", async () => {
  avisos.length = 0;
  assert.equal((await call("POST", `/v2/cuentas/${DIEGO}/aviso-prueba`)).status, 200);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].texto, /Mensaje de prueba/);
  assert.equal((await call("POST", `/v2/cuentas/${MILAGROS}/aviso-prueba`)).status, 400); // sin chat
  assert.equal((await call("POST", `/v2/cuentas/${DIEGO}/aviso-prueba`, undefined, "dev:bob:encargado")).error?.code, "SIN_PERMISO");
  telegramCaido = true;
  assert.equal((await call("POST", `/v2/cuentas/${DIEGO}/aviso-prueba`)).error?.code, "TELEGRAM_FALLO");
  telegramCaido = false;
});

test("los saldos de la app y los de la vista SQL dan lo mismo (movimientos aleatorios)", async () => {
  // generador determinista
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const ids = [uid(), uid(), uid()];
  for (const [i, id] of ids.entries()) await call("PUT", `/v2/cuentas/${id}`, cuenta(id, { nombre: `Rand ${i}`, saldo_inicial: Math.round(rnd() * 100000) / 100, orden: 50 + i }));
  for (let k = 0; k < 40; k++) {
    const tipo = ["INGRESO", "EGRESO", "TRASPASO"][Math.floor(rnd() * 3)];
    const a = ids[Math.floor(rnd() * 3)];
    let b = ids[Math.floor(rnd() * 3)];
    if (b === a) b = ids[(ids.indexOf(a) + 1) % 3];
    const monto = Math.round((rnd() * 500 + 0.01) * 100) / 100;
    const dia = 1 + Math.floor(rnd() * 25);
    const r = await putMov(uid(), { ...egreso(), tipo, cuenta_id: a, destino_id: tipo === "TRASPASO" ? b : null, monto, fecha: `2026-09-${String(dia).padStart(2, "0")}`, categoria: tipo === "INGRESO" ? "Venta" : tipo === "TRASPASO" ? "" : "Material", subcategoria: "" });
    assert.equal(r.status, 200, JSON.stringify(r.error));
  }
  // ventana corta (desde el 15): el saldo base del servidor + los movimientos de la ventana = el saldo final de la vista
  const s = (await call("GET", "/v2/snapshot?desde=2026-09-15&hasta=2026-09-30")).data;
  const sqlFinal = await db.query<{ cuenta_id: string; saldo: number }>(`SELECT cuenta_id, saldo::float8 AS saldo FROM v_fin_saldo`);
  for (const id of ids) {
    const c = s.cuentas.find((x: any) => x.id === id) as Cuenta;
    const local = saldoCuenta(c, s.movs as Mov[]);
    assert.equal(local, Math.round(sqlFinal.find((x) => x.cuenta_id === id)!.saldo * 100) / 100, `cuenta ${id}`);
  }
});

test("el servicio de la versión 2 solo trae las rutas /v2 (la versión 1 es otro servicio con otra base) y exige un rol con acceso a Finanzas", async () => {
  assert.equal((await call("GET", "/caja/estado?ciudad=AQP")).status, 404);
  assert.equal((await call("GET", "/health", undefined, "")).status, 200);
  const sinAcceso = await call("GET", "/v2/snapshot", undefined, "dev:eva:almacen");
  assert.equal(sinAcceso.status, 403);
  assert.equal(sinAcceso.error?.code, "SIN_ACCESO");
  assert.equal((await call("GET", "/v2/snapshot", undefined, "dev:pepe:finanzas")).status, 200);
});
