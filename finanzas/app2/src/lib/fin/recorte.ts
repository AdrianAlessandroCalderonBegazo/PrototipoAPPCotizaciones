/**
 * Recorte de capturas de Yape: la pantalla es morada con una tarjeta blanca; para leerla bien se recorta esa
 * tarjeta (el OCR se confunde con el fondo). Puro: trabaja sobre los píxeles RGBA de un canvas.
 */
export type Caja = { x0: number; y0: number; x1: number; y1: number };

const blanco = (d: Uint8ClampedArray, w: number, x: number, y: number) => {
  const i = (y * w + x) * 4;
  return d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235;
};

/** Fracción de la imagen que es del morado de Yape (se muestrea; no recorre todos los píxeles). */
export function proporcionMorada(d: Uint8ClampedArray, w: number, h: number): number {
  let n = 0;
  let mor = 0;
  for (let y = 0; y < h; y += 4)
    for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      n++;
      if (d[i + 2] > 90 && d[i] > 70 && d[i + 1] < 40) mor++;
    }
  return n ? mor / n : 0;
}

/** La tarjeta blanca: filas y columnas donde más de la cuarta parte de lo muestreado es blanco. */
export function encontrarTarjeta(d: Uint8ClampedArray, w: number, h: number): Caja | null {
  const filas: number[] = [];
  for (let y = 0; y < h; y += 2) {
    let b = 0;
    let n = 0;
    for (let x = 0; x < w; x += 6) (n++, blanco(d, w, x, y) && b++);
    if (n && b / n > 0.25) filas.push(y);
  }
  if (!filas.length) return null;
  const y0 = Math.min(...filas);
  const y1 = Math.max(...filas);
  const cols: number[] = [];
  for (let x = 0; x < w; x += 2) {
    let b = 0;
    let n = 0;
    for (let y = y0; y < y1; y += 6) (n++, blanco(d, w, x, y) && b++);
    if (n && b / n > 0.25) cols.push(x);
  }
  if (!cols.length) return null;
  const caja = { x0: Math.min(...cols), y0, x1: Math.max(...cols), y1 };
  return caja.x1 - caja.x0 > w * 0.3 && caja.y1 - caja.y0 > h * 0.1 ? caja : null;
}

/** Franja del monto grande de Yape: entre "¡Yapeaste!" y el nombre. Si no se conocen esas líneas, una franja fija de la tarjeta. */
export function franjaMonto(altoTarjeta: number, yapeaste?: { bottom: number }, nombre?: { top: number }): { y0: number; y1: number } {
  if (yapeaste && nombre && nombre.top - yapeaste.bottom > 10) return { y0: Math.max(0, yapeaste.bottom - 2), y1: Math.min(altoTarjeta, nombre.top + 2) };
  return { y0: Math.round(altoTarjeta * 0.14), y1: Math.round(altoTarjeta * 0.3) };
}

/** Una línea de texto del OCR con su posición en la imagen. */
export type LineaOcr = { text: string; left: number; top: number; right: number; bottom: number };

/**
 * El OCR agrupa el texto en bloques, así que las columnas de una pantalla ("Enviado a" a la izquierda y el nombre a la derecha)
 * pueden llegar separadas. Se reconstruyen las filas visuales: las líneas cuyo centro vertical difiere menos de media altura se
 * unen de izquierda a derecha.
 */
export function filasVisuales(lineas: LineaOcr[]): string[] {
  const items = lineas
    .filter((l) => l.text.trim())
    .map((l) => ({ text: l.text.trim(), left: l.left, mid: (l.top + l.bottom) / 2, h: Math.max(1, l.bottom - l.top) }))
    .sort((a, b) => a.mid - b.mid);
  const filas: (typeof items)[] = [];
  for (const it of items) {
    const f = filas[filas.length - 1];
    if (f && Math.abs(f[0].mid - it.mid) <= Math.min(f[0].h, it.h) / 2) f.push(it);
    else filas.push([it]);
  }
  return filas.map((f) => f.sort((a, b) => a.left - b.left).map((x) => x.text).join(" "));
}
