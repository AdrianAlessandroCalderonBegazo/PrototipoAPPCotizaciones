// Exportar los movimientos de la cuenta a Excel (.xlsx, con números de verdad) o a PDF (hoja lista para imprimir o guardar como PDF).
import { dinero } from "../../dinero";
import { fecha, fechaHora } from "../../formato";
import type { Cuenta, MovimientoCuenta } from "../../tipos";

export type DatosExportar = { cuenta: Cuenta; movimientos: MovimientoCuenta[]; filtros: string; totales: { ingresos: string; egresos: string }; empresa: string | null };

const nombreArchivo = (c: Cuenta, ext: string) => `movimientos_${c.nombre.replace(/[^\p{L}\p{N}]+/gu, "_")}_${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function exportarExcel(d: DatosExportar) {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  const ws = wb.addWorksheet("Movimientos", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.addRow([`${d.empresa ?? "ICR"} · ${d.cuenta.nombre} (${d.cuenta.moneda})`]).font = { bold: true, size: 14 };
  ws.addRow([`Filtros: ${d.filtros}`, "", "", "", "", "", "", "", "", `Exportado ${fechaHora(new Date().toISOString())}`]);
  ws.addRow([]);
  const cab = ws.addRow(["Fecha", "Concepto", "Tipo", "Categoría", "Proyecto", "Documento", "Contraparte", "Ingreso", "Egreso", "Saldo", "Registrado por", "Estado"]);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F7590" } }));
  // Los montos llegan como texto exacto; Excel los guarda como número con 2 decimales.
  const n = (v: string | null) => (v === null ? null : Number(v));
  for (const m of [...d.movimientos].reverse()) {
    const r = ws.addRow([
      new Date(`${m.fecha}T12:00:00`), m.concepto, m.tipo === "ingreso" ? "Ingreso" : "Egreso", m.categoria ?? "", m.proyecto_nombre ? `${m.proyecto_codigo} · ${m.proyecto_nombre}` : "",
      m.documento ?? (m.source === "envio_caja_chica" ? "Caja chica" : m.source === "erp" ? "" : "Caja ICR"), m.contraparte ?? "", m.tipo === "ingreso" ? n(m.monto) : null, m.tipo === "egreso" ? n(m.monto) : null, n(m.saldo),
      m.registrado_por ?? "", m.anulado ? `Anulado: ${m.anulado_motivo ?? ""}` : "",
    ]);
    if (m.anulado) r.font = { strike: true, color: { argb: "FF7A8B99" } };
  }
  const fin = ws.addRow(["", "Totales", "", "", "", "", "", n(d.totales.ingresos), n(d.totales.egresos)]);
  fin.font = { bold: true };
  ws.getColumn(1).numFmt = "dd/mm/yyyy";
  for (const c of [8, 9, 10]) ws.getColumn(c).numFmt = '#,##0.00;[Red]-#,##0.00';
  [12, 40, 10, 22, 30, 16, 24, 14, 14, 14, 18, 24].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 12 } };
  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivo(d.cuenta, "xlsx"));
}

function descargar(b: Blob, nombre: string) {
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Abre una hoja con la tabla y el diálogo de impresión (ahí se elige «Guardar como PDF»). */
export function exportarPdf(d: DatosExportar) {
  const mon = d.cuenta.moneda;
  const filas = d.movimientos
    .map((m) => `<tr class="${m.anulado ? "anulado" : ""}"><td>${fecha(m.fecha)}</td><td>${esc(m.concepto)}${m.anulado ? ` <em>(anulado: ${esc(m.anulado_motivo ?? "")})</em>` : ""}</td><td>${esc(m.categoria ?? "")}</td><td>${esc(m.proyecto_nombre ?? "")}</td><td>${esc(m.documento ?? (m.source === "envio_caja_chica" ? "Caja chica" : m.source === "erp" ? "" : "Caja ICR"))}</td><td class="n">${m.tipo === "ingreso" ? dinero(m.monto, mon) : ""}</td><td class="n">${m.tipo === "egreso" ? dinero(m.monto, mon) : ""}</td><td class="n">${m.saldo ? dinero(m.saldo, mon) : "—"}</td></tr>`)
    .join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(nombreArchivo(d.cuenta, "pdf"))}</title>
<style>body{font-family:Manrope,Arial,sans-serif;color:#0E2233;margin:24px;font-size:11px}h1{font-size:18px;margin:0}p{margin:4px 0 14px;color:#4A5D6E}
table{width:100%;border-collapse:collapse}th{background:#0F7590;color:#fff;text-align:left;padding:6px}td{padding:5px 6px;border-bottom:1px solid #DCE4EA;vertical-align:top}
.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.anulado td{color:#7A8B99;text-decoration:line-through}tfoot td{font-weight:800;border-top:2px solid #0E2233}
@page{size:A4 landscape;margin:12mm}</style></head><body>
<h1>${esc(d.empresa ?? "ICR")} · ${esc(d.cuenta.nombre)}</h1><p>${esc(d.filtros)} · Exportado ${fechaHora(new Date().toISOString())}</p>
<table><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Proyecto</th><th>Documento</th><th class="n">Ingreso</th><th class="n">Egreso</th><th class="n">Saldo</th></tr></thead>
<tbody>${filas}</tbody><tfoot><tr><td></td><td>Totales</td><td></td><td></td><td></td><td class="n">${dinero(d.totales.ingresos, mon)}</td><td class="n">${dinero(d.totales.egresos, mon)}</td><td></td></tr></tfoot></table>
<script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.");
  w.document.write(html);
  w.document.close();
}
