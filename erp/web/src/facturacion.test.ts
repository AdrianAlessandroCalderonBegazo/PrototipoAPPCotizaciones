import { describe, expect, it } from "vitest";
import { linea, reglas, totales } from "./paginas/facturacion/calculo";
import type { ItemCpe } from "./tipos";

const it1: ItemCpe = { descripcion: "Hito", unidad: "ZZ", cantidad: "1", valor_unitario: "57,966.10" };
const it2: ItemCpe = { descripcion: "Conector MC4", unidad: "NIU", cantidad: "3", valor_unitario: "12.3456" };
const base = { tipo: "factura" as const, cliente_doc: "20605309489", cliente_nombre: "Granja", moneda: "PEN" as const, forma_pago: "contado" as const, cuotas: [], items: [it1] };

describe("facturación: misma cuenta que el servidor", () => {
  it("IGV por línea sobre el valor sin IGV", () => {
    expect(linea(it1)).toEqual({ valor_venta: "57966.10", igv: "10433.90", importe: "68400.00" });
    expect(linea(it2)).toEqual({ valor_venta: "37.04", igv: "6.67", importe: "43.71" });
    expect(totales([it1, it2])).toMatchObject({ op_gravada: "58003.14", igv: "10440.57", total: "68443.71", completos: true });
    expect(linea({ cantidad: "1", valor_unitario: "1.23456" })).toBeNull();
  });
  it("reglas: RUC para factura, DNI desde S/ 700 en boleta, cuotas que suman el total", () => {
    expect(reglas(base, null).every((r) => r.ok)).toBe(true);
    expect(reglas({ ...base, cliente_doc: "20605309488" }, null)[0].ok).toBe(false);
    const boleta = { ...base, tipo: "boleta" as const, cliente_doc: "", cliente_nombre: "", items: [{ descripcion: "Panel", unidad: "NIU" as const, cantidad: "2", valor_unitario: "339.00" }] };
    expect(reglas(boleta, null).find((r) => r.texto.startsWith("Boletas"))!.ok).toBe(false);
    expect(reglas({ ...boleta, items: [{ ...boleta.items[0], cantidad: "1" }] }, null).every((r) => r.ok)).toBe(true);
    const credito = { ...base, forma_pago: "credito" as const, cuotas: [{ fecha: "2999-01-01", monto: "34200" }, { fecha: "2999-02-01", monto: "34200.00" }] };
    expect(reglas(credito, null).every((r) => r.ok)).toBe(true);
    expect(reglas({ ...credito, cuotas: credito.cuotas.slice(1) }, null).some((r) => !r.ok)).toBe(true);
  });
});
