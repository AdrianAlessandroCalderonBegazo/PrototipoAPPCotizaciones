/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBloqueo, diaCerrado, esDiaPasado } from "./bloqueo";

const reloj = () => {
  let t = 1_000_000;
  return { ahora: () => t, avanzar: (ms: number) => void (t += ms) };
};

test("solo los días anteriores a hoy se consideran pasados", () => {
  assert.equal(esDiaPasado("2026-10-22", "2026-10-23"), true);
  assert.equal(esDiaPasado("2026-10-23", "2026-10-23"), false);
  assert.equal(esDiaPasado("2026-12-01", "2026-10-23"), false);
});

test("empieza cerrado; el código correcto lo abre 10 minutos y luego se cierra solo", () => {
  const r = reloj();
  const b = crearBloqueo({ codigo: "1234", ahora: r.ahora });
  assert.equal(b.abierto(), false);
  assert.deepEqual(b.desbloquear(" 1234 "), { ok: true }); // tolera espacios
  assert.equal(b.abierto(), true);
  assert.equal(b.restanteMs(), 10 * 60_000);
  r.avanzar(9 * 60_000 + 59_000);
  assert.equal(b.abierto(), true);
  r.avanzar(1_001);
  assert.equal(b.abierto(), false);
  assert.equal(b.restanteMs(), 0);
});

test("código incorrecto no abre y cuenta los intentos que quedan", () => {
  const b = crearBloqueo({ codigo: "1234", ahora: reloj().ahora });
  assert.deepEqual(b.desbloquear("0000"), { ok: false, razon: "codigo", intentosRestantes: 4 });
  assert.deepEqual(b.desbloquear(""), { ok: false, razon: "codigo", intentosRestantes: 3 });
  assert.equal(b.abierto(), false);
  assert.deepEqual(b.desbloquear("1234"), { ok: true });
  // un acierto reinicia la cuenta de fallos
  b.bloquear();
  assert.deepEqual(b.desbloquear("9"), { ok: false, razon: "codigo", intentosRestantes: 4 });
});

test("5 fallos seguidos obligan a esperar 30 s, incluso con el código bueno", () => {
  const r = reloj();
  const b = crearBloqueo({ codigo: "1234", ahora: r.ahora });
  for (let i = 0; i < 4; i++) b.desbloquear("x");
  assert.deepEqual(b.desbloquear("x"), { ok: false, razon: "espera", esperaMs: 30_000 });
  r.avanzar(10_000);
  assert.deepEqual(b.desbloquear("1234"), { ok: false, razon: "espera", esperaMs: 20_000 });
  assert.equal(b.abierto(), false);
  r.avanzar(20_001);
  assert.deepEqual(b.desbloquear("1234"), { ok: true });
});

test("bloquear cierra de inmediato y avisa a los suscritos", () => {
  const b = crearBloqueo({ codigo: "1234", ahora: reloj().ahora });
  let avisos = 0;
  const quitar = b.subscribe(() => avisos++);
  const v0 = b.version();
  b.desbloquear("1234");
  assert.equal(avisos, 1);
  b.bloquear();
  assert.equal(b.abierto(), false);
  assert.equal(avisos, 2);
  assert.ok(b.version() > v0);
  b.bloquear(); // ya cerrado: no hace ruido
  assert.equal(avisos, 2);
  quitar();
  b.desbloquear("1234");
  assert.equal(avisos, 2);
});

test("días cerrados: hoy y los 2 anteriores se registran libres; más atrás pide código", () => {
  assert.equal(diaCerrado("2026-10-28", "2026-10-28"), false);
  assert.equal(diaCerrado("2026-10-27", "2026-10-28"), false);
  assert.equal(diaCerrado("2026-10-26", "2026-10-28"), false); // antes de ayer: todavía libre
  assert.equal(diaCerrado("2026-10-25", "2026-10-28"), true);
  assert.equal(diaCerrado("2026-09-01", "2026-10-28"), true);
  assert.equal(diaCerrado("2026-11-02", "2026-10-28"), false); // fecha futura: no se cierra
  assert.equal(diaCerrado("2026-12-30", "2027-01-01"), false); // cruza de año
  assert.equal(diaCerrado("2026-12-29", "2027-01-01"), true);
  assert.equal(diaCerrado("2026-10-27", "2026-10-28", 0), true); // sin ventana: ayer ya está cerrado
});
