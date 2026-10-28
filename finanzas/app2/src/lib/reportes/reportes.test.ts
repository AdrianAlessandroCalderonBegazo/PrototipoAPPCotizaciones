/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { armarReporte, cargarReporte, datosLocales, nombreArchivo, paraTexto, totalesReporte, type Reporte } from "./model";
import { generarCsv } from "./csv";
import { generarXlsx } from "./xlsx";
import { diasDeRango, errorDeRango, rangoPreset } from "./periodo";
import type { Snapshot } from "../fin/sync";
import type { Cuenta, Mov, Persona } from "../fin/types";
import type { State } from "../fin/store";

const cuenta = (p: Partial<Cuenta> & { id: string }): Cuenta => ({ nombre: p.id, tipo: "YAPE", titular: "", referencia: "", saldo_inicial: 0, saldo_base: p.saldo_inicial ?? 0, umbral: 0, aviso_whatsapp: "", aviso_telegram: "", activa: true, orden: 0, updated_at: "", ...p });
const persona = (p: Partial<Persona> & { id: string; nombre: string }): Persona => ({ tipo: "OBRA", alias: [], menu_monto: 0, activa: true, updated_at: "", ...p });
let n = 0;
const mov = (p: Partial<Mov>): Mov => ({ id: `m${++n}`, tipo: "EGRESO", fecha: "2026-10-27", hora: "10:00", cuenta_id: "diego", destino_id: "", monto: 10, categoria: "Viáticos", subcategoria: "Menú", concepto: "", pagado_a: "", pagado_a_id: "", para: [], nro_operacion: "", origen: "MANUAL", adjuntos: [], creado_por: "ana", creado: `2026-10-27T10:00:${String(n).padStart(2, "0")}Z`, updated_at: "", ...p });

const ana = persona({ id: "ana", nombre: "Ana Quispe", tipo: "PRACTICANTE" });
const luis = persona({ id: "luis", nombre: "Luis Mamani" });
const eva = persona({ id: "eva", nombre: "Eva Soto", tipo: "PRACTICANTE" }); // practicante sin gasto
const aurea = persona({ id: "aurea", nombre: "Aurea Valdivia", tipo: "PROVEEDOR" });

const datos = (): Snapshot => ({
  cuentas: [cuenta({ id: "banco", nombre: "Cta. cte. 2000", tipo: "BANCO", saldo_inicial: 5000, saldo_base: 5000 }), cuenta({ id: "diego", nombre: "Yape Diego", titular: "Diego", saldo_inicial: 300, saldo_base: 280 }), cuenta({ id: "milagros", nombre: "Yape Milagros", saldo_inicial: 300, saldo_base: 300 })],
  personas: [ana, luis, eva, aurea],
  movs: [
    mov({ monto: 20, pagado_a: "Aurea Val*", pagado_a_id: "aurea", concepto: "Menú", para: [{ persona_id: "ana", monto: 10 }, { persona_id: "luis", monto: 10 }], adjuntos: [{ id: "f1", mime: "image/jpeg", bytes: 1, synced: true }] }),
    mov({ monto: 38, categoria: "Movilidad", subcategoria: "Pasajes", pagado_a: "Ana Quispe", pagado_a_id: "ana", concepto: "Pasaje AQP MOQ", hora: "11:00" }),
    mov({ tipo: "TRASPASO", cuenta_id: "banco", destino_id: "diego", monto: 200, categoria: "", subcategoria: "", concepto: "reposición", hora: "12:00" }),
    mov({ tipo: "INGRESO", cuenta_id: "banco", monto: 1000, categoria: "Venta", subcategoria: "", concepto: "Panel solar", pagado_a: "Cliente SAC", hora: "13:00" }),
    mov({ tipo: "TRASPASO", cuenta_id: "milagros", destino_id: "diego", monto: 100, categoria: "", subcategoria: "", concepto: "gasolina", fecha: "2026-10-28", hora: "08:00" }),
    mov({ monto: 11, cuenta_id: "milagros", concepto: "Menú", pagado_a: "Luis Mamani", pagado_a_id: "luis", fecha: "2026-10-28", hora: "09:00" }),
    mov({ monto: 99, fecha: "2026-09-01" }), // fuera del período
  ],
  cuadres: [{ id: "c1", cuenta_id: "diego", fecha: "2026-10-28", saldo_real: 187.5, saldo_sistema: 200, diferencia: -12.5, nota: "faltó un yapeo", creado_por: "diego", creado: "2026-10-28T20:00:00Z" }],
});
const opciones = { desde: "2026-10-01", hasta: "2026-10-31", cuentaIds: [] as string[], usuario: "Rosa Quispe", generado: "2026-10-28T20:30:00Z" };
const reporte = (extra: Partial<typeof opciones> = {}) => armarReporte({ ...opciones, ...extra }, datos());

test("resumen por cuenta: cada traspaso suma a una y resta a la otra; el total de la empresa no se mueve por traspasos", () => {
  const r = reporte();
  const por = (id: string) => r.resumen.find((x) => x.cuenta.id === id)!;
  // Yape Diego: base 280, gasta 20 + 38, recibe 200 y 100
  assert.deepEqual([por("diego").inicial, por("diego").egresos, por("diego").traspasosIn, por("diego").traspasosOut, por("diego").final], [280, 58, 300, 0, 522]);
  assert.deepEqual([por("banco").ingresos, por("banco").traspasosOut, por("banco").final], [1000, 200, 5800]);
  assert.deepEqual([por("milagros").egresos, por("milagros").traspasosOut, por("milagros").final], [11, 100, 189]);
  assert.equal(r.movs.length, 6, "el movimiento de septiembre queda fuera");
  const T = totalesReporte(r);
  assert.deepEqual([T.ingresos, T.egresos, T.traspasos, T.movimientos], [1000, 69, 300, 6]);
  // total empresa final = inicial + ingresos − egresos
  const ini = r.resumen.reduce((a, x) => a + x.inicial, 0);
  const fin = r.resumen.reduce((a, x) => a + x.final, 0);
  assert.equal(fin, ini + 1000 - 69);
});

test("filtrar por cuenta: solo lo que la toca, y el traspaso aparece para las dos puntas", () => {
  const r = reporte({ cuentaIds: ["milagros"] });
  assert.deepEqual(r.resumen.map((x) => x.cuenta.id), ["milagros"]);
  assert.equal(r.movs.length, 2); // su egreso y el traspaso que envió
  assert.equal(r.movs.some((m) => m.concepto === "gasolina"), true);
  const dos = reporte({ cuentaIds: ["diego", "milagros"] });
  assert.equal(dos.movs.filter((m) => m.concepto === "gasolina").length, 1, "un traspaso entre dos cuentas elegidas sale una sola vez");
});

test("gasto por persona y practicantes (incluye al que no tuvo gasto)", () => {
  const r = reporte();
  assert.deepEqual(r.porPersona.map((g) => [g.persona.id, g.total]), [["ana", 48], ["luis", 21]]);
  assert.deepEqual(r.porPersona[0].porCategoria, { "Viáticos · Menú": 10, "Movilidad · Pasajes": 38 });
  assert.deepEqual(r.practicantes.map((g) => [g.persona.id, g.total]), [["ana", 48], ["eva", 0]]);
  assert.equal(paraTexto(r.movs[0], r.personas), "Ana Quispe (S/ 10.00), Luis Mamani (S/ 10.00)");
  assert.equal(paraTexto(r.movs[1], r.personas), "");
});

test("por categoría: egresos e ingresos por separado, de mayor a menor", () => {
  const r = reporte();
  assert.deepEqual(r.porCategoria.map((x) => [x.tipo, x.categoria, x.subcategoria, x.total, x.movimientos]), [
    ["EGRESO", "Movilidad", "Pasajes", 38, 1],
    ["EGRESO", "Viáticos", "Menú", 31, 2],
    ["INGRESO", "Venta", "", 1000, 1],
  ]);
});

test("sin conexión: el reporte se arma con lo del dispositivo y lo avisa; el saldo inicial cuenta lo anterior al período", async () => {
  const d = datos();
  // en el dispositivo solo está la ventana reciente: lo de septiembre ya quedó dentro del saldo base
  const local = { cuentas: d.cuentas, personas: d.personas, movs: d.movs.filter((m) => m.fecha >= "2026-10-01"), cuadres: d.cuadres, outbox: [], avisos: [], v: 1, usuario: "", miCuentaId: "" } as unknown as State;
  const caido = { snapshot: async () => { throw Object.assign(new Error("sin red"), { status: 0, code: "NETWORK" }); } };
  const r = await cargarReporte({ desde: "2026-10-28", hasta: "2026-10-28", cuentaIds: [], usuario: "x" }, caido, local, () => "2026-10-28T20:00:00Z");
  assert.equal(r.desdeLocal, true);
  // Yape Diego al empezar el 28: base 280 + lo del 27 (−20 −38 +200) = 422
  assert.equal(r.resumen.find((x) => x.cuenta.id === "diego")!.inicial, 422);
  assert.equal(r.resumen.find((x) => x.cuenta.id === "diego")!.final, 522);
  assert.equal(datosLocales(local, "2026-10-28").cuentas.find((c) => c.id === "milagros")!.saldo_base, 300);
  // con conexión usa lo del servidor
  const ok = await cargarReporte({ desde: "2026-10-01", hasta: "2026-10-31", cuentaIds: [], usuario: "x" }, { snapshot: async () => datos() }, local);
  assert.equal(ok.desdeLocal, false);
  // un error que no es de red se propaga
  await assert.rejects(cargarReporte({ desde: "2026-10-01", hasta: "2026-10-31", cuentaIds: [], usuario: "x" }, { snapshot: async () => { throw Object.assign(new Error("prohibido"), { status: 403 }); } }, local), /prohibido/);
});

test("CSV: el libro con BOM, comas bien escapadas y punto decimal", () => {
  const r = reporte();
  r.movs[0] = { ...r.movs[0], concepto: 'Menú "grande", con coma' };
  const bytes = generarCsv(r);
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const texto = new TextDecoder().decode(bytes);
  assert.match(texto, /Libro de movimientos/);
  assert.match(texto, /"Menú ""grande"", con coma"/);
  assert.match(texto, /2026-10-27,10:00,Yape Diego,Egreso,Viáticos · Menú,.*,20\.00,,,/);
  assert.match(texto, /2026-10-27,13:00,Cta\. cte\. 2000,Ingreso,Venta,Panel solar,Cliente SAC,,1000\.00,/);
  assert.match(texto, /Traspaso,,reposición,,,,,200\.00,Yape Diego/);
  assert.equal(texto.split("\r\n").filter((l) => /^2026-/.test(l)).length, 6);
});

test("Excel: hojas, totales con fórmula y valores correctos", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const r = reporte();
  const bytes = await generarXlsx(r);
  guardar("finanzas.xlsx", bytes);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Resumen", "Libro", "Por categoría", "Por persona", "Practicantes", "Cuadres"]);

  const rs = wb.getWorksheet("Resumen")!;
  assert.equal(rs.getRow(5).getCell(3).value, "Saldo inicial");
  const diego = [6, 7, 8].map((i) => rs.getRow(i)).find((row) => row.getCell(1).value === "Yape Diego")!;
  assert.deepEqual([3, 4, 5, 6, 7, 8].map((c) => diego.getCell(c).value), [280, 0, 58, 300, 0, 522]);

  const lb = wb.getWorksheet("Libro")!;
  assert.equal(lb.getRow(4).getCell(9).value, "Ingreso");
  assert.equal(lb.getRow(5).getCell(1).numFmt, "dd/mm/yyyy");
  assert.equal(lb.getRow(5).getCell(10).value, 20);
  assert.equal(lb.getRow(5).getCell(8).value, "Ana Quispe (S/ 10.00), Luis Mamani (S/ 10.00)");
  const tot = lb.getRow(11);
  assert.equal(tot.getCell(1).value, "TOTAL");
  assert.deepEqual((tot.getCell(9).value as { formula: string; result: number }), { formula: "SUBTOTAL(109,I5:I10)", result: 1000 });
  assert.deepEqual((tot.getCell(10).value as { result: number }).result, 69);
  assert.deepEqual((tot.getCell(11).value as { result: number }).result, 300);
  assert.ok(lb.autoFilter);
  assert.equal(lb.views[0].state, "frozen");

  const pr = wb.getWorksheet("Practicantes")!;
  assert.deepEqual([5, 6].map((i) => [pr.getRow(i).getCell(1).value, pr.getRow(i).getCell(7).value]), [["Ana Quispe", 48], ["Eva Soto", 0]]);
  assert.deepEqual([3, 4, 5, 6].map((c) => pr.getRow(5).getCell(c).value), [10, 38, 0, 0]); // menú, pasajes, combustible, otros
  const cu = wb.getWorksheet("Cuadres")!;
  assert.equal(cu.getRow(5).getCell(5).value, -12.5);
});

test("Excel: un período sin movimientos igual se genera y lo dice", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const vacio = armarReporte({ ...opciones, desde: "2025-01-01", hasta: "2025-01-02" }, datos());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await generarXlsx(vacio)) as unknown as ArrayBuffer);
  assert.match(String(wb.getWorksheet("Libro")!.getRow(5).getCell(1).value), /Sin movimientos/);
  assert.equal(wb.getWorksheet("Cuadres"), undefined);
  assert.deepEqual(vacio.practicantes.map((g) => g.total), [0, 0]);
});

test("nombre de archivo", () => {
  assert.equal(nombreArchivo({ desde: "2026-10-28", hasta: "2026-10-28", cuentaIds: [] }), "finanzas_2026-10-28");
  assert.equal(nombreArchivo({ desde: "2026-10-01", hasta: "2026-10-28", cuentaIds: [] }), "finanzas_2026-10-01_a_2026-10-28");
});

test("períodos rápidos: semana desde el lunes, mes y mes pasado", () => {
  assert.deepEqual(rangoPreset("semana", "2026-10-22"), { desde: "2026-10-19", hasta: "2026-10-22" });
  assert.deepEqual(rangoPreset("mes-pasado", "2026-01-15"), { desde: "2025-12-01", hasta: "2025-12-31" });
  assert.equal(diasDeRango("2026-10-01", "2026-10-22"), 22);
  assert.match(errorDeRango("2026-10-22", "2026-10-01"), /posterior/);
});

function guardar(nombre: string, bytes: Uint8Array) {
  const dir = process.env.REPORT_OUT;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, nombre), bytes);
}
void (null as unknown as Reporte);
