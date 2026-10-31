/**
 * Caja ICR en la API principal (/api/caja-icr), con el mismo token de la sesión de Finanzas.
 * Sus errores llegan como { error: "mensaje", ...datos } (p. ej. { duplicado: true, existente } si la operación ya existe).
 */
import { Platform } from "react-native";
import { currentSession, sesionVencida } from "../api";
import type { Mov, NuevoMov, Reporte, Resumen, Saldos } from "./tipos";

const BASE = (process.env.EXPO_PUBLIC_ICR_URL || "/api").replace(/\/+$/, "");

export class IcrError extends Error {
  constructor(message: string, public status = 0, public datos: Record<string, unknown> = {}) {
    super(message);
  }
}

const cabeceras = (json = false): Record<string, string> => {
  const s = currentSession();
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(s?.token ? { Authorization: `Bearer ${s.token}` } : {}) };
};

async function pedir(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, { method, headers: { ...cabeceras(), ...init.headers }, body: init.body });
  } catch {
    throw new IcrError("Sin conexión con el servidor.", 0);
  }
  if (r.status === 401) void sesionVencida();
  return r;
}

async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await pedir(method, path, body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const { error, ...datos } = (j ?? {}) as { error?: string };
    throw new IcrError(error ?? `El servidor respondió ${r.status}.`, r.status, datos);
  }
  return j as T;
}

const consulta = (q: Record<string, string | undefined>) => {
  const p = Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v!)}`);
  return p.length ? `?${p.join("&")}` : "";
};

export const resumen = () => json<Resumen>("GET", "/caja-icr/resumen");
export const movimientos = (q: { desde?: string; hasta?: string; tipo?: string; medio?: string; q?: string; anulados?: string }) => json<Mov[]>("GET", `/caja-icr/movimientos${consulta(q)}`);
export const movimiento = (id: string) => json<Mov>("GET", `/caja-icr/movimientos/${id}`);
export const registrar = (m: NuevoMov) => json<{ mov: Mov; repetido: boolean; saldos: Saldos; aviso: string | null }>("POST", "/caja-icr/movimientos", m);
export const editar = (id: string, cambios: Partial<NuevoMov>) => json<Mov>("PUT", `/caja-icr/movimientos/${id}`, cambios);
export const anular = (id: string, motivo: string) => json<Mov>("POST", `/caja-icr/movimientos/${id}/anular`, { motivo });
export const reportes = (desde: string, hasta: string) => json<Reporte>("GET", `/caja-icr/reportes${consulta({ desde, hasta })}`);

/** Sube la foto (recibo o captura) de un movimiento ya registrado. */
export async function subirFoto(movId: string, uri: string): Promise<number> {
  const blob = await (await fetch(uri)).blob();
  const ext = /png/.test(blob.type) ? "png" : /webp/.test(blob.type) ? "webp" : "jpg";
  const r = await pedir("POST", `/caja-icr/movimientos/${movId}/fotos?ext=${ext}`, { body: blob, headers: { "Content-Type": blob.type || "image/jpeg" } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new IcrError(j?.error ?? "No se pudo subir la foto.", r.status);
  return j.id as number;
}

const urls = new Map<number, string>();
/** Dirección para mostrar una foto (pide sesión: en la web se baja y se muestra como blob:). */
export async function urlFoto(id: number): Promise<{ uri: string; headers?: Record<string, string> }> {
  if (Platform.OS !== "web") return { uri: `${BASE}/caja-icr/fotos/${id}`, headers: cabeceras() };
  const ya = urls.get(id);
  if (ya) return { uri: ya };
  const r = await pedir("GET", `/caja-icr/fotos/${id}`);
  if (!r.ok) throw new IcrError("No se pudo abrir la foto.", r.status);
  const u = URL.createObjectURL(await r.blob());
  urls.set(id, u);
  return { uri: u };
}
