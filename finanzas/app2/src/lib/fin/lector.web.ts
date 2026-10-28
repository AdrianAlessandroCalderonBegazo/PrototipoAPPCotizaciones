/**
 * Lector de capturas en la PWA: Tesseract.js (WASM, archivos propios en /tesseract/) más un preproceso pensado para
 * las capturas de Yape: se recorta la tarjeta blanca (el fondo morado confunde al OCR) y el monto grande se lee
 * aparte, en su franja, reducido (Tesseract no lee bien números gigantes). Las del BCP se leen enteras.
 * Un mismo lector sirve para varias capturas (el motor tarda en arrancar; así solo se paga una vez).
 */
import { parseCaptura, type Captura } from "./captura";
import { encontrarTarjeta, filasVisuales, franjaMonto, proporcionMorada, type LineaOcr } from "./recorte";

export type Lector = { leer(uri: string): Promise<Captura>; cerrar(): Promise<void> };

type Linea = LineaOcr;

function cargarImagen(uri: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("No se pudo abrir la imagen."));
    img.src = uri;
  });
}

function lienzo(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Prepara la imagen: si es de Yape (fondo morado) recorta la tarjeta y la agranda al doble. */
function preparar(img: HTMLImageElement): { canvas: HTMLCanvasElement; yape: boolean } {
  const base = lienzo(img.naturalWidth, img.naturalHeight);
  const g = base.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, base.width, base.height);
  if (proporcionMorada(data, width, height) < 0.25) return { canvas: base, yape: false };
  const caja = encontrarTarjeta(data, width, height);
  if (!caja) return { canvas: base, yape: true };
  const out = lienzo((caja.x1 - caja.x0) * 2, (caja.y1 - caja.y0) * 2);
  const o = out.getContext("2d")!;
  o.imageSmoothingQuality = "high";
  o.drawImage(base, caja.x0, caja.y0, caja.x1 - caja.x0, caja.y1 - caja.y0, 0, 0, out.width, out.height);
  return { canvas: out, yape: true };
}

export function crearLector(): Lector {
  let worker: import("tesseract.js").Worker | null = null;
  const motor = async () => {
    if (worker) return worker;
    const Tesseract = await import("tesseract.js");
    worker = await Tesseract.createWorker("spa", undefined, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/tesseract-core-lstm.js",
      langPath: "/tesseract/",
      workerBlobURL: false, // ver ocr.ts: con blob: URL el .wasm no resuelve su ruta
    });
    return worker;
  };

  const leerLineas = async (w: import("tesseract.js").Worker, fuente: HTMLCanvasElement): Promise<Linea[]> => {
    const { data } = await w.recognize(fuente, {}, { blocks: true });
    return (data.blocks ?? []).flatMap((b) => b.paragraphs).flatMap((p) => p.lines).filter((l) => l.text.trim()).map((l) => ({ text: l.text.trim(), left: l.bbox.x0, right: l.bbox.x1, top: l.bbox.y0, bottom: l.bbox.y1 }));
  };

  /** Lee el número grande de Yape: recorta su franja, la reduce a distintos tamaños y se queda con el primero que dé un número. */
  const leerMonto = async (w: import("tesseract.js").Worker, tarjeta: HTMLCanvasElement, lineas: Linea[]): Promise<string> => {
    // las líneas por su posición vertical (el OCR no las entrega en orden): "¡Yapeaste!" y la que viene justo debajo
    const ord = [...lineas].sort((a, b) => a.top - b.top);
    const iy = ord.findIndex((l) => /yapeaste/i.test(l.text));
    const bajo = iy >= 0 ? ord.slice(iy + 1).find((l) => l.top > ord[iy].bottom) : undefined;
    // se prueba la franja entre esas dos líneas y, si no sirve, una franja fija de la tarjeta
    const franjas = [franjaMonto(tarjeta.height, ord[iy], bajo), franjaMonto(tarjeta.height)];
    await w.setParameters({ tessedit_char_whitelist: "S/0123456789.,", tessedit_pageseg_mode: "7" as never });
    try {
      for (const franja of franjas) {
        const alto = franja.y1 - franja.y0;
        if (alto < 8) continue;
        for (const escala of [0.25, 0.5, 0.3, 0.2]) {
          const c = lienzo(tarjeta.width * escala + 40, alto * escala + 40);
          const g = c.getContext("2d")!;
          g.fillStyle = "#fff";
          g.fillRect(0, 0, c.width, c.height);
          g.imageSmoothingQuality = "high";
          g.drawImage(tarjeta, 0, franja.y0, tarjeta.width, alto, 20, 20, tarjeta.width * escala, alto * escala);
          const { data } = await w.recognize(c);
          if (/\d/.test(data.text)) return data.text.trim();
        }
      }
      return "";
    } finally {
      await w.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: "3" as never });
    }
  };

  return {
    async leer(uri) {
      const w = await motor();
      const img = await cargarImagen(uri);
      const { canvas, yape } = preparar(img);
      const lineas = await leerLineas(w, canvas);
      if (!lineas.length) throw new Error("No se detectó texto. Intenta con una captura nítida.");
      const filas = filasVisuales(lineas);
      let c = parseCaptura(filas);
      if (c.formato === "YAPE" && !c.monto && yape) c = parseCaptura(filas, await leerMonto(w, canvas, lineas));
      return c;
    },
    async cerrar() {
      await worker?.terminate();
      worker = null;
    },
  };
}
