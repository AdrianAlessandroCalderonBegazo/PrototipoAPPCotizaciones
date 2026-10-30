import { describe, expect, it } from "vitest";
import { filaDeTitulos, filasParaImportar, mapeoInicial } from "./paginas/comparador/lector";

describe("lector de listas de proveedores", () => {
  const filas = [
    ["LISTA DE PRECIOS 2026"],
    ["", ""],
    ["ITEM", "CÓDIGO", "DESCRIPCIÓN", "MODELO", "PRECIO"],
    ["CARGADORES"],
    ["1", "BPC121031064R", "CARGADOR BLUE SMART IP65 12/10", "(BPC121031064R)", "$123.00"],
    ["2", "BPC122045064R", "CARGADOR BLUE SMART IP65 12/15", "", "$140.00"],
    ["INVERSORES"],
    ["3", "PMP482305012", "MULTIPLUS-II 48/3000/35-32", "", "$1,190.00"],
  ];
  it("encuentra la fila de títulos", () => expect(filaDeTitulos(filas)).toBe(2));
  it("propone el mapeo y respeta el guardado del proveedor", () => {
    expect(mapeoInicial(filas[2])).toEqual(["", "codigo", "descripcion", "modelo", "precio"]);
    expect(mapeoInicial(filas[2], { item: "codigo", codigo: "" })[0]).toBe("codigo");
  });
  it("usa los títulos de sección como categoría y conserva el número de fila", () => {
    const r = filasParaImportar({ nombre: "x", filas, encabezado: 2 }, ["", "codigo", "descripcion", "modelo", "precio"], true);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ fila: 5, codigo: "BPC121031064R", categoria: "CARGADORES", precio: "$123.00" });
    expect(r[2]).toMatchObject({ fila: 8, categoria: "INVERSORES" });
    expect(r[1].modelo).toBeUndefined();
    const sin = filasParaImportar({ nombre: "x", filas, encabezado: 2 }, ["", "codigo", "descripcion", "modelo", "precio"], false);
    expect(sin.some((f) => f.categoria)).toBe(false);
  });
});
