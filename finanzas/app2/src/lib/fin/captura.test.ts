/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarPersona, categoriaDeMensaje, coincideNombre, detectarFormato, expandirMensaje, leerMonto, parseCaptura, personasEnMensaje, sugerir, type Contexto } from "./captura";
import type { Cuenta, Mov, Persona } from "./types";

// Textos tal como los devolvió el OCR con las capturas reales del 26–28 oct 2026 (incluidos sus defectos).
const YAPE_1 = ["a Na", "¡Yapeaste!", "Ricardo Coa*", "AS 28 oct. 2026 | (O) 11:30 a. m.", "CÓDIGO DE SEGURIDAD SA ES", "DATOS DE LA TRANSACCIÓN", "Nro. de celular IR ZA", "Destino Yape", "Nro. de operación 10470373", "", "a ui"];
const YAPE_2 = ["a de", "¡Yapeaste!", "Electronica Gonzales E.i.r.!", "8 27 oct. 2026 | (O) 06:07 p. m.", "CÓDIGO DE SEGURIDAD 4 1 1", "DATOS DE LA TRANSACCIÓN", "Nro. de celular EREREES TEST", "Destino Yape", "Nro. de operación 22397411", "ho A"];
const YAPE_3 = ["a A", "¡Yapeaste!", "Aurea Val*", "8 27 oct. 2026 | O 1:35 p.m.", "", "YH Menú Hernán y Cristian", "", "CÓDIGO DE SEGURIDAD 08 8", "DATOS DE LA TRANSACCIÓN", "Nro. de celular LE", "Destino Yape", "Nro. de operación 15961088", "ho A"];
const BCP_1 = ["2BCP>", "¡Operación exitosa!", "S/ 30.00", "Miércoles 28 Octubre 2026 - 06:31 am.", "Enviado a Edilberto Arocutipa J", "AXA AX", "YAPE", "Comisión Gratis", "Desde Cuenta Corriente", "AAA 2000", "Número de operación 00310080", "Mensaje", "adolod aqo moq"];
const BCP_2 = [">BCP>", "¡Operación exitosa!", "S/ 38.00", "Lunes 26 Octubre 2026 - 08:33 pm.", "Enviado a Jose A Merma M", "AXA AX", "YAPE", "Comisión Gratis", "Desde Cuenta Corriente", "AAA 2000", "Número de operación 06219952", "Mensaje", "pax aqp mlq"];
const BCP_3 = ["2BCP>", "¡Operación exitosa!", "S/ 100.00", "Lunes 26 Octubre 2026 - 07:54 pm.", "Enviado a Diego A Lazo J", "AXA AX", "YAPE", "Comisión Gratis", "Desde Corriente Soles", "1e* 7074", "Número de operación 05940471", "Mensaje", "gasolina"];

test("Yape: nombre, fecha, hora, operación y mensaje; el monto viene de la franja grande", () => {
  assert.deepEqual(parseCaptura(YAPE_1, "S/11"), { formato: "YAPE", monto: 11, nombre: "Ricardo Coa*", fecha: "2026-10-28", hora: "11:30", mensaje: "", nro_operacion: "10470373", referencia: "" });
  const y2 = parseCaptura(YAPE_2, "S/8");
  assert.equal(y2.monto, 8);
  assert.equal(y2.nombre, "Electronica Gonzales E.i.r.!");
  assert.deepEqual([y2.fecha, y2.hora, y2.nro_operacion], ["2026-10-27", "18:07", "22397411"]);
  const y3 = parseCaptura(YAPE_3, "20");
  assert.equal(y3.monto, 20);
  assert.equal(y3.nombre, "Aurea Val*");
  assert.equal(y3.mensaje, "Menú Hernán y Cristian"); // sin el "YH" del ícono
  assert.deepEqual([y3.fecha, y3.hora], ["2026-10-27", "13:35"]);
  // sin la franja del monto no se inventa nada
  assert.equal(parseCaptura(YAPE_1).monto, 0);
});

test("BCP: monto, destinatario, fecha, cuenta de origen, mensaje", () => {
  assert.deepEqual(parseCaptura(BCP_1), { formato: "BCP", monto: 30, nombre: "Edilberto Arocutipa J", fecha: "2026-10-28", hora: "06:31", mensaje: "adolod aqo moq", nro_operacion: "00310080", referencia: "2000" });
  const b2 = parseCaptura(BCP_2);
  assert.deepEqual([b2.monto, b2.nombre, b2.fecha, b2.hora, b2.referencia, b2.mensaje], [38, "Jose A Merma M", "2026-10-26", "20:33", "2000", "pax aqp mlq"]);
  const b3 = parseCaptura(BCP_3);
  assert.deepEqual([b3.monto, b3.nombre, b3.hora, b3.referencia, b3.mensaje, b3.nro_operacion], [100, "Diego A Lazo J", "19:54", "7074", "gasolina", "05940471"]);
});

test("formato y montos", () => {
  assert.equal(detectarFormato("¡Yapeaste!\nS/ 8"), "YAPE");
  assert.equal(detectarFormato("¡Operación exitosa!"), "BCP");
  assert.equal(detectarFormato("Boleta de venta electrónica"), "OTRO");
  assert.equal(leerMonto("S/11"), 11);
  assert.equal(leerMonto("S/ 1,234.50"), 1234.5);
  assert.equal(leerMonto("38.00"), 38);
  assert.equal(leerMonto("S/ 1.234,50"), 1234.5);
  assert.equal(leerMonto("20"), 20);
  assert.equal(leerMonto("S/"), 0);
  assert.equal(leerMonto(""), 0);
});

test("horas en 12 h: mediodía y medianoche", () => {
  const h = (t: string) => parseCaptura(["¡Yapeaste!", "Ana", `28 oct. 2026 | ${t}`, "CÓDIGO DE SEGURIDAD 1 2 3"]).hora;
  assert.equal(h("12:05 p. m."), "12:05");
  assert.equal(h("12:05 a. m."), "00:05");
  assert.equal(h("1:35 p.m."), "13:35");
  assert.equal(h("11:30 a. m."), "11:30");
});

// ---- libreta y sugerencias ----
const persona = (p: Partial<Persona> & { id: string; nombre: string }): Persona => ({ tipo: "OBRA", alias: [], menu_monto: 0, activa: true, updated_at: "", ...p });
const cuenta = (p: Partial<Cuenta> & { id: string }): Cuenta => ({ nombre: p.id, tipo: "YAPE", titular: "", referencia: "", saldo_inicial: 0, saldo_base: 0, umbral: 0, aviso_whatsapp: "", aviso_telegram: "", activa: true, orden: 0, updated_at: "", ...p });
const personas = [
  persona({ id: "hernan", nombre: "Hernán Quispe Ramos" }),
  persona({ id: "cristian", nombre: "Cristian Mamani Paz", tipo: "PRACTICANTE" }),
  persona({ id: "aurea", nombre: "Aurea Valdivia", tipo: "PROVEEDOR" }),
  persona({ id: "edilberto", nombre: "Edilberto Arocutipa Jiménez" }),
  persona({ id: "jose", nombre: "José Antonio Merma Mamani" }),
  persona({ id: "ricardo", nombre: "Ricardo Coaquira", alias: ["Ricardo Coa*"] }),
  persona({ id: "planilla", nombre: "Hernán Soto", tipo: "PLANILLA" }),
];
const cuentas = [
  cuenta({ id: "cc2000", nombre: "Cta. cte. 2000", tipo: "BANCO", referencia: "2000" }),
  cuenta({ id: "cc7074", nombre: "Cta. cte. 7074", tipo: "BANCO", referencia: "7074" }),
  cuenta({ id: "diego", nombre: "Yape Diego", titular: "Diego" }),
  cuenta({ id: "milagros", nombre: "Yape Milagros", titular: "Milagros" }),
];
const ctx = (extra: Partial<Contexto> = {}): Contexto => ({ cuentas, personas, movs: [], miCuentaId: "milagros", hoy: "2026-10-28", ahora: "12:00", ...extra });
const mov = (p: Partial<Mov>): Mov => ({ id: "x", tipo: "EGRESO", fecha: "2026-10-20", hora: "10:00", cuenta_id: "milagros", destino_id: "", monto: 10, categoria: "", subcategoria: "", concepto: "", pagado_a: "", pagado_a_id: "", para: [], nro_operacion: "", origen: "MANUAL", adjuntos: [], creado_por: "", creado: "2026-10-20T10:00:00Z", updated_at: "", ...p });

test("nombres cortados o abreviados coinciden con la libreta", () => {
  assert.ok(coincideNombre("Edilberto Arocutipa J", "Edilberto Arocutipa Jiménez"));
  assert.ok(coincideNombre("Jose A Merma M", "José Antonio Merma Mamani"));
  assert.ok(coincideNombre("Aurea Val*", "Aurea Valdivia"));
  assert.ok(!coincideNombre("Jose A Merma M", "José Pérez Merma"));
  assert.ok(!coincideNombre("Ricardo", "Ricardo Coaquira")); // una sola palabra no alcanza
  assert.equal(buscarPersona("Ricardo Coa*", personas)?.id, "ricardo");
  assert.equal(buscarPersona("Edilberto Arocutipa J", personas)?.id, "edilberto");
  assert.equal(buscarPersona("Alguien Desconocido", personas), undefined);
  // dos personas posibles → no se adivina
  assert.equal(buscarPersona("Hernán Q*", [...personas, persona({ id: "hq2", nombre: "Hernán Quiroz" })]), undefined);
});

test("mensaje: categoría, siglas y nombres de pila", () => {
  assert.deepEqual(categoriaDeMensaje("Menú Hernán y Cristian"), { categoria: "Viáticos", subcategoria: "Menú" });
  assert.deepEqual(categoriaDeMensaje("gasolina"), { categoria: "Movilidad", subcategoria: "Combustible" });
  assert.deepEqual(categoriaDeMensaje("pax aqp mlq"), { categoria: "Movilidad", subcategoria: "Pasajes" });
  assert.equal(categoriaDeMensaje("adolod aqo moq"), undefined);
  assert.equal(expandirMensaje("pax aqp mlq"), "Pasaje AQP MOQ");
  const sinPlanilla = personas.filter((p) => p.id !== "planilla");
  const r = personasEnMensaje("Menú Hernán y Cristian", sinPlanilla);
  assert.deepEqual(r.encontradas.map((p) => p.id), ["hernan", "cristian"]);
  assert.deepEqual(r.sinReconocer, []);
  assert.deepEqual(personasEnMensaje("Menú Hernán, Pedro", sinPlanilla).sinReconocer, ["Pedro"]);
  // dos "Hernán" en el equipo → no adivina cuál
  assert.deepEqual(personasEnMensaje("Menú Hernán", personas).sinReconocer, ["Hernán"]);
});

test("sugerir: menú de Yape (el proveedor cobra, el gasto va a los que comieron)", () => {
  const sin = personas.filter((p) => p.id !== "planilla");
  const b = sugerir(parseCaptura(YAPE_3, "20"), ctx({ personas: sin }));
  assert.equal(b.tipo, "EGRESO");
  assert.equal(b.cuenta_id, "milagros"); // la cuenta de quien registra
  assert.equal(b.pagado_a_id, "aurea");
  assert.deepEqual([b.categoria, b.subcategoria, b.concepto], ["Viáticos", "Menú", "Menú Hernán y Cristian"]);
  assert.deepEqual(b.para, [{ persona_id: "hernan", monto: 10 }, { persona_id: "cristian", monto: 10 }]);
  assert.deepEqual(b.avisos, []);
  assert.equal(b.fecha, "2026-10-27");
  assert.equal(b.hora, "13:35");
});

test("sugerir: avisa si el menú es para alguien en planilla", () => {
  const b = sugerir(parseCaptura(["¡Yapeaste!", "Aurea Val*", "27 oct. 2026 | 1:35 p.m.", "Menú Hernán Soto", "CÓDIGO DE SEGURIDAD 0 8 8"], "20"), ctx({ personas: [personas[2], personas[6]] }));
  assert.deepEqual(b.para.map((p) => p.persona_id), ["planilla"]);
  assert.match(b.avisos.join(" "), /Hernán Soto está en planilla: no recibe menú/);
});

test("sugerir: BCP elige la cuenta por los últimos 4 dígitos y reconoce pasajes", () => {
  const b = sugerir(parseCaptura(BCP_2), ctx());
  assert.equal(b.cuenta_id, "cc2000");
  assert.equal(b.pagado_a_id, "jose");
  assert.deepEqual([b.categoria, b.subcategoria, b.concepto], ["Movilidad", "Pasajes", "Pasaje AQP MOQ"]);
  assert.deepEqual(b.para, []); // el pasaje va a quien se le yapeó (lo resuelve beneficiarios())
  assert.equal(b.tipo, "EGRESO");
  const otra = sugerir(parseCaptura(BCP_1), ctx({ cuentas: cuentas.filter((c) => c.id !== "cc2000") }));
  assert.match(otra.avisos.join(" "), /termine en 2000/);
});

test("sugerir: un pago a otra cuenta propia se propone como traspaso (Milagros → Diego, combustible)", () => {
  const b = sugerir(parseCaptura(BCP_3), ctx());
  assert.equal(b.sugiereTraspaso, true);
  assert.equal(b.tipo, "TRASPASO");
  assert.equal(b.cuenta_id, "cc7074");
  assert.equal(b.destino_id, "diego");
  assert.equal(b.monto, 100);
  assert.equal(b.concepto, "gasolina");
  // si "Diego" fuera además una persona de la libreta, no se asume
  const conDiego = sugerir(parseCaptura(BCP_3), ctx({ personas: [...personas, persona({ id: "diego_p", nombre: "Diego Alberto Lazo Jiménez" })] }));
  assert.equal(conDiego.sugiereTraspaso, false);
});

test("sugerir: aprende del historial y avisa los duplicados", () => {
  const historial = [
    mov({ id: "1", pagado_a: "Ricardo Coa*", pagado_a_id: "ricardo", categoria: "Viáticos", subcategoria: "Menú", concepto: "Menú", monto: 11 }),
    mov({ id: "2", pagado_a: "Ricardo Coa*", pagado_a_id: "ricardo", categoria: "Viáticos", subcategoria: "Menú", concepto: "Menú", monto: 11, fecha: "2026-10-21", creado: "2026-10-21T10:00:00Z" }),
    mov({ id: "3", pagado_a: "Ricardo Coa*", pagado_a_id: "ricardo", categoria: "Material", subcategoria: "", concepto: "tornillos", monto: 5, fecha: "2026-10-22", creado: "2026-10-22T10:00:00Z" }),
  ];
  const b = sugerir(parseCaptura(YAPE_1, "S/11"), ctx({ movs: historial }));
  assert.equal(b.pagado_a_id, "ricardo");
  assert.deepEqual([b.categoria, b.subcategoria, b.concepto], ["Viáticos", "Menú", "Menú"]); // lo más frecuente, no lo último
  assert.deepEqual(b.avisos, []);
  const repetida = sugerir(parseCaptura(YAPE_1, "S/11"), ctx({ movs: [mov({ id: "9", nro_operacion: "10470373" })] }));
  assert.equal(repetida.duplicadoDe?.id, "9");
  assert.match(repetida.avisos.join(" "), /ya está registrada/);
});

test("sugerir: lo que no se lee se avisa y no se inventa", () => {
  const b = sugerir(parseCaptura(YAPE_1), ctx({ hoy: "2026-10-28" })); // sin franja del monto
  assert.equal(b.monto, 0);
  assert.match(b.avisos.join(" "), /No pude leer el monto/);
  const raro = sugerir(parseCaptura(["Boleta de venta", "Total 10"]), ctx());
  assert.equal(raro.fecha, "2026-10-28");
  assert.match(raro.avisos.join(" "), /No reconocí el tipo/);
  assert.match(raro.avisos.join(" "), /fecha/);
});
