/**
 * Lo que cada rol puede hacer en Finanzas. Quien decide de verdad es el servidor (api/src/permisos.ts), según la matriz
 * de permisos del ERP (nivel del rol en «caja chica»: lectura o completo); esto solo sirve para mostrar u ocultar botones.
 * Al iniciar sesión el servidor manda sus permisos; esta tabla es el respaldo y es la misma que usa el servidor por defecto.
 */
export type Permisos = {
  /** Entrar a Finanzas y ver la caja. */
  acceso: boolean;
  /** Registrar movimientos (acceso completo). */
  escribir: boolean;
  /** Corregir días anteriores (movimientos, fotos, observaciones, caja chica). */
  corregir_pasado: boolean;
  /** Cerrar el día (arqueo). */
  cerrar: boolean;
  /** Reabrir un día cerrado. */
  reabrir: boolean;
  /** Cambiar los saldos iniciales. */
  configurar: boolean;
  /** Ver alertas y el historial de cambios. */
  revisar: boolean;
};

export const SIN_PERMISOS: Permisos = { acceso: false, escribir: false, corregir_pasado: false, cerrar: false, reabrir: false, configurar: false, revisar: false };

const ROLES = {
  admin: { acceso: true, escribir: true, corregir_pasado: true, cerrar: true, reabrir: true, configurar: true, revisar: true },
  contabilidad: { acceso: true, escribir: true, corregir_pasado: true, cerrar: true, reabrir: false, configurar: false, revisar: true },
} satisfies Record<string, Permisos>;

export const ROL_LABEL: Record<string, string> = { admin: "Administrador", ventas: "Ventas", contabilidad: "Contabilidad", tecnico: "Técnico" };

/** Permisos guardados por una versión anterior (sin `escribir`): quien podía corregir días anteriores tenía acceso completo. */
export function normalizarPermisos(p: Partial<Permisos> | null | undefined, rol: string): Permisos {
  if (!p) return permisosDeRol(rol);
  return { ...SIN_PERMISOS, ...p, escribir: p.escribir ?? !!p.corregir_pasado };
}

/** Permisos por defecto de un rol (si el servidor no los mandó). */
export function permisosDeRol(rol: string): Permisos {
  return (ROLES as Record<string, Permisos>)[(rol ?? "").toLowerCase()] ?? SIN_PERMISOS;
}
