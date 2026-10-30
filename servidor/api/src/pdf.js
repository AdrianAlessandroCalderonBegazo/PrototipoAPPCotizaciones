// PDF de una cotización, generado en el servidor con los datos de la empresa de Configuración (sin inventar nada:
// lo que falta se omite). Diseño: «Cotización imprimible» de ERP_ICR.zip.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { leerEmpresa } from './configuracion.js';
import { carpetaSubidas } from './rutas.js';

const recursos = join(dirname(fileURLToPath(import.meta.url)), '..', 'recursos');
const C = { tinta: '#0E2233', gris: '#4A5D6E', claro: '#7A8B99', linea: '#DCE4EA', teal: '#0F7590', suave: '#F2F6F9' };

const miles = (v) => {
  if (v === null || v === undefined) return '—';
  const s = String(v);
  const neg = s.startsWith('-');
  const [e, d = ''] = s.replace('-', '').split('.');
  return `${neg ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d.padEnd(2, '0').slice(0, 2)}`;
};
const soles = (v) => `S/ ${miles(v)}`;
const fecha = (f) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '');
const cantidad = (v) => (String(v).endsWith('.00') ? String(v).slice(0, -3) : String(v));

function logoDe(empresa) {
  if (empresa.logo && /^\/uploads\/[0-9a-f]{24}\.(png|jpe?g)$/.test(empresa.logo)) {
    const f = join(carpetaSubidas, empresa.logo.replace('/uploads/', ''));
    if (existsSync(f)) return f;
  }
  return join(recursos, 'logo_icr.png');
}

/** Devuelve el PDF como Buffer. `c` es una cotización ya normalizada (ventas.normalizar). */
export async function pdfCotizacion(c) {
  const empresa = await leerEmpresa();
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: { Title: `Cotización ${c.numero}`, Author: empresa.razon_social ?? '' } });
  doc.registerFont('r', join(recursos, 'Manrope-Regular.ttf'));
  doc.registerFont('b', join(recursos, 'Manrope-Bold.ttf'));
  doc.registerFont('x', join(recursos, 'Manrope-ExtraBold.ttf'));
  const partes = [];
  doc.on('data', (b) => partes.push(b));
  const fin = new Promise((ok) => doc.on('end', () => ok(Buffer.concat(partes))));

  const W = doc.page.width - 72;
  const X = 36;

  // ---- encabezado ----
  try {
    doc.image(logoDe(empresa), X, 36, { fit: [54, 54] });
  } catch {
    // logo ilegible: se omite
  }
  const tx = X + 66;
  doc.font('x').fontSize(14).fillColor(C.tinta).text(empresa.razon_social ?? '', tx, 38, { width: 280 });
  const lin1 = [empresa.ruc ? `RUC ${empresa.ruc}` : null, [empresa.direccion, empresa.ciudad].filter(Boolean).join(', ') || null].filter(Boolean).join(' · ');
  const lin2 = [empresa.correo, empresa.telefono, empresa.web].filter(Boolean).join(' · ');
  doc.font('r').fontSize(8.5).fillColor(C.gris).text(lin1, tx, doc.y + 2, { width: 300 });
  if (lin2) doc.text(lin2, tx, doc.y + 1, { width: 300 });
  doc.font('b').fontSize(8).fillColor(C.teal).text('COTIZACIÓN', X + W - 170, 38, { width: 170, align: 'right', characterSpacing: 1 });
  doc.font('x').fontSize(18).fillColor(C.tinta).text(c.numero, X + W - 170, 50, { width: 170, align: 'right' });
  doc.font('r').fontSize(8.5).fillColor(C.gris).text(`Emitida ${fecha(c.fecha)}${c.valida_hasta ? ` · Válida hasta ${fecha(c.valida_hasta)}` : ''}`, X + W - 220, 74, { width: 220, align: 'right' });
  let y = 104;
  doc.moveTo(X, y).lineTo(X + W, y).lineWidth(1.5).strokeColor(C.teal).stroke();
  y += 12;

  // ---- cliente y sistema propuesto ----
  const col = (titulo, lineas, x, ancho) => {
    doc.font('b').fontSize(7.5).fillColor(C.claro).text(titulo.toUpperCase(), x, y, { width: ancho, characterSpacing: 0.8 });
    let yy = doc.y + 3;
    lineas.filter(Boolean).forEach(([texto, fuerte], i) => {
      doc.font(fuerte ? 'b' : 'r').fontSize(fuerte ? 10.5 : 8.5).fillColor(fuerte ? C.tinta : C.gris).text(texto, x, yy, { width: ancho });
      yy = doc.y + (i === 0 ? 2 : 1);
    });
    return yy;
  };
  const yc = col('Cliente', [[c.cliente, true], c.ruc_dni && [`${c.ruc_dni.length === 8 ? 'DNI' : 'RUC'} ${c.ruc_dni}`], c.direccion && [c.direccion], (c.atencion || c.telefono || c.correo) && [[c.atencion ? `Atención: ${c.atencion}` : null, c.telefono, c.correo].filter(Boolean).join(' · ')]], X, W / 2 - 10);
  const ys = col('Sistema propuesto', [c.sistema ? [c.sistema, true] : null, c.vendedor && [`Asesor: ${c.vendedor}`]], X + W / 2 + 10, W / 2 - 10);
  y = Math.max(yc, ys) + 12;

  // ---- tabla ----
  const cols = [
    { k: '#', w: 22, a: 'left' },
    { k: 'Descripción', w: W - 22 - 46 - 74 - 46 - 80, a: 'left' },
    { k: 'Cant.', w: 46, a: 'right' },
    { k: 'P. unit.', w: 74, a: 'right' },
    { k: 'Desc.', w: 46, a: 'right' },
    { k: 'Importe', w: 80, a: 'right' },
  ];
  const cabecera = () => {
    doc.rect(X, y, W, 20).fill(C.teal);
    let x = X;
    for (const c2 of cols) {
      doc.font('b').fontSize(8).fillColor('#FFFFFF').text(c2.k, x + 5, y + 6, { width: c2.w - 10, align: c2.a });
      x += c2.w;
    }
    y += 20;
  };
  cabecera();
  c.items.forEach((it, i) => {
    const sub = [it.codigo, it.unidad, it.detalle].filter(Boolean).join(' · ');
    doc.font('b').fontSize(8.5);
    const hDesc = doc.heightOfString(it.descripcion, { width: cols[1].w - 10 }) + (sub ? doc.font('r').fontSize(7.5).heightOfString(sub, { width: cols[1].w - 10 }) + 1 : 0);
    const h = Math.max(18, hDesc + 10);
    if (y + h > doc.page.height - 120) {
      doc.addPage();
      y = 36;
      cabecera();
    }
    if (i % 2 === 1) doc.rect(X, y, W, h).fill(C.suave);
    let x = X;
    const vals = [String(i + 1), null, cantidad(it.cantidad), miles(it.precio_unitario), Number(it.descuento_pct) ? `${cantidad(it.descuento_pct)}%` : '—', miles(it.importe ?? it.importe_bruto)];
    cols.forEach((c2, j) => {
      if (j === 1) {
        doc.font('b').fontSize(8.5).fillColor(C.tinta).text(it.descripcion, x + 5, y + 5, { width: c2.w - 10 });
        if (sub) doc.font('r').fontSize(7.5).fillColor(C.claro).text(sub, x + 5, doc.y + 1, { width: c2.w - 10 });
      } else {
        doc.font(j === 5 ? 'b' : 'r').fontSize(8.5).fillColor(C.tinta).text(vals[j], x + 5, y + 5, { width: c2.w - 10, align: c2.a });
      }
      x += c2.w;
    });
    y += h;
    doc.moveTo(X, y).lineTo(X + W, y).lineWidth(0.5).strokeColor(C.linea).stroke();
  });
  y += 14;

  // ---- condiciones y totales ----
  if (y > doc.page.height - 220) {
    doc.addPage();
    y = 36;
  }
  const anchoTot = 210;
  const xTot = X + W - anchoTot;
  const tt = c.totales;
  const filas = [
    ['Subtotal (precios con IGV)', soles(tt.subtotal)],
    Number(tt.descuento_lineas) ? ['Descuentos por ítem', `- ${soles(tt.descuento_lineas)}`] : null,
    Number(tt.descuento) ? ['Descuento comercial', `- ${soles(tt.descuento)}`] : null,
    ['Valor de venta', soles(tt.valor_venta)],
    ['IGV 18%', soles(tt.igv)],
  ].filter(Boolean);
  let yt = y;
  for (const [a, b] of filas) {
    doc.font('r').fontSize(9).fillColor(C.gris).text(a, xTot, yt, { width: 120 });
    doc.font('b').fontSize(9).fillColor(C.tinta).text(b, xTot + 110, yt, { width: anchoTot - 110, align: 'right' });
    yt += 15;
  }
  doc.rect(xTot, yt + 2, anchoTot, 26).fill(C.tinta);
  doc.font('b').fontSize(10).fillColor('#FFFFFF').text('Total', xTot + 10, yt + 10, { width: 80 });
  doc.font('x').fontSize(12).fillColor('#FFFFFF').text(soles(tt.total), xTot + 70, yt + 9, { width: anchoTot - 80, align: 'right' });
  yt += 34;

  const anchoCond = W - anchoTot - 20;
  doc.font('b').fontSize(7.5).fillColor(C.claro).text('CONDICIONES', X, y, { width: anchoCond, characterSpacing: 0.8 });
  let yy = doc.y + 3;
  const condiciones = c.condiciones ?? empresa.pie_pdf;
  if (condiciones) {
    doc.font('r').fontSize(8.5).fillColor(C.gris).text(condiciones, X, yy, { width: anchoCond });
    yy = doc.y + 4;
  }
  if (c.validez_dias) {
    doc.font('r').fontSize(8.5).fillColor(C.gris).text(`Validez: ${c.validez_dias} días${c.valida_hasta ? ` (hasta el ${fecha(c.valida_hasta)})` : ''}. Precios en soles con IGV incluido.`, X, yy, { width: anchoCond });
    yy = doc.y + 4;
  }
  const deposito = [c.banco, c.moneda, c.nro_cuenta && `Cta. ${c.nro_cuenta}`, c.cci && `CCI ${c.cci}`].filter(Boolean).join(' · ') || empresa.cuentas_bancarias;
  if (deposito) {
    doc.font('b').fontSize(8.5).fillColor(C.tinta).text('Depósitos: ', X, yy, { width: anchoCond, continued: true }).font('r').fillColor(C.gris).text(deposito);
  }

  // ---- pie en cada página ----
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(i);
    const yp = doc.page.height - 30;
    doc.moveTo(X, yp - 6).lineTo(X + W, yp - 6).lineWidth(0.5).strokeColor(C.linea).stroke();
    doc.font('r').fontSize(7.5).fillColor(C.claro).text(empresa.razon_social ?? '', X, yp, { width: W / 2, lineBreak: false });
    doc.text(`Página ${i + 1} de ${rango.count}`, X + W / 2, yp, { width: W / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return fin;
}
