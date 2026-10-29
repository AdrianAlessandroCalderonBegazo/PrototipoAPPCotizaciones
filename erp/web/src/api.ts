// Cliente de la API principal (misma dirección que el ERP: /api). El token de la sesión se guarda en este navegador.
const CLAVE_TOKEN = "erp.token";

export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
  }
}

let token: string | null = leerToken();
let alVencer: (() => void) | null = null;

function leerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function guardarToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(CLAVE_TOKEN, t);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // modo privado: la sesión dura lo que dure la pestaña
  }
}

export const tieneToken = () => !!token;
export const alVencerSesion = (fn: () => void) => void (alVencer = fn);

type Opciones = { cuerpo?: unknown; binario?: Blob; consulta?: Record<string, string | number | undefined | null> };

export async function api<T = unknown>(metodo: string, ruta: string, { cuerpo, binario, consulta }: Opciones = {}): Promise<T> {
  const q = consulta ? new URLSearchParams(Object.entries(consulta).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString() : "";
  let res: Response;
  try {
    res = await fetch(`/api${ruta}${q ? `?${q}` : ""}`, {
      method: metodo,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(binario ? { "Content-Type": binario.type || "application/octet-stream" } : cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: binario ?? (cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined),
    });
  } catch {
    throw new ErrorApi(0, "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.");
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && ruta !== "/login") {
      guardarToken(null);
      alVencer?.();
    }
    throw new ErrorApi(res.status, datos?.error ?? `El servidor respondió ${res.status}.`);
  }
  return datos as T;
}

/** Sube una imagen (JPG, PNG o WEBP) y devuelve su ruta pública (/uploads/...). */
export async function subirImagen(archivo: File): Promise<string> {
  const ext = (archivo.type.split("/")[1] ?? "").replace("jpeg", "jpg");
  if (!["jpg", "png", "webp"].includes(ext)) throw new ErrorApi(400, "La imagen debe ser JPG, PNG o WEBP.");
  if (archivo.size > 8 * 1024 * 1024) throw new ErrorApi(413, "La imagen pesa más de 8 MB.");
  const r = await api<{ ruta: string }>("POST", "/subidas", { binario: archivo, consulta: { ext } });
  return r.ruta;
}
