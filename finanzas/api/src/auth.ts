/**
 * Quién llama. La app manda el token de sesión que le dio el servidor al iniciar sesión (Authorization: Bearer …).
 * Es el mismo sistema de usuarios y sesiones de toda la plataforma (tablas `usuarios` y `sesiones`, que crea la API
 * principal): una sola cuenta para el Cotizador, el Almacén y Finanzas, y un solo lugar donde se manejan los roles.
 *
 * AUTH_MODE=dev acepta cualquier "Bearer dev:<nombre>[:<rol>]" — solo para desarrollo y pruebas.
 */
import type { Db } from "./db";

/** `nivelCaja`: nivel del rol en el módulo caja_chica según la matriz de permisos del ERP (si se conoce). */
export type Usuario = { id: string; nombre: string; email: string; rol: string; token?: string; nivelCaja?: "ninguno" | "lectura" | "completo" };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type Auth = (authorization: string | undefined) => Promise<Usuario>;

/** Sesiones reales: el token tiene que estar en `sesiones`, sin vencer, y su usuario activo. */
export function authSesiones(db: Db): Auth {
  return async (h) => {
    const token = /^Bearer (.+)$/.exec(h ?? "")?.[1]?.trim();
    if (!token) throw new ApiError(401, "NO_AUTORIZADO", "Falta el token de sesión.");
    const [u] = await db.query<{ id: number; usuario: string; nombre: string; rol: string; nivel_caja: string | null }>(
      `SELECT u.id, u.usuario, u.nombre, u.rol, rp.nivel AS nivel_caja
         FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
         LEFT JOIN rol_permisos rp ON rp.rol = u.rol AND rp.modulo = 'caja_chica'
        WHERE s.token = $1 AND s.expira_en > (now() AT TIME ZONE 'America/Lima') AND u.activo`,
      [token],
    );
    if (!u) throw new ApiError(401, "NO_AUTORIZADO", "La sesión expiró o no es válida. Vuelve a iniciar sesión.");
    return { id: String(u.id), nombre: u.nombre, email: u.usuario, rol: u.rol, token, nivelCaja: (u.rol === "admin" ? "completo" : (u.nivel_caja ?? "ninguno")) as Usuario["nivelCaja"] };
  };
}

export function authDesdeEntorno(env: NodeJS.ProcessEnv, db?: Db): Auth {
  if (env.AUTH_MODE === "dev") {
    return async (h) => {
      // «dev:nombre[:rol[:nivel]]»: el nivel (ninguno/lectura/completo) simula la matriz de permisos.
      const m = /^Bearer dev:([^:]+)(?::([^:]+))?(?::(ninguno|lectura|completo))?$/.exec(h ?? "");
      if (!m) throw new ApiError(401, "NO_AUTORIZADO", "Falta el token de sesión.");
      return { id: m[1], nombre: m[1], email: `${m[1]}@dev.local`, rol: (m[2] ?? "admin").toLowerCase(), token: h?.slice(7), nivelCaja: m[3] as Usuario["nivelCaja"] };
    };
  }
  if (!db) throw new Error("Falta la base de datos para validar las sesiones (o AUTH_MODE=dev para desarrollo local).");
  return authSesiones(db);
}
