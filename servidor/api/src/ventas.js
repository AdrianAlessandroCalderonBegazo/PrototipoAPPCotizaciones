// Cotizaciones del ERP (Fase 3). Comparten la tabla y el correlativo con las que hacía Logística.
// Estados: borrador → enviada → aceptada | rechazada (una respondida puede volver a «enviada»). Las de Logística llegan sin estado.
import { calcular } from './cotizar.js';
import { leerNumeracion } from './configuracion.js';
import { consulta, enTransaccion } from './db.js';
import { monto } from './dinero.js';
import { falla } from './errores.js';
import { dniValido, rucValido } from './validaciones.js';

export const ESTADOS = ['borrador', 'enviada', 'aceptada', 'rechazada'];
const EDITABLE = (c) => c.estado === null || c.estado === 'borrador' || c.estado === 'enviada';

const t = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};

const COLS = `c.id, c.numero, c.origen, c.estado, c.cliente, c.ruc_dni, c.telefono, c.direccion, c.atencion, c.correo, c.vendedor, c.sistema,
  c.banco, c.moneda, c.nro_cuenta, c.cci, c.fecha::text AS fecha, c.total::text AS total, c.subtotal::text AS subtotal,
  c.descuento_lineas::text AS descuento_lineas, c.descuento::text AS descuento, c.valor_venta::text AS valor_venta, c.igv::text AS igv,
  c.validez_dias, c.condiciones, c.kit_id, c.proyecto_id, c.items_json, c.version, c.actualizado_por, c.actualizado_en::text AS actualizado_en,
  c.enviada_en::text AS enviada_en, c.respondida_en::text AS respondida_en, c.motivo_rechazo, u.nombre AS creado_por`;

/** Fecha hasta la que vale (fecha + validez), AAAA-MM-DD. */
function validaHasta(fecha, dias) {
  if (!fecha || !dias) return null;
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Lleva una fila de la base (de Logística o del ERP) al formato del ERP. */
export function normalizar(c) {
  const crudos = Array.isArray(c.items_json) ? c.items_json : [];
  // Las de Logística guardan { nombre, cantidad, precio_unitario (número), unidad_medida }.
  const items = crudos.map((i) => ({
    producto_id: i.producto_id ?? null,
    codigo: i.codigo ?? null,
    descripcion: i.descripcion ?? i.nombre ?? '',
    detalle: i.detalle ?? null,
    unidad: i.unidad ?? i.unidad_medida ?? null,
    cantidad: String(i.cantidad ?? '0'),
    precio_unitario: String(i.precio_unitario ?? '0'),
    descuento_pct: String(i.descuento_pct ?? '0'),
  }));
  let lineas = [];
  let totales;
  try {
    ({ lineas, totales } = calcular(items.map((i) => ({ ...i, cantidad: Number(i.cantidad).toFixed(2), precio_unitario: Number(i.precio_unitario).toFixed(2) })), c.descuento ?? '0'));
  } catch {
    lineas = items;
    totales = null;
  }
  if (c.origen === 'erp') {
    totales = { subtotal: monto(c.subtotal), descuento_lineas: monto(c.descuento_lineas), descuento: monto(c.descuento), total: monto(c.total), valor_venta: monto(c.valor_venta), igv: monto(c.igv) };
    lineas = crudos;
  }
  const { items_json: _i, subtotal: _s, descuento_lineas: _d, descuento: _g, valor_venta: _v, igv: _x, total, ...resto } = c;
  return { ...resto, total: monto(total), items: lineas, totales: totales ?? { subtotal: null, descuento_lineas: null, descuento: null, total: monto(total), valor_venta: null, igv: null }, valida_hasta: validaHasta(c.fecha, c.validez_dias) };
}

export async function listarCotizaciones() {
  const { rows } = await consulta(
    `SELECT c.id, c.numero, c.origen, c.estado, c.cliente, c.ruc_dni, c.vendedor, c.fecha::text AS fecha, c.total::text AS total, c.validez_dias, c.kit_id, c.proyecto_id,
            jsonb_array_length(c.items_json) AS n_items
       FROM cotizaciones c ORDER BY c.fecha DESC, c.id DESC`,
  );
  return rows.map((c) => ({ ...c, total: monto(c.total), valida_hasta: validaHasta(c.fecha, c.validez_dias) }));
}

export async function obtenerCotizacion(id) {
  const { rows } = await consulta(`SELECT ${COLS} FROM cotizaciones c LEFT JOIN usuarios u ON u.id = c.creado_por WHERE c.id = $1`, [id]);
  if (!rows[0]) throw falla(404, 'No existe esa cotización.');
  return normalizar(rows[0]);
}

function datosCliente(b) {
  const cliente = t(b?.cliente, 255);
  if (!cliente) throw falla(400, 'Escribe el nombre del cliente.');
  const doc = t(b?.ruc_dni, 20);
  if (doc && !(doc.length === 8 ? dniValido(doc) : rucValido(doc))) throw falla(400, 'El RUC o DNI no es válido (DNI: 8 dígitos; RUC: 11 dígitos con su dígito verificador).');
  const correo = t(b?.correo, 160);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw falla(400, 'El correo del cliente no tiene un formato válido.');
  const dias = b?.validez_dias === undefined || b?.validez_dias === null || b?.validez_dias === '' ? null : Number(b.validez_dias);
  if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 365)) throw falla(400, 'La validez debe ser de 1 a 365 días.');
  return {
    cliente, ruc_dni: doc, telefono: t(b?.telefono, 40), direccion: t(b?.direccion, 255), atencion: t(b?.atencion, 160), correo,
    vendedor: t(b?.vendedor, 120), sistema: t(b?.sistema, 2000), banco: t(b?.banco, 80), moneda: t(b?.moneda, 20), nro_cuenta: t(b?.nro_cuenta, 60),
    cci: t(b?.cci, 60), validez_dias: dias, condiciones: t(b?.condiciones, 4000),
    kit_id: Number.isInteger(Number(b?.kit_id)) && Number(b?.kit_id) > 0 ? Number(b.kit_id) : null,
    proyecto_id: Number.isInteger(Number(b?.proyecto_id)) && Number(b?.proyecto_id) > 0 ? Number(b.proyecto_id) : null,
  };
}

async function siguienteNumero(c) {
  const n = await leerNumeracion();
  const { rows } = await c.query(
    `INSERT INTO correlativos (clave, valor) VALUES ('cotizacion', 1) ON CONFLICT (clave) DO UPDATE SET valor = correlativos.valor + 1 RETURNING valor`,
  );
  return `${n.prefijo}${String(rows[0].valor).padStart(n.digitos, '0')}`;
}

export async function crearCotizacion(b, u) {
  const d = datosCliente(b);
  const { lineas, totales } = calcular(b?.items, b?.descuento ?? '0');
  return enTransaccion(async (c) => {
    const numero = await siguienteNumero(c);
    const { rows } = await c.query(
      `INSERT INTO cotizaciones (numero, origen, estado, cliente, ruc_dni, telefono, direccion, atencion, correo, vendedor, sistema, banco, moneda, nro_cuenta, cci,
         fecha, total, subtotal, descuento_lineas, descuento, valor_venta, igv, validez_dias, condiciones, kit_id, proyecto_id, items_json, archivo_pdf, creado_por, actualizado_por)
       VALUES ($1, 'erp', 'borrador', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now() AT TIME ZONE 'America/Lima', $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, '', $25, $26)
       RETURNING id`,
      [numero, d.cliente, d.ruc_dni, d.telefono, d.direccion, d.atencion, d.correo, d.vendedor ?? u.nombre, d.sistema, d.banco, d.moneda, d.nro_cuenta, d.cci,
       totales.total, totales.subtotal, totales.descuento_lineas, totales.descuento, totales.valor_venta, totales.igv, d.validez_dias, d.condiciones, d.kit_id, d.proyecto_id,
       JSON.stringify(lineas), u.id, u.nombre],
    );
    return rows[0].id;
  }).then(obtenerCotizacion);
}

export async function editarCotizacion(id, b, u) {
  const antes = await obtenerCotizacion(id);
  if (!EDITABLE(antes)) throw falla(409, `La cotización ya está ${antes.estado}: no se puede cambiar. Si hace falta, vuelve a marcarla como enviada.`);
  if (b?.version !== undefined && Number(b.version) !== antes.version) throw falla(409, 'Otra persona cambió esta cotización mientras la editabas. Se actualizó: revisa y vuelve a guardar.');
  const d = datosCliente(b);
  const { lineas, totales } = calcular(b?.items, b?.descuento ?? '0');
  await consulta(
    `UPDATE cotizaciones SET cliente = $2, ruc_dni = $3, telefono = $4, direccion = $5, atencion = $6, correo = $7, vendedor = $8, sistema = $9, banco = $10,
       moneda = $11, nro_cuenta = $12, cci = $13, total = $14, subtotal = $15, descuento_lineas = $16, descuento = $17, valor_venta = $18, igv = $19,
       validez_dias = $20, condiciones = $21, kit_id = $22, proyecto_id = $23, items_json = $24, origen = 'erp', estado = COALESCE(estado, 'borrador'),
       version = version + 1, actualizado_en = now() AT TIME ZONE 'America/Lima', actualizado_por = $25
     WHERE id = $1`,
    [id, d.cliente, d.ruc_dni, d.telefono, d.direccion, d.atencion, d.correo, d.vendedor, d.sistema, d.banco, d.moneda, d.nro_cuenta, d.cci,
     totales.total, totales.subtotal, totales.descuento_lineas, totales.descuento, totales.valor_venta, totales.igv, d.validez_dias, d.condiciones,
     d.kit_id ?? antes.kit_id, d.proyecto_id, JSON.stringify(lineas), u.nombre],
  );
  return { antes, despues: await obtenerCotizacion(id) };
}

const TRANSICIONES = { null: ESTADOS, borrador: ['enviada'], enviada: ['aceptada', 'rechazada', 'borrador'], aceptada: ['enviada'], rechazada: ['enviada'] };

export async function cambiarEstado(id, b, u) {
  const antes = await obtenerCotizacion(id);
  const estado = String(b?.estado ?? '');
  if (!ESTADOS.includes(estado)) throw falla(400, 'Estado no válido.');
  if (!TRANSICIONES[antes.estado ?? 'null'].includes(estado)) throw falla(409, `Una cotización ${antes.estado ?? 'sin estado'} no puede pasar a ${estado}.`);
  const motivo = estado === 'rechazada' ? t(b?.motivo, 500) : null;
  await consulta(
    `UPDATE cotizaciones SET estado = $2::text, motivo_rechazo = $3,
       enviada_en = CASE WHEN $2::text = 'enviada' AND enviada_en IS NULL THEN now() AT TIME ZONE 'America/Lima' ELSE enviada_en END,
       respondida_en = CASE WHEN $2::text IN ('aceptada','rechazada') THEN now() AT TIME ZONE 'America/Lima' WHEN $2::text IN ('enviada','borrador') THEN NULL ELSE respondida_en END,
       version = version + 1, actualizado_en = now() AT TIME ZONE 'America/Lima', actualizado_por = $4
     WHERE id = $1`,
    [id, estado, motivo, u.nombre],
  );
  return { antes, despues: await obtenerCotizacion(id) };
}
