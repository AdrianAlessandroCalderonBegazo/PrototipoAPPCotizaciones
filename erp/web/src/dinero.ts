// Montos que llegan del servidor como texto («1234.50»). Se muestran sin pasar por coma flotante.
import { SIN_DATO } from "./formato";

export type Moneda = "PEN" | "USD";
export const SIMBOLO: Record<Moneda, string> = { PEN: "S/", USD: "US$" };

/** «-1234567.5» → «-1,234,567.50». */
export function conMiles(v: string): string {
  const t = v.trim();
  const neg = t.startsWith("-");
  const [ent, dec = ""] = t.replace("-", "").split(".");
  const miles = ent.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${miles}.${dec.padEnd(2, "0").slice(0, 2)}`;
}

/** «S/ 1,234.50», o «Sin dato» si no se conoce. */
export function dinero(v: string | null | undefined, moneda: Moneda = "PEN"): string {
  if (v === null || v === undefined || v === "" || !/^-?\d+(\.\d+)?$/.test(String(v))) return SIN_DATO;
  const t = conMiles(String(v));
  return t.startsWith("-") ? `-${SIMBOLO[moneda]} ${t.slice(1)}` : `${SIMBOLO[moneda]} ${t}`;
}

/** Solo para dibujar (anchos de barras): nunca para cuentas. */
export const paraDibujar = (v: string | null | undefined) => (v ? Number(v) : 0);

export const esNegativo = (v: string | null | undefined) => !!v && v.trim().startsWith("-") && /[1-9]/.test(v);

/** Lo que escribe la persona en un campo de monto → texto con punto decimal (o null si no es un monto). */
export function leerMonto(v: string): string | null {
  let t = v.trim().replace(/\s/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  return /^\d{1,12}(\.\d{1,2})?$/.test(t) && /[1-9]/.test(t) ? t : null;
}

/** Resta exacta en céntimos de dos montos en texto (para vistas previas como «la caja quedará en…»). */
export function restar(a: string, b: string): string {
  const c = (x: string) => {
    const neg = x.startsWith("-");
    const [e, d = ""] = x.replace("-", "").split(".");
    const n = Number(e) * 100 + Number(d.padEnd(2, "0").slice(0, 2));
    return neg ? -n : n;
  };
  const r = c(a) - c(b);
  const abs = Math.abs(r);
  return `${r < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
export const sumarMontos = (a: string, b: string) => restar(a, b.startsWith("-") ? b.slice(1) : `-${b}`);

/** US$ × tipo de cambio en céntimos exactos (para el «≈ S/» de la cuenta en dólares). */
export function aSoles(usd: string | null, tc: string | null): string | null {
  if (!usd || !tc) return null;
  const cent = (v: string, dec: number) => {
    const neg = v.startsWith("-");
    const [e, d = ""] = v.replace("-", "").split(".");
    const n = BigInt(e) * 10n ** BigInt(dec) + BigInt((d + "0".repeat(dec)).slice(0, dec) || "0");
    return neg ? -n : n;
  };
  const r = (cent(usd, 2) * cent(tc, 4) + 5000n) / 10000n; // céntimos de sol, redondeado
  const neg = r < 0n;
  const a = neg ? -r : r;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

