/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriaDeMensaje, detectarFormato, expandirMensaje, leerMonto, parseCaptura, sugerir } from "./captura";

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

test("mensaje: categoría y siglas", () => {
  assert.deepEqual(categoriaDeMensaje("Menú Hernán y Cristian"), { categoria: "Viáticos", subcategoria: "Menú" });
  assert.deepEqual(categoriaDeMensaje("gasolina"), { categoria: "Movilidad", subcategoria: "Combustible" });
  assert.deepEqual(categoriaDeMensaje("pax aqp mlq"), { categoria: "Movilidad", subcategoria: "Pasajes" });
  assert.equal(categoriaDeMensaje("adolod aqo moq"), undefined);
  assert.equal(expandirMensaje("pax aqp mlq"), "Pasaje AQP MOQ");
});

const CATS = ["Movilidad", "Viáticos", "Material", "Proveedores", "Otros egresos"];
test("sugerir: monto, fecha, destinatario, operación y categoría del mensaje", () => {
  const b = sugerir(parseCaptura(BCP_2), "2026-10-28", CATS);
  assert.deepEqual([b.monto, b.fecha, b.destinatario, b.operacion, b.categoria, b.subcategoria], ["38.00", "2026-10-26", "Jose A Merma M", "06219952", "Movilidad", ""]);
  assert.equal(b.descripcion, "Pasajes · Pasaje AQP MOQ");
  assert.deepEqual(b.avisos, []);
  const y = sugerir(parseCaptura(YAPE_2, "S/8"), "2026-10-28", CATS);
  assert.equal(y.descripcion, "Yape a Electronica Gonzales E.i.r.");
  assert.equal(y.categoria, "");
});

test("sugerir: lo que no se lee se avisa y no se inventa", () => {
  const b = sugerir(parseCaptura(YAPE_1), "2026-10-28", CATS); // sin franja del monto
  assert.equal(b.monto, "");
  assert.ok(b.avisos.some((a) => /monto/.test(a)));
  const raro = sugerir(parseCaptura(["Boleta de venta", "Total 10"]), "2026-10-28", CATS);
  assert.equal(raro.fecha, "2026-10-28");
  assert.ok(raro.avisos.some((a) => /tipo de captura/.test(a)));
  assert.ok(raro.avisos.some((a) => /fecha/.test(a)));
});
