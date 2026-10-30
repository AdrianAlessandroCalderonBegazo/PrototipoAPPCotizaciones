// Comparador de proveedores (Fase 8): proveedores, listas de precios (Excel, CSV o PDF leídos en el navegador), historial de precios
// solo-agregar, reconocimiento del mismo producto entre proveedores y búsqueda con la mejor opción.
// Nunca se inventan datos: lo que la lista no trae queda «Sin dato» (null) y no se completa solo.
import { leerParametros } from './configuracion.js';
import { consulta, enTransaccion } from './db.js';
import { aCentimos, deCentimos } from './dinero.js';
import { falla } from './errores.js';
import { embeber, iaConfigurada } from './ia/ollama.js';
import { leerConfigIa } from './ia/config.js';
import { rucValido } from './validaciones.js';

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const t = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  return s === '' ? null : s;
};
export const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------------------------------------------------------------------------------------------
// Precios escritos de mil formas: «$1,616.00», «S/ 1.234,50», «63.000», «1400»
// ---------------------------------------------------------------------------------------------

/** → { valor: '1616.00', moneda: 'USD'|'PEN'|null, aviso } o null si no es un precio. */
export function leerPrecio(entrada) {
  if (entrada === null || entrada === undefined) return null;
  if (typeof entrada === 'number') return Number.isFinite(entrada) && entrada > 0 ? { valor: (Math.round(entrada * 100) / 100).toFixed(2), moneda: null, aviso: null } : null;
  let s = String(entrada).trim();
  if (!s) return null;
  let moneda = null;
  if (/US\$|USD|\$|d[oó]lar/i.test(s)) moneda = 'USD';
  if (/S\/|PEN|soles?\b/i.test(s)) moneda = 'PEN';
  s = s.replace(/US\$|USD|S\/\.?|PEN|soles?|\$|d[oó]lares?/gi, '').replace(/\s/g, '');
  let aviso = null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ''); // 1,616.00
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,50
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.'); // 1234,5
  else if (/^\d+\.\d{3}$/.test(s)) aviso = `«${String(entrada).trim()}» se leyó como ${Number(s).toFixed(2)}: revisa que no sean miles.`;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!(n > 0) || n >= 1e11) return null;
  return { valor: (Math.round(n * 100) / 100).toFixed(2), moneda, aviso };
}

// ---------------------------------------------------------------------------------------------
// ¿Es el mismo producto? Firma = palabras importantes; los números (48/3000/35-32, 230v, 550w) deben coincidir.
// ---------------------------------------------------------------------------------------------

const GENERICAS = new Set(['de', 'del', 'la', 'el', 'y', 'con', 'para', 'por', 'en', 'tipo', 'inversor', 'inversores', 'cargador', 'cargadores', 'inversor-cargador', 'controlador',
  'controladores', 'carga', 'bateria', 'baterias', 'panel', 'paneles', 'solar', 'solares', 'modulo', 'equipo', 'convertidor', 'cable', 'unidad', 'und', 'retail', 'nuevo', 'original', 'hibrido', 'red']);
function tokens(texto, quitar = []) {
  const fuera = new Set(quitar.filter(Boolean).map((x) => normal(x).replace(/[^a-z0-9]/g, '')));
  return normal(texto)
    .replace(/[(),;:|"'+*]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-./]+|[-./]+$/g, ''))
    .filter((w) => w.length >= 2 && !fuera.has(w.replace(/[^a-z0-9]/g, '')));
}
const numerico = (w) => /\d/.test(w);
const igualaNumero = (w) => w.replace(/[-/]/g, '/').replace(/,/g, '.');

/** Firma del producto: tokens numéricos normalizados + palabras de modelo (sin genéricas). Se guarda para comparar rápido. */
export function firmaDe({ descripcion, marca, modelo, codigo }) {
  const ws = tokens(`${modelo ?? ''} ${descripcion ?? ''}`, [codigo, marca]);
  const marcaW = new Set(tokens(marca ?? ''));
  const nums = [...new Set(ws.filter(numerico).map(igualaNumero))].sort();
  const palabras = [...new Set(ws.filter((w) => !numerico(w) && !GENERICAS.has(w) && !marcaW.has(w) && w.length >= 2))].sort();
  return `${nums.join(' ')}|${palabras.join(' ')}`;
}
const partes = (f) => {
  const [n = '', p = ''] = String(f ?? '').split('|');
  return { n: new Set(n.split(' ').filter(Boolean)), p: new Set(p.split(' ').filter(Boolean)) };
};
const iguales = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const marcaCompatible = (a, b) => !a || !b || normal(a).split(/\s+/)[0] === normal(b).split(/\s+/)[0];

/** 'exacta' | 'alternativa' | null entre dos productos de proveedor. */
export function compararProductos(a, b) {
  if (a.codigo && b.codigo && normal(a.codigo).replace(/[^a-z0-9]/g, '') === normal(b.codigo).replace(/[^a-z0-9]/g, '')) return 'exacta';
  if (!marcaCompatible(a.marca, b.marca)) return null;
  const A = partes(a.firma ?? firmaDe(a));
  const B = partes(b.firma ?? firmaDe(b));
  // Palabras que distinguen variantes (gx, smart, pro…): si una tiene alguna que la otra no, no es «exacta».
  const sobran = [...A.p].filter((w) => !B.p.has(w)).length + [...B.p].filter((w) => !A.p.has(w)).length;
  const comunesP = [...A.p].filter((w) => B.p.has(w)).length;
  if (A.n.size && iguales(A.n, B.n) && comunesP >= 1 && sobran === 0) return 'exacta';
  const comunesN = [...A.n].filter((w) => B.n.has(w)).length;
  const union = new Set([...A.n, ...B.n, ...A.p, ...B.p]).size || 1;
  if (comunesN >= 1 && (comunesN + comunesP) / union >= 0.4) return 'alternativa';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Proveedores y fuentes
// ---------------------------------------------------------------------------------------------

function datosProveedor(b, parcial) {
  const d = {};
  if (!parcial || b?.nombre !== undefined) {
    d.nombre = t(b?.nombre, 160);
    if (!d.nombre) throw falla(400, 'Escribe el nombre del proveedor.');
  }
  if (b?.ruc !== undefined) {
    d.ruc = t(b.ruc, 11);
    if (d.ruc && !rucValido(d.ruc)) throw falla(400, 'El RUC no es válido (11 dígitos con su dígito verificador).');
  }
  for (const [k, max] of [['contacto', 200], ['telefono', 40], ['correo', 160], ['web', 300], ['notas', 1000]]) if (b?.[k] !== undefined) d[k] = t(b[k], max);
  if (b?.moneda !== undefined) d.moneda = ['PEN', 'USD'].includes(b.moneda) ? b.moneda : null;
  if (b?.costo_envio !== undefined) {
    if (b.costo_envio === null || b.costo_envio === '') d.costo_envio = null;
    else {
      const p = leerPrecio(b.costo_envio);
      if (!p && String(b.costo_envio).trim() !== '0') throw falla(400, 'El costo de envío debe ser un monto (0 si está incluido).');
      d.costo_envio = p ? p.valor : '0.00';
    }
  }
  return d;
}

export async function listarProveedores() {
  const { rows } = await consulta(
    `SELECT p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.correo, p.web, p.moneda, p.costo_envio::text AS costo_envio, p.notas, p.activo,
            (SELECT count(*)::int FROM proveedor_productos x WHERE x.proveedor_id = p.id) AS productos,
            (SELECT max(c.creado_en)::text FROM proveedor_cargas c WHERE c.proveedor_id = p.id) AS ultima_carga,
            (SELECT max(c.fecha_lista)::text FROM proveedor_cargas c WHERE c.proveedor_id = p.id) AS ultima_fecha_lista,
            COALESCE((SELECT json_agg(json_build_object('id', f.id, 'tipo', f.tipo, 'url', f.url, 'adaptador', f.adaptador, 'frecuencia_dias', f.frecuencia_dias, 'activa', f.activa,
                     'config', CASE WHEN f.tipo = 'web' THEN f.config END, 'ultima_ejecucion', f.ultima_ejecucion, 'ultimo_estado', f.ultimo_estado, 'ultimo_mensaje', f.ultimo_mensaje, 'ultimos_leidos', f.ultimos_leidos) ORDER BY f.id)
                       FROM proveedor_fuentes f WHERE f.proveedor_id = p.id), '[]'::json) AS fuentes
       FROM proveedores p ORDER BY p.activo DESC, p.nombre`,
  );
  return rows;
}

export async function crearProveedor(b) {
  const d = datosProveedor(b, false);
  const cols = Object.keys(d);
  const { rows } = await consulta(`INSERT INTO proveedores (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((k) => d[k]));
  return (await listarProveedores()).find((p) => p.id === rows[0].id);
}

export async function editarProveedor(id, b) {
  const antes = (await listarProveedores()).find((p) => p.id === id);
  if (!antes) throw falla(404, 'No existe ese proveedor.');
  const d = datosProveedor(b, true);
  if (b?.activo !== undefined) d.activo = b.activo === true;
  const cols = Object.keys(d);
  if (cols.length) await consulta(`UPDATE proveedores SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1`, [id, ...cols.map((k) => d[k])]);
  return { antes, despues: (await listarProveedores()).find((p) => p.id === id) };
}

const URL_OK = /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/[^\s]*)?$/i;
/** Solo páginas públicas: nunca direcciones internas del servidor (salvo en pruebas, con COMPARADOR_PERMITIR_LOCAL=1). */
export function urlPermitida(url) {
  if (process.env.COMPARADOR_PERMITIR_LOCAL === '1' && /^http:\/\/127\.0\.0\.1:\d+(\/\S*)?$/.test(url)) return true;
  return URL_OK.test(url) && !/^https?:\/\/(localhost|[^/]*\.(local|internal))(:|\/|$)/i.test(url);
}
export async function guardarFuenteWeb(proveedorId, b, fuenteId = null) {
  const url = t(b?.url, 500);
  if (!url || !urlPermitida(url)) throw falla(400, 'Escribe la dirección completa de la tienda, por ejemplo https://www.tienda.pe');
  const adaptador = ['auto', 'woocommerce', 'shopify', 'jsonld'].includes(b?.adaptador) ? b.adaptador : 'auto';
  const frec = Number(b?.frecuencia_dias ?? 7);
  if (!Number.isInteger(frec) || frec < 1 || frec > 90) throw falla(400, 'La frecuencia debe ser de 1 a 90 días.');
  const moneda = ['PEN', 'USD'].includes(b?.moneda) ? b.moneda : 'PEN';
  const incluye = b?.incluye_igv !== false;
  const config = { moneda, incluye_igv: incluye };
  if (fuenteId) {
    await consulta('UPDATE proveedor_fuentes SET url = $2, adaptador = $3, frecuencia_dias = $4, activa = $5, config = $6 WHERE id = $1 AND tipo = $7', [fuenteId, url, adaptador, frec, b?.activa !== false, JSON.stringify(config), 'web']);
    return fuenteId;
  }
  const { rows } = await consulta("INSERT INTO proveedor_fuentes (proveedor_id, tipo, url, adaptador, frecuencia_dias, config) VALUES ($1, 'web', $2, $3, $4, $5) RETURNING id", [proveedorId, url, adaptador, frec, JSON.stringify(config)]);
  return rows[0].id;
}

/** Cómo se leyó la última lista de este proveedor (para no volver a mapear las columnas). */
export async function mapeoArchivo(proveedorId) {
  const { rows } = await consulta("SELECT config FROM proveedor_fuentes WHERE proveedor_id = $1 AND tipo = 'archivo'", [proveedorId]);
  return rows[0]?.config ?? null;
}

// ---------------------------------------------------------------------------------------------
// Cargar una lista (vista previa → confirmar). El navegador manda las filas ya leídas y mapeadas.
// ---------------------------------------------------------------------------------------------

export const CAMPOS_LISTA = ['codigo', 'descripcion', 'marca', 'modelo', 'categoria', 'unidad', 'precio', 'moneda', 'disponibilidad', 'caracteristicas'];
const claveDe = (r) => (r.codigo ? `c:${normal(r.codigo).replace(/[^a-z0-9]/g, '')}` : `d:${normal(r.marca ?? '')}|${firmaDe(r)}`).slice(0, 300);

async function ultimosPrecios(c, ids) {
  if (!ids.length) return new Map();
  const { rows } = await c.query(
    `SELECT DISTINCT ON (producto_id) producto_id, precio::text AS precio, moneda, incluye_igv FROM proveedor_precios WHERE producto_id = ANY($1::int[]) ORDER BY producto_id, fecha_lista DESC, id DESC`,
    [ids],
  );
  return new Map(rows.map((r) => [r.producto_id, r]));
}

export async function importarLista(b, u) {
  const proveedorId = Number(b?.proveedor_id);
  const { rows: pv } = await consulta('SELECT id, nombre, moneda, activo FROM proveedores WHERE id = $1', [proveedorId]);
  if (!pv[0]) throw falla(400, 'Elige el proveedor.');
  const fecha = String(b?.fecha_lista ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyLima()) throw falla(400, 'Escribe la fecha de la lista (no puede ser futura).');
  const monedaLista = ['PEN', 'USD'].includes(b?.moneda) ? b.moneda : pv[0].moneda;
  const incluyeIgv = typeof b?.incluye_igv === 'boolean' ? b.incluye_igv : null;
  if (incluyeIgv === null) throw falla(400, 'Indica si los precios de la lista incluyen IGV.');
  const filas = Array.isArray(b?.filas) ? b.filas : [];
  if (!filas.length) throw falla(400, 'La lista no tiene filas.');
  if (filas.length > 20000) throw falla(400, 'La lista tiene demasiadas filas (máximo 20 000).');
  const duplicados = b?.duplicados === 'omitir' ? 'omitir' : 'ultimo';
  const archivo = t(b?.archivo, 200) ?? 'lista';

  // 1) Validar cada fila
  const salida = [];
  const sinDato = Object.fromEntries(['codigo', 'marca', 'modelo', 'unidad', 'disponibilidad'].map((k) => [k, 0]));
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i] ?? {};
    const n = Number(f.fila) || i + 1;
    const r = {
      fila: n, codigo: t(f.codigo, 80), descripcion: t(f.descripcion, 500), marca: t(f.marca, 80), modelo: t(f.modelo, 160), categoria: t(f.categoria, 160),
      unidad: t(f.unidad, 40), disponibilidad: t(f.disponibilidad, 120), caracteristicas: t(f.caracteristicas, 1000),
    };
    if (!r.descripcion) {
      salida.push({ ...r, estado: 'error', mensaje: 'Sin descripción del producto.' });
      continue;
    }
    const p = leerPrecio(f.precio);
    if (!p) {
      salida.push({ ...r, estado: 'error', mensaje: f.precio === null || f.precio === undefined || String(f.precio).trim() === '' ? 'Sin precio.' : `Precio no válido: «${String(f.precio).slice(0, 30)}».` });
      continue;
    }
    const moneda = (['PEN', 'USD'].includes(f.moneda) ? f.moneda : /US|\$|USD|d[oó]lar/i.test(String(f.moneda ?? '')) ? 'USD' : /S\/|PEN|sol/i.test(String(f.moneda ?? '')) ? 'PEN' : null) ?? p.moneda ?? monedaLista;
    if (!moneda) {
      salida.push({ ...r, estado: 'error', mensaje: 'No se sabe la moneda: elígela para la lista.' });
      continue;
    }
    for (const k of Object.keys(sinDato)) if (!r[k]) sinDato[k]++;
    r.firma = firmaDe(r);
    salida.push({ ...r, clave: claveDe(r), precio: p.valor, moneda, aviso: p.aviso, estado: 'ok' });
  }
  // 2) Duplicados dentro del archivo (mismo código o mismo producto)
  const grupos = new Map();
  for (const r of salida) if (r.estado === 'ok') grupos.set(r.clave, [...(grupos.get(r.clave) ?? []), r]);
  const listaDup = [];
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    listaDup.push({ descripcion: g[0].descripcion, filas: g.map((x) => x.fila), precios: g.map((x) => x.precio) });
    const quedan = duplicados === 'omitir' ? [] : [g[g.length - 1]];
    for (const x of g) if (!quedan.includes(x)) Object.assign(x, { estado: 'duplicado', mensaje: duplicados === 'omitir' ? 'Duplicado: se omite.' : `Repetido: se usa la fila ${g[g.length - 1].fila}.` });
  }
  // 3) Comparar con lo que ya hay
  return enTransaccion(async (c) => {
    const validas = salida.filter((r) => r.estado === 'ok');
    const { rows: ya } = await c.query('SELECT id, clave FROM proveedor_productos WHERE proveedor_id = $1 AND clave = ANY($2::text[])', [proveedorId, validas.map((r) => r.clave)]);
    const idDe = new Map(ya.map((x) => [x.clave, x.id]));
    const ult = await ultimosPrecios(c, ya.map((x) => x.id));
    for (const r of validas) {
      const id = idDe.get(r.clave);
      const prev = id ? ult.get(id) : null;
      r.precio_anterior = prev ? `${prev.moneda === 'USD' ? 'US$' : 'S/'} ${prev.precio}` : null;
      r.estado = !id ? 'nuevo' : !prev || prev.precio !== r.precio || prev.moneda !== r.moneda || prev.incluye_igv !== incluyeIgv ? 'cambio' : 'igual';
    }
    const cuenta = (e) => salida.filter((r) => r.estado === e).length;
    const resumen = { filas: salida.length, nuevos: cuenta('nuevo'), cambiaron: cuenta('cambio'), sin_cambios: cuenta('igual'), errores: cuenta('error'), duplicados: cuenta('duplicado'), sin_dato: sinDato };
    const vista = salida.slice(0, 2000).map(({ firma: _f, clave: _c, ...r }) => r);
    if (b?.confirmar !== true) return { confirmado: false, resumen, filas: vista, duplicados: listaDup };

    // 4) Confirmar: carga + productos (sin borrar datos que ya había) + precios (siempre se agregan)
    const tc = (await leerParametros()).tipo_cambio?.valor ?? null;
    const { rows: fu } = await c.query(
      `INSERT INTO proveedor_fuentes (proveedor_id, tipo, config, ultima_ejecucion, ultimo_estado, ultimos_leidos) VALUES ($1, 'archivo', $2, now() AT TIME ZONE 'America/Lima', 'ok', $3)
       ON CONFLICT (proveedor_id) WHERE tipo = 'archivo' DO UPDATE SET config = EXCLUDED.config, ultima_ejecucion = EXCLUDED.ultima_ejecucion, ultimo_estado = 'ok', ultimos_leidos = EXCLUDED.ultimos_leidos
       RETURNING id`,
      [proveedorId, JSON.stringify({ ...(b?.mapeo && typeof b.mapeo === 'object' ? { mapeo: b.mapeo } : {}), moneda: monedaLista, incluye_igv: incluyeIgv }), validas.length],
    );
    const { rows: ca } = await c.query(
      `INSERT INTO proveedor_cargas (proveedor_id, fuente_id, tipo, origen, fecha_lista, filas, nuevos, cambiaron, sin_cambios, errores, detalle, creado_por)
       VALUES ($1, $2, 'archivo', $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [proveedorId, fu[0].id, archivo, fecha, resumen.filas, resumen.nuevos, resumen.cambiaron, resumen.sin_cambios, resumen.errores, JSON.stringify({ duplicados: listaDup.length, sin_dato: sinDato }), u.nombre],
    );
    for (const r of validas) {
      const { rows: pr } = await c.query(
        `INSERT INTO proveedor_productos (proveedor_id, clave, codigo, descripcion, marca, modelo, categoria, unidad, caracteristicas, disponibilidad, firma)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (proveedor_id, clave) DO UPDATE SET descripcion = EXCLUDED.descripcion, codigo = COALESCE(EXCLUDED.codigo, proveedor_productos.codigo),
           marca = COALESCE(EXCLUDED.marca, proveedor_productos.marca), modelo = COALESCE(EXCLUDED.modelo, proveedor_productos.modelo),
           categoria = COALESCE(EXCLUDED.categoria, proveedor_productos.categoria), unidad = COALESCE(EXCLUDED.unidad, proveedor_productos.unidad),
           caracteristicas = COALESCE(EXCLUDED.caracteristicas, proveedor_productos.caracteristicas), disponibilidad = EXCLUDED.disponibilidad, firma = EXCLUDED.firma,
           actualizado_en = now() AT TIME ZONE 'America/Lima'
         RETURNING id`,
        [proveedorId, r.clave, r.codigo, r.descripcion, r.marca, r.modelo, r.categoria, r.unidad, r.caracteristicas, r.disponibilidad, r.firma],
      );
      await c.query(
        `INSERT INTO proveedor_precios (producto_id, carga_id, precio, moneda, incluye_igv, origen, origen_detalle, fecha_lista, tc_usado) VALUES ($1, $2, $3, $4, $5, 'archivo', $6, $7, $8)`,
        [pr[0].id, ca[0].id, r.precio, r.moneda, incluyeIgv, `${archivo} · fila ${r.fila}`, fecha, tc],
      );
    }
    return { confirmado: true, carga_id: ca[0].id, resumen, filas: vista, duplicados: listaDup };
  });
}

/** Guarda lo leído de una página web (lo usa comparador_web.js). Misma lógica que una lista: productos + precios nuevos. */
export async function guardarLecturaWeb(fuente, productos, { url, u = null } = {}) {
  const tc = (await leerParametros()).tipo_cambio?.valor ?? null;
  const fecha = hoyLima();
  return enTransaccion(async (c) => {
    const { rows: ca } = await c.query(
      `INSERT INTO proveedor_cargas (proveedor_id, fuente_id, tipo, origen, fecha_lista, filas, creado_por) VALUES ($1, $2, 'web', $3, $4, $5, $6) RETURNING id`,
      [fuente.proveedor_id, fuente.id, url, fecha, productos.length, u?.nombre ?? 'Lectura automática'],
    );
    let nuevos = 0;
    let cambiaron = 0;
    for (const p of productos) {
      const r = { codigo: t(p.codigo, 80), descripcion: t(p.descripcion, 500), marca: t(p.marca, 80), modelo: t(p.modelo, 160), categoria: t(p.categoria, 160), disponibilidad: t(p.disponibilidad, 120), url: t(p.url, 500) };
      const precio = leerPrecio(p.precio);
      if (!r.descripcion || !precio) continue;
      r.firma = firmaDe(r);
      const clave = claveDe(r);
      const { rows: ex } = await c.query('SELECT id FROM proveedor_productos WHERE proveedor_id = $1 AND clave = $2', [fuente.proveedor_id, clave]);
      const prev = ex[0] ? (await ultimosPrecios(c, [ex[0].id])).get(ex[0].id) : null;
      const { rows: pr } = await c.query(
        `INSERT INTO proveedor_productos (proveedor_id, clave, codigo, descripcion, marca, modelo, categoria, disponibilidad, url, firma) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (proveedor_id, clave) DO UPDATE SET descripcion = EXCLUDED.descripcion, codigo = COALESCE(EXCLUDED.codigo, proveedor_productos.codigo), marca = COALESCE(EXCLUDED.marca, proveedor_productos.marca),
           categoria = COALESCE(EXCLUDED.categoria, proveedor_productos.categoria), disponibilidad = EXCLUDED.disponibilidad, url = EXCLUDED.url, firma = EXCLUDED.firma, actualizado_en = now() AT TIME ZONE 'America/Lima'
         RETURNING id`,
        [fuente.proveedor_id, clave, r.codigo, r.descripcion, r.marca, r.modelo, r.categoria, r.disponibilidad, r.url, r.firma],
      );
      const moneda = p.moneda === 'USD' || p.moneda === 'PEN' ? p.moneda : fuente.config?.moneda ?? 'PEN';
      const incluye = fuente.config?.incluye_igv !== false;
      if (!ex[0]) nuevos++;
      else if (!prev || prev.precio !== precio.valor || prev.moneda !== moneda) cambiaron++;
      await c.query(
        `INSERT INTO proveedor_precios (producto_id, carga_id, precio, moneda, incluye_igv, origen, origen_detalle, fecha_lista, tc_usado) VALUES ($1, $2, $3, $4, $5, 'web', $6, $7, $8)`,
        [pr[0].id, ca[0].id, precio.valor, moneda, incluye, r.url ?? url, fecha, tc],
      );
    }
    await c.query('UPDATE proveedor_cargas SET nuevos = $2, cambiaron = $3, sin_cambios = $4 WHERE id = $1', [ca[0].id, nuevos, cambiaron, productos.length - nuevos - cambiaron]);
    return { carga_id: ca[0].id, leidos: productos.length, nuevos, cambiaron };
  });
}

// ---------------------------------------------------------------------------------------------
// Precio comparable: en soles, con IGV, más costos adicionales conocidos
// ---------------------------------------------------------------------------------------------

const tc4 = (tc) => {
  if (!tc) return null;
  const [e, d = ''] = String(tc).split('.');
  return BigInt(e) * 10000n + BigInt(d.padEnd(4, '0').slice(0, 4));
};
const div = (a, b) => (a * 2n + b) / (b * 2n);
const txt = (c) => deCentimos(Number(c));

/** { con_igv (moneda original), soles (con IGV) | null si falta TC, total | null } en texto. */
export function precioComparable({ precio, moneda, incluye_igv: incluye }, tc, costoEnvio) {
  let c = BigInt(aCentimos(precio));
  if (!incluye) c = div(c * 118n, 100n);
  const conIgv = txt(c);
  let soles = c;
  if (moneda === 'USD') {
    const k = tc4(tc);
    if (!k) return { con_igv: conIgv, soles: null, total: null };
    soles = div(c * k, 10000n);
  }
  const extra = costoEnvio === null || costoEnvio === undefined ? null : BigInt(aCentimos(costoEnvio));
  return { con_igv: conIgv, soles: txt(soles), total: txt(soles + (extra ?? 0n)), extra_conocido: extra !== null };
}

// ---------------------------------------------------------------------------------------------
// Índice por significado (opcional, con Ollama): tipo «proveedor» en ia_embeddings
// ---------------------------------------------------------------------------------------------

let vectores = null;
export const olvidarVectores = () => void (vectores = null);
async function cargarVectores() {
  if (vectores) return vectores;
  const { modelo_embeddings: m } = await leerConfigIa();
  const { rows } = await consulta("SELECT ref_id, vector FROM ia_embeddings WHERE tipo = 'proveedor' AND modelo = $1", [m]);
  vectores = new Map(rows.map((r) => [r.ref_id, Float32Array.from(r.vector)]));
  return vectores;
}
export async function reindexarProveedores() {
  if (!iaConfigurada()) return { indexados: 0, disponible: false };
  const { modelo_embeddings: m } = await leerConfigIa();
  const { rows } = await consulta(
    `SELECT p.id, concat_ws(' | ', p.descripcion, p.marca, p.modelo, p.categoria) AS texto FROM proveedor_productos p
      WHERE NOT EXISTS (SELECT 1 FROM ia_embeddings e WHERE e.tipo = 'proveedor' AND e.ref_id = p.id AND e.modelo = $1 AND e.huella = md5(concat_ws(' | ', p.descripcion, p.marca, p.modelo, p.categoria)))`,
    [m],
  );
  for (let i = 0; i < rows.length; i += 32) {
    const lote = rows.slice(i, i + 32);
    const vs = await embeber(lote.map((r) => r.texto));
    for (let k = 0; k < lote.length; k++) {
      if (!Array.isArray(vs[k])) continue;
      await consulta(
        `INSERT INTO ia_embeddings (tipo, ref_id, modelo, huella, vector) VALUES ('proveedor', $1, $2, md5($3), $4)
         ON CONFLICT (tipo, ref_id, modelo) DO UPDATE SET huella = EXCLUDED.huella, vector = EXCLUDED.vector, actualizado_en = now() AT TIME ZONE 'America/Lima'`,
        [lote[k].id, m, lote[k].texto, vs[k]],
      );
    }
  }
  vectores = null;
  return { indexados: (await cargarVectores()).size, nuevos: rows.length, disponible: true };
}
let relojIndice = null;
export function programarIndiceProveedores(ms = 20_000) {
  vectores = null;
  if (!iaConfigurada()) return;
  clearTimeout(relojIndice);
  relojIndice = setTimeout(() => reindexarProveedores().catch(() => null), ms);
  relojIndice.unref?.();
}

// ---------------------------------------------------------------------------------------------
// Búsqueda y comparación
// ---------------------------------------------------------------------------------------------

const COLS_PROD = `p.id, p.proveedor_id, v.nombre AS proveedor, v.costo_envio::text AS costo_envio, p.codigo, p.descripcion, p.marca, p.modelo, p.categoria, p.unidad,
  p.caracteristicas, p.disponibilidad, p.url, p.firma, u.precio::text AS precio, u.moneda, u.incluye_igv, u.origen, u.origen_detalle, u.fecha_lista::text AS fecha_lista,
  u.obtenido_en::text AS obtenido_en, u.tc_usado::text AS tc_usado`;
const ULTIMO = `JOIN LATERAL (SELECT * FROM proveedor_precios x WHERE x.producto_id = p.id ORDER BY x.fecha_lista DESC, x.id DESC LIMIT 1) u ON TRUE`;

async function decisiones(ids) {
  if (!ids.length) return new Map();
  const { rows } = await consulta('SELECT a_id, b_id, estado FROM proveedor_equivalencias WHERE a_id = ANY($1::int[]) OR b_id = ANY($1::int[])', [ids]);
  return new Map(rows.map((r) => [`${r.a_id}-${r.b_id}`, r.estado]));
}
const par = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Busca en los productos de los proveedores activos. Puntaje = palabras (+ significado si hay IA).
 * El resultado más parecido es la referencia: los que son el mismo producto que ella son «exacta»; el resto, «alternativa».
 */
export async function buscar(q = {}) {
  const texto = t(q.q, 200);
  if (!texto) throw falla(400, 'Escribe qué producto buscas.');
  const par_ = await leerParametros();
  const tc = par_.tipo_cambio?.valor ?? null;
  const vigencia = par_.vigencia_precios_dias ?? 30;
  const { rows } = await consulta(`SELECT ${COLS_PROD} FROM proveedor_productos p JOIN proveedores v ON v.id = p.proveedor_id ${ULTIMO} WHERE v.activo`);
  const ws = [...new Set(tokens(texto))];
  const nums = ws.filter(numerico).map(igualaNumero);
  const cod = normal(texto).replace(/[^a-z0-9]/g, '');
  const consultaComoProducto = { descripcion: texto, firma: firmaDe({ descripcion: texto }) };
  const Q = partes(consultaComoProducto.firma);
  const puntos = new Map();
  for (const r of rows) {
    const h = normal(`${r.codigo ?? ''} ${r.descripcion} ${r.marca ?? ''} ${r.modelo ?? ''} ${r.categoria ?? ''}`);
    const hn = new Set(tokens(h).filter(numerico).map(igualaNumero));
    let s = 0;
    for (const w of ws) if (!numerico(w) && h.includes(w)) s += w.length >= 4 ? 1 : 0.5;
    for (const n of nums) if (hn.has(n) || h.includes(n)) s += 1.5;
    if (r.codigo && normal(r.codigo).replace(/[^a-z0-9]/g, '') === cod) s += 10;
    if (s > 0 && compararProductos(consultaComoProducto, r) === 'exacta') s += 3; // lo escrito es justo este producto
    if (s > 0) {
      // Desempate entre variantes: cada palabra de modelo que no se escribió (gx, smart, pro…) resta un poco.
      const extra = [...partes(r.firma).p].filter((w) => !Q.p.has(w)).length;
      s = Math.max(0.1, s - 0.4 * extra);
    }
    if (s > 0) puntos.set(r.id, s);
  }
  let sentido = new Map();
  try {
    const vs = await cargarVectores();
    if (vs.size && iaConfigurada()) {
      const [v] = await embeber([texto]);
      const nq = Math.hypot(...v) || 1;
      for (const [id, e] of vs) {
        let dot = 0;
        for (let i = 0; i < v.length && i < e.length; i++) dot += v[i] * e[i];
        sentido.set(id, dot / (nq * (Math.hypot(...e) || 1)));
      }
    }
  } catch {
    sentido = new Map();
  }
  const maxP = Math.max(1, ...puntos.values());
  const puntaje = (r) => (sentido.size ? 0.5 * ((puntos.get(r.id) ?? 0) / maxP) + 0.5 * Math.max(0, sentido.get(r.id) ?? 0) : (puntos.get(r.id) ?? 0) / maxP);
  let lista = rows.filter((r) => puntos.has(r.id) || (sentido.get(r.id) ?? 0) > 0.75).map((r) => ({ ...r, puntaje: puntaje(r) })).sort((a, b) => b.puntaje - a.puntaje).slice(0, 60);
  if (q.proveedores) {
    const ids = String(q.proveedores).split(',').map(Number);
    lista = lista.filter((r) => ids.includes(r.proveedor_id));
  }
  const ref = lista[0] ?? null;
  const dec = await decisiones(lista.map((r) => r.id));
  const hoy = hoyLima();
  const limite = new Date(`${hoy}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - vigencia);
  const desde = limite.toISOString().slice(0, 10);
  let res = lista.map((r) => {
    const d = ref && r.id !== ref.id ? dec.get(par(ref.id, r.id)) : null;
    const auto = !ref || r.id === ref.id ? 'exacta' : compararProductos(ref, r);
    const coincidencia = d === 'confirmada' ? 'exacta' : d === 'rechazada' ? 'distinta' : auto === 'exacta' ? 'exacta' : 'alternativa';
    const pc = precioComparable(r, tc, r.costo_envio);
    const { firma: _f, costo_envio, ...resto } = r;
    return { ...resto, costo_envio: costo_envio ?? null, coincidencia, decidida: !!d, vigente: r.fecha_lista >= desde, ...pc };
  });
  // Filtros
  const marcas = q.marcas ? String(q.marcas).split(',').map(normal) : null;
  if (marcas) res = res.filter((r) => r.marca && marcas.includes(normal(r.marca)));
  if (q.coincidencia === 'exacta') res = res.filter((r) => r.coincidencia === 'exacta');
  if (q.coincidencia === 'alternativa') res = res.filter((r) => r.coincidencia !== 'exacta');
  if (q.distintas !== '1') res = res.filter((r) => r.coincidencia !== 'distinta');
  if (q.disponibilidad === 'stock') res = res.filter((r) => /stock|dispon|inmediat/i.test(r.disponibilidad ?? ''));
  if (q.pmax) {
    const max = leerPrecio(q.pmax);
    if (max) res = res.filter((r) => r.total !== null && aCentimos(r.total) <= aCentimos(max.valor));
  }
  // Orden: primero el mismo producto (exactas), luego alternativas; dentro de cada grupo por costo total (sin soles al final)
  const grupo = { exacta: 0, alternativa: 1, distinta: 2 };
  res.sort((a, b) => grupo[a.coincidencia] - grupo[b.coincidencia] || (a.total === null) - (b.total === null)
    || (a.total !== null && b.total !== null ? Number(aCentimos(a.total) - aCentimos(b.total)) : 0));
  const exactasVigentes = res.filter((r) => r.coincidencia === 'exacta' && r.vigente && r.total !== null);
  const mejor = exactasVigentes[0] ?? null;
  const siguiente = exactasVigentes[1] ?? null;
  return {
    referencia: ref ? { id: ref.id, descripcion: ref.descripcion, proveedor: ref.proveedor } : null,
    tipo_cambio: tc, vigencia_dias: vigencia, interpretado: ws,
    mejor: mejor ? { id: mejor.id, ahorro: siguiente ? deCentimos(aCentimos(siguiente.total) - aCentimos(mejor.total)) : null } : null,
    resultados: res,
    proveedores: (await consulta('SELECT count(*)::int AS n FROM proveedores WHERE activo')).rows[0].n,
  };
}

/** Un producto con todo su historial de precios y los productos de otros proveedores que son el mismo. */
export async function detalleProducto(id) {
  const { rows } = await consulta(`SELECT ${COLS_PROD} FROM proveedor_productos p JOIN proveedores v ON v.id = p.proveedor_id ${ULTIMO} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw falla(404, 'No existe ese producto.');
  const tc = (await leerParametros()).tipo_cambio?.valor ?? null;
  const p = rows[0];
  const { rows: otros } = await consulta(`SELECT ${COLS_PROD} FROM proveedor_productos p JOIN proveedores v ON v.id = p.proveedor_id ${ULTIMO} WHERE p.id <> $1 AND v.activo`, [id]);
  const dec = await decisiones([id]);
  const mismos = otros.filter((o) => {
    const d = dec.get(par(id, o.id));
    return d === 'confirmada' || (d !== 'rechazada' && compararProductos(p, o) === 'exacta');
  });
  const ids = [p.id, ...mismos.map((m) => m.id)];
  const { rows: hist } = await consulta(
    `SELECT h.producto_id, v.nombre AS proveedor, h.precio::text AS precio, h.moneda, h.incluye_igv, h.origen, h.origen_detalle, h.fecha_lista::text AS fecha_lista,
            h.obtenido_en::text AS obtenido_en, h.tc_usado::text AS tc_usado
       FROM proveedor_precios h JOIN proveedor_productos p ON p.id = h.producto_id JOIN proveedores v ON v.id = p.proveedor_id
      WHERE h.producto_id = ANY($1::int[]) ORDER BY h.fecha_lista, h.id`,
    [ids],
  );
  // Serie mensual en soles con IGV, al tipo de cambio guardado cuando se obtuvo cada precio (o el actual si no hay).
  const serie = {};
  for (const h of hist) {
    const pc = precioComparable(h, h.tc_usado ?? tc, null);
    if (pc.soles === null) continue;
    (serie[h.proveedor] ??= {})[h.fecha_lista.slice(0, 7)] = pc.soles;
  }
  const { firma: _f, ...prod } = p;
  return { producto: { ...prod, ...precioComparable(p, tc, p.costo_envio) }, mismos: mismos.map(({ firma: _x, ...m }) => ({ ...m, ...precioComparable(m, tc, m.costo_envio) })), historial: hist, serie, tipo_cambio: tc };
}

/** Una persona decide si dos productos son el mismo (o no). La decisión se respeta en todas las búsquedas. */
export async function decidirEquivalencia(b, u) {
  const a = Number(b?.a_id);
  const c = Number(b?.b_id);
  if (!Number.isInteger(a) || !Number.isInteger(c) || a === c) throw falla(400, 'Elige dos productos distintos.');
  const [x, y] = a < c ? [a, c] : [c, a];
  if (b?.estado === null || b?.estado === 'quitar') {
    await consulta('DELETE FROM proveedor_equivalencias WHERE a_id = $1 AND b_id = $2', [x, y]);
    return { a_id: x, b_id: y, estado: null };
  }
  if (!['confirmada', 'rechazada'].includes(b?.estado)) throw falla(400, 'Elige «es el mismo» o «no es el mismo».');
  await consulta(
    `INSERT INTO proveedor_equivalencias (a_id, b_id, estado, decidido_por) VALUES ($1, $2, $3, $4)
     ON CONFLICT (a_id, b_id) DO UPDATE SET estado = EXCLUDED.estado, decidido_por = EXCLUDED.decidido_por, decidido_en = now() AT TIME ZONE 'America/Lima'`,
    [x, y, b.estado, u.nombre],
  );
  return { a_id: x, b_id: y, estado: b.estado };
}

export async function cargasDe(proveedorId) {
  const { rows } = await consulta(
    `SELECT id, tipo, origen, fecha_lista::text AS fecha_lista, filas, nuevos, cambiaron, sin_cambios, errores, creado_por, creado_en::text AS creado_en
       FROM proveedor_cargas WHERE proveedor_id = $1 ORDER BY id DESC LIMIT 50`,
    [proveedorId],
  );
  return rows;
}
