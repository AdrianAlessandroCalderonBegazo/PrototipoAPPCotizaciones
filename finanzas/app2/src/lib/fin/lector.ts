/**
 * Lector de capturas en el teléfono nativo (Android/iOS): ML Kit lee la imagen entera y parseCaptura interpreta el texto.
 * La versión web (la PWA) es lector.web.ts, que además recorta la tarjeta de Yape y lee el monto grande aparte.
 */
import { parseCaptura, type Captura } from "./captura";

export type Lector = { leer(uri: string): Promise<Captura>; cerrar(): Promise<void> };

export function crearLector(): Lector {
  return {
    async leer(uri) {
      const { recognizeText } = require("@infinitered/react-native-mlkit-text-recognition") as typeof import("@infinitered/react-native-mlkit-text-recognition");
      const r = await recognizeText(uri);
      const lineas = r.blocks.flatMap((b) => b.lines).map((l) => l.text);
      if (!lineas.length) throw new Error("No se detectó texto en la captura.");
      return parseCaptura(lineas);
    },
    async cerrar() {},
  };
}
