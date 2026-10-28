/**
 * Cliente de la API del ERP (ICR-LOGISTICA) para la Caja diaria y la Caja chica.
 *
 * Cada persona de campo entra con su propia cuenta del ERP (mismo correo y clave que usaría en el ERP desde
 * una computadora); el JWT de SU sesión es el único token que usa esta app. Esta app solo habla con las rutas
 * /caja/* y /caja-chica/* (contrato en docs/API.md): es el SERVIDOR quien refleja cada ingreso o gasto real en
 * Contabilidad → Flujo de caja. La app ya no llama a /income ni /expenses, para no duplicar nada.
 *
 * Formato de respuesta del ERP:  { status: "success", data }  |  { status: "error", error: { code, message } }
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

// La API de Finanzas 2 se publica bajo el mismo origen que la app (finanza.TUDOMINIO/api-fin): no hace falta configurar nada.
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_ERP_API_URL || "/api-fin").replace(/\/+$/, "");
const SESSION_KEY = "cajaobra.session.v1";

export type Session = { token: string; nombre: string; email: string; rolCodigo: string };

let session: Session | null = null;
let onUnauthorized: (() => void) | null = null;

/** La app se entera cuando el ERP dice que la sesión ya no vale (para volver a la pantalla de ingreso). */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export async function loadSession(): Promise<Session | null> {
  if (session) return session;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    session = raw ? JSON.parse(raw) : null;
  } catch {
    session = null;
  }
  return session;
}

async function saveSession(next: Session | null) {
  session = next;
  try {
    if (next) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(SESSION_KEY);
  } catch {}
}

/** `status` 0 = no hubo respuesta (sin red). Con status 5xx o 0 conviene reintentar; con 4xx el servidor ya dijo que no. */
export class ApiError extends Error {
  constructor(message: string, public code?: string, public status = 0) {
    super(message);
  }
  get sinRed() {
    return this.status === 0 || this.status >= 500;
  }
}

async function enviar(method: string, path: string, init: { body?: BodyInit; contentType?: string }): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.contentType) headers["Content-Type"] = init.contentType;
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body: init.body });
  } catch {
    throw new ApiError("Sin conexión con el servidor.", "NETWORK", 0);
  }
  if (res.status === 401 && session) {
    await saveSession(null);
    onUnauthorized?.();
  }
  return res;
}

async function leerError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  return new ApiError(body?.error?.message || `El servidor respondió ${res.status}`, body?.error?.code, res.status);
}

/** JSON hacia el ERP; devuelve `data`. */
export async function apiJson<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await enviar(method, path, { body: body === undefined ? undefined : JSON.stringify(body), contentType: body === undefined ? undefined : "application/json" });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.status !== "success") throw new ApiError(payload?.error?.message || `El servidor respondió ${res.status}`, payload?.error?.code, res.status);
  return payload.data as T;
}

/** Sube una foto (cuerpo binario). */
export async function apiSubirFoto(path: string, blob: Blob): Promise<void> {
  const res = await enviar("PUT", path, { body: blob, contentType: blob.type || "image/jpeg" });
  if (!res.ok) throw await leerError(res);
}

/** Baja una foto (pide sesión, por eso no se puede usar directo en un <img src>). */
export async function apiBajarFoto(path: string): Promise<Blob> {
  const res = await enviar("GET", path, {});
  if (!res.ok) throw await leerError(res);
  return res.blob();
}

/** Entra con el usuario y la clave de la plataforma (los mismos del Cotizador y de Finanzas 1); el servidor valida el rol. */
export async function login(usuario: string, clave: string): Promise<Session> {
  const res = await enviar("POST", "/auth/login", { body: JSON.stringify({ usuario, clave }), contentType: "application/json" });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.status !== "success") throw new ApiError(payload?.error?.message || `El servidor respondió ${res.status}`, payload?.error?.code, res.status);
  const data = payload.data;
  const next: Session = { token: data.token, nombre: data.user.nombre_completo, email: data.user.email, rolCodigo: data.user.rol_codigo };
  await saveSession(next);
  return next;
}

export async function logout() {
  await saveSession(null);
}

export function currentSession(): Session | null {
  return session;
}
