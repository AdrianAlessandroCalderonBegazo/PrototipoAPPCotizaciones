import { useState } from "react";
import { Icono } from "../../componentes/Icono";
import { Pildora, type TonoPildora } from "../../componentes/Pildora";
import type { EstadoCpe, TipoCpe, UnidadCpe } from "../../tipos";

export const ESTADO_CPE: Record<EstadoCpe, { l: string; tono: TonoPildora }> = {
  borrador: { l: "Borrador", tono: "neutro" },
  enviado: { l: "Enviado a SUNAT", tono: "primario" },
  emitido: { l: "Emitido", tono: "exito" },
  anulado: { l: "Anulado", tono: "peligro" },
};
export const PillCpe = ({ e }: { e: EstadoCpe }) => <Pildora tono={ESTADO_CPE[e].tono}>{ESTADO_CPE[e].l}</Pildora>;
export const TIPO_CPE: Record<TipoCpe, { l: string; largo: string; icono: string }> = {
  factura: { l: "Factura", largo: "Factura electrónica", icono: "receipt_long" },
  boleta: { l: "Boleta", largo: "Boleta de venta electrónica", icono: "receipt" },
};
export const UNIDADES: Record<UnidadCpe, string> = { NIU: "Unidad (NIU)", ZZ: "Servicio (ZZ)", MTR: "Metro (MTR)" };
export const FUENTE: Record<string, string> = { sunat: "SUNAT", reniec: "RENIEC", historial: "Registrado en el ERP" };
export const nombreCpe = (c: { numero: string | null; tipo: TipoCpe; id: number }) => c.numero ?? `${TIPO_CPE[c.tipo].l} · borrador #${c.id}`;

/** Fila con un dato y su botón «Copiar» (para pasarlo a SUNAT a mano si hace falta). */
export function Copiable({ l, v }: { l: string; v: string | null | undefined }) {
  const [ok, setOk] = useState(false);
  if (!v) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border py-1.5 last:border-0">
      <div className="min-w-0 flex-1"><div className="text-[11.5px] text-text-3">{l}</div><div className="truncate text-[13px] font-semibold">{v}</div></div>
      <button className="btn-secundario h-8 px-2.5 text-[12px]" onClick={() => void navigator.clipboard?.writeText(v).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1200); })}>
        <Icono n={ok ? "check" : "content_copy"} t={16} />{ok ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
