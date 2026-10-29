// Formatos de pantalla. Lo que no se sabe se muestra como «Sin dato» (nunca se inventa).
export const SIN_DATO = "Sin dato";

export const texto = (v: string | null | undefined) => (v === null || v === undefined || String(v).trim() === "" ? SIN_DATO : String(v));

const Z = "America/Lima";

/** Las fechas de la base vienen sin zona (hora de Lima). */
function aFecha(v: string): Date | null {
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(" ", "T")}-05:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fecha(v: string | null | undefined): string {
  if (!v) return SIN_DATO;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split("-");
    return `${d}/${m}/${a}`;
  }
  const d = aFecha(v);
  return d ? d.toLocaleDateString("es-PE", { timeZone: Z, day: "2-digit", month: "2-digit", year: "numeric" }) : SIN_DATO;
}

export function fechaHora(v: string | null | undefined): string {
  if (!v) return SIN_DATO;
  const d = aFecha(v);
  if (!d) return SIN_DATO;
  return `${d.toLocaleDateString("es-PE", { timeZone: Z, day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("es-PE", { timeZone: Z, hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

/** «Hoy 10:24», «Ayer 18:40» o la fecha. */
export function cuando(v: string | null | undefined, ahora = new Date()): string {
  if (!v) return SIN_DATO;
  const d = aFecha(v);
  if (!d) return SIN_DATO;
  const dia = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: Z });
  const hora = d.toLocaleTimeString("es-PE", { timeZone: Z, hour: "2-digit", minute: "2-digit", hour12: false });
  if (dia(d) === dia(ahora)) return `Hoy ${hora}`;
  if (dia(d) === dia(new Date(ahora.getTime() - 86_400_000))) return `Ayer ${hora}`;
  return fechaHora(v);
}

/** Hoy en Lima, AAAA-MM-DD. */
export const hoyLima = (ahora = new Date()) => ahora.toLocaleDateString("en-CA", { timeZone: Z });

export const iniciales = (nombre: string) =>
  nombre.trim().split(/\s+/).filter(Boolean).map((p) => p[0]!.toUpperCase()).slice(0, 2).join("") || "?";

/** Validación de RUC peruano (11 dígitos, prefijo 10/15/16/17/20 y dígito verificador). Igual que en el servidor. */
export function rucValido(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const dv = (11 - (suma % 11)) % 10;
  return dv === Number(ruc[10]);
}
