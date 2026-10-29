import { useEffect, useState } from "react";
import { fotoCaja } from "../api";
import { Icono } from "./Icono";

export type FotoVisor = { url?: string; idCaja?: string; titulo?: string; detalle?: string };

/** Visor a pantalla completa con flechas. Las fotos de la caja se piden recién al mostrarlas. */
export function VisorFotos({ fotos, inicio = 0, onCerrar }: { fotos: FotoVisor[]; inicio?: number; onCerrar: () => void }) {
  const [i, setI] = useState(inicio);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const f = fotos[i];
  useEffect(() => {
    let local: string | null = null;
    setError(null);
    setUrl(f?.url ?? null);
    if (f?.idCaja) {
      setUrl(null);
      fotoCaja(f.idCaja)
        .then((u) => setUrl((local = u)))
        .catch((e) => setError(e instanceof Error ? e.message : "No se pudo abrir la foto."));
    }
    return () => {
      if (local) URL.revokeObjectURL(local);
    };
  }, [f]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, fotos.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [fotos.length, onCerrar]);
  if (!f) return null;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90" onMouseDown={onCerrar}>
      <div className="flex items-center justify-between gap-3 p-4 text-white" onMouseDown={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="truncate font-bold">{f.titulo ?? "Foto"}</div>
          {f.detalle ? <div className="truncate text-[12.5px] opacity-75">{f.detalle}</div> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] opacity-75">{i + 1} / {fotos.length}</span>
          <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/10" onClick={onCerrar} title="Cerrar"><Icono n="close" /></button>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center p-4" onMouseDown={(e) => e.stopPropagation()}>
        {error ? <div className="rounded-xl bg-white/10 px-4 py-3 text-white">{error}</div> : url ? <img src={url} alt={f.titulo ?? ""} className="max-h-full max-w-full rounded-lg object-contain" /> : <div className="text-white/70">Cargando…</div>}
        {i > 0 ? <button className="absolute left-4 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" onClick={() => setI(i - 1)}><Icono n="chevron_left" t={28} /></button> : null}
        {i < fotos.length - 1 ? <button className="absolute right-4 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" onClick={() => setI(i + 1)}><Icono n="chevron_right" t={28} /></button> : null}
      </div>
    </div>
  );
}
