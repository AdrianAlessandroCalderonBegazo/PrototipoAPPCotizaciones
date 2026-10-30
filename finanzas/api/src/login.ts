/** Inicio de sesión contra la API principal (usuarios y sesiones de toda la plataforma). */
import { ApiError } from "./auth";
import type { LoginPrincipal } from "./server";

export function loginHttp(base: string, fetchFn: typeof fetch = fetch): LoginPrincipal {
  return {
    async entrar(usuario, clave, ip) {
      let res: Response;
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", ...(ip ? { "X-Forwarded-For": ip } : {}) };
        res = await fetchFn(`${base}/api/login`, { method: "POST", headers, body: JSON.stringify({ usuario, clave }) });
      } catch {
        throw new ApiError(503, "SERVIDOR_NO_DISPONIBLE", "No se pudo comunicar con el servidor de usuarios. Intenta de nuevo.");
      }
      const datos = (await res.json().catch(() => null)) as { token?: string; usuario?: { usuario: string; nombre: string; rol: string; niveles?: Record<string, string> }; error?: string } | null;
      if (!res.ok || !datos?.token || !datos.usuario) {
        const status = res.status >= 400 && res.status < 500 ? res.status : 502;
        throw new ApiError(status, status === 401 ? "CREDENCIALES" : "LOGIN_RECHAZADO", datos?.error || "No se pudo iniciar sesión.");
      }
      return { token: datos.token, usuario: datos.usuario };
    },
    async salir(token) {
      await fetchFn(`${base}/api/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
    },
  };
}
