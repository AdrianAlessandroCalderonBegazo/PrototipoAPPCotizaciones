/// <reference types="node" />
/**
 * Prueba de integración de ICR Finanzas 2: el almacén local y el motor de sincronización DE LA APP contra la API real
 * (Postgres de verdad con PGlite). Dos "dispositivos" con su propio almacenamiento, red que se corta y respuestas que
 * se pierden. Es la prueba de que trabajar sin conexión no pierde ni duplica nada.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { MIGRACIONES_FIN, migrar, pgliteDb, type Db } from "./db";
import { authDesdeEntorno } from "./auth";
import { memoryStorage } from "./storage";
import { sinEspejo } from "./erp";
import { crearServicio } from "./service";
import { crearFin } from "./fin";
import { crearServidor } from "./server";
import { crearStore, pendientes, saldoDe, type NuevoMov, type Store } from "../../app2/src/lib/fin/store";
import { crearSync, type Sync, type SyncApi } from "../../app2/src/lib/fin/sync";

let db: Db;
let server: ReturnType<typeof crearServidor>;
let base = "";
let hoy = "2026-10-28";

before(async () => {
  db = await pgliteDb();
  await migrar(db, MIGRACIONES_FIN);
  const env = { AUTH_MODE: "dev" } as NodeJS.ProcessEnv;
  const storage = memoryStorage();
  server = crearServidor({ modo: "fin", auth: authDesdeEntorno(env), svc: crearServicio({ db, storage, mirror: sinEspejo, env }), fin: crearFin({ db, storage, env, hoy: () => hoy }) });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await db.close();
});

type Dispositivo = { store: Store; sync: Sync; fotos: Map<string, Blob>; red: { offline: boolean; perderRespuesta: boolean }; kv: Map<string, unknown> };

function dispositivo(nombre: string, ventanaDias?: number, kvPrevio?: Map<string, unknown>): Dispositivo {
  const kv = kvPrevio ?? new Map<string, unknown>();
  const fotos = new Map<string, Blob>();
  const red = { offline: false, perderRespuesta: false };
  const store = crearStore({ kv: { get: async (k) => kv.get(k) as any, set: async (k, v) => void kv.set(k, structuredClone(v)) }, borrarFoto: async (k) => void fotos.delete(k) });
  const llamar = async (metodo: string, path: string, init: { body?: BodyInit; contentType?: string }) => {
    if (red.offline) throw Object.assign(new Error("Sin conexión con el servidor."), { status: 0, code: "NETWORK" });
    const res = await fetch(base + path, { method: metodo, headers: { Authorization: `Bearer dev:${nombre}:ADMIN`, ...(init.contentType ? { "Content-Type": init.contentType } : {}) }, body: init.body });
    if (red.perderRespuesta) throw Object.assign(new Error("Sin conexión con el servidor."), { status: 0, code: "NETWORK" }); // el servidor SÍ lo aplicó
    return res;
  };
  const api: SyncApi = {
    async json(metodo, path, body) {
      const res = await llamar(metodo, path, { body: body === undefined ? undefined : JSON.stringify(body), contentType: body === undefined ? undefined : "application/json" });
      const p: any = await res.json();
      if (!res.ok || p.status !== "success") throw Object.assign(new Error(p.error?.message), { status: res.status, code: p.error?.code });
      return p.data;
    },
    async subirFoto(path, blob) {
      const res = await llamar("PUT", path, { body: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type });
      if (!res.ok) throw Object.assign(new Error("foto rechazada"), { status: res.status });
    },
    async bajarFoto(path) {
      return await (await llamar("GET", path, {})).blob();
    },
  };
  const sync = crearSync({ store, api, blobFoto: async (k) => fotos.get(k) ?? null, hoy: () => hoy, ventanaDias });
  return { store, sync, fotos, red, kv };
}

let n = 0;
const uid = () => `20000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const nuevaCuenta = (nombre: string, p: Record<string, unknown> = {}) => ({ id: uid(), nombre, tipo: "YAPE" as const, titular: "", referencia: "", saldo_inicial: 0, umbral: 0, aviso_whatsapp: "", aviso_telegram: "", activa: true, ...p });
const nuevoMov = (cuenta_id: string, p: Partial<NuevoMov> = {}): NuevoMov => ({
  id: uid(), tipo: "EGRESO", fecha: "2026-10-27", hora: "10:00", cuenta_id, destino_id: "", monto: 8, categoria: "Viáticos", subcategoria: "Menú", concepto: "Menú", pagado_a: "Aurea Val*", pagado_a_id: "",
  para: [], nro_operacion: "", origen: "CAPTURA", ...p,
});
const foto = (d: Dispositivo, texto = "jpg") => {
  const key = uid();
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(texto)])], { type: "image/jpeg" });
  d.fotos.set(key, blob);
  return { key, mime: "image/jpeg", bytes: blob.size };
};
const servidor = async (desde = "2026-01-01", hasta = "2026-12-31") => ((await (await fetch(`${base}/v2/snapshot?desde=${desde}&hasta=${hasta}`, { headers: { Authorization: "Bearer dev:x" } })).json()) as any).data;

test("trabajar todo el día sin conexión y sincronizar al volver: nada se pierde ni se duplica", async () => {
  const a = dispositivo("diego");
  await a.store.init();
  a.store.setUsuario("Diego");
  a.red.offline = true;
  const banco = nuevaCuenta("Cta. cte. 2000", { tipo: "BANCO", saldo_inicial: 5000, referencia: "2000" });
  const yape = nuevaCuenta("Yape Diego", { saldo_inicial: 300, umbral: 40, titular: "Diego" });
  a.store.guardarCuenta(banco);
  a.store.guardarCuenta(yape);
  const aurea = uid();
  a.store.guardarPersona({ id: aurea, nombre: "Aurea Valdivia", tipo: "PROVEEDOR", alias: ["Aurea Val*"], menu_monto: 0, activa: true });
  const m1 = nuevoMov(yape.id, { monto: 20, nro_operacion: "15961088", pagado_a_id: aurea });
  a.store.guardarMov(m1);
  a.store.agregarAdjunto(m1.id, foto(a, "menu"));
  a.store.guardarMov(nuevoMov(yape.id, { monto: 11, nro_operacion: "10470373" }));
  a.store.guardarMov(nuevoMov(banco.id, { tipo: "TRASPASO", destino_id: yape.id, monto: 200, categoria: "", subcategoria: "", concepto: "reposición", origen: "MANUAL" }));
  // sin red todo se ve al instante y el saldo ya cuenta lo registrado
  assert.equal(saldoDe(a.store.get(), yape.id), 300 - 20 - 11 + 200);
  assert.equal(saldoDe(a.store.get(), banco.id), 5000 - 200);
  assert.ok(pendientes(a.store.get()) >= 7);
  await a.sync.sincronizar();
  assert.equal(a.sync.estado().fase, "sin-conexion");
  assert.equal((await servidor()).movs.length, 0, "el servidor todavía no tiene nada");

  a.red.offline = false;
  await a.sync.sincronizar();
  assert.equal(pendientes(a.store.get()), 0);
  const s = await servidor();
  assert.deepEqual(s.cuentas.map((c: any) => c.nombre).sort(), ["Cta. cte. 2000", "Yape Diego"]);
  assert.equal(s.movs.length, 3);
  assert.equal(s.movs.find((m: any) => m.id === m1.id).adjuntos.length, 1);
  assert.equal(s.movs.find((m: any) => m.id === m1.id).creado_por, "diego"); // el servidor sabe quién fue (por el token)
  // el saldo que ve el dispositivo = el del servidor
  assert.equal(saldoDe(a.store.get(), yape.id), 469);
  assert.equal(s.cuentas.find((c: any) => c.id === yape.id).saldo_base, 300); // base: lo que traía antes de la ventana
  // sincronizar otra vez no cambia nada
  await a.sync.sincronizar();
  assert.equal((await servidor()).movs.length, 3);
});

test("se corta la señal justo después de que el servidor aplicó: al reenviar no se duplica", async () => {
  const a = dispositivo("milagros");
  await a.store.init();
  const c = nuevaCuenta("Yape Milagros", { saldo_inicial: 300 });
  a.store.guardarCuenta(c);
  await a.sync.sincronizar();
  const m = nuevoMov(c.id, { monto: 38, nro_operacion: "06219952", concepto: "Pasaje AQP MOQ", categoria: "Movilidad", subcategoria: "Pasajes" });
  a.store.guardarMov(m);
  a.red.perderRespuesta = true;
  await a.sync.sincronizar();
  assert.equal(pendientes(a.store.get()), 1, "para el dispositivo sigue pendiente (no recibió la respuesta)");
  assert.equal((await servidor()).movs.filter((x: any) => x.id === m.id).length, 1, "pero el servidor ya lo tiene");
  a.red.perderRespuesta = false;
  await a.sync.sincronizar();
  assert.equal(pendientes(a.store.get()), 0);
  assert.equal((await servidor()).movs.filter((x: any) => x.id === m.id).length, 1, "reenviar no duplicó");
  assert.equal((await servidor()).movs.filter((x: any) => x.nro_operacion === "06219952").length, 1);
});

test("la misma captura registrada desde dos teléfonos: el segundo es rechazado, se ve el motivo y al corregir se envía", async () => {
  const a = dispositivo("diego");
  const b = dispositivo("milagros");
  await a.store.init();
  await b.store.init();
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  const yape = a.store.get().cuentas.find((c) => c.nombre === "Yape Diego")!;
  assert.ok(b.store.get().cuentas.some((c) => c.id === yape.id), "el otro teléfono ve las cuentas");
  const ma = nuevoMov(yape.id, { monto: 30, nro_operacion: "00310080", pagado_a: "Edilberto Arocutipa J" });
  a.store.guardarMov(ma);
  await a.sync.sincronizar();
  const mb = nuevoMov(yape.id, { monto: 30, nro_operacion: "00310080", pagado_a: "Edilberto Arocutipa J" });
  b.store.guardarMov(mb);
  await b.sync.sincronizar();
  const err = b.store.get().outbox.find((o) => o.ref === mb.id)?.error;
  assert.match(err ?? "", /ya está registrada/);
  assert.equal((await servidor()).movs.filter((x: any) => x.nro_operacion === "00310080").length, 1);
  // el que quedó rechazado se corrige (no era el mismo pago) y entonces sí llega
  b.store.guardarMov({ ...nuevoMov(yape.id), ...mb, nro_operacion: "00310081" });
  await b.sync.reintentarTodo();
  assert.equal(pendientes(b.store.get()), 0);
  assert.equal(b.store.get().outbox.length, 0);
  assert.equal((await servidor()).movs.filter((x: any) => x.id === mb.id).length, 1);
});

test("un dispositivo nuevo baja todo: cuentas, libreta, movimientos con fotos y el mismo saldo", async () => {
  const nuevo = dispositivo("rosa");
  await nuevo.store.init();
  await nuevo.sync.sincronizar();
  const s = await servidor();
  assert.equal(nuevo.store.get().movs.length, s.movs.length);
  assert.equal(nuevo.store.get().personas.length, s.personas.length);
  const conFoto = nuevo.store.get().movs.find((m) => m.adjuntos.length)!;
  assert.ok(conFoto);
  const blob = await nuevo.sync.traerFotoRemota(conFoto.adjuntos[0].id);
  assert.equal(blob.type, "image/jpeg");
  for (const c of nuevo.store.get().cuentas) {
    const enSql = (await db.query<{ saldo: number }>(`SELECT saldo::float8 AS saldo FROM v_fin_saldo WHERE cuenta_id = $1::uuid`, [c.id]))[0].saldo;
    assert.equal(saldoDe(nuevo.store.get(), c.id), Math.round(enSql * 100) / 100, c.nombre);
  }
});

test("ventana corta: los movimientos viejos no se bajan, pero el saldo sigue siendo el correcto", async () => {
  const c = nuevaCuenta("Yape Ventana", { saldo_inicial: 1000 });
  const a = dispositivo("rosa");
  await a.store.init();
  a.store.guardarCuenta(c);
  a.store.guardarMov(nuevoMov(c.id, { monto: 100, fecha: "2026-09-01", nro_operacion: "" }));
  a.store.guardarMov(nuevoMov(c.id, { monto: 25, fecha: "2026-10-27", nro_operacion: "" }));
  await a.sync.sincronizar();
  const b = dispositivo("rosa", 3); // hoy = 2026-10-28: solo desde el 25
  await b.store.init();
  await b.sync.sincronizar();
  assert.equal(b.store.get().movs.filter((m) => m.cuenta_id === c.id).length, 1, "solo el reciente");
  assert.equal(saldoDe(b.store.get(), c.id), 1000 - 100 - 25, "el saldo cuenta también lo que no bajó");
});

test("pasan los días: lo que sale de la ventana se suma al saldo base y el saldo no cambia", async () => {
  const c = nuevaCuenta("Yape Avance", { saldo_inicial: 500 });
  const a = dispositivo("rosa", 2); // ventana de 2 días
  await a.store.init();
  a.store.guardarCuenta(c);
  a.store.guardarMov(nuevoMov(c.id, { monto: 70, fecha: "2026-10-27", nro_operacion: "" }));
  a.store.guardarMov(nuevoMov(c.id, { monto: 30, fecha: "2026-10-28", nro_operacion: "" }));
  await a.sync.sincronizar(); // hoy = 28 → ventana desde el 26
  assert.equal(a.store.get().movs.filter((m) => m.cuenta_id === c.id).length, 2);
  assert.equal(saldoDe(a.store.get(), c.id), 400);
  const ayer = hoy;
  try {
    hoy = "2026-10-30"; // la app sigue abierta y pasan dos días: ventana desde el 28 → el movimiento del 27 sale
    await a.sync.sincronizar();
    assert.equal(a.store.get().movs.filter((m) => m.cuenta_id === c.id).length, 1);
    assert.equal(a.store.get().cuentas.find((x) => x.id === c.id)!.saldo_base, 430, "el movimiento que salió quedó dentro del saldo base");
    assert.equal(saldoDe(a.store.get(), c.id), 400, "y el saldo es el mismo");
  } finally {
    hoy = ayer;
  }
});

test("un movimiento borrado en otro teléfono desaparece al sincronizar; si lo editas mientras tanto no reaparece", async () => {
  const a = dispositivo("diego");
  const b = dispositivo("milagros");
  await a.store.init();
  await b.store.init();
  await a.sync.sincronizar();
  const yape = a.store.get().cuentas.find((c) => c.nombre === "Yape Diego")!;
  const m = nuevoMov(yape.id, { monto: 9, nro_operacion: "" });
  a.store.guardarMov(m);
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  assert.ok(b.store.get().movs.some((x) => x.id === m.id));
  a.store.borrarMov(m.id);
  await a.sync.sincronizar();
  b.red.offline = true;
  b.store.guardarMov({ ...nuevoMov(yape.id), ...m, concepto: "editado sin señal" }); // B lo edita sin saber que A lo borró
  b.red.offline = false;
  await b.sync.sincronizar();
  assert.ok(!b.store.get().movs.some((x) => x.id === m.id), "se quitó también aquí");
  assert.equal(b.store.get().outbox.length, 0);
  assert.ok(!(await servidor()).movs.some((x: any) => x.id === m.id));
});

test("una edición que el servidor rechaza NO se pierde al traer lo del servidor: queda visible para corregirla", async () => {
  const a = dispositivo("diego");
  await a.store.init();
  await a.sync.sincronizar();
  const yape = a.store.get().cuentas.find((c) => c.nombre === "Yape Diego")!;
  const otro = nuevoMov(yape.id, { monto: 5, nro_operacion: "777001" });
  const m = nuevoMov(yape.id, { monto: 15, nro_operacion: "", concepto: "original" });
  a.store.guardarMov(otro);
  a.store.guardarMov(m);
  await a.sync.sincronizar();
  // la persona cambia el movimiento y por error le pone el número de operación de otro
  a.store.guardarMov({ ...nuevoMov(yape.id), ...m, monto: 18, concepto: "corregido", nro_operacion: "777001" });
  await a.sync.sincronizar(); // el servidor lo rechaza (409) y, después, la sincronización trae lo del servidor
  const local = a.store.get().movs.find((x) => x.id === m.id)!;
  assert.equal(local.concepto, "corregido", "traer() no debe devolverle la versión vieja del servidor");
  assert.equal(local.monto, 18);
  assert.match(a.store.get().outbox.find((o) => o.ref === m.id)?.error ?? "", /ya está registrada/);
  assert.equal((await servidor()).movs.find((x: any) => x.id === m.id).monto, 15, "el servidor sigue con la versión anterior");
  // la corrige y llega
  a.store.guardarMov({ ...nuevoMov(yape.id), ...m, monto: 18, concepto: "corregido", nro_operacion: "777002" });
  await a.sync.reintentarTodo();
  assert.equal(pendientes(a.store.get()), 0);
  const s = (await servidor()).movs.find((x: any) => x.id === m.id);
  assert.deepEqual([s.monto, s.concepto, s.nro_operacion], [18, "corregido", "777002"]);
});

test("cuadre sin conexión: se guarda con el saldo de la app y llega al servidor", async () => {
  const a = dispositivo("diego");
  await a.store.init();
  await a.sync.sincronizar();
  const yape = a.store.get().cuentas.find((c) => c.nombre === "Yape Diego")!;
  const sistema = saldoDe(a.store.get(), yape.id);
  a.red.offline = true;
  const c = a.store.crearCuadre({ cuenta_id: yape.id, fecha: hoy, saldo_real: sistema - 12.5, nota: "falta un yapeo" })!;
  assert.deepEqual([c.saldo_sistema, c.diferencia], [sistema, -12.5]);
  a.red.offline = false;
  await a.sync.sincronizar();
  assert.equal(pendientes(a.store.get()), 0);
  const s = (await servidor()).cuadres.find((x: any) => x.id === c.id);
  assert.deepEqual([s.saldo_sistema, s.diferencia, s.nota], [sistema, -12.5, "falta un yapeo"]);
  assert.ok(a.store.get().cuadres.some((x) => x.id === c.id));
});

test("lo guardado en el dispositivo sobrevive a cerrar y abrir la app", async () => {
  const a = dispositivo("diego");
  await a.store.init();
  a.red.offline = true;
  const c = nuevaCuenta("Yape Reinicio", { saldo_inicial: 50 });
  a.store.guardarCuenta(c);
  a.store.guardarMov(nuevoMov(c.id, { monto: 5, nro_operacion: "" }));
  await a.store.vaciar();
  const despues = dispositivo("diego", undefined, a.kv); // misma "memoria del teléfono", app nueva
  await despues.store.init();
  assert.equal(despues.store.get().movs.length, 1);
  assert.equal(pendientes(despues.store.get()), 2);
  despues.red.offline = false;
  await despues.sync.sincronizar();
  assert.equal(pendientes(despues.store.get()), 0);
  assert.equal(saldoDe(despues.store.get(), c.id), 45);
});

test("un traspaso borrado hace volver el saldo de las dos cuentas", async () => {
  const a = dispositivo("diego");
  await a.store.init();
  await a.sync.sincronizar();
  const [x, y] = [nuevaCuenta("Yape X", { saldo_inicial: 100 }), nuevaCuenta("Yape Y", { saldo_inicial: 100 })];
  a.store.guardarCuenta(x);
  a.store.guardarCuenta(y);
  const t = nuevoMov(x.id, { tipo: "TRASPASO", destino_id: y.id, monto: 40, categoria: "", subcategoria: "", nro_operacion: "", origen: "MANUAL" });
  a.store.guardarMov(t);
  await a.sync.sincronizar();
  assert.deepEqual([saldoDe(a.store.get(), x.id), saldoDe(a.store.get(), y.id)], [60, 140]);
  a.store.borrarMov(t.id);
  assert.deepEqual([saldoDe(a.store.get(), x.id), saldoDe(a.store.get(), y.id)], [100, 100]);
  await a.sync.sincronizar();
  const s = await servidor();
  assert.ok(!s.movs.some((m: any) => m.id === t.id));
  assert.deepEqual([saldoDe(a.store.get(), x.id), saldoDe(a.store.get(), y.id)], [100, 100]);
});
