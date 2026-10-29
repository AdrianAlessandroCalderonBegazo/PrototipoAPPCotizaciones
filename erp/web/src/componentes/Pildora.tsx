import type { ReactNode } from "react";

export type TonoPildora = "exito" | "aviso" | "peligro" | "neutro" | "primario" | "ia";
const TONOS: Record<TonoPildora, [string, string]> = {
  exito: ["var(--success-soft)", "var(--success)"],
  aviso: ["var(--warning-soft)", "var(--warning)"],
  peligro: ["var(--danger-soft)", "var(--danger)"],
  neutro: ["var(--neutral-soft)", "var(--neutral)"],
  primario: ["var(--primary-soft)", "var(--primary-ink)"],
  ia: ["var(--ai-soft)", "var(--ai)"],
};

/** Etiqueta de estado con punto, como en el diseño. */
export function Pildora({ tono, children, punto = true }: { tono: TonoPildora; children: ReactNode; punto?: boolean }) {
  const [bg, fg] = TONOS[tono];
  return (
    <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-bold" style={{ background: bg, color: fg }}>
      {punto ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: fg }} /> : null}
      {children}
    </span>
  );
}
