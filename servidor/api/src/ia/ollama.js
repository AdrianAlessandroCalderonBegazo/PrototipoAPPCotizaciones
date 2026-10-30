// Cliente de Ollama (IA local en el VPS). Solo lo llama el servidor: Ollama nunca se expone a internet.
// Modelos: los de Configuración › Inteligencia artificial; si no hay, los de las variables OLLAMA_MODELO y OLLAMA_EMBED.
import { leerConfigIa } from './config.js';

const base = (env = process.env) => (env.OLLAMA_URL || '').replace(/\/+$/, '');
export const iaConfigurada = (env = process.env) => !!base(env);

async function pedir(ruta, cuerpo, { ms = 300_000, senal } = {}) {
  const url = base();
  if (!url) throw Object.assign(new Error('La IA no está instalada en el servidor (falta OLLAMA_URL).'), { sinIa: true });
  const ctl = new AbortController();
  const reloj = setTimeout(() => ctl.abort(), ms);
  senal?.addEventListener('abort', () => ctl.abort());
  try {
    const r = await fetch(`${url}${ruta}`, { method: cuerpo ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: ctl.signal });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw Object.assign(new Error(`Ollama respondió ${r.status}${t ? `: ${t.slice(0, 200)}` : ''}`), { estado: r.status });
    }
    return { r, reloj };
  } catch (e) {
    clearTimeout(reloj);
    if (e.name === 'AbortError') throw Object.assign(new Error('La IA tardó demasiado en responder.'), { tiempo: true });
    if (e.sinIa || e.estado) throw e;
    throw Object.assign(new Error('No se pudo conectar con la IA del servidor.'), { sinConexion: true });
  }
}

const mismo = (a, b) => a === b || a === `${b}:latest` || `${a}:latest` === b;

/** ¿Responde Ollama y están los modelos? */
export async function salud() {
  const cfg = await leerConfigIa();
  if (!iaConfigurada()) return { disponible: false, motivo: 'no_instalada', detalle: 'La IA no está instalada en el servidor.', ...cfg };
  const inicio = Date.now();
  try {
    const { r, reloj } = await pedir('/api/tags', null, { ms: 5000 });
    clearTimeout(reloj);
    const modelos = ((await r.json()).models ?? []).map((m) => m.name);
    const chat = modelos.some((m) => mismo(m, cfg.modelo));
    const emb = modelos.some((m) => mismo(m, cfg.modelo_embeddings));
    return {
      disponible: chat, motivo: chat ? null : 'falta_modelo', latencia_ms: Date.now() - inicio, modelos, modelo_presente: chat, embeddings_presente: emb,
      detalle: chat ? `En línea · ${cfg.modelo}` : `Ollama responde, pero falta el modelo ${cfg.modelo}.`, ...cfg,
    };
  } catch (e) {
    return { disponible: false, motivo: 'sin_conexion', detalle: e.message, ...cfg };
  }
}

/** Vectores de significado para una lista de textos. */
export async function embeber(textos) {
  const cfg = await leerConfigIa();
  const { r, reloj } = await pedir('/api/embed', { model: cfg.modelo_embeddings, input: textos, keep_alive: '30m' }, { ms: 120_000 });
  clearTimeout(reloj);
  const j = await r.json();
  return j.embeddings ?? [];
}

/**
 * Una vuelta de chat en streaming. Llama a alTexto(pedazo) con el texto que va llegando (sin las marcas <think>)
 * y devuelve { texto, llamadas: [{ name, arguments }], modelo }.
 */
export async function chatear({ mensajes, herramientas, alTexto, senal }) {
  const cfg = await leerConfigIa();
  const { r, reloj } = await pedir('/api/chat', {
    model: cfg.modelo, messages: mensajes, tools: herramientas?.length ? herramientas : undefined, stream: true, think: false, keep_alive: '30m',
    options: { temperature: 0.2, num_ctx: cfg.num_ctx },
  }, { senal });
  let texto = '';
  let pensando = false;
  let pendiente = '';
  const llamadas = [];
  const emitir = (s) => {
    // Quita los bloques <think>…</think> que algunos modelos mandan aunque se pida no pensar.
    pendiente += s;
    let salida = '';
    for (;;) {
      if (pensando) {
        const fin = pendiente.indexOf('</think>');
        if (fin < 0) { pendiente = pendiente.slice(-8); return; }
        pendiente = pendiente.slice(fin + 8);
        pensando = false;
      } else {
        const ini = pendiente.indexOf('<think>');
        if (ini < 0) {
          const corte = pendiente.length - 7; // por si «<think>» llega partido
          if (corte > 0) { salida += pendiente.slice(0, corte); pendiente = pendiente.slice(corte); }
          break;
        }
        salida += pendiente.slice(0, ini);
        pendiente = pendiente.slice(ini + 7);
        pensando = true;
      }
    }
    if (salida) {
      texto += salida;
      alTexto?.(salida);
    }
  };
  try {
    const lector = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const linea = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!linea) continue;
        const j = JSON.parse(linea);
        if (j.error) throw new Error(`La IA devolvió un error: ${j.error}`);
        if (j.message?.content) emitir(j.message.content);
        for (const c of j.message?.tool_calls ?? []) {
          let args = c.function?.arguments ?? {};
          if (typeof args === 'string') try { args = JSON.parse(args); } catch { args = {}; }
          llamadas.push({ name: c.function?.name, arguments: args });
        }
      }
    }
    if (!pensando && pendiente) {
      texto += pendiente;
      alTexto?.(pendiente);
    }
  } finally {
    clearTimeout(reloj);
  }
  return { texto: texto.trim(), llamadas, modelo: cfg.modelo };
}
