/** Elegir o tomar fotos (recibos y capturas), reducidas para que pesen poco. Se suben al servidor al registrar. */
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export type OrigenFoto = "galeria" | "camara";
export class FotoError extends Error {}

async function reducir(uri: string, width: number, height: number, maxLado = 1600, calidad = 0.8): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > maxLado) ctx.resize(width >= height ? { width: maxLado } : { height: maxLado });
  return (await (await ctx.renderAsync()).saveAsync({ compress: calidad, format: SaveFormat.JPEG })).uri;
}

/** Una foto de la galería o la cámara (null si la persona cancela). */
export async function elegirFoto(origen: OrigenFoto): Promise<string | null> {
  if (origen === "camara") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new FotoError("Necesitamos permiso de cámara para tomar la foto.");
  }
  const res = origen === "camara" ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  try {
    return await reducir(a.uri, a.width, a.height);
  } catch {
    throw new FotoError("No se pudo leer la imagen.");
  }
}

/** Varias capturas de la galería a la vez (gastos digitales). Las que no se pueden leer se omiten. */
export async function elegirCapturas(limite = 30): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, allowsMultipleSelection: true, selectionLimit: limite });
  if (res.canceled) return [];
  const out: string[] = [];
  for (const a of res.assets) {
    try {
      // las capturas se leen mejor sin reducirlas tanto (texto chico)
      out.push(await reducir(a.uri, a.width, a.height, 2000, 0.85));
    } catch (e) {
      console.warn("No se pudo leer una captura del lote:", e);
    }
  }
  return out;
}
