// Caja ICR (Fase 11): la única caja de Finanzas. Dos saldos (EFECTIVO y DIGITAL), sin ciudades ni cierre del día.
// Ingresos: ventas (app) y fondos enviados desde el ERP. Egresos: gastos físicos, gastos digitales (capturas de Yape/BCP) y
// «Depósito a cuenta principal», que crea el ingreso en la cuenta principal del ERP en la misma transacción (y se anulan juntos).
// Los movimientos no se borran: se anulan con motivo. Todo cambio queda en la auditoría.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditar } from './auditoria.js';
import { consulta, enTransaccion } from './db.js';
import { aCentimos, deCentimos, montoEntrada } from './dinero.js';
import { falla } from './errores.js';

export const CATEGORIA_DEPOSITO = 'Depósito a cuenta principal';
export const CATEGORIAS_ICR = {
  EGRESO: ['Movilidad', 'Viáticos', 'Material', 'Equipos', 'Oficina', 'Fletes', 'Proveedores', 'Gastos fijos', 'Gasto de proyecto', CATEGORIA_DEPOSITO, 'Otros egresos'],
  INGRESO: ['Venta', 'Cobro a cliente', 'Otros ingresos'],
};
export const SUBCATEGORIAS_ICR = { 'Gastos fijos': ['Sueldos', 'Alquiler', 'Servicios'] };
export const MEDIOS = { EFECTIVO: 'Efectivo', DIGITAL: 'Digital (Yape / transferencia)' };
const COMPROBANTES = ['BOLETA', 'FACTURA', 'RECIBO', 'NINGUNO'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const t = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  return s === '' ? null : s;
};
function fechaValida(v) {
  const f = String(v ?? hoyLima()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(`${f}T12:00:00Z`))) throw falla(400, 'La fecha debe ser AAAA-MM-DD.');
  if (f > hoyLima()) throw falla(400, 'La fecha no puede ser futura.');
  return f;
}
const sumar = (xs) => deCentimos(xs.reduce((s, v) => s + aCentimos(v ?? '0'), 0));

const COLS = `m.id, m.fecha::text AS fecha, m.tipo, m.medio, m.origen, m.categoria, m.subcategoria, m.descripcion, m.persona, m.destinatario, m.operacion,
  m.comprobante, m.monto::text AS monto, m.proyecto_id, p.nombre AS proyecto, m.cuenta_movimiento_id, m.anulado, m.anulado_motivo, m.anulado_por,
  m.anulado_en::text AS anulado_en, m.creado_por, m.creado_en::text AS creado_en, m.actualizado_por, m.actualizado_en::text AS actualizado_en,
  COALESCE((SELECT json_agg(a.id ORDER BY a.id) FROM caja_icr_adjunto a WHERE a.mov_id = m.id), '[]'::json) AS adjuntos`;
const DESDE = 'FROM caja_icr_mov m LEFT JOIN proyectos p ON p.id = m.proyecto_id';

async function obtener(c, id) {
  const { rows } = await (c ?? { query: consulta }).query(`SELECT ${COLS} ${DESDE} WHERE m.id = $1`, [id]);
  return rows[0] ?? null;
}
export async function movimiento(id) {
  if (!UUID.test(String(id))) throw falla(404, 'No existe ese movimiento.');
  const m = await obtener(null, id);
  if (!m) throw falla(404, 'No existe ese movimiento.');
  return m;
}

/** Saldos de la caja (sin anulados): efectivo, digital y total. */
export async function saldos(c) {
  const { rows } = await (c ?? { query: consulta }).query(
    `SELECT medio, COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END), 0)::text AS saldo FROM caja_icr_mov WHERE NOT anulado GROUP BY medio`,
  );
  const de = (m) => rows.find((r) => r.medio === m)?.saldo ?? '0.00';
  const efectivo = deCentimos(aCentimos(de('EFECTIVO')));
  const digital = deCentimos(aCentimos(de('DIGITAL')));
  return { efectivo, digital, total: deCentimos(aCentimos(efectivo) + aCentimos(digital)) };
}

async function cuentaPrincipal(c) {
  const { rows } = await c.query("SELECT id, nombre, activa FROM cuentas WHERE principal AND moneda = 'PEN' FOR UPDATE");
  if (!rows[0]) throw falla(409, 'Falta la cuenta principal en soles en el ERP (Contabilidad › Cuentas): sin ella no se puede registrar el depósito.');
  if (!rows[0].activa) throw falla(409, 'La cuenta principal está desactivada en el ERP.');
  return rows[0];
}

async function validarProyecto(c, id) {
  if (id === null || id === undefined || id === '') return null;
  const n = Number(id);
  const { rows } = await c.query("SELECT id, estado FROM proyectos WHERE id = $1", [Number.isInteger(n) ? n : 0]);
  if (!rows[0]) throw falla(400, 'Ese proyecto no existe.');
  return n;
}

/**
 * Registra un movimiento. b.id lo genera la app (uuid): si ya existe, devuelve el mismo (un reintento no duplica).
 * b.origen: VENTA (ingreso) | GASTO (gasto físico) | CAPTURA (gasto digital desde una captura) | AJUSTE (solo administrador).
 * Un egreso con la categoría «Depósito a cuenta principal» pasa a origen DEPOSITO y crea el ingreso en la cuenta principal.
 */
export async function registrar(b, u, req) {
  const id = String(b?.id ?? '');
  if (!UUID.test(id)) throw falla(400, 'Falta el identificador del movimiento (lo pone la app).');
  const ya = await obtener(null, id);
  if (ya) return { mov: ya, repetido: true, saldos: await saldos() };

  let origen = b?.origen;
  if (!['VENTA', 'GASTO', 'CAPTURA', 'AJUSTE'].includes(origen)) throw falla(400, 'Elige si es una venta, un gasto físico o un gasto digital.');
  if (origen === 'AJUSTE' && u.rol !== 'admin') throw falla(403, 'Solo un Administrador registra ajustes de saldo.');
  const tipo = origen === 'VENTA' ? 'INGRESO' : origen === 'AJUSTE' ? (b?.tipo === 'INGRESO' ? 'INGRESO' : b?.tipo === 'EGRESO' ? 'EGRESO' : null) : 'EGRESO';
  if (!tipo) throw falla(400, 'Indica si el ajuste suma o resta.');
  const medio = origen === 'CAPTURA' ? 'DIGITAL' : b?.medio === 'DIGITAL' ? 'DIGITAL' : 'EFECTIVO';
  const fecha = fechaValida(b?.fecha);
  const monto = montoEntrada(b?.monto);
  const descripcion = t(b?.descripcion, 300);
  if (!descripcion) throw falla(400, 'Escribe la descripción.');
  let categoria = t(b?.categoria, 80);
  if (origen === 'AJUSTE') categoria = 'Ajuste de saldo';
  else if (!categoria || !CATEGORIAS_ICR[tipo].includes(categoria)) throw falla(400, 'Elige una categoría de la lista.');
  const subcategoria = t(b?.subcategoria, 80);
  if (subcategoria && !(SUBCATEGORIAS_ICR[categoria] ?? []).includes(subcategoria)) throw falla(400, 'La subcategoría no corresponde a la categoría.');
  if (categoria === CATEGORIA_DEPOSITO) origen = 'DEPOSITO';
  const comprobante = b?.comprobante ? (COMPROBANTES.includes(b.comprobante) ? b.comprobante : null) : null;
  const operacion = t(b?.operacion, 40);

  return enTransaccion(async (c) => {
    if (operacion) {
      const { rows } = await c.query(`SELECT ${COLS} ${DESDE} WHERE m.operacion = $1 AND NOT m.anulado`, [operacion]);
      if (rows[0]) throw falla(409, `Esa operación (n.º ${operacion}) ya está registrada: ${rows[0].descripcion}, ${rows[0].fecha}.`, { duplicado: true, existente: rows[0] });
    }
    const proyectoId = tipo === 'EGRESO' && origen !== 'DEPOSITO' ? await validarProyecto(c, b?.proyecto_id) : null;
    let cuentaMov = null;
    if (origen === 'DEPOSITO') {
      const cta = await cuentaPrincipal(c);
      const { rows } = await c.query(
        `INSERT INTO cuenta_movimientos (cuenta_id, fecha, tipo, monto, concepto, categoria, source, contraparte, registrado_por_id, registrado_por)
         VALUES ($1, $2, 'ingreso', $3, $4, 'Depósito desde Caja ICR', 'deposito_caja_icr', 'Caja ICR', $5, $6) RETURNING id`,
        [cta.id, fecha, monto, `Depósito desde Caja ICR (${medio === 'EFECTIVO' ? 'efectivo' : 'digital'}) · ${descripcion}`.slice(0, 255), u.id, u.nombre],
      );
      cuentaMov = rows[0].id;
    }
    const antes = await saldos(c);
    await c.query(
      `INSERT INTO caja_icr_mov (id, fecha, tipo, medio, origen, categoria, subcategoria, descripcion, persona, destinatario, operacion, comprobante, monto, proyecto_id,
                                 cuenta_movimiento_id, creado_por_id, creado_por, actualizado_por)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)`,
      [id, fecha, tipo, medio, origen, categoria, subcategoria, descripcion, t(b?.persona, 120), t(b?.destinatario, 160), operacion, comprobante, monto, proyectoId, cuentaMov, u.id, u.nombre],
    );
    const mov = await obtener(c, id);
    const despues = await saldos(c);
    await auditar(req ?? { usuario: u }, { accion: 'crear', entidad: 'caja_icr', entidadId: id, despues: mov, detalle: origen === 'DEPOSITO' ? `Depósito a la cuenta principal (movimiento ${cuentaMov})` : null }, c);
    const negativo = aCentimos(despues[medio === 'EFECTIVO' ? 'efectivo' : 'digital']) < 0;
    return { mov, repetido: false, saldos: despues, aviso: negativo ? `El saldo ${medio === 'EFECTIVO' ? 'en efectivo' : 'digital'} quedó en negativo (antes ${antes[medio === 'EFECTIVO' ? 'efectivo' : 'digital']}). Revisa si falta registrar algún ingreso.` : null };
  });
}

/** Corrige un movimiento (queda en la auditoría con el antes y el después). Fondos y depósitos solo cambian su descripción. */
export async function editar(id, b, u, req) {
  return enTransaccion(async (c) => {
    const { rows } = await c.query(`SELECT ${COLS} ${DESDE} WHERE m.id = $1 FOR UPDATE OF m`, [String(id)]);
    const antes = rows[0];
    if (!antes) throw falla(404, 'No existe ese movimiento.');
    if (antes.anulado) throw falla(409, 'Ese movimiento está anulado.');
    if (antes.origen === 'AJUSTE' && u.rol !== 'admin') throw falla(403, 'Solo un Administrador corrige ajustes de saldo.');
    const d = {};
    if (b?.descripcion !== undefined) {
      d.descripcion = t(b.descripcion, 300);
      if (!d.descripcion) throw falla(400, 'Escribe la descripción.');
    }
    const soloTexto = ['FONDO', 'DEPOSITO'].includes(antes.origen);
    const otros = ['fecha', 'monto', 'medio', 'categoria', 'subcategoria', 'persona', 'destinatario', 'comprobante', 'proyecto_id'].filter((k) => b?.[k] !== undefined);
    if (soloTexto && otros.length) throw falla(409, antes.origen === 'FONDO' ? 'Un fondo enviado desde el ERP solo se corrige en el ERP.' : 'Un depósito a la cuenta principal no se corrige: anúlalo y regístralo de nuevo.');
    if (b?.fecha !== undefined) d.fecha = fechaValida(b.fecha);
    if (b?.monto !== undefined) d.monto = montoEntrada(b.monto);
    if (b?.medio !== undefined && antes.origen !== 'CAPTURA') d.medio = b.medio === 'DIGITAL' ? 'DIGITAL' : 'EFECTIVO';
    if (b?.categoria !== undefined && antes.origen !== 'AJUSTE') {
      const cat = t(b.categoria, 80);
      if (!cat || !CATEGORIAS_ICR[antes.tipo].includes(cat) || cat === CATEGORIA_DEPOSITO) throw falla(400, cat === CATEGORIA_DEPOSITO ? 'Para un depósito a la cuenta principal registra un movimiento nuevo.' : 'Elige una categoría de la lista.');
      d.categoria = cat;
    }
    if (b?.subcategoria !== undefined) d.subcategoria = t(b.subcategoria, 80);
    const cat = d.categoria ?? antes.categoria;
    if ((d.subcategoria ?? antes.subcategoria) && !(SUBCATEGORIAS_ICR[cat] ?? []).includes(d.subcategoria ?? antes.subcategoria)) d.subcategoria = null;
    for (const [k, max] of [['persona', 120], ['destinatario', 160]]) if (b?.[k] !== undefined) d[k] = t(b[k], max);
    if (b?.comprobante !== undefined) d.comprobante = COMPROBANTES.includes(b.comprobante) ? b.comprobante : null;
    if (b?.proyecto_id !== undefined) d.proyecto_id = antes.tipo === 'EGRESO' ? await validarProyecto(c, b.proyecto_id) : null;
    const cols = Object.keys(d);
    if (!cols.length) return antes;
    await c.query(`UPDATE caja_icr_mov SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, actualizado_por = $${cols.length + 2}, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1`,
      [antes.id, ...cols.map((k) => d[k]), u.nombre]);
    const despues = await obtener(c, antes.id);
    await auditar(req ?? { usuario: u }, { accion: 'editar', entidad: 'caja_icr', entidadId: antes.id, antes, despues }, c);
    return despues;
  });
}

/** Anula (no borra). Un depósito anula también su ingreso en la cuenta principal; un fondo del ERP se anula desde el ERP. */
export async function anular(id, b, u, req) {
  const motivo = t(b?.motivo, 500);
  if (!motivo) throw falla(400, 'Escribe por qué se anula.');
  return enTransaccion(async (c) => {
    const { rows } = await c.query(`SELECT ${COLS} ${DESDE} WHERE m.id = $1 FOR UPDATE OF m`, [String(id)]);
    const antes = rows[0];
    if (!antes) throw falla(404, 'No existe ese movimiento.');
    if (antes.anulado) throw falla(409, 'Ese movimiento ya está anulado.');
    if (antes.origen === 'FONDO') throw falla(409, 'Un fondo enviado desde el ERP se anula en el ERP (Contabilidad › movimiento › Anular).');
    if (antes.origen === 'AJUSTE' && u.rol !== 'admin') throw falla(403, 'Solo un Administrador anula ajustes de saldo.');
    await c.query(`UPDATE caja_icr_mov SET anulado = TRUE, anulado_motivo = $2, anulado_por = $3, anulado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1`, [antes.id, motivo, u.nombre]);
    if (antes.origen === 'DEPOSITO' && antes.cuenta_movimiento_id) {
      await c.query(
        `UPDATE cuenta_movimientos SET anulado = TRUE, anulado_motivo = $2, anulado_por = $3, anulado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1 AND NOT anulado`,
        [antes.cuenta_movimiento_id, `Anulado en la Caja ICR: ${motivo}`, u.nombre],
      );
    }
    const despues = await obtener(c, antes.id);
    await auditar(req ?? { usuario: u }, { accion: 'anular', entidad: 'caja_icr', entidadId: antes.id, antes, despues, detalle: motivo }, c);
    return despues;
  });
}

/** Lista con filtros (por defecto el mes actual). */
export async function listar(q = {}) {
  const v = [];
  const w = [];
  const add = (sql, val) => { v.push(val); w.push(sql.replace('?', `$${v.length}`)); };
  const f = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x ?? '')) ? x : null);
  if (f(q.desde)) add('m.fecha >= ?', q.desde);
  if (f(q.hasta)) add('m.fecha <= ?', q.hasta);
  if (['INGRESO', 'EGRESO'].includes(q.tipo)) add('m.tipo = ?', q.tipo);
  if (['EFECTIVO', 'DIGITAL'].includes(q.medio)) add('m.medio = ?', q.medio);
  if (q.categoria) add('m.categoria = ?', String(q.categoria));
  if (q.proyecto_id && Number.isInteger(Number(q.proyecto_id))) add('m.proyecto_id = ?', Number(q.proyecto_id));
  if (q.q) add("(m.descripcion || ' ' || COALESCE(m.persona, '') || ' ' || COALESCE(m.destinatario, '') || ' ' || COALESCE(m.operacion, '')) ILIKE ?", `%${String(q.q).slice(0, 80)}%`);
  if (q.anulados !== '1') w.push('NOT m.anulado');
  const n = Math.min(Math.max(Number(q.limite) || 300, 1), 2000);
  const { rows } = await consulta(`SELECT ${COLS} ${DESDE} ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY m.fecha DESC, m.creado_en DESC LIMIT ${n}`, v);
  return rows;
}

/** Pantalla principal: saldos, lo de hoy y los últimos movimientos. */
export async function resumen() {
  const hoy = hoyLima();
  const s = await saldos();
  const deHoy = await listar({ desde: hoy, hasta: hoy, limite: 500 });
  const suma = (tipo, medio) => sumar(deHoy.filter((m) => m.tipo === tipo && (!medio || m.medio === medio)).map((m) => m.monto));
  return {
    fecha: hoy, saldos: s,
    hoy: { ingresos: suma('INGRESO'), egresos: suma('EGRESO'), movimientos: deHoy.length, sin_foto: deHoy.filter((m) => m.tipo === 'EGRESO' && m.origen === 'GASTO' && !m.adjuntos.length).length },
    recientes: await listar({ limite: 15 }),
    categorias: CATEGORIAS_ICR, subcategorias: SUBCATEGORIAS_ICR, medios: MEDIOS, categoria_deposito: CATEGORIA_DEPOSITO,
  };
}

/** Reportes de un período: totales por medio, por categoría, por día, por persona y por proyecto (todo calculado aquí, en céntimos). */
export async function reportes(q = {}) {
  const hoy = hoyLima();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(q.desde ?? '')) ? q.desde : `${hoy.slice(0, 7)}-01`;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(q.hasta ?? '')) ? q.hasta : hoy;
  if (desde > hasta) throw falla(400, 'La fecha «desde» es posterior a «hasta».');
  const movs = await listar({ desde, hasta, limite: 2000 });
  const { rows: previo } = await consulta(
    `SELECT medio, COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END), 0)::text AS s FROM caja_icr_mov WHERE NOT anulado AND fecha < $1 GROUP BY medio`, [desde],
  );
  const ini = (m) => deCentimos(aCentimos(previo.find((r) => r.medio === m)?.s ?? '0'));
  const total = (filtro) => sumar(movs.filter(filtro).map((m) => m.monto));
  const agrupar = (clave, filtro) => {
    const g = new Map();
    for (const m of movs.filter(filtro)) {
      const k = clave(m) ?? 'Sin dato';
      g.set(k, (g.get(k) ?? 0) + aCentimos(m.monto));
    }
    return [...g.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ clave: k, monto: deCentimos(c) }));
  };
  const porMedio = (medio) => {
    const ing = total((m) => m.medio === medio && m.tipo === 'INGRESO');
    const egr = total((m) => m.medio === medio && m.tipo === 'EGRESO');
    return { saldo_inicial: ini(medio), ingresos: ing, egresos: egr, saldo_final: deCentimos(aCentimos(ini(medio)) + aCentimos(ing) - aCentimos(egr)) };
  };
  const egresoReal = (m) => m.tipo === 'EGRESO' && m.origen !== 'DEPOSITO';
  const dias = new Map();
  for (const m of movs) {
    const d = dias.get(m.fecha) ?? { fecha: m.fecha, ingresos: 0, egresos: 0 };
    d[m.tipo === 'INGRESO' ? 'ingresos' : 'egresos'] += aCentimos(m.monto);
    dias.set(m.fecha, d);
  }
  return {
    desde, hasta,
    efectivo: porMedio('EFECTIVO'), digital: porMedio('DIGITAL'),
    ingresos: total((m) => m.tipo === 'INGRESO'), egresos: total((m) => m.tipo === 'EGRESO'),
    ventas: total((m) => m.origen === 'VENTA'), fondos: total((m) => m.origen === 'FONDO'),
    gastos: total(egresoReal), depositos: total((m) => m.origen === 'DEPOSITO'),
    gastos_fisicos: total((m) => egresoReal(m) && m.medio === 'EFECTIVO'), gastos_digitales: total((m) => egresoReal(m) && m.medio === 'DIGITAL'),
    sin_foto: movs.filter((m) => m.origen === 'GASTO' && !m.adjuntos.length).length,
    por_categoria: agrupar((m) => (m.subcategoria ? `${m.categoria} · ${m.subcategoria}` : m.categoria), egresoReal),
    por_persona: agrupar((m) => m.persona, egresoReal),
    por_proyecto: agrupar((m) => m.proyecto, (m) => egresoReal(m) && m.proyecto_id),
    por_dia: [...dias.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((d) => ({ fecha: d.fecha, ingresos: deCentimos(d.ingresos), egresos: deCentimos(d.egresos) })),
    movimientos: movs,
  };
}

// ---------------------------------------------------------------------------------------------
// Fotos del recibo y capturas: carpeta privada, se ven solo con sesión y permiso
// ---------------------------------------------------------------------------------------------

const FIRMAS = { jpg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46] };
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function subirAdjunto(movId, extIn, bytes, carpeta, u, req) {
  const m = await movimiento(movId);
  if (m.anulado) throw falla(409, 'Ese movimiento está anulado.');
  const ext = String(extIn ?? 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const firma = FIRMAS[ext];
  if (!firma || !Buffer.isBuffer(bytes) || bytes.length < 16 || !firma.every((x, i) => bytes[i] === x)) throw falla(400, 'La foto debe ser una imagen JPG, PNG o WEBP.');
  const { rows: n } = await consulta('SELECT count(*)::int AS n FROM caja_icr_adjunto WHERE mov_id = $1', [m.id]);
  if (n[0].n >= 10) throw falla(409, 'Máximo 10 fotos por movimiento.');
  mkdirSync(carpeta, { recursive: true });
  const archivo = `${randomBytes(12).toString('hex')}.${ext}`;
  writeFileSync(join(carpeta, archivo), bytes);
  const { rows } = await consulta('INSERT INTO caja_icr_adjunto (mov_id, archivo, mime, bytes) VALUES ($1, $2, $3, $4) RETURNING id', [m.id, archivo, MIME[ext], bytes.length]);
  await auditar(req ?? { usuario: u }, { accion: 'subir_foto', entidad: 'caja_icr', entidadId: m.id, detalle: `foto ${rows[0].id}` });
  return { id: rows[0].id };
}

export async function leerAdjunto(id, carpeta) {
  const { rows } = await consulta('SELECT archivo, mime FROM caja_icr_adjunto WHERE id = $1', [Number(id) || 0]);
  if (!rows[0] || !/^[0-9a-f]{24}\.(jpg|png|webp)$/.test(rows[0].archivo)) throw falla(404, 'No existe esa foto.');
  return { bytes: readFileSync(join(carpeta, rows[0].archivo)), mime: rows[0].mime };
}

// ---------------------------------------------------------------------------------------------
// Fondos desde el ERP (los usa contabilidad.enviarFondos dentro de su transacción)
// ---------------------------------------------------------------------------------------------

export async function recibirFondo(c, { id, fecha, medio, monto, descripcion, cuentaMovimientoId, u }) {
  await c.query(
    `INSERT INTO caja_icr_mov (id, fecha, tipo, medio, origen, categoria, descripcion, persona, monto, cuenta_movimiento_id, creado_por_id, creado_por, actualizado_por)
     VALUES ($1::uuid, $2, 'INGRESO', $3, 'FONDO', 'Fondos de la cuenta principal', $4, $5, $6, $7, $8, $5, $5)`,
    [id, fecha, medio === 'EFECTIVO' ? 'EFECTIVO' : 'DIGITAL', descripcion, u.nombre, monto, cuentaMovimientoId, u.id],
  );
  return obtener(c, id);
}
