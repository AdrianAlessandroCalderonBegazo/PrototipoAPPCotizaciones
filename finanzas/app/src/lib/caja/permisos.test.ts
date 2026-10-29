import { test } from "node:test";
import assert from "node:assert/strict";
import { diaCerrado, motivoSoloLectura, normalizarPermisos, permisosDeRol, puedeEditarDia, SIN_PERMISOS } from "./permisos";
import { describirCambio, diferencias } from "./revision";

const HOY = "2026-10-22";

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

test("un día se puede editar según nivel, fecha y cierre", () => {
  const lectura = { ...SIN_PERMISOS, acceso: true, revisar: true };
  const fin = permisosDeRol("contabilidad");
  assert.equal(puedeEditarDia(lectura, HOY, HOY, false), false);
  assert.equal(puedeEditarDia(fin, "2026-10-21", HOY, false), true);
  assert.equal(puedeEditarDia(fin, HOY, HOY, true), false);
  assert.match(motivoSoloLectura(lectura, HOY, HOY, false) ?? "", /solo lectura/);
  assert.match(motivoSoloLectura(fin, HOY, HOY, true) ?? "", /cerrado/);
  assert.equal(motivoSoloLectura(fin, HOY, HOY, false), null);
});

test("un día anterior a uno cerrado también queda cerrado, pero no al revés ni en la otra ciudad", () => {
  const hojas = {
    "AQP|2026-10-21": { ciudad: "AQP", fecha: "2026-10-21" },
    "AQP|2026-10-22": { ciudad: "AQP", fecha: "2026-10-22", cierre: {} },
    "MOQ|2026-10-20": { ciudad: "MOQ", fecha: "2026-10-20" },
  };
  assert.equal(diaCerrado(hojas, "AQP", "2026-10-21"), true);
  assert.equal(diaCerrado(hojas, "AQP", "2026-10-22"), true);
  assert.equal(diaCerrado(hojas, "AQP", "2026-10-23"), false);
  assert.equal(diaCerrado(hojas, "MOQ", "2026-10-20"), false);
});

test("el historial de cambios se lee en español con el valor anterior", () => {
  assert.deepEqual(diferencias({ caja_salida_efectivo: 20, descripcion: "Cable" }, { caja_salida_efectivo: 25, descripcion: "Cable" }), ["salida en efectivo: S/ 20.00 → S/ 25.00"]);
  const c = describirCambio({ accion: "cerrar", entidad: "hoja", antes: null, despues: { efectivo_contado: 190, saldo_calculado: 200, diferencia: -10 }, motivo: "vuelto" });
  assert.match(c.titulo, /falta S\/ 10\.00/);
  assert.ok(c.detalle.includes("nota: vuelto"));
  assert.match(describirCambio({ accion: "reabrir", entidad: "hoja", antes: null, despues: null, motivo: "recibo" }).detalle[0], /recibo/);
});
