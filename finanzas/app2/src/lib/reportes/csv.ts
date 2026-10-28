/** CSV (UTF-8 con BOM para que Excel respete las tildes): el libro completo, una fila por movimiento. */
import { TIPO_MOV_LABEL } from "../fin/types";
import { categoriaTexto, nombreCuentas, paraTexto, periodoTexto, type Reporte } from "./model";

const celda = (v: string | number | boolean) => {
  const s = typeof v === "boolean" ? (v ? "Sí" : "No") : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const linea = (xs: (string | number | boolean)[]) => xs.map(celda).join(",");
const imp = (n: number) => n.toFixed(2); // punto decimal, sin separador de miles: lo que espera cualquier hoja de cálculo

export function generarCsv(r: Reporte): Uint8Array {
  const nombre = (id: string) => r.cuentas.find((c) => c.id === id)?.nombre ?? "";
  const L: string[] = [];
  L.push(linea(["ICR Finanzas - Libro de movimientos"]));
  L.push(linea([`${nombreCuentas(r)} · ${periodoTexto(r.desde, r.hasta)}`]));
  L.push("");
  L.push(linea(["Fecha", "Hora", "Cuenta", "Tipo", "Categoría", "Concepto", "Pagado a", "Para quién", "Ingreso", "Egreso", "Traspaso", "Destino", "N° operación", "Fotos", "Registrado por"]));
  for (const m of r.movs)
    L.push(linea([m.fecha, m.hora, nombre(m.cuenta_id), TIPO_MOV_LABEL[m.tipo], categoriaTexto(m.categoria, m.subcategoria), m.concepto, m.pagado_a, paraTexto(m, r.personas), m.tipo === "INGRESO" ? imp(m.monto) : "", m.tipo === "EGRESO" ? imp(m.monto) : "", m.tipo === "TRASPASO" ? imp(m.monto) : "", nombre(m.destino_id), m.nro_operacion, m.adjuntos.length, m.creado_por]));
  return new TextEncoder().encode("﻿" + L.join("\r\n") + "\r\n");
}
