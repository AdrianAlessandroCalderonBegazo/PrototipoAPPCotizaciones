/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { encontrarTarjeta, filasVisuales, franjaMonto, proporcionMorada } from "./recorte";
import { parseCaptura } from "./captura";

/** Imagen sintética: fondo (morado o blanco) y una tarjeta blanca con "texto" oscuro. */
function imagen(w: number, h: number, fondo: [number, number, number], tarjeta?: { x0: number; y0: number; x1: number; y1: number }) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dentro = tarjeta && x >= tarjeta.x0 && x < tarjeta.x1 && y >= tarjeta.y0 && y < tarjeta.y1;
      const texto = dentro && (x % 9 < 2) && (y % 13 < 4); // píxeles oscuros dispersos dentro de la tarjeta
      const c = dentro ? (texto ? [40, 30, 60] : [255, 255, 255]) : fondo;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  return d;
}

test("detecta el morado de Yape y recorta la tarjeta blanca", () => {
  const w = 400, h = 800;
  const t = { x0: 20, y0: 170, x1: 380, y1: 560 };
  const d = imagen(w, h, [102, 0, 130], t);
  assert.ok(proporcionMorada(d, w, h) > 0.4);
  const caja = encontrarTarjeta(d, w, h)!;
  assert.ok(caja);
  // tolera el muestreo (pasos de 2 y 6 px)
  assert.ok(Math.abs(caja.x0 - t.x0) <= 6 && Math.abs(caja.x1 - t.x1) <= 6, JSON.stringify(caja));
  assert.ok(Math.abs(caja.y0 - t.y0) <= 2 && Math.abs(caja.y1 - t.y1) <= 2, JSON.stringify(caja));
});

test("una captura blanca del BCP no se toma por Yape", () => {
  const d = imagen(400, 800, [255, 255, 255]);
  assert.equal(proporcionMorada(d, 400, 800), 0);
});

test("sin tarjeta no inventa un recorte", () => {
  assert.equal(encontrarTarjeta(imagen(400, 800, [102, 0, 130]), 400, 800), null);
});

test("franja del monto: entre las dos líneas, o una franja fija", () => {
  assert.deepEqual(franjaMonto(1000, { bottom: 150 }, { top: 300 }), { y0: 148, y1: 302 });
  assert.deepEqual(franjaMonto(1000), { y0: 140, y1: 300 });
  assert.deepEqual(franjaMonto(1000, { bottom: 150 }, { top: 155 }), { y0: 140, y1: 300 }); // líneas pegadas: no sirve
});

test("filas visuales: las etiquetas de la izquierda se unen con sus valores aunque el OCR los entregue en bloques separados", () => {
  const L = (text: string, left: number, top: number): { text: string; left: number; top: number; right: number; bottom: number } => ({ text, left, top, right: left + 200, bottom: top + 30 });
  // como llegó del navegador con la captura del BCP: primero la columna de etiquetas, luego la de valores
  const lineas = [
    L("¡Operación exitosa!", 200, 190), L("S/ 30.00", 200, 330),
    L("Enviado a", 50, 600), L("Comisión", 50, 810), L("Desde", 50, 925), L("Número de operación", 50, 1090), L("Mensaje", 90, 1260),
    L("Edilberto Arocutipa J", 480, 598), L("Gratis", 700, 812), L("Cuenta Corriente", 540, 926), L("2000", 700, 975), L("00310080", 640, 1092), L("adolod aqo moq", 90, 1318),
    L("Miércoles 28 Octubre 2026 - 06:31 am.", 180, 460),
  ];
  const filas = filasVisuales(lineas);
  assert.ok(filas.includes("Enviado a Edilberto Arocutipa J"));
  assert.ok(filas.includes("Comisión Gratis"));
  assert.ok(filas.includes("Número de operación 00310080"));
  const c = parseCaptura(filas);
  assert.deepEqual([c.formato, c.monto, c.nombre, c.referencia, c.nro_operacion, c.mensaje, c.fecha, c.hora], ["BCP", 30, "Edilberto Arocutipa J", "2000", "00310080", "adolod AQP MOQ".replace("AQP", "aqo").replace("MOQ", "moq"), "2026-10-28", "06:31"]);
});
