import { Pildora, type TonoPildora } from "../../componentes/Pildora";
import type { EstadoProyecto } from "../../tipos";

export const ESTADO: Record<EstadoProyecto, { l: string; tono: TonoPildora }> = {
  activo: { l: "Activo", tono: "exito" },
  pausado: { l: "Pausado", tono: "aviso" },
  finalizado: { l: "Finalizado", tono: "neutro" },
};

export const PillEstado = ({ e }: { e: EstadoProyecto }) => <Pildora tono={ESTADO[e].tono}>{ESTADO[e].l}</Pildora>;

/** Color de la barra según el % gastado y los umbrales de Configuración › Parámetros. */
export function colorAvance(pct: number | null, aviso = 80, limite = 100) {
  if (pct === null) return "var(--track)";
  if (pct >= limite) return "var(--danger)";
  if (pct >= aviso) return "var(--warning)";
  return "var(--primary)";
}

export function BarraAvance({ pct, aviso, limite, alto = 6 }: { pct: number | null; aviso?: number; limite?: number; alto?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-track" style={{ height: alto }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: colorAvance(pct, aviso, limite) }} />
    </div>
  );
}

export const pctTexto = (p: number | null) => (p === null ? "Sin dato" : `${p.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
