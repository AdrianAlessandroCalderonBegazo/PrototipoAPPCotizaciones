/**
 * Quién puede hacer qué en Finanzas (la PWA de caja chica). Los roles son los de toda la plataforma (Administrador,
 * Ventas, Contabilidad, Técnico) y el nivel de cada rol en el módulo «caja_chica» sale de la matriz de permisos del ERP
 * (tabla rol_permisos de la base principal, ERP › Configuración). Se comprueba en el SERVIDOR; la app solo esconde botones.
 *
 *   lectura   → entrar, ver la caja, las alertas y el historial de cambios
 *   completo  → además registrar, corregir días anteriores y cerrar el día
 *   reabrir un día cerrado y cambiar los saldos iniciales → solo el Administrador
 */
import type { Usuario } from "./auth";

export type Nivel = "ninguno" | "lectura" | "completo";
const ORDEN: Record<Nivel, number> = { ninguno: 0, lectura: 1, completo: 2 };
/** Si la sesión no trae el nivel (desarrollo y pruebas), el de cada rol por defecto. */
const POR_DEFECTO: Record<string, Nivel> = { admin: "completo", contabilidad: "completo" };

export type Permisos = ReturnType<typeof crearPermisos>;

export function crearPermisos(_env: NodeJS.ProcessEnv = {}) {
  const rol = (u: Pick<Usuario, "rol">) => (u.rol ?? "").toLowerCase();
  const nivel = (u: Pick<Usuario, "rol" | "nivelCaja">): Nivel => (rol(u) === "admin" ? "completo" : u.nivelCaja ?? POR_DEFECTO[rol(u)] ?? "ninguno");
  const al = (minimo: Nivel) => (u: Pick<Usuario, "rol" | "nivelCaja">) => ORDEN[nivel(u)] >= ORDEN[minimo];
  const soloAdmin = (u: Pick<Usuario, "rol">) => rol(u) === "admin";
  return {
    nivel,
    acceso: al("lectura"),
    escribir: al("completo"),
    corregirPasado: al("completo"),
    cerrar: al("completo"),
    reabrir: soloAdmin,
    configurar: soloAdmin,
    revisar: al("lectura"),
    /** Lo que la app necesita saber para mostrar u ocultar botones. */
    de: (u: Pick<Usuario, "rol" | "nivelCaja">) => ({
      acceso: al("lectura")(u), escribir: al("completo")(u), corregir_pasado: al("completo")(u), cerrar: al("completo")(u),
      reabrir: soloAdmin(u), configurar: soloAdmin(u), revisar: al("lectura")(u),
    }),
  };
}
