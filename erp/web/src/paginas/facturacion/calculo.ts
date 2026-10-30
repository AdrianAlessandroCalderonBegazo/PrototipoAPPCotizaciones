// Misma cuenta que servidor/api/src/facturacion.js (vista previa mientras se escribe; el servidor manda).
// Valor de venta = cantidad × valor unitario (sin IGV); IGV de la línea = 18 % del valor de venta; total = op. gravada + IGV.
import { rucValido } from "../../formato";
import type { CuotaCpe, ItemCpe, Regla, TipoCpe, TotalesCpe } from "../../tipos";

function decimal(v: string | undefined, dec: number): bigint | null {
  let s = String(v ?? "").trim();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!new RegExp(`^\\d{1,12}(\\.\\d{1,${dec}})?$`).test(s)) return null;
  const [e, d = ""] = s.split(".");
  return BigInt(e) * 10n ** BigInt(dec) + BigInt(d.padEnd(dec, "0"));
}
const div = (a: bigint, b: bigint) => (a * 2n + b) / (b * 2n);
const texto = (c: bigint) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
export const centimos = (v: string | null | undefined) => decimal(v ?? "", 2);

/** Valor de venta e IGV de una línea, o null si algún número no es válido. */
export function linea(i: Pick<ItemCpe, "cantidad" | "valor_unitario">): { valor_venta: string; igv: string; importe: string } | null {
  const q = decimal(i.cantidad, 2);
  const v = decimal(i.valor_unitario, 4);
  if (q === null || v === null || q <= 0n || v <= 0n) return null;
  const vv = div(q * v, 10000n);
  const ig = div(vv * 18n, 100n);
  return { valor_venta: texto(vv), igv: texto(ig), importe: texto(vv + ig) };
}

export function totales(items: ItemCpe[]): TotalesCpe & { completos: boolean } {
  let g = 0n;
  let ig = 0n;
  let completos = items.length > 0;
  for (const i of items) {
    const l = linea(i);
    if (!l || !i.descripcion.trim()) {
      completos = false;
      continue;
    }
    g += decimal(l.valor_venta, 2)!;
    ig += decimal(l.igv, 2)!;
  }
  return { op_gravada: texto(g), igv: texto(ig), total: texto(g + ig), completos };
}

const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/** Las mismas reglas que revisa el servidor antes de abrir SUNAT. */
export function reglas(f: { tipo: TipoCpe; cliente_doc: string; cliente_nombre: string; moneda: "PEN" | "USD"; forma_pago: "contado" | "credito"; cuotas: CuotaCpe[]; items: ItemCpe[] }, tc: string | null): Regla[] {
  const doc = f.cliente_doc.trim();
  const t = totales(f.items);
  const total = decimal(t.total, 2) ?? 0n;
  const tcN = tc ? decimal(tc, 4) : null;
  const totalSoles = f.moneda === "USD" ? (tcN ? div(total * tcN, 10000n) : null) : total;
  const factura = f.tipo === "factura";
  const out: Regla[] = [];
  if (factura) out.push({ ok: rucValido(doc), texto: "RUC del cliente válido (11 dígitos y dígito verificador)" });
  else {
    out.push({ ok: !doc || /^\d{8}$/.test(doc) || rucValido(doc), texto: "Documento del cliente con formato válido (DNI de 8 dígitos o RUC)" });
    out.push({ ok: !!doc || (totalSoles !== null && totalSoles < 70000n), texto: "Boletas desde S/ 700.00 identifican al cliente (DNI o RUC)" });
  }
  const pideNombre = factura || !!doc;
  out.push({ ok: !pideNombre || !!f.cliente_nombre.trim(), texto: factura ? "Razón social del cliente" : "Nombre del cliente (si tiene documento)" });
  out.push({ ok: t.completos && total > 0n, texto: "Todos los ítems con descripción, cantidad y valor; total mayor a 0" });
  if (f.forma_pago === "credito") {
    const suma = f.cuotas.reduce((s, q) => s + (decimal(q.monto, 2) ?? 0n), 0n);
    out.push({ ok: f.cuotas.length > 0 && suma === total, texto: "Las cuotas suman el total del comprobante" });
    out.push({ ok: f.cuotas.every((q) => q.fecha > hoyLima()), texto: "Las cuotas vencen después de hoy" });
  }
  return out;
}
