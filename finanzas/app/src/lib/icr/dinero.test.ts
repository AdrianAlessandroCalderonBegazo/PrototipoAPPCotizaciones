/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { esNegativo, leerMonto, soles } from "./dinero";

test("montos en texto, sin coma flotante", () => {
  assert.equal(soles("1234567.5"), "S/ 1,234,567.50");
  assert.equal(soles("-40.00"), "-S/ 40.00");
  assert.equal(soles("0.00"), "S/ 0.00");
  assert.equal(soles(null), "Sin dato");
  assert.equal(esNegativo("-0.00"), false);
  assert.equal(esNegativo("-3.10"), true);
  assert.equal(leerMonto("12,50"), "12.50");
  assert.equal(leerMonto("1,250.50"), "1250.50");
  assert.equal(leerMonto("0"), null);
  assert.equal(leerMonto("abc"), null);
  assert.equal(leerMonto("12.345"), null);
});
