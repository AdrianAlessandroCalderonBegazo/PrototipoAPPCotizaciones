import type { ReactNode } from "react";
import { Icono } from "./Icono";

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-3 p-6 text-text-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-line border-t-transparent" />
      {texto}
    </div>
  );
}

export function ErrorCarga({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-danger-soft p-4 text-[13.5px] text-danger">
      <Icono n="error" relleno />
      <span className="flex-1 font-semibold">{mensaje}</span>
      {reintentar ? (
        <button className="btn-secundario h-9" onClick={reintentar}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function Vacio({ icono, titulo, children }: { icono: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-text-3">
        <Icono n={icono} t={26} />
      </span>
      <div className="text-[15px] font-bold">{titulo}</div>
      {children ? <div className="max-w-md text-[13.5px] text-text-2">{children}</div> : null}
    </div>
  );
}
