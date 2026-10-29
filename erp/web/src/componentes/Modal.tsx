import { useEffect, type ReactNode } from "react";
import { Icono } from "./Icono";

export function Modal({ titulo, icono, onCerrar, children, pie, ancho = 460 }: { titulo: string; icono?: string; onCerrar: () => void; children: ReactNode; pie?: ReactNode; ancho?: number }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "var(--overlay)" }} onMouseDown={onCerrar}>
      <div role="dialog" aria-modal aria-label={titulo} className="aparecer flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-menu" style={{ maxWidth: ancho }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          {icono ? (
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary-soft text-primary-ink">
              <Icono n={icono} t={20} />
            </span>
          ) : null}
          <div className="flex-1 text-[16px] font-bold">{titulo}</div>
          <button className="grid h-9 w-9 place-items-center rounded-[10px] text-text-3 hover:bg-surface-2" onClick={onCerrar} title="Cerrar">
            <Icono n="close" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {pie ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">{pie}</div> : null}
      </div>
    </div>
  );
}
