// Lee en el navegador una lista de precios (Excel, CSV o PDF) y la devuelve como tablas de texto. No sube el archivo:
// al servidor solo van las filas ya mapeadas.
import { leerCsv } from "../cotizacion/csv";

export type Tabla = { nombre: string; filas: string[][]; encabezado: number };
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const PISTAS = /^(n°|nº|item|cod|codigo|sku|ref|descripcion|producto|detalle|marca|modelo|precio|p\.? ?unit|pvp|moneda|unidad|und|stock|categoria)/;

/** La fila de títulos: la primera de las 15 primeras con más celdas que parecen títulos. */
export function filaDeTitulos(filas: string[][]): number {
  let mejor = 0;
  let puntos = 0;
  filas.slice(0, 15).forEach((f, i) => {
    const p = f.filter((c) => PISTAS.test(sinTildes(c))).length;
    if (p > puntos) [mejor, puntos] = [i, p];
  });
  return mejor;
}

async function leerExcel(archivo: File): Promise<Tabla[]> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  await wb.xlsx.load(await archivo.arrayBuffer());
  return wb.worksheets.map((ws) => {
    const filas: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") {
          const o = v as { result?: unknown; text?: string; richText?: { text: string }[]; hyperlink?: string };
          if (o.richText) return o.richText.map((x) => x.text).join("");
          if (o.text !== undefined) return String(o.text);
          if (o.result !== undefined) return String(o.result);
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          return "";
        }
        return String(v);
      });
      if (vals.some((x) => x.trim())) filas.push(vals.map((x) => x.trim()));
    });
    return { nombre: ws.name, filas, encabezado: filaDeTitulos(filas) };
  });
}

type Pedazo = { x: number; fin: number; y: number; alto: number; t: string };
/**
 * PDF: junta el texto por renglones (misma altura) y lo parte en celdas donde hay un espacio grande. Si encuentra la fila
 * de títulos, ordena las celdas de cada renglón según la columna de los títulos (aunque falte alguna celda).
 */
async function leerPdf(archivo: File): Promise<Tabla[]> {
  const pdfjs = await import("pdfjs-dist");
  const trabajador = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = trabajador;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const renglones: Pedazo[][] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 80); n++) {
    const pag = await doc.getPage(n);
    const tc = await pag.getTextContent();
    const piezas = (tc.items as { str: string; transform: number[]; width: number; height: number }[])
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ x: i.transform[4], fin: i.transform[4] + i.width, y: i.transform[5], alto: Math.abs(i.transform[3]) || i.height || 8, t: i.str }));
    piezas.sort((a, b) => b.y - a.y || a.x - b.x);
    const propios: Pedazo[][] = [];
    for (const p of piezas) {
      const r = propios.find((g) => Math.abs(g[0].y - p.y) <= Math.max(2, p.alto * 0.35));
      if (r) r.push(p);
      else propios.push([p]);
    }
    for (const r of propios) renglones.push(r.sort((a, b) => a.x - b.x));
  }
  // celdas por espacios grandes
  const celdas = renglones.map((r) => {
    const out: Pedazo[] = [];
    for (const p of r) {
      const ult = out[out.length - 1];
      if (ult && p.x - ult.fin <= Math.max(4, p.alto * 0.6)) Object.assign(ult, { fin: Math.max(ult.fin, p.fin), t: `${ult.t} ${p.t}`.replace(/\s+/g, " ") });
      else out.push({ ...p });
    }
    return out;
  });
  const texto = celdas.map((r) => r.map((c) => c.t.trim()));
  const enc = filaDeTitulos(texto);
  const titulos = celdas[enc] ?? [];
  if (titulos.length < 2) return [{ nombre: "PDF", filas: texto, encabezado: enc }];
  // límites de columna = puntos medios entre los centros de los títulos
  const centros = titulos.map((c) => (c.x + c.fin) / 2);
  const limites = centros.slice(1).map((c, i) => (c + centros[i]) / 2);
  const porCentro = (c: Pedazo) => {
    const m = (c.x + c.fin) / 2;
    const i = limites.findIndex((l) => m < l);
    return i < 0 ? limites.length : i;
  };
  // 2.ª pasada: dónde empieza de verdad cada columna (mediana del inicio de sus celdas). Así un texto corto que cae
  // cerca del título anterior (ej. una descripción breve) va a su columna por dónde empieza, no por su centro.
  const inicios = titulos.map((t, k) => {
    const xs = celdas.slice(enc + 1).flatMap((r) => r.filter((c) => porCentro(c) === k).map((c) => c.x)).sort((a, b) => a - b);
    return xs.length >= 3 ? xs[Math.floor(xs.length / 2)] : t.x;
  });
  const ordenados = inicios.every((v, i) => i === 0 || v > inicios[i - 1]);
  const columna = (c: Pedazo) => {
    if (!ordenados) return porCentro(c);
    let k = 0;
    // margen hacia la izquierda: un 30 % del espacio con la columna anterior (los montos alineados a la derecha empiezan antes)
    inicios.forEach((v, i) => void (c.x >= v - (i ? Math.max(2, (v - inicios[i - 1]) * 0.3) : 0) && (k = i)));
    return k;
  };
  const tituloTxt = texto[enc].join("|");
  const filas = [texto[enc]];
  celdas.forEach((r, i) => {
    if (i <= enc || texto[i].join("|") === tituloTxt) return; // títulos repetidos en cada página
    const f = new Array<string>(titulos.length).fill("");
    for (const c of r) {
      const k = columna(c);
      f[k] = f[k] ? `${f[k]} ${c.t}` : c.t;
    }
    filas.push(f.map((x) => x.trim()));
  });
  return [{ nombre: "PDF", filas, encabezado: 0 }];
}

export async function leerArchivo(archivo: File): Promise<Tabla[]> {
  const ext = archivo.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return leerPdf(archivo);
  if (ext === "xlsx") return leerExcel(archivo);
  if (ext === "csv" || ext === "txt") {
    const filas = leerCsv(await archivo.text());
    return [{ nombre: archivo.name, filas, encabezado: filaDeTitulos(filas) }];
  }
  throw new Error("Usa un archivo Excel (.xlsx), CSV o PDF.");
}

// ---- mapeo de columnas ----
export const CAMPOS_LISTA: { k: string; l: string }[] = [
  { k: "", l: "No importar" },
  { k: "codigo", l: "Código" },
  { k: "descripcion", l: "Descripción" },
  { k: "marca", l: "Marca" },
  { k: "modelo", l: "Modelo" },
  { k: "categoria", l: "Categoría" },
  { k: "unidad", l: "Unidad" },
  { k: "precio", l: "Precio" },
  { k: "moneda", l: "Moneda" },
  { k: "disponibilidad", l: "Disponibilidad / stock" },
  { k: "caracteristicas", l: "Características" },
];
const PISTA_CAMPO: [string, RegExp][] = [
  ["codigo", /^(cod|codigo|sku|ref|referencia|part ?n|n° ?parte)/],
  ["descripcion", /^(descripcion|producto|detalle|articulo|nombre)/],
  ["marca", /^(marca|brand|fabricante)/],
  ["modelo", /^(modelo|model)/],
  ["categoria", /^(categoria|familia|linea|rubro)/],
  ["unidad", /^(unidad|und|u\.?m)/],
  ["precio", /^(precio|p\.? ?unit|pvp|venta|price|valor)/],
  ["moneda", /^(moneda|currency)$/],
  ["disponibilidad", /^(stock|disponib|existencia)/],
  ["caracteristicas", /^(caracteristicas|especificaciones|comentarios|observaciones)/],
];
/** Propuesta de mapeo a partir de los títulos; si el proveedor ya tiene uno guardado (título → campo), se usa ese. */
export function mapeoInicial(titulos: string[], guardado?: Record<string, string> | null): string[] {
  const usados = new Set<string>();
  return titulos.map((t) => {
    const n = sinTildes(t);
    const g = guardado?.[n];
    if (g !== undefined && !usados.has(g)) return usados.add(g), g;
    const p = PISTA_CAMPO.find(([k, re]) => re.test(n) && !usados.has(k));
    if (p) usados.add(p[0]);
    return p?.[0] ?? "";
  });
}
export const claveTitulo = sinTildes;

/** Filas del archivo → filas para el servidor. Las filas con una sola celda (títulos de sección) se usan como categoría si se pide. */
export function filasParaImportar(t: Tabla, mapeo: string[], seccionesComoCategoria: boolean): Record<string, string | number | null>[] {
  const out: Record<string, string | number | null>[] = [];
  let seccion: string | null = null;
  t.filas.forEach((f, i) => {
    if (i <= t.encabezado) return;
    const llenas = f.filter((c) => c && c.trim());
    if (seccionesComoCategoria && llenas.length === 1 && !/\d/.test(llenas[0]?.replace(/^\d+\.?\s*/, "") ?? "x")) {
      seccion = llenas[0];
      return;
    }
    if (!llenas.length) return;
    const r: Record<string, string | number | null> = { fila: i + 1 };
    mapeo.forEach((campo, j) => {
      if (campo && f[j] !== undefined && f[j] !== "") r[campo] = r[campo] ? `${r[campo]} ${f[j]}` : f[j];
    });
    if (seccionesComoCategoria && !r.categoria && seccion) r.categoria = seccion;
    out.push(r);
  });
  return out;
}
