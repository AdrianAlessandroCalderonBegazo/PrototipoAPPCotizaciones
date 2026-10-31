// Pregunta a la IA y va recibiendo la respuesta mientras se escribe (text/event-stream sobre un POST).
import { tokenActual } from "../../api";
import type { MensajeIa, ModuloIa } from "../../tipos";

export type EventoIa =
  | { tipo: "conversacion"; id: number; titulo: string }
  | { tipo: "herramienta"; nombre: string; fuente: string | null }
  | { tipo: "texto"; t: string }
  | { tipo: "borrar" }
  | { tipo: "fin"; mensaje: MensajeIa }
  | { tipo: "error"; mensaje: string; motivo: string };

export async function preguntarIa(modulo: ModuloIa, cuerpo: { conversacion_id?: number | null; texto: string; por_voz?: boolean }, alEvento: (e: EventoIa) => void, senal?: AbortSignal) {
  let r: Response;
  try {
    const t = tokenActual();
    r = await fetch(`/api/ia/${modulo}/preguntar`, { method: "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(cuerpo), signal: senal });
  } catch {
    return alEvento({ tipo: "error", mensaje: "No hay conexión con el servidor.", motivo: "sin_conexion" });
  }
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => null);
    return alEvento({ tipo: "error", mensaje: j?.error ?? `El servidor respondió ${r.status}.`, motivo: "error" });
  }
  const lector = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let cerrado = false;
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const bloque = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const linea = bloque.split("\n").find((l) => l.startsWith("data: "));
        if (!linea) continue;
        const e = JSON.parse(linea.slice(6)) as EventoIa;
        if (e.tipo === "fin" || e.tipo === "error") cerrado = true;
        alEvento(e);
      }
    }
  } catch {
    if (!senal?.aborted) alEvento({ tipo: "error", mensaje: "Se cortó la conexión mientras la IA respondía.", motivo: "error" });
    return;
  }
  if (!cerrado && !senal?.aborted) alEvento({ tipo: "error", mensaje: "La respuesta llegó incompleta.", motivo: "error" });
}
