// Facturación SUNAT (Fase 5). El ERP prepara boletas y facturas; la extensión de Chrome rellena el portal SOL y la persona emite.
// El número lo pone SUNAT: se registra al marcar «emitido». Montos exactos con enteros (nunca coma flotante):
//   valor de venta de la línea = cantidad × valor unitario (sin IGV)   ·   IGV de la línea = 18 % del valor de venta
//   op. gravada = Σ valores de venta   ·   IGV = Σ IGV de líneas   ·   total = op. gravada + IGV
// La misma cuenta está en erp/web/src/paginas/facturacion/calculo.ts (vista previa); el servidor manda.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { IGV_PCT, texto } from './cotizar.js';
import { leerParametros } from './configuracion.js';
import { consulta, enTransaccion } from './db.js';
import { monto } from './dinero.js';
import { falla } from './errores.js';
import { dniValido, rucValido } from './validaciones.js';
import { obtenerCotizacion } from './ventas.js';

export const TIPOS = ['factura', 'boleta'];
export const ESTADOS = ['borrador', 'enviado', 'emitido', 'anulado'];
export const UNIDADES = { NIU: 'Unidad', ZZ: 'Servicio', MTR: 'Metro' };
export const LIMITE_BOLETA_SIN_DOC = 70000n; // S/ 700.00 en céntimos: desde ahí la boleta debe identificar al cliente

const t = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const div = (a, b) => (a * 2n + b) / (b * 2n); // redondeo de la mitad hacia arriba (positivos)

/** «12.5» → BigInt en unidades de 10^-dec. Acepta coma decimal y separador de miles. */
function decimal(v, dec, nombre, { min = 0n, max = 10n ** 16n } = {}) {
  let s = typeof v === 'number' ? String(v) : String(v ?? '').trim();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!new RegExp(`^\\d{1,12}(\\.\\d{1,${dec}})?$`).test(s)) throw falla(400, `${nombre} debe ser un número con hasta ${dec} decimales.`);
  const [e, d = ''] = s.split('.');
  const n = BigInt(e) * 10n ** BigInt(dec) + BigInt(d.padEnd(dec, '0'));
  if (n < min || n > max) throw falla(400, `${nombre} está fuera de rango.`);
  return n;
}
const texto4 = (n) => `${n / 10000n}.${String(n % 10000n).padStart(4, '0')}`;
const cent = (v) => decimal(v, 2, 'El monto');

/** items → líneas normalizadas (texto) y totales. Lanza 400 con el ítem que falla. */
export function calcularComprobante(items) {
  if (!Array.isArray(items)) throw falla(400, 'Los ítems no son válidos.');
  if (items.length > 200) throw falla(400, 'Un comprobante puede tener como máximo 200 ítems.');
  let gravada = 0n;
  let igv = 0n;
  const lineas = items.map((it, i) => {
    const n = i + 1;
    const descripcion = String(it?.descripcion ?? '').trim().slice(0, 500);
    if (!descripcion) throw falla(400, `El ítem ${n} no tiene descripción.`);
    const unidad = UNIDADES[it?.unidad] ? it.unidad : 'NIU';
    const cant = decimal(it?.cantidad, 2, `La cantidad del ítem ${n}`, { min: 1n });
    const vu = decimal(it?.valor_unitario, 4, `El valor unitario del ítem ${n}`, { min: 1n });
    const vv = div(cant * vu, 10000n); // centésimas × diezmilésimas → céntimos
    const ig = div(vv * BigInt(IGV_PCT), 100n);
    gravada += vv;
    igv += ig;
    return { descripcion, unidad, cantidad: texto(cant), valor_unitario: texto4(vu), valor_venta: texto(vv), igv: texto(ig), importe: texto(vv + ig) };
  });
  return { lineas, totales: { op_gravada: texto(gravada), igv: texto(igv), total: texto(gravada + igv) } };
}

/** Lo que se revisa antes de mandar a SUNAT. Cada regla: { ok, texto }. */
export function validaciones(c, tc = null) {
  const doc = c.cliente_doc ?? '';
  const total = c.totales?.total ? cent(c.totales.total) : 0n;
  let totalSoles = total;
  if (c.moneda === 'USD') totalSoles = tc ? div(total * decimal(tc, 4, 'El tipo de cambio'), 10000n) : null;
  const factura = c.tipo === 'factura';
  const reglas = [];
  if (factura) reglas.push({ ok: rucValido(doc), texto: 'RUC del cliente válido (11 dígitos y dígito verificador)' });
  else {
    const docOk = !doc || dniValido(doc) || rucValido(doc);
    reglas.push({ ok: docOk, texto: 'Documento del cliente con formato válido (DNI de 8 dígitos o RUC)' });
    reglas.push({ ok: !!doc || (totalSoles !== null && totalSoles < LIMITE_BOLETA_SIN_DOC), texto: 'Boletas desde S/ 700.00 identifican al cliente (DNI o RUC)' });
  }
  const pideNombre = factura || !!doc;
  reglas.push({ ok: !pideNombre || !!c.cliente_nombre, texto: factura ? 'Razón social del cliente' : 'Nombre del cliente (si tiene documento)' });
  reglas.push({ ok: (c.items?.length ?? 0) > 0 && total > 0n, texto: 'Al menos un ítem, con total mayor a 0' });
  if (c.forma_pago === 'credito') {
    const hoy = hoyLima();
    const suma = (c.cuotas ?? []).reduce((s, q) => s + cent(q.monto), 0n);
    reglas.push({ ok: (c.cuotas?.length ?? 0) > 0 && suma === total, texto: 'Las cuotas suman el total del comprobante' });
    reglas.push({ ok: (c.cuotas ?? []).every((q) => q.fecha > hoy), texto: 'Las cuotas vencen después de hoy' });
  }
  return reglas;
}

// ---------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------

const COLS = `c.id, c.tipo, c.estado, c.serie, c.correlativo, c.fecha_emision::text AS fecha_emision, c.moneda, c.cliente_tipo_doc, c.cliente_doc,
  c.cliente_nombre, c.cliente_direccion, c.cliente_fuente, c.forma_pago, c.cuotas, c.items, c.observacion, c.op_gravada::text AS op_gravada,
  c.igv::text AS igv, c.total::text AS total, c.cotizacion_id, q.numero AS cotizacion_numero, c.proyecto_id, p.nombre AS proyecto_nombre,
  c.pdf_archivo, c.xml_archivo, c.motivo_anulacion, c.enviado_en::text AS enviado_en, c.emitido_en::text AS emitido_en, c.anulado_en::text AS anulado_en,
  u.nombre AS creado_por, c.actualizado_por, c.version, c.creado_en::text AS creado_en, c.actualizado_en::text AS actualizado_en`;
const DESDE = `comprobantes c LEFT JOIN usuarios u ON u.id = c.creado_por LEFT JOIN cotizaciones q ON q.id = c.cotizacion_id LEFT JOIN proyectos p ON p.id = c.proyecto_id`;

export const numeroDe = (c) => (c.serie ? `${c.serie}-${String(c.correlativo).padStart(8, '0')}` : null);

function deFila(f) {
  const { op_gravada, igv, total, pdf_archivo, xml_archivo, ...resto } = f;
  return {
    ...resto,
    numero: numeroDe(f),
    totales: { op_gravada: monto(op_gravada), igv: monto(igv), total: monto(total) },
    tiene_pdf: !!pdf_archivo,
    tiene_xml: !!xml_archivo,
  };
}

export async function obtenerComprobante(id) {
  const { rows } = await consulta(`SELECT ${COLS} FROM ${DESDE} WHERE c.id = $1`, [id]);
  if (!rows[0]) throw falla(404, 'No existe ese comprobante.');
  return deFila(rows[0]);
}

export async function listarComprobantes() {
  const { rows } = await consulta(`SELECT ${COLS} FROM ${DESDE} ORDER BY COALESCE(c.fecha_emision, c.creado_en::date) DESC, c.id DESC LIMIT 1000`);
  const lista = rows.map(deFila).map(({ items, cuotas, ...c }) => ({ ...c, n_items: items.length }));
  const mes = hoyLima().slice(0, 7);
  const emitidos = lista.filter((c) => c.estado === 'emitido' && c.moneda === 'PEN' && c.fecha_emision?.startsWith(mes));
  return {
    comprobantes: lista,
    resumen: {
      mes,
      emitido_mes: texto(emitidos.reduce((s, c) => s + cent(c.totales.total), 0n)),
      emitidos_mes: emitidos.length,
      por_estado: Object.fromEntries(ESTADOS.map((e) => [e, lista.filter((c) => c.estado === e).length])),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Crear y editar (solo en borrador)
// ---------------------------------------------------------------------------------------------

function datos(b) {
  const tipo = String(b?.tipo ?? '');
  if (!TIPOS.includes(tipo)) throw falla(400, 'Elige boleta o factura.');
  const moneda = b?.moneda === 'USD' ? 'USD' : 'PEN';
  const doc = t(b?.cliente_doc, 11)?.replace(/\D/g, '') || null;
  if (doc && !(doc.length === 8 ? dniValido(doc) : rucValido(doc))) throw falla(400, 'El documento del cliente no es válido (DNI: 8 dígitos; RUC: 11 dígitos con su dígito verificador).');
  if (tipo === 'factura' && doc && doc.length !== 11) throw falla(400, 'La factura se emite a un RUC (11 dígitos).');
  const fuente = ['sunat', 'reniec', 'historial'].includes(b?.cliente_fuente) ? b.cliente_fuente : null;
  const forma = b?.forma_pago === 'credito' ? 'credito' : 'contado';
  const cuotasIn = forma === 'credito' && Array.isArray(b?.cuotas) ? b.cuotas : [];
  if (cuotasIn.length > 24) throw falla(400, 'Como máximo 24 cuotas.');
  const cuotas = cuotasIn.map((q, i) => {
    const fecha = String(q?.fecha ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw falla(400, `La cuota ${i + 1} necesita fecha de vencimiento.`);
    return { fecha, monto: texto(decimal(q?.monto, 2, `El monto de la cuota ${i + 1}`, { min: 1n })) };
  });
  const entero = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const { lineas, totales } = calcularComprobante(b?.items ?? []);
  return {
    tipo, moneda, cliente_tipo_doc: doc ? (doc.length === 8 ? 'DNI' : 'RUC') : null, cliente_doc: doc,
    cliente_nombre: t(b?.cliente_nombre, 255), cliente_direccion: t(b?.cliente_direccion, 255), cliente_fuente: doc ? fuente : null,
    forma_pago: forma, cuotas, items: lineas, totales, observacion: t(b?.observacion, 500),
    cotizacion_id: entero(b?.cotizacion_id), proyecto_id: entero(b?.proyecto_id),
  };
}

const VALORES = (d) => [d.tipo, d.moneda, d.cliente_tipo_doc, d.cliente_doc, d.cliente_nombre, d.cliente_direccion, d.cliente_fuente, d.forma_pago,
  JSON.stringify(d.cuotas), JSON.stringify(d.items), d.observacion, d.totales.op_gravada, d.totales.igv, d.totales.total, d.cotizacion_id, d.proyecto_id];

export async function crearComprobante(b, u) {
  const d = datos(b);
  const { rows } = await consulta(
    `INSERT INTO comprobantes (tipo, moneda, cliente_tipo_doc, cliente_doc, cliente_nombre, cliente_direccion, cliente_fuente, forma_pago, cuotas, items,
       observacion, op_gravada, igv, total, cotizacion_id, proyecto_id, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
    [...VALORES(d), u.id, u.nombre],
  );
  return obtenerComprobante(rows[0].id);
}

function exigirVersion(antes, b) {
  if (b?.version !== undefined && Number(b.version) !== antes.version) throw falla(409, 'Otra persona cambió este comprobante mientras lo editabas. Se actualizó: revisa y vuelve a intentar.');
}

export async function editarComprobante(id, b, u) {
  const antes = await obtenerComprobante(id);
  if (antes.estado !== 'borrador') throw falla(409, `El comprobante está ${antes.estado}: solo se edita en borrador.`);
  exigirVersion(antes, b);
  const d = datos(b);
  await consulta(
    `UPDATE comprobantes SET tipo = $2, moneda = $3, cliente_tipo_doc = $4, cliente_doc = $5, cliente_nombre = $6, cliente_direccion = $7, cliente_fuente = $8,
       forma_pago = $9, cuotas = $10, items = $11, observacion = $12, op_gravada = $13, igv = $14, total = $15, cotizacion_id = $16, proyecto_id = $17,
       version = version + 1, actualizado_en = now() AT TIME ZONE 'America/Lima', actualizado_por = $18
     WHERE id = $1`,
    [id, ...VALORES(d), u.nombre],
  );
  return { antes, despues: await obtenerComprobante(id) };
}

export async function eliminarBorrador(id) {
  const antes = await obtenerComprobante(id);
  if (antes.estado !== 'borrador') throw falla(409, 'Solo se elimina un borrador. Un comprobante emitido se anula.');
  await consulta('DELETE FROM comprobantes WHERE id = $1', [id]);
  return antes;
}

// ---------------------------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------------------------

async function cambiar(id, sets, valores, u) {
  await consulta(
    `UPDATE comprobantes SET ${sets}, version = version + 1, actualizado_en = now() AT TIME ZONE 'America/Lima', actualizado_por = $2 WHERE id = $1`,
    [id, u.nombre, ...valores],
  );
  return obtenerComprobante(id);
}

/** borrador → enviado: se revisa todo y queda listo para la extensión. */
export async function enviar(id, b, u) {
  const antes = await obtenerComprobante(id);
  if (antes.estado !== 'borrador') throw falla(409, `El comprobante ya está ${antes.estado}.`);
  exigirVersion(antes, b);
  const tc = (await leerParametros()).tipo_cambio?.valor ?? null;
  const malas = validaciones(antes, tc).filter((r) => !r.ok);
  if (malas.length) throw falla(400, `Falta corregir: ${malas.map((r) => r.texto).join(' · ')}.`, { validaciones: malas });
  return { antes, despues: await cambiar(id, "estado = 'enviado', enviado_en = now() AT TIME ZONE 'America/Lima'", [], u) };
}

/** enviado → borrador (SUNAT lo rechazó o hay que corregir algo antes de emitir). */
export async function volverABorrador(id, b, u) {
  const antes = await obtenerComprobante(id);
  if (antes.estado !== 'enviado') throw falla(409, 'Solo un comprobante enviado (sin emitir) vuelve a borrador.');
  exigirVersion(antes, b);
  return { antes, despues: await cambiar(id, "estado = 'borrador', enviado_en = NULL", [], u) };
}

/** «E001-123» → { serie: 'E001', correlativo: 123 }, revisando que la serie corresponda al tipo. */
export function leerNumero(v, tipo) {
  const s = String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const m = /^([A-Z0-9]{4})-(\d{1,8})$/.exec(s);
  if (!m || Number(m[2]) < 1) throw falla(400, 'Escribe el número que dio SUNAT con su serie, por ejemplo E001-123 o F001-00000123.');
  const serie = m[1];
  if (tipo === 'factura' && !/^[FE]/.test(serie)) throw falla(400, 'La serie de una factura empieza con F o E (por ejemplo F001 o E001).');
  if (tipo === 'boleta' && !/^(B|EB)/.test(serie)) throw falla(400, 'La serie de una boleta empieza con B o EB (por ejemplo B001 o EB01).');
  return { serie, correlativo: Number(m[2]) };
}

/** enviado → emitido, con el número que asignó SUNAT y la fecha de emisión. */
export async function marcarEmitido(id, b, u) {
  const antes = await obtenerComprobante(id);
  if (antes.estado !== 'enviado') throw falla(409, antes.estado === 'borrador' ? 'Primero revisa el comprobante y ábrelo en SUNAT (paso «Abrir en SUNAT»).' : `El comprobante ya está ${antes.estado}.`);
  exigirVersion(antes, b);
  const { serie, correlativo } = leerNumero(b?.numero, antes.tipo);
  const fecha = String(b?.fecha_emision ?? hoyLima());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyLima()) throw falla(400, 'La fecha de emisión no puede ser futura.');
  const { rows } = await consulta('SELECT id FROM comprobantes WHERE tipo = $1 AND serie = $2 AND correlativo = $3 AND id <> $4', [antes.tipo, serie, correlativo, id]);
  if (rows[0]) throw falla(409, `El número ${serie}-${correlativo} ya está registrado en otro comprobante.`);
  const despues = await cambiar(id, "estado = 'emitido', serie = $3, correlativo = $4, fecha_emision = $5::date, emitido_en = now() AT TIME ZONE 'America/Lima'", [serie, correlativo, fecha], u);
  return { antes, despues };
}

/** emitido → anulado. En SUNAT se presenta la comunicación de baja (o nota de crédito); aquí queda el registro. */
export async function anular(id, b, u) {
  const antes = await obtenerComprobante(id);
  if (antes.estado !== 'emitido') throw falla(409, 'Solo se anula un comprobante emitido. Un borrador se elimina.');
  exigirVersion(antes, b);
  const motivo = t(b?.motivo, 500);
  if (!motivo) throw falla(400, 'Escribe el motivo de la anulación.');
  return { antes, despues: await cambiar(id, "estado = 'anulado', motivo_anulacion = $3, anulado_en = now() AT TIME ZONE 'America/Lima'", [motivo], u) };
}

// ---------------------------------------------------------------------------------------------
// Archivos de SUNAT (PDF y XML) — carpeta privada, se descargan solo con sesión
// ---------------------------------------------------------------------------------------------

const FIRMA = { pdf: (b) => b.subarray(0, 4).toString('latin1') === '%PDF', xml: (b) => /^\s*(﻿)?</.test(b.subarray(0, 64).toString('utf8')) };

export async function guardarArchivo(id, tipoArchivo, bytes, carpeta, u) {
  if (!FIRMA[tipoArchivo]) throw falla(400, 'Solo se adjunta el PDF o el XML de SUNAT.');
  if (!Buffer.isBuffer(bytes) || bytes.length < 16 || !FIRMA[tipoArchivo](bytes)) throw falla(400, tipoArchivo === 'pdf' ? 'El archivo no es un PDF.' : 'El archivo no es un XML.');
  const antes = await obtenerComprobante(id);
  if (!['enviado', 'emitido'].includes(antes.estado)) throw falla(409, 'Los archivos de SUNAT se adjuntan al marcar emitido o después.');
  mkdirSync(carpeta, { recursive: true });
  const nombre = `${randomBytes(12).toString('hex')}.${tipoArchivo}`;
  writeFileSync(join(carpeta, nombre), bytes);
  await consulta(`UPDATE comprobantes SET ${tipoArchivo}_archivo = $2, actualizado_en = now() AT TIME ZONE 'America/Lima', actualizado_por = $3 WHERE id = $1`, [id, nombre, u.nombre]);
  return obtenerComprobante(id);
}

export async function leerArchivo(id, tipoArchivo, carpeta) {
  if (!FIRMA[tipoArchivo]) throw falla(404, 'No existe ese archivo.');
  const { rows } = await consulta(`SELECT ${tipoArchivo}_archivo AS a, tipo, serie, correlativo FROM comprobantes WHERE id = $1`, [id]);
  if (!rows[0]?.a || !/^[0-9a-f]{24}\.(pdf|xml)$/.test(rows[0].a)) throw falla(404, 'Este comprobante no tiene ese archivo adjunto.');
  return { bytes: readFileSync(join(carpeta, rows[0].a)), nombre: `${numeroDe(rows[0]) ?? `comprobante-${id}`}.${tipoArchivo}` };
}

// ---------------------------------------------------------------------------------------------
// Desde una cotización: propone cliente e ítems (precios de la cotización CON IGV → valor unitario SIN IGV)
// ---------------------------------------------------------------------------------------------

const UNIDAD_DE = (u, conProducto) => {
  const s = String(u ?? '').toLowerCase();
  if (/serv|glob|zz/.test(s)) return 'ZZ';
  if (/^m(etro|ts|tr)?s?$|metro/.test(s)) return 'MTR';
  return conProducto || s ? 'NIU' : 'ZZ';
};

export async function propuestaDesdeCotizacion(idCot, q) {
  const c = await obtenerCotizacion(idCot);
  if (!c.totales?.total || cent(c.totales.total) <= 0n) throw falla(400, 'La cotización no tiene un total para facturar.');
  const pct = decimal(q?.porcentaje ?? '100', 2, 'El porcentaje', { min: 1n, max: 10000n }); // centésimas de %
  const modo = q?.modo === 'detalle' ? 'detalle' : 'resumen';
  const totalCot = cent(c.totales.total);
  const objetivo = div(totalCot * pct, 10000n); // monto con IGV a facturar
  const pctTexto = texto(pct).replace(/\.00$/, '');
  let items;
  if (modo === 'resumen') {
    const base = (c.sistema?.split('\n')[0] || `Según cotización ${c.numero}`).slice(0, 400);
    const descripcion = pct === 10000n ? base : `${base} – ${pctTexto}% (cotización ${c.numero})`;
    items = [{ descripcion, unidad: 'ZZ', cantidad: '1.00', valor_unitario: texto4(div(objetivo * 1000000n, 118n * 100n)) }];
  } else {
    // Importe de cada línea (con IGV, ya con su descuento), menos su parte del descuento comercial, por el porcentaje.
    const lineas = c.items.filter((i) => i.importe && cent(i.importe) > 0n);
    const suma = lineas.reduce((s, i) => s + cent(i.importe), 0n);
    let asignado = 0n;
    items = lineas.map((i, k) => {
      const parte = k === lineas.length - 1 ? objetivo - asignado : div(cent(i.importe) * objetivo, suma);
      asignado += parte;
      const cant = decimal(i.cantidad, 2, 'La cantidad');
      const desc = [i.descripcion, pct === 10000n ? null : `${pctTexto}%`].filter(Boolean).join(' – ');
      return { descripcion: desc.slice(0, 500), unidad: UNIDAD_DE(i.unidad, !!i.producto_id), cantidad: texto(cant), valor_unitario: texto4(div(parte * 1000000n, 118n * cant)) };
    });
  }
  const { lineas, totales } = calcularComprobante(items);
  const doc = c.ruc_dni && (dniValido(c.ruc_dni) || rucValido(c.ruc_dni)) ? c.ruc_dni : null;
  return {
    cotizacion: { id: c.id, numero: c.numero, total: c.totales.total, estado: c.estado },
    tipo: doc?.length === 11 ? 'factura' : 'boleta',
    cliente_doc: doc, cliente_nombre: c.cliente || null, cliente_direccion: c.direccion || null,
    proyecto_id: c.proyecto_id ?? null, items: lineas, totales,
    objetivo: texto(objetivo),
    diferencia: texto(cent(totales.total) - objetivo), // céntimos por redondeo (SUNAT calcula el IGV sobre el valor sin IGV)
  };
}

// ---------------------------------------------------------------------------------------------
// Padrón: RUC (SUNAT) y DNI (RENIEC) con un proveedor opcional; si no hay, lo último que se usó en el ERP
// ---------------------------------------------------------------------------------------------

const URL_RUC = 'https://api.decolecta.com/v1/sunat/ruc?numero={numero}';
const URL_DNI = 'https://api.decolecta.com/v1/reniec/dni?numero={numero}';

function leerProveedor(json, esRuc) {
  const g = (...ks) => ks.map((k) => json?.[k]).find((v) => v !== undefined && v !== null && String(v).trim() !== '') ?? null;
  if (esRuc) {
    const nombre = g('razon_social', 'razonSocial', 'nombre');
    if (!nombre) return null;
    const dir = g('direccion', 'direccion_completa');
    const extra = [g('distrito'), g('provincia'), g('departamento')].filter(Boolean).join(', ');
    return { nombre, direccion: dir && dir !== '-' ? [dir, extra].filter(Boolean).join(', ') : null, estado: g('estado'), condicion: g('condicion') };
  }
  const completo = g('full_name', 'nombre_completo', 'nombreCompleto');
  const partes = [g('first_name', 'nombres'), g('first_last_name', 'apellido_paterno', 'apellidoPaterno'), g('second_last_name', 'apellido_materno', 'apellidoMaterno')].filter(Boolean).join(' ');
  const nombre = completo || partes || null;
  return nombre ? { nombre, direccion: null, estado: null, condicion: null } : null;
}

export async function consultarPadron(docIn, env = process.env) {
  const doc = String(docIn ?? '').replace(/\D/g, '');
  const esRuc = doc.length === 11;
  if (!(esRuc ? rucValido(doc) : dniValido(doc))) throw falla(400, 'Escribe un DNI de 8 dígitos o un RUC válido de 11.');
  const configurado = !!env.CONSULTA_DOC_TOKEN;
  // 1) Lo consultado en los últimos 30 días
  const { rows: guardado } = await consulta(`SELECT datos, consultado_en::text AS en FROM padron_consultas WHERE doc = $1 AND consultado_en > (now() AT TIME ZONE 'America/Lima') - interval '30 days'`, [doc]);
  if (guardado[0]) return { encontrado: true, configurado, fuente: esRuc ? 'sunat' : 'reniec', consultado_en: guardado[0].en, ...guardado[0].datos };
  // 2) El proveedor externo (si hay token)
  let aviso = null;
  if (configurado) {
    try {
      const url = (esRuc ? env.CONSULTA_RUC_URL || URL_RUC : env.CONSULTA_DNI_URL || URL_DNI).replace('{numero}', doc);
      const ctl = new AbortController();
      const reloj = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${env.CONSULTA_DOC_TOKEN}`, Accept: 'application/json' }, signal: ctl.signal }).finally(() => clearTimeout(reloj));
      if (r.ok) {
        const datos = leerProveedor(await r.json(), esRuc);
        if (datos) {
          await consulta(`INSERT INTO padron_consultas (doc, datos) VALUES ($1, $2) ON CONFLICT (doc) DO UPDATE SET datos = EXCLUDED.datos, consultado_en = now() AT TIME ZONE 'America/Lima'`, [doc, JSON.stringify(datos)]);
          return { encontrado: true, configurado, fuente: esRuc ? 'sunat' : 'reniec', consultado_en: null, ...datos };
        }
        aviso = esRuc ? 'SUNAT no tiene ese RUC.' : 'RENIEC no devolvió datos para ese DNI.';
      } else aviso = r.status === 404 ? (esRuc ? 'SUNAT no tiene ese RUC.' : 'No se encontró ese DNI.') : `El servicio de consulta respondió ${r.status}.`;
    } catch {
      aviso = 'El servicio de consulta no respondió.';
    }
  }
  // 3) Lo último que se usó en el ERP con ese documento
  const { rows: h } = await consulta(
    `SELECT nombre, direccion FROM (
       SELECT cliente_nombre AS nombre, cliente_direccion AS direccion, actualizado_en AS f FROM comprobantes WHERE cliente_doc = $1 AND cliente_nombre IS NOT NULL
       UNION ALL
       SELECT cliente, direccion, fecha FROM cotizaciones WHERE ruc_dni = $1 AND cliente <> ''
     ) x ORDER BY f DESC LIMIT 1`,
    [doc],
  );
  if (h[0]) return { encontrado: true, configurado, fuente: 'historial', nombre: h[0].nombre, direccion: h[0].direccion, estado: null, condicion: null, aviso };
  return { encontrado: false, configurado, fuente: null, nombre: null, direccion: null, estado: null, condicion: null, aviso };
}
