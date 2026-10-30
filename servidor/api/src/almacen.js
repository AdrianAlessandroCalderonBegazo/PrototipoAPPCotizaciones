// Almacén (Fase 9): artículos con stock y kardex solo-agregar (entradas, salidas, ajustes por conteo y anulaciones).
// Las cantidades se calculan como los montos (texto con 2 decimales, en «céntimos») para no perder exactitud.
// El stock nunca queda negativo: una salida mayor al stock se rechaza.
import { consulta, enTransaccion } from './db.js';
import { aCentimos, deCentimos } from './dinero.js';
import { falla } from './errores.js';

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const t = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  return s === '' ? null : s;
};
const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const idValido = (v, nombre) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw falla(400, `${nombre} no es válido.`);
  return n;
};

/** Cantidad escrita por una persona («12», «12.5», «1,250»). Con `cero` acepta 0 (conteo físico). */
export function cantidadEntrada(v, nombre = 'La cantidad', { cero = false } = {}) {
  let s = typeof v === 'number' ? String(v) : String(v ?? '').trim();
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) throw falla(400, `${nombre} debe ser un número con hasta 2 decimales.`);
  const c = aCentimos(s);
  if (c < 0 || (!cero && c === 0)) throw falla(400, `${nombre} debe ser mayor a 0.`);
  return deCentimos(c);
}
const cant = (v) => (v === null || v === undefined ? null : deCentimos(aCentimos(v)));

const COLS_ART = `a.id, a.codigo, a.nombre, a.categoria, a.unidad, a.stock::text AS stock, a.stock_minimo::text AS stock_minimo, a.ubicacion,
  a.producto_id, a.activo, a.actualizado_en::text AS actualizado_en,
  (a.stock_minimo IS NOT NULL AND a.stock <= a.stock_minimo) AS bajo,
  (SELECT max(m.creado_en)::text FROM almacen_movimientos m WHERE m.articulo_id = a.id) AS ultimo_movimiento`;

export async function listarArticulos({ q, categoria, bajo, inactivos } = {}) {
  const { rows } = await consulta(`SELECT ${COLS_ART} FROM almacen_articulos a ${inactivos === '1' ? '' : 'WHERE a.activo'} ORDER BY a.categoria NULLS LAST, a.nombre`);
  const nq = normal(q);
  const lista = rows.filter((a) => (!nq || normal(`${a.codigo ?? ''} ${a.nombre} ${a.categoria ?? ''} ${a.ubicacion ?? ''}`).includes(nq))
    && (!categoria || a.categoria === categoria) && (bajo !== '1' || a.bajo));
  return {
    articulos: lista,
    categorias: [...new Set(rows.map((a) => a.categoria).filter(Boolean))].sort(),
    resumen: { articulos: rows.filter((a) => a.activo).length, bajos: rows.filter((a) => a.activo && a.bajo).length, sin_stock: rows.filter((a) => a.activo && aCentimos(a.stock) === 0).length },
  };
}

function datosArticulo(b, parcial) {
  const d = {};
  if (!parcial || b?.nombre !== undefined) {
    d.nombre = t(b?.nombre, 255);
    if (!d.nombre) throw falla(400, 'Escribe el nombre del artículo.');
  }
  if (!parcial || b?.unidad !== undefined) d.unidad = t(b?.unidad, 40) ?? 'und';
  for (const [k, max] of [['codigo', 60], ['categoria', 120], ['ubicacion', 120]]) if (b?.[k] !== undefined) d[k] = t(b[k], max);
  if (b?.stock_minimo !== undefined) d.stock_minimo = b.stock_minimo === null || String(b.stock_minimo).trim() === '' ? null : cantidadEntrada(b.stock_minimo, 'El stock mínimo', { cero: true });
  if (b?.producto_id !== undefined) d.producto_id = b.producto_id === null || b.producto_id === '' ? null : idValido(b.producto_id, 'El producto');
  return d;
}
const duplicado = (e) => {
  if (e?.code === '23505') throw falla(409, String(e.constraint).includes('codigo') ? 'Ya hay un artículo con ese código.' : 'Ya hay un artículo con ese nombre.');
  throw e;
};

export async function articulo(id) {
  const { rows } = await consulta(`SELECT ${COLS_ART} FROM almacen_articulos a WHERE a.id = $1`, [id]);
  if (!rows[0]) throw falla(404, 'No existe ese artículo.');
  return rows[0];
}

/** Crea un artículo. Si trae stock inicial, se registra como primera entrada (queda en el kardex). */
export async function crearArticulo(b, u) {
  const d = datosArticulo(b, false);
  const inicial = b?.stock_inicial === undefined || b?.stock_inicial === null || String(b.stock_inicial).trim() === '' ? null : cantidadEntrada(b.stock_inicial, 'El stock inicial', { cero: true });
  const id = await enTransaccion(async (c) => {
    const cols = Object.keys(d);
    const { rows } = await c.query(`INSERT INTO almacen_articulos (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((k) => d[k])).catch(duplicado);
    if (inicial && aCentimos(inicial) > 0) await mover(c, rows[0].id, { tipo: 'entrada', cantidad: inicial, fecha: hoyLima(), nota: 'Stock inicial' }, u);
    return rows[0].id;
  });
  return articulo(id);
}

export async function editarArticulo(id, b) {
  const antes = await articulo(id);
  const d = datosArticulo(b, true);
  if (b?.activo !== undefined) d.activo = b.activo === true;
  const cols = Object.keys(d);
  if (cols.length) {
    await consulta(`UPDATE almacen_articulos SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1`, [id, ...cols.map((k) => d[k])]).catch(duplicado);
  }
  return { antes, despues: await articulo(id) };
}

/** Agrega artículos desde el catálogo de Cotización (los que ya existen con ese nombre o producto se saltan). */
export async function articulosDesdeCatalogo(ids) {
  const lista = (Array.isArray(ids) ? ids : []).map((x) => idValido(x, 'El producto')).slice(0, 500);
  if (!lista.length) throw falla(400, 'Elige al menos un producto.');
  const { rows } = await consulta(
    `INSERT INTO almacen_articulos (codigo, nombre, categoria, unidad, producto_id)
     SELECT CASE WHEN p.codigo_erp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM almacen_articulos x WHERE x.codigo = p.codigo_erp) THEN p.codigo_erp END,
            p.nombre, p.categoria_producto, COALESCE(NULLIF(trim(p.unidad_medida), ''), 'und'), p.id
       FROM productos p
      WHERE p.id = ANY($1::int[]) AND NOT p.eliminado
        AND NOT EXISTS (SELECT 1 FROM almacen_articulos x WHERE x.producto_id = p.id OR lower(x.nombre) = lower(p.nombre))
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [lista],
  );
  return { agregados: rows.length, saltados: lista.length - rows.length };
}

/**
 * Un movimiento dentro de una transacción. Bloquea el artículo para que dos personas no descuenten a la vez.
 * entrada: suma · salida: resta (sin quedar negativo) · ajuste: el stock pasa a ser el conteo físico.
 */
async function mover(c, articuloId, m, u) {
  const { rows } = await c.query('SELECT id, nombre, unidad, stock::text AS stock, activo FROM almacen_articulos WHERE id = $1 FOR UPDATE', [articuloId]);
  const a = rows[0];
  if (!a) throw falla(404, 'No existe ese artículo.');
  if (!a.activo) throw falla(409, `«${a.nombre}» está desactivado.`);
  const stock = aCentimos(a.stock);
  const q = aCentimos(m.cantidad);
  const delta = m.tipo === 'entrada' ? q : m.tipo === 'salida' ? -q : m.tipo === 'ajuste' ? q - stock : m.delta;
  if (m.tipo === 'ajuste' && delta === 0) throw falla(400, `El conteo de «${a.nombre}» es igual al stock: no hay nada que ajustar.`);
  const despues = stock + delta;
  if (despues < 0) {
    throw falla(409, `No hay stock suficiente de «${a.nombre}»: hay ${deCentimos(stock)} ${a.unidad}${m.tipo === 'salida' ? ` y se quiere sacar ${deCentimos(q)}` : ''}.`, { articulo_id: a.id, stock: deCentimos(stock) });
  }
  await c.query("UPDATE almacen_articulos SET stock = $2, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1", [a.id, deCentimos(despues)]);
  const { rows: mv } = await c.query(
    `INSERT INTO almacen_movimientos (articulo_id, tipo, cantidad, delta, stock_despues, fecha, proyecto_id, requerimiento_id, proveedor_id, documento, costo_unitario, moneda, nota, anula_id, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
    [a.id, m.tipo, m.cantidad, deCentimos(delta), deCentimos(despues), m.fecha, m.proyecto_id ?? null, m.requerimiento_id ?? null, m.proveedor_id ?? null,
      m.documento ?? null, m.costo_unitario ?? null, m.costo_unitario ? m.moneda ?? 'PEN' : null, m.nota ?? null, m.anula_id ?? null, u?.nombre ?? null],
  );
  return { id: mv[0].id, articulo_id: a.id, articulo: a.nombre, tipo: m.tipo, cantidad: m.cantidad, delta: deCentimos(delta), stock_despues: deCentimos(despues) };
}

async function existe(c, tabla, id, nombre) {
  if (id === null || id === undefined || id === '') return null;
  const n = idValido(id, nombre);
  const { rows } = await c.query(`SELECT 1 FROM ${tabla} WHERE id = $1`, [n]);
  if (!rows[0]) throw falla(400, `${nombre} no existe.`);
  return n;
}

/**
 * Registra uno o varios movimientos del mismo tipo en una sola transacción (todo o nada).
 * b = { tipo, fecha, items: [{ articulo_id, cantidad }], proyecto_id?, requerimiento_id?, proveedor_id?, documento?, costo_unitario?, moneda?, nota?, repetir? }
 */
export async function registrarMovimientos(b, u) {
  const tipo = b?.tipo;
  if (!['entrada', 'salida', 'ajuste'].includes(tipo)) throw falla(400, 'Elige si es entrada, salida o ajuste.');
  const fecha = String(b?.fecha ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyLima()) throw falla(400, 'Escribe la fecha (no puede ser futura).');
  const items = Array.isArray(b?.items) ? b.items : [];
  if (!items.length) throw falla(400, 'Agrega al menos un artículo.');
  if (items.length > 200) throw falla(400, 'Máximo 200 artículos por registro.');
  const vistos = new Set();
  const lineas = items.map((it, i) => {
    const id = idValido(it?.articulo_id, `El artículo de la línea ${i + 1}`);
    if (vistos.has(id)) throw falla(400, 'Un artículo está repetido: júntalo en una sola línea.');
    vistos.add(id);
    return { articulo_id: id, cantidad: cantidadEntrada(it?.cantidad, `La cantidad de la línea ${i + 1}`, { cero: tipo === 'ajuste' }) };
  });
  if (tipo === 'ajuste' && !t(b?.nota, 500)) throw falla(400, 'Explica el ajuste en la nota (por ejemplo «conteo de fin de mes»).');
  const costo = b?.costo_unitario === undefined || b?.costo_unitario === null || String(b.costo_unitario).trim() === '' ? null : cantidadEntrada(b.costo_unitario, 'El costo unitario');
  if (costo && lineas.length > 1) throw falla(400, 'El costo unitario se registra de a un artículo.');
  const moneda = ['PEN', 'USD'].includes(b?.moneda) ? b.moneda : 'PEN';
  return enTransaccion(async (c) => {
    const proyecto_id = await existe(c, 'proyectos', b?.proyecto_id, 'El proyecto');
    const requerimiento_id = await existe(c, 'requerimientos', b?.requerimiento_id, 'El requerimiento');
    const proveedor_id = await existe(c, 'proveedores', b?.proveedor_id, 'El proveedor');
    if (requerimiento_id && tipo === 'salida' && b?.repetir !== true) {
      const { rows } = await c.query("SELECT count(*)::int AS n, max(fecha)::text AS f FROM almacen_movimientos WHERE requerimiento_id = $1 AND tipo = 'salida'", [requerimiento_id]);
      if (rows[0].n) throw falla(409, `Ya se registró la salida de este requerimiento (${rows[0].f}). Si de verdad salió más material, confirma para registrarlo otra vez.`, { repetido: true });
    }
    const comun = { tipo, fecha, proyecto_id, requerimiento_id, proveedor_id, documento: t(b?.documento, 80), costo_unitario: costo, moneda, nota: t(b?.nota, 500) };
    const hechos = [];
    for (const l of lineas) hechos.push(await mover(c, l.articulo_id, { ...comun, ...l }, u));
    return hechos;
  });
}

/** Anula un movimiento con otro igual y contrario (el original queda en el kardex). */
export async function anularMovimiento(id, b, u) {
  const motivo = t(b?.motivo, 300);
  if (!motivo) throw falla(400, 'Escribe por qué se anula.');
  return enTransaccion(async (c) => {
    const { rows } = await c.query('SELECT id, articulo_id, tipo, delta::text AS delta, fecha::text AS fecha FROM almacen_movimientos WHERE id = $1', [id]);
    const m = rows[0];
    if (!m) throw falla(404, 'No existe ese movimiento.');
    if (m.tipo === 'anulacion') throw falla(409, 'Una anulación no se anula: registra un movimiento nuevo.');
    const { rows: ya } = await c.query('SELECT 1 FROM almacen_movimientos WHERE anula_id = $1', [id]);
    if (ya[0]) throw falla(409, 'Ese movimiento ya está anulado.');
    const delta = -aCentimos(m.delta);
    return mover(c, m.articulo_id, { tipo: 'anulacion', cantidad: deCentimos(Math.abs(delta)), delta, fecha: hoyLima(), anula_id: m.id, nota: `Anula el movimiento ${m.id}: ${motivo}` }, u);
  });
}

const COLS_MOV = `m.id, m.articulo_id, a.nombre AS articulo, a.unidad, a.codigo, m.tipo, m.cantidad::text AS cantidad, m.delta::text AS delta, m.stock_despues::text AS stock_despues,
  m.fecha::text AS fecha, m.proyecto_id, p.nombre AS proyecto, m.requerimiento_id, r.numero AS requerimiento, r.obra, m.proveedor_id, v.nombre AS proveedor,
  m.documento, m.costo_unitario::text AS costo_unitario, m.moneda, m.nota, m.anula_id, m.creado_por, m.creado_en::text AS creado_en,
  EXISTS (SELECT 1 FROM almacen_movimientos z WHERE z.anula_id = m.id) AS anulado`;
const JOIN_MOV = `FROM almacen_movimientos m JOIN almacen_articulos a ON a.id = m.articulo_id LEFT JOIN proyectos p ON p.id = m.proyecto_id
  LEFT JOIN requerimientos r ON r.id = m.requerimiento_id LEFT JOIN proveedores v ON v.id = m.proveedor_id`;

export async function listarMovimientos({ articulo_id, tipo, desde, hasta, proyecto_id, requerimiento_id, limite } = {}) {
  const w = [];
  const v = [];
  const add = (sql, val) => { v.push(val); w.push(sql.replace('?', `$${v.length}`)); };
  if (articulo_id) add('m.articulo_id = ?', idValido(articulo_id, 'El artículo'));
  if (['entrada', 'salida', 'ajuste', 'anulacion'].includes(tipo)) add('m.tipo = ?', tipo);
  if (/^\d{4}-\d{2}-\d{2}$/.test(desde ?? '')) add('m.fecha >= ?', desde);
  if (/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '')) add('m.fecha <= ?', hasta);
  if (proyecto_id) add('m.proyecto_id = ?', idValido(proyecto_id, 'El proyecto'));
  if (requerimiento_id) add('m.requerimiento_id = ?', idValido(requerimiento_id, 'El requerimiento'));
  const n = Math.min(Math.max(Number(limite) || 300, 1), 2000);
  const { rows } = await consulta(`SELECT ${COLS_MOV} ${JOIN_MOV} ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY m.id DESC LIMIT ${n}`, v);
  return rows;
}

/** Kardex de un artículo: datos, movimientos y totales de entradas y salidas. */
export async function kardex(id) {
  const a = await articulo(id);
  const movimientos = await listarMovimientos({ articulo_id: id, limite: 2000 });
  const suma = (f) => deCentimos(movimientos.filter(f).reduce((s, m) => s + aCentimos(m.delta), 0));
  return { articulo: a, movimientos, entradas: suma((m) => aCentimos(m.delta) > 0), salidas: suma((m) => aCentimos(m.delta) < 0) };
}

/**
 * Propuesta de salida para un requerimiento de Logística: sus materiales (con cantidad) y el artículo del almacén con el mismo nombre.
 * Lo que no coincide queda sin artículo para que la persona lo elija; nada se descuenta hasta confirmar.
 */
export async function propuestaRequerimiento(id) {
  const { rows } = await consulta('SELECT id, numero, obra, estado, categorias_json FROM requerimientos WHERE id = $1', [id]);
  const r = rows[0];
  if (!r) throw falla(404, 'No existe ese requerimiento.');
  let cats = r.categorias_json;
  if (typeof cats === 'string') try { cats = JSON.parse(cats); } catch { cats = []; }
  const { rows: arts } = await consulta('SELECT id, nombre, unidad, stock::text AS stock FROM almacen_articulos WHERE activo');
  const porNombre = new Map(arts.map((a) => [normal(a.nombre), a]));
  const items = [];
  for (const cat of Array.isArray(cats) ? cats : []) {
    for (const it of Array.isArray(cat?.items) ? cat.items : []) {
      const q = Number(it?.cantidad);
      if (!it?.texto || !Number.isFinite(q) || q <= 0) continue;
      const a = porNombre.get(normal(it.texto)) ?? null;
      items.push({ texto: String(it.texto), categoria: cat?.nombre ?? cat?.categoria ?? null, cantidad: cant(String(Math.round(q * 100) / 100)), unidad: it.unidad ?? null, articulo: a });
    }
  }
  const { rows: ya } = await consulta("SELECT max(fecha)::text AS fecha, count(*)::int AS n FROM almacen_movimientos WHERE requerimiento_id = $1 AND tipo = 'salida'", [id]);
  return { requerimiento: { id: r.id, numero: r.numero, obra: r.obra, estado: r.estado }, items, salida_registrada: ya[0].n ? ya[0].fecha : null };
}

/** Para Inicio: artículos en o bajo su stock mínimo. */
export async function articulosBajos() {
  const { rows } = await consulta('SELECT id, nombre, unidad, stock::text AS stock, stock_minimo::text AS stock_minimo FROM almacen_articulos WHERE activo AND stock_minimo IS NOT NULL AND stock <= stock_minimo ORDER BY nombre');
  return rows;
}
