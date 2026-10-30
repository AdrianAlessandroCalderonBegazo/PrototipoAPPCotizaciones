// Kits de venta (Fase 3): plantillas editables. Al cotizar se copian; cambiar la cotización no toca el kit.
// Un ítem con precio_unitario NULL usa el precio del catálogo del momento (así un cambio de lista de precios lo actualiza).
import { calcular } from './cotizar.js';
import { consulta, enTransaccion } from './db.js';
import { monto } from './dinero.js';
import { falla } from './errores.js';

const t = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};

async function itemsDe(ids) {
  if (!ids.length) return [];
  const { rows } = await consulta(
    `SELECT i.id, i.kit_id, i.orden, i.producto_id, i.descripcion, i.unidad, i.cantidad::text AS cantidad, i.precio_unitario::text AS precio_unitario,
            i.descuento_pct::text AS descuento_pct, p.codigo_erp AS codigo, p.nombre AS producto_nombre, p.precio_venta::text AS precio_catalogo,
            p.unidad_medida AS producto_unidad, (p.id IS NULL OR p.eliminado) AS sin_producto
       FROM kit_items i LEFT JOIN productos p ON p.id = i.producto_id
      WHERE i.kit_id = ANY($1) ORDER BY i.kit_id, i.orden, i.id`,
    [ids],
  );
  return rows.map((i) => ({
    ...i,
    cantidad: monto(i.cantidad),
    precio_unitario: monto(i.precio_unitario),
    precio_catalogo: monto(i.precio_catalogo),
    descuento_pct: monto(i.descuento_pct),
    precio_efectivo: monto(i.precio_unitario ?? i.precio_catalogo),
    unidad: i.unidad ?? i.producto_unidad ?? null,
  }));
}

/** Totales de un kit con los precios de hoy (null si algún ítem no tiene precio). */
function totalesKit(items) {
  if (!items.length || items.some((i) => i.precio_efectivo === null)) return null;
  return calcular(items.map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_efectivo, descuento_pct: i.descuento_pct }))).totales;
}

const COLS = "k.id, k.nombre, k.descripcion, k.variante_de, k.source, k.version, k.creado_en::text AS creado_en, k.actualizado_en::text AS actualizado_en";

export async function listarKits() {
  const { rows } = await consulta(`SELECT ${COLS} FROM kits k WHERE k.activo ORDER BY k.nombre`);
  const items = await itemsDe(rows.map((k) => k.id));
  return rows.map((k) => {
    const propios = items.filter((i) => i.kit_id === k.id);
    return { ...k, n_items: propios.length, sin_precio: propios.filter((i) => i.precio_efectivo === null).length, totales: totalesKit(propios) };
  });
}

export async function detalleKit(id) {
  const { rows } = await consulta(`SELECT ${COLS} FROM kits k WHERE k.id = $1 AND k.activo`, [id]);
  if (!rows[0]) throw falla(404, 'No existe ese kit.');
  const items = await itemsDe([id]);
  return { ...rows[0], items, totales: totalesKit(items) };
}

async function validarItems(c, items) {
  if (!Array.isArray(items) || !items.length) throw falla(400, 'El kit necesita al menos un producto.');
  if (items.length > 300) throw falla(400, 'Un kit puede tener como máximo 300 ítems.');
  const ids = items.map((i) => Number(i.producto_id)).filter((n) => Number.isInteger(n) && n > 0);
  const { rows } = ids.length ? await c.query('SELECT id, nombre, unidad_medida FROM productos WHERE id = ANY($1) AND NOT eliminado', [ids]) : { rows: [] };
  const productos = new Map(rows.map((p) => [p.id, p]));
  // Reusa la validación de montos de la cotización (cantidad > 0, hasta 2 decimales, descuento 0–100).
  return items.map((i, n) => {
    const p = i.producto_id ? productos.get(Number(i.producto_id)) : null;
    if (i.producto_id && !p) throw falla(400, `El producto del ítem ${n + 1} ya no existe.`);
    const descripcion = t(i.descripcion, 255) ?? p?.nombre;
    const precio = i.precio_unitario === null || i.precio_unitario === undefined || i.precio_unitario === '' ? null : i.precio_unitario;
    if (!p && precio === null) throw falla(400, `El ítem ${n + 1} no es del catálogo: indica su precio.`);
    const [l] = calcular([{ descripcion: descripcion ?? '', cantidad: i.cantidad, precio_unitario: precio ?? '0', descuento_pct: i.descuento_pct ?? '0' }]).lineas;
    return { producto_id: p?.id ?? null, descripcion: l.descripcion, unidad: t(i.unidad, 40) ?? p?.unidad_medida ?? null, cantidad: l.cantidad, precio_unitario: precio === null ? null : l.precio_unitario, descuento_pct: l.descuento_pct };
  });
}

async function guardarItems(c, kitId, items) {
  await c.query('DELETE FROM kit_items WHERE kit_id = $1', [kitId]);
  for (const [orden, i] of items.entries()) {
    await c.query(
      'INSERT INTO kit_items (kit_id, orden, producto_id, descripcion, unidad, cantidad, precio_unitario, descuento_pct) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [kitId, orden, i.producto_id, i.descripcion, i.unidad, i.cantidad, i.precio_unitario, i.descuento_pct],
    );
  }
}

export async function crearKit(b, u, { source = 'erp', varianteDe = null } = {}) {
  const nombre = t(b?.nombre, 160);
  if (!nombre) throw falla(400, 'Escribe el nombre del kit.');
  return enTransaccion(async (c) => {
    const items = await validarItems(c, b?.items);
    const { rows } = await c.query(
      'INSERT INTO kits (nombre, descripcion, variante_de, source, creado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nombre, t(b?.descripcion, 2000), varianteDe, source, u?.id ?? null],
    );
    await guardarItems(c, rows[0].id, items);
    return rows[0].id;
  }).then(detalleKit);
}

export async function editarKit(id, b) {
  const antes = await detalleKit(id);
  if (b?.version !== undefined && Number(b.version) !== antes.version) throw falla(409, 'Otra persona cambió este kit mientras lo editabas. Se actualizó: revisa y vuelve a guardar.');
  const nombre = b?.nombre === undefined ? antes.nombre : t(b.nombre, 160);
  if (!nombre) throw falla(400, 'El kit necesita un nombre.');
  await enTransaccion(async (c) => {
    const items = b?.items === undefined ? null : await validarItems(c, b.items);
    await c.query(
      "UPDATE kits SET nombre = $2, descripcion = $3, version = version + 1, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1",
      [id, nombre, b?.descripcion === undefined ? antes.descripcion : t(b.descripcion, 2000)],
    );
    if (items) await guardarItems(c, id, items);
  });
  return { antes, despues: await detalleKit(id) };
}

export async function varianteKit(id, b, u) {
  const base = await detalleKit(id);
  return crearKit({
    nombre: t(b?.nombre, 160) ?? `${base.nombre} (variante)`,
    descripcion: base.descripcion,
    items: (b?.items ?? base.items).map((i) => ({ ...i })),
  }, u, { varianteDe: base.id });
}

export async function eliminarKit(id) {
  const antes = await detalleKit(id);
  await consulta("UPDATE kits SET activo = FALSE, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1", [id]);
  return antes;
}
