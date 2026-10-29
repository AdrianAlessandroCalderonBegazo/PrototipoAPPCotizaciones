import { useMemo, useState } from "react";
import { menuDe, puede, CONFIGURACION } from "../modulos";
import { useSesion } from "../sesion";
import { Icono } from "./Icono";

type Opcion = { ruta: string; nombre: string; icono: string; grupo: string };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ctrl+K: ir a un módulo o a una sección de Configuración. La búsqueda de datos (proyectos, productos…) llega en la fase 4. */
export function Paleta({ onCerrar, onIr }: { onCerrar: () => void; onIr: (ruta: string) => void }) {
  const { usuario } = useSesion();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const opciones = useMemo<Opcion[]>(() => {
    const ops: Opcion[] = menuDe(usuario).flatMap((g) => g.items.map((i) => ({ ruta: i.ruta, nombre: i.nombre, icono: i.icono, grupo: g.grupo })));
    if (puede(usuario, "configuracion")) {
      for (const [ruta, nombre, icono] of [
        ["usuarios", "Usuarios y roles", "group"],
        ["permisos", "Matriz de permisos", "admin_panel_settings"],
        ["empresa", "Datos de la empresa", "apartment"],
        ["parametros", "Parámetros y numeración", "tune"],
        ["integraciones", "Integraciones", "hub"],
        ["auditoria", "Auditoría", "history"],
      ])
        ops.push({ ruta: `${CONFIGURACION.ruta}/${ruta}`, nombre, icono, grupo: "Configuración" });
    }
    const t = sinTildes(q.trim());
    return t ? ops.filter((o) => sinTildes(`${o.nombre} ${o.grupo}`).includes(t)) : ops;
  }, [q, usuario]);

  return (
    <div className="fixed inset-0 z-50 flex justify-center p-4 pt-[12vh]" style={{ background: "var(--overlay)" }} onMouseDown={onCerrar}>
      <div className="aparecer flex max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-menu" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Icono n="search" className="text-text-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCerrar();
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, opciones.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && opciones[sel]) onIr(opciones[sel].ruta);
            }}
            placeholder="Ir a un módulo o acción…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-3"
          />
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-3">Esc</span>
        </div>
        <div className="overflow-y-auto p-2">
          {opciones.length === 0 ? <div className="p-4 text-center text-[13.5px] text-text-3">No hay coincidencias.</div> : null}
          {opciones.map((o, i) => (
            <button key={o.ruta} onMouseEnter={() => setSel(i)} onClick={() => onIr(o.ruta)} className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] ${i === sel ? "bg-primary-soft text-primary-ink" : "text-text"}`}>
              <Icono n={o.icono} className={i === sel ? "" : "text-text-3"} />
              <span className="flex-1 font-semibold">{o.nombre}</span>
              <span className="text-[12px] text-text-3">{o.grupo}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-border px-4 py-2.5 text-[12px] text-text-3">La búsqueda de proyectos, productos y comprobantes llega en la fase 4.</div>
      </div>
    </div>
  );
}
