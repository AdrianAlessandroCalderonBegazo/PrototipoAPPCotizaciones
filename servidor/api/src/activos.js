// Activos y control (Fase 9): sistemas instalados (cliente / sitio), sus equipos con número de serie y garantía,
// y la dirección de la instalación en el portal Victron VRM (que el ERP muestra embebido; no se usa la API de VRM).
import { consulta } from './db.js';
import { falla } from './errores.js';

const t = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  return s === '' ? null : s;
};
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const fechaONulo = (v, nombre) => {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(String(v)))) throw falla(400, `${nombre} no es una fecha válida.`);
  return String(v);
};
export const TIPOS_EQUIPO = ['inversor', 'bateria', 'panel', 'controlador', 'monitoreo', 'otro'];
export const DIAS_AVISO_GARANTIA = 60;

/** Solo direcciones del portal oficial de VRM (es lo único que el ERP muestra embebido). */
export function vrmUrl(v) {
  const s = t(v, 500);
  if (!s) return null;
  if (!/^https:\/\/vrm\.victronenergy\.com\/[^\s"'<>]*$/.test(s)) throw falla(400, 'La dirección de VRM debe empezar con https://vrm.victronenergy.com/ (cópiala del navegador al abrir la instalación).');
  return s;
}

const COLS = `a.id, a.nombre, a.cliente, a.proyecto_id, p.nombre AS proyecto, a.ubicacion, a.fecha_instalacion::text AS fecha_instalacion, a.vrm_url, a.notas, a.activo,
  a.actualizado_en::text AS actualizado_en`;

async function equiposDe(ids) {
  if (!ids.length) return new Map();
  const { rows } = await consulta(
    `SELECT id, activo_id, tipo, marca, modelo, serie, cantidad, garantia_hasta::text AS garantia_hasta, notas FROM activo_equipos WHERE activo_id = ANY($1::int[]) ORDER BY activo_id, tipo, id`,
    [ids],
  );
  const m = new Map();
  for (const e of rows) m.set(e.activo_id, [...(m.get(e.activo_id) ?? []), e]);
  return m;
}

/** Estado de garantía de un equipo: vigente, por vencer (≤ 60 días), vencida o Sin dato. */
export function estadoGarantia(hasta, hoy = hoyLima()) {
  if (!hasta) return null;
  if (hasta < hoy) return 'vencida';
  const dias = Math.round((Date.parse(hasta) - Date.parse(hoy)) / 864e5);
  return dias <= DIAS_AVISO_GARANTIA ? 'por_vencer' : 'vigente';
}

export async function listarActivos({ q, inactivos } = {}) {
  const { rows } = await consulta(`SELECT ${COLS} FROM activos a LEFT JOIN proyectos p ON p.id = a.proyecto_id ${inactivos === '1' ? '' : 'WHERE a.activo'} ORDER BY a.activo DESC, a.nombre`);
  const eq = await equiposDe(rows.map((r) => r.id));
  const hoy = hoyLima();
  const nq = String(q ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const lista = rows.map((a) => {
    const equipos = (eq.get(a.id) ?? []).map((e) => ({ ...e, garantia: estadoGarantia(e.garantia_hasta, hoy) }));
    return { ...a, equipos, por_vencer: equipos.filter((e) => e.garantia === 'por_vencer').length, vencidas: equipos.filter((e) => e.garantia === 'vencida').length };
  }).filter((a) => !nq || [a.nombre, a.cliente, a.ubicacion, a.proyecto, ...a.equipos.flatMap((e) => [e.marca, e.modelo, e.serie])]
    .filter(Boolean).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(nq));
  return {
    activos: lista,
    resumen: {
      sistemas: rows.filter((a) => a.activo).length,
      con_vrm: rows.filter((a) => a.activo && a.vrm_url).length,
      equipos: lista.reduce((n, a) => n + a.equipos.reduce((k, e) => k + e.cantidad, 0), 0),
      por_vencer: lista.reduce((n, a) => n + a.por_vencer, 0),
    },
    dias_aviso: DIAS_AVISO_GARANTIA,
  };
}

export async function activo(id) {
  const { rows } = await consulta(`SELECT ${COLS} FROM activos a LEFT JOIN proyectos p ON p.id = a.proyecto_id WHERE a.id = $1`, [id]);
  if (!rows[0]) throw falla(404, 'No existe ese sistema.');
  const equipos = ((await equiposDe([id])).get(id) ?? []).map((e) => ({ ...e, garantia: estadoGarantia(e.garantia_hasta) }));
  return { ...rows[0], equipos };
}

async function datosActivo(b, parcial) {
  const d = {};
  if (!parcial || b?.nombre !== undefined) {
    d.nombre = t(b?.nombre, 160);
    if (!d.nombre) throw falla(400, 'Escribe el nombre del sistema o sitio (por ejemplo «Hostal Los Tambos»).');
  }
  for (const [k, max] of [['cliente', 200], ['ubicacion', 200], ['notas', 1000]]) if (b?.[k] !== undefined) d[k] = t(b[k], max);
  const f = fechaONulo(b?.fecha_instalacion, 'La fecha de instalación');
  if (f !== undefined) {
    if (f && f > hoyLima()) throw falla(400, 'La fecha de instalación no puede ser futura.');
    d.fecha_instalacion = f;
  }
  if (b?.vrm_url !== undefined) d.vrm_url = vrmUrl(b.vrm_url);
  if (b?.proyecto_id !== undefined) {
    if (b.proyecto_id === null || b.proyecto_id === '') d.proyecto_id = null;
    else {
      const n = Number(b.proyecto_id);
      const { rows } = await consulta('SELECT 1 FROM proyectos WHERE id = $1', [Number.isInteger(n) ? n : 0]);
      if (!rows[0]) throw falla(400, 'Ese proyecto no existe.');
      d.proyecto_id = n;
    }
  }
  return d;
}

export async function crearActivo(b) {
  const d = await datosActivo(b, false);
  const cols = Object.keys(d);
  const { rows } = await consulta(`INSERT INTO activos (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((k) => d[k]));
  return activo(rows[0].id);
}

export async function editarActivo(id, b) {
  const antes = await activo(id);
  const d = await datosActivo(b, true);
  if (b?.activo !== undefined) d.activo = b.activo === true;
  const cols = Object.keys(d);
  if (cols.length) await consulta(`UPDATE activos SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1`, [id, ...cols.map((k) => d[k])]);
  return { antes, despues: await activo(id) };
}

function datosEquipo(b) {
  const tipo = TIPOS_EQUIPO.includes(b?.tipo) ? b.tipo : null;
  if (!tipo) throw falla(400, 'Elige el tipo de equipo.');
  const cantidad = b?.cantidad === undefined || b?.cantidad === '' ? 1 : Number(b.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10000) throw falla(400, 'La cantidad debe ser un número entero mayor a 0.');
  const d = { tipo, marca: t(b?.marca, 80), modelo: t(b?.modelo, 160), serie: t(b?.serie, 120), cantidad, garantia_hasta: fechaONulo(b?.garantia_hasta, 'La garantía') ?? null, notas: t(b?.notas, 500) };
  if (!d.marca && !d.modelo) throw falla(400, 'Escribe al menos la marca o el modelo del equipo.');
  return d;
}

export async function agregarEquipo(activoId, b) {
  await activo(activoId);
  const d = datosEquipo(b);
  const { rows } = await consulta(
    'INSERT INTO activo_equipos (activo_id, tipo, marca, modelo, serie, cantidad, garantia_hasta, notas) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [activoId, d.tipo, d.marca, d.modelo, d.serie, d.cantidad, d.garantia_hasta, d.notas],
  );
  await consulta("UPDATE activos SET actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1", [activoId]);
  return { id: rows[0].id, activo_id: activoId, ...d };
}

async function equipo(id) {
  const { rows } = await consulta('SELECT id, activo_id, tipo, marca, modelo, serie, cantidad, garantia_hasta::text AS garantia_hasta, notas FROM activo_equipos WHERE id = $1', [id]);
  if (!rows[0]) throw falla(404, 'No existe ese equipo.');
  return rows[0];
}

export async function editarEquipo(id, b) {
  const antes = await equipo(id);
  const d = datosEquipo({ ...antes, ...b });
  await consulta('UPDATE activo_equipos SET tipo = $2, marca = $3, modelo = $4, serie = $5, cantidad = $6, garantia_hasta = $7, notas = $8 WHERE id = $1', [id, d.tipo, d.marca, d.modelo, d.serie, d.cantidad, d.garantia_hasta, d.notas]);
  return { antes, despues: await equipo(id) };
}

export async function quitarEquipo(id) {
  const antes = await equipo(id);
  await consulta('DELETE FROM activo_equipos WHERE id = $1', [id]);
  return antes;
}

/** Para Inicio: equipos de sistemas activos cuya garantía vence en los próximos 60 días. */
export async function garantiasPorVencer() {
  const { rows } = await consulta(
    `SELECT e.id, a.id AS activo_id, a.nombre AS sistema, e.marca, e.modelo, e.garantia_hasta::text AS garantia_hasta
       FROM activo_equipos e JOIN activos a ON a.id = e.activo_id
      WHERE a.activo AND e.garantia_hasta BETWEEN (now() AT TIME ZONE 'America/Lima')::date AND (now() AT TIME ZONE 'America/Lima')::date + $1::int
      ORDER BY e.garantia_hasta`,
    [DIAS_AVISO_GARANTIA],
  );
  return rows;
}
