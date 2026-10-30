// Lector de CSV del navegador: separado por comas o punto y coma, con comillas, en UTF-8 (también con BOM).

export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primera = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : primera.includes("\t") && !primera.includes(",") ? "\t" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo);
      if (fila.some((x) => x.trim() !== "")) filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== "")) filas.push(fila);
  return filas.map((f) => f.map((x) => x.trim()));
}

export const CAMPOS: { k: string; l: string }[] = [
  { k: "", l: "No importar" },
  { k: "codigo", l: "Código" },
  { k: "nombre", l: "Nombre" },
  { k: "marca", l: "Marca" },
  { k: "modelo", l: "Modelo" },
  { k: "categoria", l: "Categoría" },
  { k: "unidad", l: "Unidad" },
  { k: "precio", l: "Precio de venta (con IGV)" },
  { k: "costo", l: "Costo" },
  { k: "moneda", l: "Moneda" },
  { k: "caracteristicas", l: "Características" },
];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const PISTAS: [string, RegExp][] = [
  ["codigo", /^(cod|codigo|sku|ref|referencia|item|part ?n)/],
  ["nombre", /^(nombre|descripcion|producto|detalle|articulo)/],
  ["marca", /^marca|^brand/],
  ["modelo", /^modelo|^model/],
  ["categoria", /^(categoria|familia|linea|rubro)/],
  ["unidad", /^(unidad|und|u\.?m)/],
  ["precio", /^(precio|pvp|p\.? ?venta|venta|price)/],
  ["costo", /^(costo|cost|compra)/],
  ["moneda", /^(moneda|currency|mon)$/],
  ["caracteristicas", /^(caracteristicas|especificaciones|specs|notas)/],
];

/** Mapeo automático por el título de cada columna (la persona lo puede cambiar). */
export function mapeoAutomatico(titulos: string[]): string[] {
  const usados = new Set<string>();
  return titulos.map((t) => {
    const s = sinTildes(t);
    const hit = PISTAS.find(([k, re]) => !usados.has(k) && re.test(s));
    if (!hit) return "";
    usados.add(hit[0]);
    return hit[0];
  });
}
