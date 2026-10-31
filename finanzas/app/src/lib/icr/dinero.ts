/** Montos que llegan del servidor como texto («1234.50»): se muestran sin pasar por coma flotante. */
export function soles(v: string | null | undefined): string {
  if (v === null || v === undefined || !/^-?\d+(\.\d+)?$/.test(String(v))) return "Sin dato";
  const neg = String(v).startsWith("-");
  const [e, d = ""] = String(v).replace("-", "").split(".");
  return `${neg ? "-" : ""}S/ ${e.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${d.padEnd(2, "0").slice(0, 2)}`;
}
export const esNegativo = (v: string | null | undefined) => !!v && v.startsWith("-") && /[1-9]/.test(v);
/** Lo que escribe la persona → «12.50» (o null si no es un monto válido mayor a 0). */
export function leerMonto(v: string): string | null {
  const t = v.trim().replace(/\s/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  return /^\d{1,10}(\.\d{1,2})?$/.test(t) && /[1-9]/.test(t) ? t : null;
}
