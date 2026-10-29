import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icono } from "./Icono";

type Tono = "exito" | "error" | "info";
type Aviso = { id: number; titulo: string; texto?: string; tono: Tono };

const Ctx = createContext<(titulo: string, texto?: string, tono?: Tono) => void>(() => {});
let n = 0;

const ESTILO: Record<Tono, { icono: string; color: string }> = {
  exito: { icono: "check_circle", color: "var(--success)" },
  error: { icono: "error", color: "var(--danger)" },
  info: { icono: "info", color: "var(--primary)" },
};

/** Avisos breves abajo a la derecha (se van solos). */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((titulo: string, texto?: string, tono: Tono = "exito") => {
    const id = ++n;
    setAvisos((a) => [...a, { id, titulo, texto, tono }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tono === "error" ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className="aparecer pointer-events-auto flex gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-menu">
            <Icono n={ESTILO[a.tono].icono} t={22} relleno style={{ color: ESTILO[a.tono].color }} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold">{a.titulo}</div>
              {a.texto ? <div className="mt-0.5 text-[12.5px] text-text-2">{a.texto}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useAvisos = () => useContext(Ctx);
