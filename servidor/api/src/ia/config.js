// Configuración de la IA (Configuración › Inteligencia artificial) y contexto del Cotizador IA.
// Se guarda en la tabla `configuracion`. Las reglas y notas las escribe la empresa: por defecto están vacías (nunca se inventan).
import { consulta } from '../db.js';
import { falla } from '../errores.js';

async function leer(clave, porDefecto) {
  const { rows } = await consulta('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
  try {
    return rows[0] ? { ...porDefecto, ...JSON.parse(rows[0].valor) } : { ...porDefecto };
  } catch {
    return { ...porDefecto };
  }
}
const escribir = (clave, valor) =>
  consulta(
    `INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now() AT TIME ZONE 'America/Lima'`,
    [clave, JSON.stringify(valor)],
  );

const POR_DEFECTO = () => ({ modelo: process.env.OLLAMA_MODELO || 'qwen3:4b', modelo_embeddings: process.env.OLLAMA_EMBED || 'bge-m3', num_ctx: 8192 });

export const leerConfigIa = async () => {
  const d = POR_DEFECTO();
  const c = await leer('ia', {});
  return { modelo: c.modelo || d.modelo, modelo_embeddings: c.modelo_embeddings || d.modelo_embeddings, num_ctx: c.num_ctx || d.num_ctx };
};

const NOMBRE = /^[a-z0-9][a-z0-9._:/-]{0,79}$/i;
export async function guardarConfigIa(b) {
  const antes = await leerConfigIa();
  const nueva = { ...antes };
  if (b?.modelo !== undefined) {
    if (!NOMBRE.test(String(b.modelo))) throw falla(400, 'El nombre del modelo no es válido (por ejemplo qwen3:4b).');
    nueva.modelo = String(b.modelo);
  }
  if (b?.modelo_embeddings !== undefined) {
    if (!NOMBRE.test(String(b.modelo_embeddings))) throw falla(400, 'El nombre del modelo de búsqueda no es válido (por ejemplo bge-m3).');
    nueva.modelo_embeddings = String(b.modelo_embeddings);
  }
  if (b?.num_ctx !== undefined) {
    const n = Number(b.num_ctx);
    if (!Number.isInteger(n) || n < 2048 || n > 32768) throw falla(400, 'La memoria de conversación debe estar entre 2048 y 32768.');
    nueva.num_ctx = n;
  }
  await escribir('ia', nueva);
  return { antes, despues: nueva };
}

const CONTEXTO = { reglas: null, notas: null, usar_catalogo: true, usar_precios: true, usar_reglas: true, usar_notas: true, guiada: { paneles: [], inversores: [], baterias: [] } };
export const leerContexto = () => leer('ia_contexto', CONTEXTO);

export async function guardarContexto(b) {
  const antes = await leerContexto();
  const nuevo = { ...antes };
  for (const k of ['reglas', 'notas']) if (b?.[k] !== undefined) nuevo[k] = b[k] === null ? null : String(b[k]).trim().slice(0, 4000) || null;
  for (const k of ['usar_catalogo', 'usar_precios', 'usar_reglas', 'usar_notas']) if (b?.[k] !== undefined) nuevo[k] = b[k] === true;
  // Cotización guiada: hasta 5 productos preferidos de cada tipo (ids del catálogo, en orden de preferencia).
  if (b?.guiada !== undefined) {
    const lista = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 5);
    nuevo.guiada = { paneles: lista(b.guiada?.paneles), inversores: lista(b.guiada?.inversores), baterias: lista(b.guiada?.baterias) };
  }
  await escribir('ia_contexto', nuevo);
  return { antes, despues: nuevo };
}
