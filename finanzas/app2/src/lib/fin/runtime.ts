/**
 * Las instancias reales del almacén y la sincronización (con el almacenamiento del dispositivo y la API), más los
 * ganchos de React para que las pantallas se actualicen solas.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { today } from "../format";
import { apiBajarFoto, apiJson, apiSubirFoto, currentSession } from "../api";
import { kvGet, kvSet } from "../kv";
import { crearBloqueo } from "./bloqueo";
import { blobFoto, borrarFoto, guardarFotoRemota, urlFoto } from "./fotos";
import { crearStore, pendientes } from "./store";
import { crearSync } from "./sync";
import type { Adjunto } from "./types";

export const store = crearStore({ kv: { get: kvGet, set: kvSet }, borrarFoto });
export const sync = crearSync({ store, api: { json: apiJson, subirFoto: apiSubirFoto, bajarFoto: apiBajarFoto }, blobFoto, hoy: today });

export const useFin = () => useSyncExternalStore(store.subscribe, store.get);
export const useEstadoSync = () => useSyncExternalStore(sync.subscribe, sync.estado);

/** Candado de los días anteriores. El código se cambia al compilar con EXPO_PUBLIC_CODIGO_EDICION (por defecto 1234). */
export const bloqueo = crearBloqueo({ codigo: (process.env.EXPO_PUBLIC_CODIGO_EDICION || "1234").trim(), ahora: Date.now });

/** Hook: estado del candado; se refresca cada segundo mientras está abierto (cuenta regresiva y cierre automático). */
export function useBloqueo() {
  useSyncExternalStore(bloqueo.subscribe, bloqueo.version);
  const [, tic] = useState(0);
  const abierto = bloqueo.abierto();
  useEffect(() => {
    if (!abierto) return;
    const id = setInterval(() => tic((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [abierto]);
  return { abierto: bloqueo.abierto(), restanteMs: bloqueo.restanteMs() };
}

/**
 * Sincroniza sola: al abrir, al volver la conexión, al volver a la pestaña, cada minuto y poco después de cada
 * cambio. Solo si hay sesión. Devuelve la función que lo apaga.
 */
export function iniciarSyncAutomatica(): () => void {
  let espera: ReturnType<typeof setTimeout> | null = null;
  const intentar = () => {
    if (currentSession()) void sync.sincronizar();
  };
  const trasCambio = () => {
    if (!currentSession() || pendientes(store.get()) === 0) return;
    if (espera) clearTimeout(espera);
    espera = setTimeout(intentar, 800);
  };
  const quitar = store.subscribe(trasCambio);
  const cada = setInterval(intentar, 60_000);
  const g = globalThis as { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void; document?: { visibilityState?: string } };
  const alVolver = () => {
    if (g.document?.visibilityState !== "hidden") intentar();
  };
  g.addEventListener?.("online", intentar);
  g.addEventListener?.("visibilitychange", alVolver);
  intentar();
  return () => {
    quitar();
    clearInterval(cada);
    if (espera) clearTimeout(espera);
    g.removeEventListener?.("online", intentar);
    g.removeEventListener?.("visibilitychange", alVolver);
  };
}

/** Hook: ejecuta `iniciarSyncAutomatica` mientras `activo` sea verdadero (hay sesión). */
export function useSyncAutomatica(activo: boolean) {
  useEffect(() => (activo ? iniciarSyncAutomatica() : undefined), [activo]);
}

/** URL para mostrar la foto de un comprobante: la copia local si la hay; si no (la subió otra persona), se baja y se guarda. */
export async function urlAdjunto(adj: Adjunto): Promise<string | null> {
  if (adj.localKey) {
    const u = await urlFoto(adj.localKey);
    if (u) return u;
  }
  const guardada = await urlFoto(`remota:${adj.id}`);
  if (guardada) return guardada;
  try {
    const blob = await sync.traerFotoRemota(adj.id);
    const key = await guardarFotoRemota(adj.id, blob);
    return key ? await urlFoto(key) : null;
  } catch {
    return null; // sin conexión y sin copia local: se muestra el marcador de foto
  }
}
