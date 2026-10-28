/**
 * Excel (.xlsx) legible: resumen por cuenta, libro de movimientos, gasto por categoría, gasto por persona, practicantes y
 * cuadres. Encabezados de color, importes con formato de miles, filtros y fila de títulos congelada. Los totales son
 * fórmulas SUBTOTAL: si se filtra (por ejemplo, una sola categoría), el total se recalcula con lo que queda visible.
 */
import type { Alignment, Borders, Fill, Font, Worksheet } from "exceljs";
import { r2 } from "../fin/calc";
import { TIPO_CUENTA_LABEL, TIPO_MOV_LABEL, TIPO_PERSONA_LABEL } from "../fin/types";
import type { GastoPersona } from "../fin/calc";
import { categoriaTexto, nombreCuentas, paraTexto, periodoTexto, totalesReporte, type Reporte } from "./model";

const TEAL = "FF0E7490";
const LINE = "FFD5E0E8";
const INK = "FF0D2233";
const TINT = "FFD8F3F4";
const MONEY = '#,##0.00;[Red]-#,##0.00;;@'; // cero = celda vacía; negativo en rojo
const MONEY_CERO = '#,##0.00;[Red]-#,##0.00';
const FUENTE = "Calibri";

const borde: Partial<Borders> = { top: { style: "thin", color: { argb: LINE } }, bottom: { style: "thin", color: { argb: LINE } }, left: { style: "thin", color: { argb: LINE } }, right: { style: "thin", color: { argb: LINE } } };
const relleno = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function titulo(ws: Worksheet, texto: string, sub: string, columnas: number) {
  ws.mergeCells(1, 1, 1, columnas);
  const c = ws.getCell(1, 1);
  c.value = texto;
  c.font = { name: FUENTE, size: 16, bold: true, color: { argb: "FFFFFFFF" } } as Font;
  c.fill = relleno(TEAL);
  c.alignment = { vertical: "middle", indent: 1 } as Partial<Alignment>;
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, columnas);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { name: FUENTE, size: 10.5, color: { argb: INK } } as Font;
  s.alignment = { vertical: "middle", indent: 1 } as Partial<Alignment>;
  ws.getRow(2).height = 20;
}

function encabezado(ws: Worksheet, fila: number, nombres: string[], numericas: number[] = []) {
  const row = ws.getRow(fila);
  nombres.forEach((n, i) => {
    const c = row.getCell(i + 1);
    c.value = n;
    c.font = { name: FUENTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } } as Font;
    c.fill = relleno(INK);
    c.alignment = { vertical: "middle", horizontal: numericas.includes(i + 1) ? "center" : "left", wrapText: true } as Partial<Alignment>;
    c.border = borde;
  });
  row.height = 32;
}

const anchos = (ws: Worksheet, xs: number[]) => xs.forEach((w, i) => (ws.getColumn(i + 1).width = w));

function pie(ws: Worksheet) {
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  ws.headerFooter = { oddFooter: "&LICR Finanzas&CPágina &P de &N&R&D" };
}

/** Estilo de una fila de datos; `numericas` lleva formato de importe y alineación a la derecha. */
function datos(ws: Worksheet, fila: number, valores: unknown[], numericas: number[], zebra: boolean) {
  const row = ws.getRow(fila);
  row.values = valores as never;
  row.eachCell({ includeEmpty: true }, (c, n) => {
    if (n > valores.length) return;
    c.border = borde;
    c.font = { name: FUENTE, size: 10 } as Font;
    c.alignment = { vertical: "middle", wrapText: true, horizontal: numericas.includes(n) ? "right" : "left" } as Partial<Alignment>;
    if (numericas.includes(n)) c.numFmt = MONEY;
    if (zebra) c.fill = relleno("FFF3F7F9");
  });
}

/** Fila de totales con SUBTOTAL(109) sobre las columnas indicadas (el valor guardado es la suma, para visores que no recalculan). */
function totales(ws: Worksheet, fila: number, ini: number, fin: number, columnas: number, sumas: Record<number, number>, etiqueta = "TOTAL") {
  const row = ws.getRow(fila);
  for (let n = 1; n <= columnas; n++) {
    const c = row.getCell(n);
    const L = ws.getColumn(n).letter;
    if (n === 1) c.value = etiqueta;
    else if (sumas[n] !== undefined) {
      c.value = { formula: `SUBTOTAL(109,${L}${ini}:${L}${fin})`, result: r2(sumas[n]) };
      c.numFmt = MONEY_CERO;
      c.alignment = { horizontal: "right" } as Partial<Alignment>;
    }
    c.font = { name: FUENTE, size: 10, bold: true, color: { argb: INK } } as Font;
    c.fill = relleno(TINT);
    c.border = borde;
  }
}

const SUB_MENU = "Viáticos · Menú";
const SUB_PASAJES = "Movilidad · Pasajes";
const SUB_COMB = "Movilidad · Combustible";

function hojaPersonas(wb: import("exceljs").Workbook, nombre: string, texto: string, sub: string, lista: GastoPersona[]) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const cols = ["Persona", "Tipo", "Menú", "Pasajes", "Combustible", "Otros", "Total", "Movimientos"];
  titulo(ws, texto, sub, cols.length);
  anchos(ws, [32, 18, 13, 13, 13, 13, 14, 13]);
  encabezado(ws, 4, cols, [3, 4, 5, 6, 7, 8]);
  const num = [3, 4, 5, 6, 7];
  let fila = 4;
  const s = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } as Record<number, number>;
  for (const g of lista) {
    const menu = g.porCategoria[SUB_MENU] ?? 0;
    const pas = g.porCategoria[SUB_PASAJES] ?? 0;
    const comb = g.porCategoria[SUB_COMB] ?? 0;
    const otros = r2(g.total - menu - pas - comb);
    fila++;
    datos(ws, fila, [g.persona.nombre, TIPO_PERSONA_LABEL[g.persona.tipo], menu, pas, comb, otros, g.total, g.movimientos], num, fila % 2 === 0);
    ws.getRow(fila).getCell(8).alignment = { horizontal: "center" } as Partial<Alignment>;
    s[3] += menu; s[4] += pas; s[5] += comb; s[6] += otros; s[7] += g.total;
  }
  if (lista.length) {
    totales(ws, fila + 1, 5, fila, cols.length, s);
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: fila, column: cols.length } };
  } else {
    ws.getCell(5, 1).value = "Sin gasto asignado a personas en este período.";
    ws.getCell(5, 1).font = { name: FUENTE, size: 10, italic: true, color: { argb: INK } } as Font;
  }
  pie(ws);
}

export async function generarXlsx(r: Reporte): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ICR Finanzas";
  wb.created = new Date(r.generado);
  const sub = `${nombreCuentas(r)} · ${periodoTexto(r.desde, r.hasta)} · generado por ${r.usuario || "—"} el ${new Date(r.generado).toLocaleString("es-PE")}`;
  const T = totalesReporte(r);
  const nombreDe = (id: string) => r.cuentas.find((c) => c.id === id)?.nombre ?? "";

  // ---- Resumen por cuenta ------------------------------------------------------------------------------------
  const rs = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  const colsR = ["Cuenta", "Tipo", "Saldo inicial", "Ingresos", "Egresos", "Traspasos recibidos", "Traspasos enviados", "Saldo final", "N° mov."];
  titulo(rs, "ICR Finanzas · Resumen por cuenta", sub, colsR.length);
  anchos(rs, [28, 12, 15, 15, 15, 17, 17, 15, 9]);
  rs.getCell(4, 1).value = "SALDOS POR CUENTA";
  rs.getCell(4, 1).font = { name: FUENTE, size: 11, bold: true, color: { argb: TEAL } } as Font;
  encabezado(rs, 5, colsR, [3, 4, 5, 6, 7, 8, 9]);
  let f = 5;
  const sR = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 } as Record<number, number>;
  for (const x of r.resumen) {
    f++;
    datos(rs, f, [x.cuenta.nombre, TIPO_CUENTA_LABEL[x.cuenta.tipo], x.inicial, x.ingresos, x.egresos, x.traspasosIn, x.traspasosOut, x.final, x.movimientos], [3, 4, 5, 6, 7, 8], f % 2 === 0);
    for (const n of [3, 4, 5, 6, 7, 8]) rs.getRow(f).getCell(n).numFmt = MONEY_CERO;
    rs.getRow(f).getCell(9).alignment = { horizontal: "center" } as Partial<Alignment>;
    sR[3] += x.inicial; sR[4] += x.ingresos; sR[5] += x.egresos; sR[6] += x.traspasosIn; sR[7] += x.traspasosOut; sR[8] += x.final;
  }
  if (r.resumen.length) totales(rs, f + 1, 6, f, colsR.length, sR);
  f += 3;
  rs.getCell(f, 1).value = "DEL PERÍODO";
  rs.getCell(f, 1).font = { name: FUENTE, size: 11, bold: true, color: { argb: TEAL } } as Font;
  for (const [k, v] of [["Ingresos", T.ingresos], ["Egresos", T.egresos], ["Resultado (ingresos − egresos)", r2(T.ingresos - T.egresos)], ["Traspasos entre cuentas (no son ingreso ni gasto)", T.traspasos], ["Movimientos", T.movimientos]] as [string, number][]) {
    f++;
    rs.getCell(f, 1).value = k;
    rs.getCell(f, 1).font = { name: FUENTE, size: 10 } as Font;
    rs.mergeCells(f, 1, f, 3);
    const c = rs.getCell(f, 4);
    c.value = v;
    c.numFmt = k === "Movimientos" ? "0" : MONEY_CERO;
    c.font = { name: FUENTE, size: 10, bold: true } as Font;
  }
  pie(rs);

  // ---- Libro ------------------------------------------------------------------------------------------------
  const cols = ["Fecha", "Hora", "Cuenta", "Tipo", "Categoría", "Concepto", "Pagado a", "Para quién", "Ingreso", "Egreso", "Traspaso", "Destino", "N° operación", "Fotos", "Registrado por"];
  const lb = wb.addWorksheet("Libro", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  titulo(lb, "ICR Finanzas · Libro de movimientos", sub, cols.length);
  anchos(lb, [12, 7, 20, 11, 24, 28, 24, 26, 13, 13, 13, 18, 14, 7, 16]);
  encabezado(lb, 4, cols, [9, 10, 11, 14]);
  let fl = 4;
  const sL = { 9: 0, 10: 0, 11: 0 } as Record<number, number>;
  for (const m of r.movs) {
    fl++;
    datos(lb, fl, [new Date(m.fecha + "T12:00:00"), m.hora, nombreDe(m.cuenta_id), TIPO_MOV_LABEL[m.tipo], m.tipo === "TRASPASO" ? "" : categoriaTexto(m.categoria, m.subcategoria), m.concepto, m.pagado_a, paraTexto(m, r.personas), m.tipo === "INGRESO" ? m.monto : null, m.tipo === "EGRESO" ? m.monto : null, m.tipo === "TRASPASO" ? m.monto : null, nombreDe(m.destino_id), m.nro_operacion, m.adjuntos.length || null, m.creado_por], [9, 10, 11], fl % 2 === 0);
    lb.getRow(fl).getCell(1).numFmt = "dd/mm/yyyy";
    lb.getRow(fl).getCell(14).alignment = { horizontal: "center" } as Partial<Alignment>;
    if (m.tipo === "INGRESO") sL[9] += m.monto;
    if (m.tipo === "EGRESO") sL[10] += m.monto;
    if (m.tipo === "TRASPASO") sL[11] += m.monto;
  }
  if (r.movs.length) {
    totales(lb, fl + 1, 5, fl, cols.length, sL);
    lb.autoFilter = { from: { row: 4, column: 1 }, to: { row: fl, column: cols.length } };
  } else {
    lb.getCell(5, 1).value = "Sin movimientos en este período.";
    lb.getCell(5, 1).font = { name: FUENTE, size: 10, italic: true, color: { argb: INK } } as Font;
  }
  pie(lb);

  // ---- Por categoría ----------------------------------------------------------------------------------------
  const pc = wb.addWorksheet("Por categoría", { views: [{ showGridLines: false }] });
  titulo(pc, "ICR Finanzas · Por categoría", sub, 4);
  anchos(pc, [28, 22, 14, 16]);
  let fc = 3;
  for (const tipo of ["EGRESO", "INGRESO"] as const) {
    const filas = r.porCategoria.filter((x) => x.tipo === tipo);
    fc += 1;
    pc.getCell(fc, 1).value = tipo === "EGRESO" ? "EGRESOS" : "INGRESOS";
    pc.getCell(fc, 1).font = { name: FUENTE, size: 11, bold: true, color: { argb: TEAL } } as Font;
    fc++;
    encabezado(pc, fc, ["Categoría", "Tipo de gasto", "Movimientos", "Total"], [3, 4]);
    const ini = fc + 1;
    let suma = 0;
    for (const x of filas) {
      fc++;
      datos(pc, fc, [x.categoria, x.subcategoria, x.movimientos, x.total], [4], fc % 2 === 0);
      pc.getRow(fc).getCell(3).alignment = { horizontal: "center" } as Partial<Alignment>;
      suma += x.total;
    }
    if (filas.length) {
      totales(pc, fc + 1, ini, fc, 4, { 4: suma });
      fc++;
    }
    fc += 1;
  }
  pie(pc);

  // ---- Por persona y practicantes -------------------------------------------------------------------------------
  hojaPersonas(wb, "Por persona", "ICR Finanzas · Gasto por persona", sub, r.porPersona);
  hojaPersonas(wb, "Practicantes", "ICR Finanzas · Gasto en practicantes", sub, r.practicantes);

  // ---- Cuadres ---------------------------------------------------------------------------------------------------
  if (r.cuadres.length) {
    const cu = wb.addWorksheet("Cuadres", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
    const cc = ["Fecha", "Cuenta", "Saldo real", "Saldo en la app", "Diferencia", "Nota", "Registrado por"];
    titulo(cu, "ICR Finanzas · Cuadres", sub, cc.length);
    anchos(cu, [12, 24, 15, 16, 14, 34, 16]);
    encabezado(cu, 4, cc, [3, 4, 5]);
    let fq = 4;
    for (const c of r.cuadres) {
      fq++;
      datos(cu, fq, [new Date(c.fecha + "T12:00:00"), nombreDe(c.cuenta_id), c.saldo_real, c.saldo_sistema, c.diferencia, c.nota, c.creado_por], [3, 4, 5], fq % 2 === 0);
      cu.getRow(fq).getCell(1).numFmt = "dd/mm/yyyy";
      cu.getRow(fq).getCell(5).numFmt = MONEY_CERO;
    }
    pie(cu);
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
