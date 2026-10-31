/**
 * Excel (.xlsx) de la Caja ICR: una hoja de resumen (efectivo y digital, ventas, fondos, gastos, depósitos, por categoría)
 * y una hoja con todos los movimientos del período (con filtros y totales SUBTOTAL que se recalculan al filtrar).
 */
import type { Alignment, Borders, Fill, Font, Worksheet } from "exceljs";
import { catTexto, COMPROBANTE_LABEL, MEDIO_LABEL, ORIGEN_LABEL, type Reporte } from "./tipos";

const TEAL = "FF0E7490";
const LINE = "FFD5E0E8";
const INK = "FF0D2233";
const MONEY = "#,##0.00;[Red]-#,##0.00";
const FUENTE = "Calibri";
const borde: Partial<Borders> = { top: { style: "thin", color: { argb: LINE } }, bottom: { style: "thin", color: { argb: LINE } }, left: { style: "thin", color: { argb: LINE } }, right: { style: "thin", color: { argb: LINE } } };
const relleno = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const n = (v: string) => Number(v); // solo para la celda de Excel: los totales ya vienen calculados por el servidor
const fecha = (iso: string) => iso.split("-").reverse().join("/");

function titulo(ws: Worksheet, texto: string, sub: string, columnas: number) {
  ws.mergeCells(1, 1, 1, columnas);
  ws.getCell(1, 1).value = texto;
  ws.getCell(1, 1).font = { name: FUENTE, size: 16, bold: true, color: { argb: "FFFFFFFF" } } as Font;
  ws.getCell(1, 1).fill = relleno(TEAL);
  ws.getCell(1, 1).alignment = { vertical: "middle", indent: 1 } as Partial<Alignment>;
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, columnas);
  ws.getCell(2, 1).value = sub;
  ws.getCell(2, 1).font = { name: FUENTE, size: 10.5, color: { argb: INK } } as Font;
}
function encabezado(ws: Worksheet, fila: number, nombres: string[]) {
  const row = ws.getRow(fila);
  nombres.forEach((x, i) => {
    const c = row.getCell(i + 1);
    c.value = x;
    c.font = { name: FUENTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } } as Font;
    c.fill = relleno(INK);
    c.alignment = { vertical: "middle", wrapText: true } as Partial<Alignment>;
    c.border = borde;
  });
  row.height = 28;
}
const anchos = (ws: Worksheet, xs: number[]) => xs.forEach((w, i) => (ws.getColumn(i + 1).width = w));

export async function generarXlsx(r: Reporte, generadoPor: string): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ICR Finanzas";
  const periodo = r.desde === r.hasta ? fecha(r.desde) : `${fecha(r.desde)} al ${fecha(r.hasta)}`;
  const sub = `Período: ${periodo} · Generado por ${generadoPor}`;

  const res = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  titulo(res, "Caja ICR · Resumen", sub, 3);
  encabezado(res, 4, ["", "Efectivo (S/)", "Digital (S/)"]);
  const filas: [string, keyof Reporte["efectivo"]][] = [["Saldo al inicio", "saldo_inicial"], ["Entró", "ingresos"], ["Salió", "egresos"], ["Saldo al final", "saldo_final"]];
  filas.forEach(([l, k], i) => {
    const row = res.getRow(5 + i);
    row.values = [l, n(r.efectivo[k]), n(r.digital[k])];
    row.font = { name: FUENTE, size: 11, bold: k === "saldo_final" } as Font;
    [2, 3].forEach((c) => (row.getCell(c).numFmt = MONEY));
  });
  let f = 10;
  encabezado(res, f++, ["Concepto", "Monto (S/)", ""]);
  for (const [l, v] of [["Ventas", r.ventas], ["Fondos recibidos del ERP", r.fondos], ["Gastos (sin depósitos)", r.gastos], ["· Gastos físicos (efectivo)", r.gastos_fisicos], ["· Gastos digitales", r.gastos_digitales], ["Depósitos a la cuenta principal", r.depositos]] as [string, string][]) {
    const row = res.getRow(f++);
    row.values = [l, n(v)];
    row.getCell(2).numFmt = MONEY;
  }
  res.getRow(f++).values = ["Gastos físicos sin foto del recibo", r.sin_foto];
  f++;
  encabezado(res, f++, ["Gastos por categoría", "Monto (S/)", ""]);
  for (const g of r.por_categoria) {
    const row = res.getRow(f++);
    row.values = [g.clave, n(g.monto)];
    row.getCell(2).numFmt = MONEY;
  }
  if (r.por_proyecto.length) {
    f++;
    encabezado(res, f++, ["Gastos por proyecto", "Monto (S/)", ""]);
    for (const g of r.por_proyecto) {
      const row = res.getRow(f++);
      row.values = [g.clave, n(g.monto)];
      row.getCell(2).numFmt = MONEY;
    }
  }
  anchos(res, [38, 18, 18]);

  const ws = wb.addWorksheet("Movimientos", { views: [{ state: "frozen", ySplit: 4 }] });
  const cols = ["Fecha", "Tipo", "Medio", "Categoría", "Descripción", "Persona", "Se pagó a", "N.º operación", "Comprobante", "Proyecto", "Ingreso (S/)", "Egreso (S/)", "Fotos", "Registró"];
  titulo(ws, "Caja ICR · Movimientos", sub, cols.length);
  encabezado(ws, 4, cols);
  const movs = [...r.movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.creado_en < b.creado_en ? -1 : 1));
  movs.forEach((m, i) => {
    const row = ws.getRow(5 + i);
    row.values = [fecha(m.fecha), ORIGEN_LABEL[m.origen], MEDIO_LABEL[m.medio], catTexto(m), m.descripcion, m.persona ?? "", m.destinatario ?? "", m.operacion ?? "", m.comprobante ? COMPROBANTE_LABEL[m.comprobante] : "", m.proyecto ?? "",
      m.tipo === "INGRESO" ? n(m.monto) : null, m.tipo === "EGRESO" ? n(m.monto) : null, m.adjuntos.length, m.creado_por ?? ""];
    [11, 12].forEach((c) => (row.getCell(c).numFmt = MONEY));
    row.eachCell((c) => (c.border = borde));
  });
  const fin = 5 + movs.length;
  const tot = ws.getRow(fin);
  tot.getCell(10).value = "Total (lo visible)";
  tot.getCell(11).value = { formula: `SUBTOTAL(109,K5:K${Math.max(fin - 1, 5)})` };
  tot.getCell(12).value = { formula: `SUBTOTAL(109,L5:L${Math.max(fin - 1, 5)})` };
  [11, 12].forEach((c) => (tot.getCell(c).numFmt = MONEY));
  tot.font = { name: FUENTE, bold: true } as Font;
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
  anchos(ws, [11, 16, 10, 22, 36, 16, 20, 14, 12, 22, 13, 13, 7, 16]);
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
