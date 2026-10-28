/** Acciones que juntan varios pasos sobre el almacén (guardar un movimiento y sus fotos). */
import type { FotoItem } from "../components/fin";
import { store } from "../lib/fin/runtime";
import type { NuevoMov } from "../lib/fin/store";
import type { Mov } from "../lib/fin/types";

/** Guarda el movimiento y deja sus fotos como están en el formulario (las quitadas se quitan, las nuevas se suben). */
export function aplicarGuardado(m: NuevoMov, fotos: FotoItem[], previo?: Mov) {
  store.guardarMov(m);
  const quedan = new Set(fotos.filter((f) => f.adj).map((f) => f.adj!.id));
  for (const a of previo?.adjuntos ?? []) if (!quedan.has(a.id)) store.quitarAdjunto(m.id, a.id);
  for (const f of fotos) if (f.nueva) store.agregarAdjunto(m.id, f.nueva);
}
