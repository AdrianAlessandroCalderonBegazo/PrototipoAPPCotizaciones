// Misma cuenta que servidor/api/src/cotizar.js (para la vista previa mientras se escribe). Quien manda es el servidor.
// Los precios del catálogo INCLUYEN IGV: total = Σ ítems − descuentos; valor de venta = total ÷ 1.18; IGV = total − valor de venta.

export type LineaEntrada = { descripcion: string; cantidad: string; precio_unitario: string; descuento_pct?: string };
export type Totales = { subtotal: string; descuento_lineas: string; descuento: string; total: string; valor_venta: string; igv: string };

function centesimas(v: string | undefined): bigint | null {
  let t = String(v ?? "").trim();
  if (t === "") return 0n;
  if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) return null;
  const [e, d = ""] = t.split(".");
  return BigInt(e) * 100n + BigInt(d.padEnd(2, "0"));
}
const div = (a: bigint, b: bigint) => (a * 2n + b) / (b * 2n);
const texto = (c: bigint) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
};

/** Importe de una línea (o null si algún número no es válido). */
export function importeLinea(l: LineaEntrada): string | null {
  const q = centesimas(l.cantidad);
  const p = centesimas(l.precio_unitario);
  const d = centesimas(l.descuento_pct);
  if (q === null || p === null || d === null || d > 10000n) return null;
  const bruto = div(q * p, 100n);
  return texto(bruto - div(bruto * d, 10000n));
}

/** Totales, o null si hay algún dato inválido (la pantalla lo marca). */
export function calcularTotales(lineas: LineaEntrada[], descuento = "0"): Totales | null {
  let sub = 0n;
  let desc = 0n;
  for (const l of lineas) {
    const q = centesimas(l.cantidad);
    const p = centesimas(l.precio_unitario);
    const d = centesimas(l.descuento_pct);
    if (q === null || p === null || d === null || q <= 0n || d > 10000n) return null;
    const bruto = div(q * p, 100n);
    sub += bruto;
    desc += div(bruto * d, 10000n);
  }
  const g = centesimas(descuento);
  if (g === null || g > sub - desc) return null;
  const total = sub - desc - g;
  const vv = div(total * 100n, 118n);
  return { subtotal: texto(sub), descuento_lineas: texto(desc), descuento: texto(g), total: texto(total), valor_venta: texto(vv), igv: texto(total - vv) };
}
