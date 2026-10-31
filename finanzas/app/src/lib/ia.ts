/**
 * «Preguntar»: consultas a la IA sobre la caja diaria y la caja chica. La responde la API principal (/api/ia/finanzas, misma sesión)
 * y la respuesta llega mientras se escribe (text/event-stream). La IA solo lee: no registra ni cambia nada.
 */
import { currentSession } from "./api";

const IA_URL = (process.env.EXPO_PUBLIC_IA_URL || "/api/ia").replace(/\/+$/, "");

export type Bloque =
  | { tipo: "kpis"; items: { l: string; v: string; c?: "primario" | "peligro" }[] }
  | { tipo: "tabla"; titulo: string; columnas: { l: string; a: "left" | "right" }[]; filas: string[][]; destacar: number | null }
  | { tipo: "grafico"; titulo: string; barras: { l: string; v: number; texto: string }[] };
export type MensajeIa = { id: number; rol: "usuario" | "ia" | "error"; texto: string; datos: { bloques?: Bloque[]; fuentes?: string[] } | null; por_voz: boolean; creado_en: string; duracion_ms: number | null };
export type Conversacion = { id: number; titulo: string; actualizado_en: string; n_mensajes: number };
export type EstadoIa = { disponible: boolean; motivo: string | null; detalle: string; modelo: string };
export type Evento =
  | { tipo: "conversacion"; id: number; titulo: string }
  | { tipo: "herramienta"; nombre: string; fuente: string | null }
  | { tipo: "texto"; t: string }
  | { tipo: "borrar" }
  | { tipo: "fin"; mensaje: MensajeIa }
  | { tipo: "error"; mensaje: string; motivo: string };

const cabeceras = (json = false): Record<string, string> => {
  const s = currentSession();
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(s?.token ? { Authorization: `Bearer ${s.token}` } : {}) };
};

/** Saca los eventos completos («data: …» separados por una línea en blanco) y devuelve lo que sobra para la próxima vez. */
export function leerEventos(buf: string): { eventos: Evento[]; resto: string } {
  const eventos: Evento[] = [];
  let resto = buf.replace(/\r/g, "");
  let i: number;
  while ((i = resto.indexOf("\n\n")) >= 0) {
    const bloque = resto.slice(0, i);
    resto = resto.slice(i + 2);
    const linea = bloque.split("\n").find((l) => l.startsWith("data: "));
    if (!linea) continue; // latido («: esperando»)
    try {
      eventos.push(JSON.parse(linea.slice(6)) as Evento);
    } catch {
      // un evento roto no debe tumbar la conversación
    }
  }
  return { eventos, resto };
}

/** JSON de la API principal (sus errores vienen como { error }). */
export async function iaJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${IA_URL}${path}`, { method, headers: cabeceras(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Sin conexión con el servidor.");
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `El servidor respondió ${r.status}.`);
  return j as T;
}

export async function preguntar(cuerpo: { conversacion_id?: number | null; texto: string; por_voz?: boolean }, alEvento: (e: Evento) => void, senal?: AbortSignal) {
  let r: Response;
  try {
    r = await fetch(`${IA_URL}/finanzas/preguntar`, { method: "POST", headers: cabeceras(true), body: JSON.stringify(cuerpo), signal: senal });
  } catch {
    return alEvento({ tipo: "error", mensaje: "Sin conexión con el servidor.", motivo: "sin_conexion" });
  }
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    return alEvento({ tipo: "error", mensaje: j?.error ?? `El servidor respondió ${r.status}.`, motivo: "error" });
  }
  let cerrado = false;
  const emitir = (es: Evento[]) => es.forEach((e) => ((cerrado ||= e.tipo === "fin" || e.tipo === "error"), alEvento(e)));
  const cuerpoStream = (r as Response & { body?: ReadableStream<Uint8Array> | null }).body;
  try {
    if (cuerpoStream && typeof cuerpoStream.getReader === "function") {
      // Navegador: se va mostrando mientras llega.
      const lector = cuerpoStream.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        const x = leerEventos(buf + dec.decode(value, { stream: true }));
        buf = x.resto;
        emitir(x.eventos);
      }
    } else {
      // Teléfono sin streaming: llega todo junto al final.
      emitir(leerEventos(`${await r.text()}\n\n`).eventos);
    }
  } catch {
    if (!senal?.aborted) alEvento({ tipo: "error", mensaje: "Se cortó la conexión mientras la IA respondía.", motivo: "error" });
    return;
  }
  if (!cerrado && !senal?.aborted) alEvento({ tipo: "error", mensaje: "La respuesta llegó incompleta.", motivo: "error" });
}

/** «**negrita**» y listas («- », «1. ») en piezas simples para dibujar sin HTML. */
export type Pieza = { lista: boolean; partes: { t: string; negrita: boolean }[] };
export function piezasDeTexto(texto: string): Pieza[] {
  return texto
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
      const cuerpo = (m ? m[1] : l).replace(/^#+\s*/, "");
      return { lista: !!m, partes: cuerpo.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) => (p.startsWith("**") && p.endsWith("**") ? { t: p.slice(2, -2), negrita: true } : { t: p, negrita: false })) };
    });
}
