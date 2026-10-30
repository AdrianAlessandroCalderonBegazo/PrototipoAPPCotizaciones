import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import { AlertaFila } from "../paginas/Inicio";
import type { Alerta } from "../tipos";
import { Icono } from "./Icono";

type Respuesta = { notificaciones: Alerta[]; sin_leer: number };

/** Campana de la barra superior: las alertas del Inicio, con «leída» guardada por persona en el servidor. */
export function Campana() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const cargar = () => api<Respuesta>("GET", "/notificaciones").then(setDatos).catch(() => setDatos(null));
  useEffect(() => {
    void cargar();
    const t = window.setInterval(() => void cargar(), 5 * 60_000);
    return () => window.clearInterval(t);
  }, [pathname]);
  useEffect(() => {
    if (!abierto) return;
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [abierto]);
  const marcar = async (claves?: string[]) => {
    await api("POST", "/notificaciones/leidas", { cuerpo: claves ? { claves } : {} }).catch(() => null);
    void cargar();
  };
  const n = datos?.sin_leer ?? 0;
  const lista = datos?.notificaciones ?? [];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto(!abierto)} title="Notificaciones" aria-label={`Notificaciones${n ? ` (${n} sin leer)` : ""}`} className="relative grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px] border border-border bg-surface text-text-2 hover:bg-surface-2">
        <Icono n="notifications" t={21} />
        {n ? <span className="num absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10.5px] font-extrabold text-white">{n > 99 ? "99+" : n}</span> : null}
      </button>
      {abierto ? (
        <div className="aparecer absolute right-0 top-12 z-40 flex max-h-[70vh] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-menu">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="titulo-seccion">Notificaciones</div>
            {n ? <button onClick={() => void marcar()} className="text-[12.5px] font-semibold text-primary-ink hover:underline">Marcar todas como leídas</button> : null}
          </div>
          <div className="overflow-y-auto">
            {lista.length === 0 ? <div className="flex items-center gap-2 px-5 py-5 text-[13px] text-success"><Icono n="check_circle" relleno />No hay nada pendiente.</div> : null}
            {lista.map((a) => (
              <div key={a.clave} className={a.leida ? "opacity-60" : ""}>
                <AlertaFila a={a} onIr={() => { setAbierto(false); if (!a.leida) void marcar([a.clave]); }} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
