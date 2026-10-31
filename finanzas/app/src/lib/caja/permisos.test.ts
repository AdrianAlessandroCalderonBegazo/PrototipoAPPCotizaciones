import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarPermisos, permisosDeRol, SIN_PERMISOS } from "./permisos";

test("cada rol tiene su alcance por defecto; los demás dependen de la matriz del ERP", () => {
  assert.equal(permisosDeRol("admin").reabrir, true);
  assert.equal(permisosDeRol("contabilidad").cerrar, true);
  assert.equal(permisosDeRol("contabilidad").reabrir, false);
  assert.deepEqual(permisosDeRol("tecnico"), SIN_PERMISOS);
  assert.deepEqual(permisosDeRol("VENTAS"), SIN_PERMISOS);
});

test("permisos guardados por la versión anterior: sin `escribir`, se deduce de corregir_pasado", () => {
  const viejoEncargado = { acceso: true, corregir_pasado: false, cerrar: false, reabrir: false, configurar: false, revisar: true };
  assert.equal(normalizarPermisos(viejoEncargado, "tecnico").escribir, false);
  assert.equal(normalizarPermisos({ ...viejoEncargado, corregir_pasado: true }, "contabilidad").escribir, true);
  assert.equal(normalizarPermisos(null, "admin").escribir, true);
});
