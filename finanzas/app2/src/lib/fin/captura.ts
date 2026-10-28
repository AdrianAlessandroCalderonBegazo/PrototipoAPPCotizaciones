/**
 * Lee una captura de pago (Yape o BCP) y propone el movimiento. Puro (sin React Native): el OCR lo hace lector.ts
 * y aquí solo se interpretan las líneas de texto, así se prueba con Node con textos reales.
 *
 * Los dos formatos que usa ICR hoy:
 *  - Yape  "¡Yapeaste!": monto grande (sin decimales), nombre (a veces cortado: "Ricardo Coa*"), fecha y hora, mensaje opcional.
 *  - BCP   "¡Operación exitosa!": monto con decimales, "Enviado a", "Desde Cuenta Corriente ****2000", mensaje.
 */
import { SUBCATEGORIAS } from "./categorias";
import { buscarDuplicado, ordenMov, repartir } from "./calc";
import type { Cuenta, Mov, Para, Persona, TipoMov } from "./types";

export type FormatoCaptura = "YAPE" | "BCP" | "OTRO";
export type Captura = {
  formato: FormatoCaptura;
  monto: number; // 0 si no se pudo leer
  nombre: string;
  fecha: string; // "" si no se pudo leer
  hora: string; // HH:MM o ""
  mensaje: string;
  nro_operacion: string;
  /** Últimos 4 dígitos de la cuenta de la que salió (solo BCP). */
  referencia: string;
};

const MESES: Record<string, string> = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", set: "09", sep: "09", oct: "10", nov: "11", dic: "12" };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Minúsculas, sin tildes ni signos, espacios simples. */
export const norm = (s: string) => sinTildes(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function detectarFormato(texto: string): FormatoCaptura {
  const t = norm(texto);
  if (/yapeaste|codigo de seguridad/.test(t)) return "YAPE";
  if (/operacion exitosa|enviado a|numero de operacion/.test(t)) return "BCP";
  return "OTRO";
}

function fechaHora(texto: string): { fecha: string; hora: string } {
  const f = /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-záéíóú]*\.?\s+(\d{4})/i.exec(sinTildes(texto));
  const h = /(\d{1,2}):(\d{2})\s*([ap])\.?\s?m/i.exec(texto);
  let hora = "";
  if (h) {
    let hh = Number(h[1]) % 12;
    if (h[3].toLowerCase() === "p") hh += 12;
    hora = `${String(hh).padStart(2, "0")}:${h[2]}`;
  }
  return { fecha: f ? `${f[3]}-${MESES[f[2].toLowerCase()]}-${f[1].padStart(2, "0")}` : "", hora };
}

/** "S/ 1,234.50" → 1234.5 ; "S/11" → 11 ; "20" → 20. */
export function leerMonto(s: string): number {
  const m = /(\d[\d.,]*)/.exec(s.replace(/\s/g, ""));
  if (!m) return 0;
  let n = m[1];
  const dec = /[.,](\d{1,2})$/.exec(n);
  n = dec ? n.slice(0, n.length - dec[0].length).replace(/[.,]/g, "") + "." + dec[1] : n.replace(/[.,]/g, "");
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Quita las "letras sueltas" que el OCR lee del ícono que va antes del mensaje ("YH Menú…" → "Menú…"). */
const sinRuido = (s: string) => s.replace(/^(?:[^\p{L}\d]*[A-Z]{1,2}(?=\s)\s+)+/u, "").replace(/^[^\p{L}\d]+/u, "").trim();

export function parseCaptura(lineas: string[], montoBanda = ""): Captura {
  const L = lineas.map((l) => l.trim()).filter(Boolean);
  const texto = L.join("\n");
  const formato = detectarFormato(texto);
  const out: Captura = { formato, monto: 0, nombre: "", fecha: "", hora: "", mensaje: "", nro_operacion: "", referencia: "" };
  const { fecha, hora } = fechaHora(texto);
  out.fecha = fecha;
  out.hora = hora;
  const nro = /operaci[oó]n\D{0,6}(\d{6,})/i.exec(texto.replace(/\n/g, " "));
  out.nro_operacion = nro?.[1] ?? "";

  if (formato === "YAPE") {
    const iy = L.findIndex((l) => /yapeaste/i.test(l));
    // monto: el que se leyó aparte en la franja grande; si no, una línea "S/ 11" suelta
    out.monto = leerMonto(montoBanda) || leerMonto(L.find((l) => /^S\s*\/\s*\d/i.test(l)) ?? "");
    // nombre: la primera línea después de "¡Yapeaste!" que no sea el monto ni la fecha
    for (let i = iy + 1; i < L.length; i++) {
      if (/^S\s*\/\s*\d/i.test(L[i]) || /^\d+([.,]\d+)?$/.test(L[i])) continue;
      if (fechaHora(L[i]).fecha || /c[oó]digo de seguridad/i.test(L[i])) break;
      out.nombre = L[i].replace(/^[^\p{L}\d]+/u, "").trim();
      break;
    }
    // mensaje: lo que haya entre la línea de fecha y "CÓDIGO DE SEGURIDAD"
    const id = L.findIndex((l) => fechaHora(l).fecha);
    const ic = L.findIndex((l) => /c[oó]digo de seguridad/i.test(l));
    if (id >= 0 && ic > id + 1) out.mensaje = sinRuido(L.slice(id + 1, ic).join(" "));
  } else if (formato === "BCP") {
    const m = /S\s*\/\s*([\d.,]+)/i.exec(texto);
    out.monto = m ? leerMonto(m[1]) : leerMonto(montoBanda);
    const ie = L.findIndex((l) => /enviado a/i.test(l));
    if (ie >= 0) {
      const mismo = L[ie].replace(/^.*enviado a\s*/i, "").trim();
      out.nombre = mismo || L[ie + 1] || "";
    }
    const idesde = L.findIndex((l) => /^desde\b/i.test(l));
    if (idesde >= 0) {
      const d = L.slice(idesde, idesde + 3).join(" ").match(/\b(\d{4})\b/);
      out.referencia = d?.[1] ?? "";
    }
    const im = L.findIndex((l) => /^mensaje/i.test(l));
    if (im >= 0) out.mensaje = L.slice(im + 1).join(" ").trim();
  }
  return out;
}

// ---- sugerencias --------------------------------------------------------------------------------------------------

/** ¿Coincide el nombre de la captura con el de una persona? Cada palabra de la captura debe ser el comienzo de una palabra distinta del nombre ("Coa*", "Jose A Merma M"). */
export function coincideNombre(capturado: string, nombre: string): boolean {
  const a = norm(capturado).split(" ").filter(Boolean);
  const b = norm(nombre).split(" ").filter(Boolean);
  if (!a.length || a.length > b.length) return false;
  if (a.join(" ") === b.join(" ")) return true;
  if (a.length < 2) return false; // una sola palabra no basta para dar por buena una coincidencia parcial
  const usadas = new Set<number>();
  return a.every((t) => {
    const j = b.findIndex((w, i) => !usadas.has(i) && w.startsWith(t));
    if (j < 0) return false;
    usadas.add(j);
    return true;
  });
}

/** La persona de la libreta que corresponde a ese nombre (por alias o por nombre); undefined si no hay una única. */
export function buscarPersona(nombre: string, personas: Persona[]): Persona | undefined {
  if (!norm(nombre)) return undefined;
  const activos = personas.filter((p) => p.activa);
  const alias = activos.filter((p) => p.alias.some((a) => norm(a) === norm(nombre)));
  if (alias.length === 1) return alias[0];
  const c = activos.filter((p) => coincideNombre(nombre, p.nombre) || p.alias.some((a) => coincideNombre(nombre, a)));
  return c.length === 1 ? c[0] : undefined;
}

/** Nombres de pila de un mensaje tipo "Menú Hernán y Cristian" → personas del equipo (nunca proveedores). */
export function personasEnMensaje(mensaje: string, personas: Persona[]): { encontradas: Persona[]; sinReconocer: string[] } {
  const resto = mensaje.replace(/^\s*(men[uú]|almuerzo|desayuno|cena|pasajes?|pax)(?=[\s:-]|$)[:\s-]*/i, "");
  const nombres = resto.split(/,|\s+y\s+|\s+e\s+|\s*\/\s*/i).map((s) => s.trim()).filter(Boolean);
  const equipo = personas.filter((p) => p.activa && p.tipo !== "PROVEEDOR");
  const encontradas: Persona[] = [];
  const sinReconocer: string[] = [];
  for (const n of nombres) {
    const k = norm(n);
    if (!k) continue;
    // por la primera palabra del nombre; si hay más de una persona con ese nombre de pila, no se adivina
    const c = equipo.filter((p) => {
      const t = norm(p.nombre).split(" ");
      return k.split(" ").every((w, i) => t[i] === w) || p.alias.some((a) => norm(a) === k);
    });
    if (c.length === 1 && !encontradas.includes(c[0])) encontradas.push(c[0]);
    else if (c.length !== 1) sinReconocer.push(n);
  }
  return { encontradas, sinReconocer };
}

const PALABRAS: [RegExp, string, string][] = [
  [/\b(menu|almuerzo|desayuno|cena)\b/, "Viáticos", "Menú"],
  [/\b(gasolina|combustible|grifo|petroleo|diesel)\b/, "Movilidad", "Combustible"],
  [/\b(pax|pasaje|pasajes|bus|taxi|movilidad)\b/, "Movilidad", "Pasajes"],
  [/\b(alojamiento|hospedaje|hotel)\b/, "Viáticos", "Alojamiento"],
];
export function categoriaDeMensaje(mensaje: string): { categoria: string; subcategoria: string } | undefined {
  const t = norm(mensaje);
  const p = PALABRAS.find(([re]) => re.test(t));
  return p ? { categoria: p[1], subcategoria: p[2] } : undefined;
}

const SIGLAS: Record<string, string> = { pax: "Pasaje", aqp: "AQP", aqo: "AQP", mlq: "MOQ", moq: "MOQ" };
/** "pax aqp mlq" → "Pasaje AQP MOQ" (lo demás se deja tal cual). */
export const expandirMensaje = (m: string) => m.split(/\s+/).map((w) => SIGLAS[norm(w)] ?? w).join(" ").trim();

/** Lo que ya se hizo antes con ese destinatario: la categoría más usada y lo último que se escribió con ella. */
export function memoriaDe(movs: Mov[], personaId: string, nombre: string) {
  const k = norm(nombre);
  const previos = movs.filter((m) => m.tipo === "EGRESO" && ((personaId && m.pagado_a_id === personaId) || (k && norm(m.pagado_a) === k))).sort(ordenMov).slice(-20);
  if (!previos.length) return undefined;
  const cuenta = new Map<string, number>();
  for (const m of previos) cuenta.set(`${m.categoria}|${m.subcategoria}`, (cuenta.get(`${m.categoria}|${m.subcategoria}`) ?? 0) + 1);
  const [mejor] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  const [categoria, subcategoria] = mejor.split("|");
  const ultimo = [...previos].reverse().find((m) => m.categoria === categoria && m.subcategoria === subcategoria)!;
  return { categoria, subcategoria, concepto: ultimo.concepto, para: ultimo.para };
}

export type Borrador = {
  tipo: TipoMov;
  fecha: string;
  hora: string;
  cuenta_id: string;
  destino_id: string;
  monto: number;
  categoria: string;
  subcategoria: string;
  concepto: string;
  pagado_a: string;
  pagado_a_id: string;
  para: Para[];
  nro_operacion: string;
  /** Cosas que la persona debe mirar antes de confirmar. */
  avisos: string[];
  duplicadoDe?: Mov;
  /** El destinatario es otra cuenta propia (p. ej. el Yape de Diego): probablemente un traspaso. */
  sugiereTraspaso: boolean;
};

export type Contexto = { cuentas: Cuenta[]; personas: Persona[]; movs: Mov[]; miCuentaId: string; hoy: string; ahora: string };

/** Convierte lo leído en un borrador de movimiento, usando la libreta, el historial y las cuentas. */
export function sugerir(c: Captura, ctx: Contexto): Borrador {
  const avisos: string[] = [];
  if (c.formato === "OTRO") avisos.push("No reconocí el tipo de captura: revisa todos los datos.");
  if (!c.monto) avisos.push("No pude leer el monto: escríbelo.");
  if (!c.fecha) avisos.push("No pude leer la fecha: se puso la de hoy.");

  // cuenta de origen: BCP por los últimos 4 dígitos; Yape, la de quien registra
  const activas = ctx.cuentas.filter((x) => x.activa);
  let cuenta = c.formato === "BCP" ? activas.find((x) => x.tipo === "BANCO" && c.referencia && x.referencia === c.referencia) : undefined;
  if (!cuenta && c.formato === "BCP" && c.referencia) avisos.push(`No encuentro una cuenta del banco que termine en ${c.referencia}: elige de cuál salió.`);
  cuenta ??= activas.find((x) => x.id === ctx.miCuentaId) ?? activas.find((x) => x.tipo === "YAPE");

  const persona = buscarPersona(c.nombre, ctx.personas);
  // ¿se le pagó a otra de nuestras cuentas? (p. ej. del banco al Yape de Diego)
  const propia = activas.find((x) => {
    if (x.id === cuenta?.id || x.tipo === "BANCO" || !x.titular) return false;
    if (coincideNombre(c.nombre, x.titular)) return true;
    // titular con una sola palabra ("Diego"): basta el primer nombre, salvo que el destinatario sea otra persona de la libreta
    const t = norm(x.titular).split(" ");
    return t.length === 1 && !persona && norm(c.nombre).split(" ")[0] === t[0];
  });

  const delMensaje = categoriaDeMensaje(c.mensaje);
  const recuerdo = memoriaDe(ctx.movs, persona?.id ?? "", c.nombre);
  const categoria = delMensaje?.categoria ?? recuerdo?.categoria ?? "";
  const subcategoria = delMensaje ? delMensaje.subcategoria : recuerdo?.subcategoria ?? "";
  const concepto = c.mensaje ? expandirMensaje(c.mensaje) : recuerdo?.concepto ?? "";

  // para quién: los nombres del mensaje; si no, lo que se hizo la vez anterior con este destinatario
  let para: Para[] = [];
  if (c.mensaje) {
    const { encontradas, sinReconocer } = personasEnMensaje(c.mensaje, ctx.personas);
    if (encontradas.length) para = repartir(c.monto, encontradas.map((p) => p.id));
    if (sinReconocer.length && /^\s*men[uú]/i.test(c.mensaje)) avisos.push(`No reconocí a: ${sinReconocer.join(", ")}. Agrégalos a la libreta o elige a mano para quién fue.`);
  } else if (recuerdo?.para.length) para = recuerdo.para.length === 1 ? [{ persona_id: recuerdo.para[0].persona_id, monto: c.monto }] : [];

  if (categoria === "Viáticos" && subcategoria === "Menú") {
    const planilla = para.map((p) => ctx.personas.find((x) => x.id === p.persona_id)).filter((p): p is Persona => !!p && p.tipo === "PLANILLA");
    if (planilla.length) avisos.push(`${planilla.map((p) => p.nombre).join(", ")} está en planilla: no recibe menú.`);
  }
  const dup = buscarDuplicado(ctx.movs, c.nro_operacion);
  if (dup) avisos.push(`Esta operación (${c.nro_operacion}) ya está registrada.`);

  const sugiereTraspaso = !!propia;
  return {
    tipo: sugiereTraspaso ? "TRASPASO" : "EGRESO",
    fecha: c.fecha || ctx.hoy,
    hora: c.hora || ctx.ahora,
    cuenta_id: cuenta?.id ?? "",
    destino_id: propia?.id ?? "",
    monto: c.monto,
    categoria: sugiereTraspaso ? "" : categoria,
    subcategoria: sugiereTraspaso ? "" : subcategoria,
    concepto,
    pagado_a: c.nombre,
    pagado_a_id: persona?.id ?? "",
    para: sugiereTraspaso ? [] : para,
    nro_operacion: c.nro_operacion,
    avisos,
    duplicadoDe: dup,
    sugiereTraspaso,
  };
}

/** Subcategorías válidas para una categoría (para los selectores). */
export const subcategoriasDe = (categoria: string) => SUBCATEGORIAS[categoria] ?? [];
