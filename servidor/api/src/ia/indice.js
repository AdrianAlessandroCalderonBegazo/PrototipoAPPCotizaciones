// Búsqueda de productos para la IA: por palabras (siempre) + por significado (embeddings de Ollama, si están).
// Los vectores se guardan en ia_embeddings y se tienen en memoria (≈ 1 000 productos: la comparación es instantánea).
import { createHash } from 'node:crypto';
import { consulta } from '../db.js';
import { monto } from '../dinero.js';
import { leerConfigIa } from './config.js';
import { embeber, iaConfigurada } from './ollama.js';

export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VACIAS = new Set(['para', 'con', 'una', 'uno', 'los', 'las', 'del', 'que', 'por', 'sin', 'mas', 'como', 'sistema', 'cotiza', 'cotizar', 'quiero', 'necesito', 'precio', 'cliente']);
const palabras = (s) => [...new Set(normalizar(s).split(/[^a-z0-9.]+/).filter((w) => w.length >= 2 && !VACIAS.has(w)))];

const textoProducto = (p) => [p.nombre, p.marca, p.modelo, p.categoria, p.caracteristicas].filter(Boolean).join(' | ').slice(0, 800);
const huella = (texto, modelo) => createHash('sha1').update(`${modelo}\n${texto}`).digest('hex');

let productosCache = null;
let productosEn = 0;
async function productos() {
  if (!productosCache || Date.now() - productosEn > 60_000) {
    const { rows } = await consulta(
      `SELECT id, codigo_erp AS codigo, referencia_interna AS referencia, nombre, marca, modelo, categoria_producto AS categoria, caracteristicas,
              unidad_medida AS unidad, precio_venta::text AS precio, moneda FROM productos WHERE NOT eliminado`,
    );
    productosCache = rows.map((p) => ({ ...p, precio: monto(p.precio), _t: normalizar(`${p.codigo ?? ''} ${p.referencia ?? ''} ${textoProducto(p)}`) }));
    productosEn = Date.now();
  }
  return productosCache;
}
/** Catálogo completo en memoria (se refresca cada minuto). Lo usa la cotización guiada. */
export const catalogoProductos = () => productos();
export const productoPorId = async (id) => (await productos()).find((p) => p.id === Number(id)) ?? null;
export const olvidarProductos = () => {
  productosCache = null;
  vectores = null;
};

let vectores = null; // Map ref_id → { v: Float32Array, n: norma }
async function cargarVectores() {
  if (vectores) return vectores;
  const { modelo_embeddings: m } = await leerConfigIa();
  const { rows } = await consulta("SELECT ref_id, vector FROM ia_embeddings WHERE tipo = 'producto' AND modelo = $1", [m]);
  vectores = new Map(rows.map((r) => {
    const v = Float32Array.from(r.vector);
    return [r.ref_id, { v, n: Math.hypot(...v) || 1 }];
  }));
  return vectores;
}

/** Recalcula los vectores que cambiaron. Devuelve cuántos hay y cuántos se calcularon. */
export async function reindexar() {
  if (!iaConfigurada()) return { total: 0, indexados: 0, nuevos: 0, disponible: false };
  const { modelo_embeddings: m } = await leerConfigIa();
  olvidarProductos();
  const lista = await productos();
  const { rows } = await consulta("SELECT ref_id, huella FROM ia_embeddings WHERE tipo = 'producto' AND modelo = $1", [m]);
  const tengo = new Map(rows.map((r) => [r.ref_id, r.huella]));
  const pendientes = lista.map((p) => ({ p, t: textoProducto(p), h: huella(textoProducto(p), m) })).filter((x) => tengo.get(x.p.id) !== x.h);
  for (let i = 0; i < pendientes.length; i += 32) {
    const lote = pendientes.slice(i, i + 32);
    const vs = await embeber(lote.map((x) => x.t));
    for (let k = 0; k < lote.length; k++) {
      if (!Array.isArray(vs[k])) continue;
      await consulta(
        `INSERT INTO ia_embeddings (tipo, ref_id, modelo, huella, vector) VALUES ('producto', $1, $2, $3, $4)
         ON CONFLICT (tipo, ref_id, modelo) DO UPDATE SET huella = EXCLUDED.huella, vector = EXCLUDED.vector, actualizado_en = now() AT TIME ZONE 'America/Lima'`,
        [lote[k].p.id, m, lote[k].h, vs[k]],
      );
    }
  }
  await consulta("DELETE FROM ia_embeddings WHERE tipo = 'producto' AND ref_id NOT IN (SELECT id FROM productos WHERE NOT eliminado)");
  vectores = null;
  return { total: lista.length, indexados: (await cargarVectores()).size, nuevos: pendientes.length, disponible: true };
}

export async function estadoIndice() {
  const { modelo_embeddings: m } = await leerConfigIa();
  const { rows } = await consulta(
    `SELECT (SELECT count(*)::int FROM productos WHERE NOT eliminado) AS total,
            (SELECT count(*)::int FROM ia_embeddings WHERE tipo = 'producto' AND modelo = $1) AS indexados,
            (SELECT max(actualizado_en)::text FROM ia_embeddings WHERE tipo = 'producto' AND modelo = $1) AS actualizado_en`,
    [m],
  );
  return { ...rows[0], modelo: m };
}

/**
 * Productos más parecidos a un texto. Puntaje = 60 % significado + 40 % palabras (solo palabras si no hay embeddings).
 * Devuelve datos reales del catálogo; los precios incluyen IGV.
 */
export async function buscarProductos(texto, { limite = 10, marca = null, categoria = null } = {}) {
  const lista = (await productos()).filter((p) => (!marca || normalizar(p.marca).includes(normalizar(marca))) && (!categoria || normalizar(p.categoria).includes(normalizar(categoria))));
  const ws = palabras(texto);
  const codigo = normalizar(texto).trim();
  const porPalabras = new Map();
  for (const p of lista) {
    let s = 0;
    for (const w of ws) if (p._t.includes(w)) s += w.length >= 4 ? 1 : 0.5;
    if (codigo && (normalizar(p.codigo) === codigo || normalizar(p.referencia) === codigo)) s += 5;
    if (s > 0) porPalabras.set(p.id, s);
  }
  const maxP = Math.max(1, ...porPalabras.values());
  let porSentido = new Map();
  try {
    const vs = await cargarVectores();
    if (vs.size && iaConfigurada()) {
      const [q] = await embeber([String(texto).slice(0, 500)]);
      if (Array.isArray(q)) {
        const nq = Math.hypot(...q) || 1;
        for (const p of lista) {
          const e = vs.get(p.id);
          if (!e) continue;
          let dot = 0;
          for (let i = 0; i < q.length && i < e.v.length; i++) dot += q[i] * e.v[i];
          porSentido.set(p.id, dot / (nq * e.n));
        }
      }
    }
  } catch {
    porSentido = new Map(); // sin embeddings: solo palabras
  }
  const conSentido = porSentido.size > 0;
  const puntaje = (p) => (conSentido ? 0.6 * Math.max(0, porSentido.get(p.id) ?? 0) : 0) + (conSentido ? 0.4 : 1) * ((porPalabras.get(p.id) ?? 0) / maxP);
  return lista
    .filter((p) => porPalabras.has(p.id) || (conSentido && (porSentido.get(p.id) ?? 0) > 0.35))
    .map((p) => ({ p, s: puntaje(p) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limite)
    .map(({ p }) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, marca: p.marca, modelo: p.modelo, categoria: p.categoria, unidad: p.unidad, precio: p.precio, moneda: p.moneda }));
}

/** Busca un producto exacto por código (o referencia) o por nombre idéntico. */
export async function productoExacto(clave) {
  const k = normalizar(clave).trim();
  if (!k) return null;
  const lista = await productos();
  return lista.find((p) => normalizar(p.codigo) === k) ?? lista.find((p) => normalizar(p.referencia) === k) ?? lista.find((p) => normalizar(p.nombre) === k) ?? null;
}

let reloj = null;
/** Después de cambiar el catálogo: recalcula el índice en segundo plano (espera 30 s por si vienen más cambios). */
export function programarReindexado(ms = 30_000) {
  productosCache = null;
  if (!iaConfigurada()) return;
  clearTimeout(reloj);
  reloj = setTimeout(() => reindexar().catch(() => null), ms);
  reloj.unref?.();
}
