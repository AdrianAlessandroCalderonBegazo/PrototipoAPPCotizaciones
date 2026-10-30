import { Pildora, type TonoPildora } from "../../componentes/Pildora";
import type { EstadoCot } from "../../tipos";

export const ESTADO_COT: Record<EstadoCot, { l: string; tono: TonoPildora }> = {
  borrador: { l: "Borrador", tono: "neutro" },
  enviada: { l: "Enviada", tono: "primario" },
  aceptada: { l: "Aceptada", tono: "exito" },
  rechazada: { l: "Rechazada", tono: "peligro" },
};

export const PillCot = ({ e }: { e: EstadoCot | null }) => (e ? <Pildora tono={ESTADO_COT[e].tono}>{ESTADO_COT[e].l}</Pildora> : <Pildora tono="neutro" punto={false}>Sin estado</Pildora>);

/** Imagen de un producto o un recuadro con sus iniciales. */
export function Miniatura({ src, nombre, tam = 44 }: { src: string | null; nombre: string; tam?: number }) {
  return (
    <span className="grid flex-shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2 text-[11px] font-bold text-text-3" style={{ width: tam, height: tam }}>
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full bg-white object-contain" onError={(e) => ((e.currentTarget.style.display = "none"))} /> : nombre.slice(0, 2).toUpperCase()}
    </span>
  );
}

export const cant = (v: string) => (v.endsWith(".00") ? v.slice(0, -3) : v);
