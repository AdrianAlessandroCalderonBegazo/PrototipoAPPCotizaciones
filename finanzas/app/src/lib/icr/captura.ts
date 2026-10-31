/**
 * Lee una captura de pago (Yape o BCP) y propone el gasto digital de la Caja ICR. Puro (sin React Native): el OCR lo hace lector.ts
 * y aquí solo se interpretan las líneas de texto, así se prueba con Node con textos reales.
 *
 * Los dos formatos que usa ICR hoy:
 *  - Yape  "¡Yapeaste!": monto grande (sin decimales), nombre (a veces cortado: "Ricardo Coa*"), fecha y hora, mensaje opcional.
 *  - BCP   "¡Operación exitosa!": monto con decimales, "Enviado a", "Desde Cuenta Corriente ****2000", mensaje.
 */

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

// ---- sugerencia para la Caja ICR ----------------------------------------------------------------------------------

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

export type Borrador = {
  fecha: string;
  monto: string;
  destinatario: string;
  operacion: string;
  descripcion: string;
  categoria: string;
  subcategoria: string;
  /** Cosas que la persona debe mirar antes de registrar. */
  avisos: string[];
};

/** Lo leído → borrador del gasto digital. Lo que no se pudo leer queda vacío (nunca se inventa) y se avisa. */
export function sugerir(c: Captura, hoy: string, categorias: readonly string[] = []): Borrador {
  const avisos: string[] = [];
  if (c.formato === "OTRO") avisos.push("No reconocí el tipo de captura: revisa todos los datos.");
  if (!c.monto) avisos.push("No pude leer el monto: escríbelo.");
  if (!c.fecha) avisos.push("No pude leer la fecha: se puso la de hoy.");
  if (c.fecha && c.fecha > hoy) avisos.push("La fecha leída es futura: revísala.");
  const delMensaje = categoriaDeMensaje(c.mensaje);
  const categoria = delMensaje && (!categorias.length || categorias.includes(delMensaje.categoria)) ? delMensaje.categoria : "";
  const mensaje = c.mensaje ? expandirMensaje(c.mensaje) : "";
  const quien = c.nombre.replace(/[*!]+$/, "").trim();
  const descripcion = [delMensaje && !mensaje.toLowerCase().includes(delMensaje.subcategoria.toLowerCase()) ? delMensaje.subcategoria : "", mensaje].filter(Boolean).join(" · ")
    || (quien ? `${c.formato === "BCP" ? "Transferencia" : "Yape"} a ${quien}` : "");
  return {
    fecha: c.fecha && c.fecha <= hoy ? c.fecha : hoy,
    monto: c.monto ? c.monto.toFixed(2) : "",
    destinatario: c.nombre,
    operacion: c.nro_operacion,
    descripcion,
    categoria,
    subcategoria: "",
    avisos,
  };
}
