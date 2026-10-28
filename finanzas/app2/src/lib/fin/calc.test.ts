/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { beneficiarios, buscarDuplicado, esEntrada, esSalida, fusionarMovs, fusionarPorId, gastoPorPersona, repartir, reposicion, saldoCuenta, saldoTotal, validarMov } from "./calc";
import { textoReposicion, enlaceWhatsApp, enlaceTelegram } from "./reposicion";
import type { Cuenta, Mov, Persona } from "./types";

const cuenta = (p: Partial<Cuenta> & { id: string }): Cuenta => ({ nombre: p.id, tipo: "YAPE", titular: "", referencia: "", saldo_inicial: 0, saldo_base: p.saldo_inicial ?? 0, umbral: 0, aviso_whatsapp: "", aviso_telegram: "", activa: true, orden: 0, updated_at: "", ...p });
let n = 0;
const mov = (p: Partial<Mov>): Mov => ({ id: `m${++n}`, tipo: "EGRESO", fecha: "2026-10-27", hora: "10:00", cuenta_id: "diego", destino_id: "", monto: 10, categoria: "Viáticos", subcategoria: "Menú", concepto: "", pagado_a: "", pagado_a_id: "", para: [], nro_operacion: "", origen: "MANUAL", adjuntos: [], creado_por: "t", creado: `2026-10-27T10:00:${String(n).padStart(2, "0")}Z`, updated_at: "", ...p });
const persona = (p: Partial<Persona> & { id: string }): Persona => ({ nombre: p.id, tipo: "OBRA", alias: [], menu_monto: 0, activa: true, updated_at: "", ...p });

const diego = cuenta({ id: "diego", nombre: "Yape Diego", saldo_inicial: 300, umbral: 40 });
const milagros = cuenta({ id: "milagros", nombre: "Yape Milagros", saldo_inicial: 300 });
const banco = cuenta({ id: "banco", tipo: "BANCO", saldo_inicial: 5000 });

test("saldo = saldo base + ingresos − egresos ± traspasos", () => {
  const movs = [
    mov({ monto: 12 }), // egreso de Diego
    mov({ tipo: "INGRESO", cuenta_id: "banco", monto: 1000, categoria: "Venta", subcategoria: "" }),
    mov({ tipo: "TRASPASO", cuenta_id: "banco", destino_id: "diego", monto: 200 }),
    mov({ tipo: "TRASPASO", cuenta_id: "milagros", destino_id: "diego", monto: 100 }), // Milagros le pasa a Diego
  ];
  assert.equal(saldoCuenta(diego, movs), 300 - 12 + 200 + 100);
  assert.equal(saldoCuenta(milagros, movs), 200);
  assert.equal(saldoCuenta(banco, movs), 5000 + 1000 - 200);
  // un traspaso no cambia el total de la empresa
  const sinIngreso = movs.filter((m) => m.tipo !== "INGRESO");
  assert.equal(saldoTotal([diego, milagros, banco], sinIngreso), 300 + 300 + 5000 - 12);
  assert.ok(esEntrada(movs[3], "diego") && esSalida(movs[3], "milagros") && !esEntrada(movs[3], "milagros"));
  // saldo_base: lo que la cuenta traía antes de los movimientos que hay en el dispositivo
  assert.equal(saldoCuenta({ id: "diego", saldo_base: 50 }, [mov({ monto: 20 })]), 30);
});

test("los céntimos no se pierden por punto flotante", () => {
  const c = cuenta({ id: "diego", saldo_inicial: 0.1 });
  assert.equal(saldoCuenta(c, [mov({ tipo: "INGRESO", cuenta_id: "diego", monto: 0.2, categoria: "Otro", subcategoria: "" })]), 0.3);
});

test("reposición: lo gastado desde la última entrada de dinero, y aviso bajo el umbral", () => {
  const movs = [
    mov({ tipo: "TRASPASO", cuenta_id: "banco", destino_id: "diego", monto: 300, fecha: "2026-10-20" }), // última reposición
    mov({ monto: 100, fecha: "2026-10-21" }),
    mov({ monto: 62.5, fecha: "2026-10-22", hora: "09:00" }),
    mov({ monto: 90, fecha: "2026-10-23" }),
  ];
  const r = reposicion(diego, movs);
  assert.equal(r.saldo, 300 + 300 - 100 - 62.5 - 90);
  assert.equal(r.gastado, 252.5);
  assert.equal(r.sugerido, 252.5);
  assert.equal(r.desde, "2026-10-20");
  assert.equal(r.movimientos.length, 3);
  assert.equal(r.bajoUmbral, false); // 347.5 > 40
  // se gasta casi todo: salta el aviso
  const poco = reposicion(diego, [...movs, mov({ monto: 320, fecha: "2026-10-24" })]);
  assert.equal(poco.saldo, 27.5);
  assert.equal(poco.bajoUmbral, true);
  // al entrar dinero (o un traspaso de otro Yape) el ciclo vuelve a empezar
  const repuesto = reposicion(diego, [...movs, mov({ monto: 320, fecha: "2026-10-24" }), mov({ tipo: "TRASPASO", cuenta_id: "milagros", destino_id: "diego", monto: 100, fecha: "2026-10-25" })]);
  assert.equal(repuesto.gastado, 0);
  assert.equal(repuesto.desde, "2026-10-25");
  assert.equal(repuesto.bajoUmbral, false);
  // sin umbral nunca avisa; y si nunca le entró dinero cuenta todo lo gastado
  const sin = reposicion(milagros, [mov({ cuenta_id: "milagros", monto: 290 })]);
  assert.equal(sin.bajoUmbral, false);
  assert.equal(sin.desde, "");
  assert.equal(sin.gastado, 290);
  // lo que sale por traspaso también cuenta como gastado (Milagros le pasó 100 a Diego)
  assert.equal(reposicion(milagros, [mov({ tipo: "TRASPASO", cuenta_id: "milagros", destino_id: "diego", monto: 100 })]).gastado, 100);
});

test("mismo minuto: el orden lo desempata la hora de creación", () => {
  const a = mov({ tipo: "TRASPASO", cuenta_id: "banco", destino_id: "diego", monto: 50, hora: "10:00" });
  const b = mov({ monto: 20, hora: "10:00" }); // creado después, misma hora
  assert.equal(reposicion(diego, [b, a]).gastado, 20);
  const c = mov({ monto: 20, hora: "10:00" });
  const d = mov({ tipo: "TRASPASO", cuenta_id: "banco", destino_id: "diego", monto: 50, hora: "10:00" }); // la entrada es posterior
  assert.equal(reposicion(diego, [c, d]).gastado, 0);
});

test("repartir: partes iguales sin perder centavos", () => {
  assert.deepEqual(repartir(20, ["a", "b"]).map((p) => p.monto), [10, 10]);
  const tres = repartir(10, ["a", "b", "c"]).map((p) => p.monto);
  assert.deepEqual(tres, [3.33, 3.33, 3.34]);
  assert.equal(tres.reduce((a, b) => a + b, 0).toFixed(2), "10.00");
  assert.deepEqual(repartir(5, []), []);
});

test("para quién fue: lo indicado; si no, la persona a la que se le pagó (salvo proveedores)", () => {
  const porId = new Map([persona({ id: "hernan", tipo: "OBRA" }), persona({ id: "aurea", tipo: "PROVEEDOR" })].map((p) => [p.id, p]));
  assert.deepEqual(beneficiarios(mov({ pagado_a_id: "aurea", para: [{ persona_id: "hernan", monto: 20 }] }), porId), [{ persona_id: "hernan", monto: 20 }]);
  assert.deepEqual(beneficiarios(mov({ monto: 38, pagado_a_id: "hernan" }), porId), [{ persona_id: "hernan", monto: 38 }]); // el pasaje yapeado al que viaja
  assert.deepEqual(beneficiarios(mov({ pagado_a_id: "aurea" }), porId), []); // al proveedor no se le carga
  assert.deepEqual(beneficiarios(mov({}), porId), []);
});

test("gasto por persona: menús y pasajes de los practicantes en un rango", () => {
  const personas = [persona({ id: "ana", nombre: "Ana", tipo: "PRACTICANTE" }), persona({ id: "luis", nombre: "Luis", tipo: "OBRA" }), persona({ id: "aurea", tipo: "PROVEEDOR" })];
  const movs = [
    mov({ monto: 20, pagado_a_id: "aurea", para: [{ persona_id: "ana", monto: 10 }, { persona_id: "luis", monto: 10 }] }), // menú de dos
    mov({ monto: 38, categoria: "Movilidad", subcategoria: "Pasajes", pagado_a_id: "ana" }), // pasaje yapeado a Ana
    mov({ monto: 12, fecha: "2026-09-01" }), // fuera de rango
    mov({ tipo: "INGRESO", cuenta_id: "banco", monto: 500, categoria: "Venta", subcategoria: "", para: [{ persona_id: "ana", monto: 500 }] }), // no es gasto
    mov({ monto: 7, para: [{ persona_id: "ana", monto: 7 }], categoria: "Viáticos", subcategoria: "Menú" }),
  ];
  const todos = gastoPorPersona(movs, personas, "2026-10-01", "2026-10-31");
  assert.deepEqual(todos.map((g) => [g.persona.id, g.total]), [["ana", 55], ["luis", 10]]);
  assert.deepEqual(todos[0].porCategoria, { "Viáticos · Menú": 17, "Movilidad · Pasajes": 38 });
  const soloPracticantes = gastoPorPersona(movs, personas, "2026-10-01", "2026-10-31", ["PRACTICANTE"]);
  assert.deepEqual(soloPracticantes.map((g) => g.persona.id), ["ana"]);
});

test("validar movimiento", () => {
  const cs = [diego, banco];
  const ok = { tipo: "EGRESO" as const, fecha: "2026-10-28", cuenta_id: "diego", destino_id: "", monto: 8, categoria: "Viáticos", subcategoria: "Menú", para: [] };
  assert.deepEqual(validarMov(ok, cs), {});
  assert.ok(validarMov({ ...ok, monto: 0 }, cs).monto);
  assert.ok(validarMov({ ...ok, cuenta_id: "x" }, cs).cuenta);
  assert.ok(validarMov({ ...ok, categoria: "" }, cs).categoria);
  assert.ok(validarMov({ ...ok, categoria: "Gastos fijos", subcategoria: "" }, cs).subcategoria); // obligatoria
  assert.deepEqual(validarMov({ ...ok, categoria: "Material", subcategoria: "" }, cs), {}); // opcional en el resto
  assert.ok(validarMov({ ...ok, subcategoria: "Pasajes" }, cs).subcategoria); // no es de Viáticos
  assert.ok(validarMov({ ...ok, fecha: "" }, cs).fecha);
  // traspaso: sin categoría, pero con destino distinto
  const t = { ...ok, tipo: "TRASPASO" as const, categoria: "", subcategoria: "", destino_id: "banco" };
  assert.deepEqual(validarMov(t, cs), {});
  assert.ok(validarMov({ ...t, destino_id: "diego" }, cs).destino);
  assert.ok(validarMov({ ...t, destino_id: "" }, cs).destino);
  // reparto
  assert.deepEqual(validarMov({ ...ok, monto: 20, para: [{ persona_id: "a", monto: 10 }, { persona_id: "b", monto: 10 }] }, cs), {});
  assert.ok(validarMov({ ...ok, monto: 20, para: [{ persona_id: "a", monto: 15 }, { persona_id: "b", monto: 10 }] }, cs).para);
  assert.ok(validarMov({ ...ok, para: [{ persona_id: "a", monto: 0 }] }, cs).para);
  // ingreso usa sus propias categorías
  assert.deepEqual(validarMov({ ...ok, tipo: "INGRESO", categoria: "Venta", subcategoria: "" }, cs), {});
  assert.ok(validarMov({ ...ok, tipo: "INGRESO", categoria: "Viáticos" }, cs).categoria);
});

test("número de operación repetido se detecta (y no cuenta contra sí mismo)", () => {
  const a = mov({ nro_operacion: "10470373" });
  assert.equal(buscarDuplicado([a], "10470373")?.id, a.id);
  assert.equal(buscarDuplicado([a], " 10470373 ")?.id, a.id);
  assert.equal(buscarDuplicado([a], "10470373", a.id), undefined);
  assert.equal(buscarDuplicado([a], ""), undefined);
  assert.equal(buscarDuplicado([a], "999"), undefined);
});

test("fusionar: el servidor manda salvo lo pendiente y lo borrado; conserva las fotos locales", () => {
  const foto = { id: "f1", mime: "image/jpeg", bytes: 1, localKey: "k1", synced: false };
  const a = mov({ id: "a", concepto: "local" });
  const b = mov({ id: "b", concepto: "local sin enviar" });
  const c = mov({ id: "c", adjuntos: [foto] });
  const sa = { ...a, concepto: "del servidor" };
  const sc = { ...c, adjuntos: [{ id: "f1", mime: "image/jpeg", bytes: 1, synced: true }] };
  const sd = mov({ id: "d" });
  const r = fusionarMovs([a, b, c], [sa, sc, sd], new Set(["b"]), new Set(["d"]));
  assert.deepEqual(r.map((m) => m.id).sort(), ["a", "b", "c"]);
  assert.equal(r.find((m) => m.id === "a")!.concepto, "del servidor");
  assert.equal(r.find((m) => m.id === "b")!.concepto, "local sin enviar");
  assert.equal(r.find((m) => m.id === "c")!.adjuntos[0].localKey, "k1"); // sigue la copia local
  assert.equal(r.find((m) => m.id === "a")!.servidor, true);
  // por id (cuentas/personas)
  const l = [persona({ id: "x", nombre: "local" }), persona({ id: "y", nombre: "nuevo local" })];
  const s = [persona({ id: "x", nombre: "servidor" })];
  assert.deepEqual(fusionarPorId(l, s, new Set(["y"])).map((p) => p.nombre), ["servidor", "nuevo local"]);
  assert.deepEqual(fusionarPorId(l, s, new Set(["x"])).map((p) => p.nombre), ["local", "nuevo local"].slice(0, 1));
});

test("solicitud de reposición: texto y enlaces", () => {
  const movs = [mov({ monto: 100, concepto: "gasolina", pagado_a: "Diego A Lazo J" }), mov({ monto: 8, concepto: "Menú" })];
  const r = reposicion(diego, movs);
  const t = textoReposicion(diego, r, "2026-10-28");
  assert.match(t, /Yape Diego/);
  assert.match(t, /Monto sugerido a reponer: S\/ 108\.00/);
  assert.match(t, /gasolina · Diego A Lazo J · S\/ 100\.00/);
  assert.match(t, /aviso al bajar de S\/ 40\.00/);
  const wa = enlaceWhatsApp("+51 999 888 777", "hola & chau");
  assert.equal(wa, "https://wa.me/51999888777?text=hola%20%26%20chau");
  assert.match(enlaceTelegram("hola"), /^https:\/\/t\.me\/share\/url\?/);
});
