import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { menuDe, puede, CONFIGURACION } from "../modulos";
import { useSesion } from "../sesion";
import type { GrupoBusqueda } from "../tipos";
import { Icono } from "./Icono";

type Opcion = { ruta: string; nombre: string; icono: string; grupo: string; detalle?: string };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ctrl+K: ir a un módulo o sección, y buscar datos (proyectos, cotizaciones, productos, movimientos, requerimientos) según los permisos. */
export function Paleta({ onCerrar, onIr }: { onCerrar: () => void; onIr: (ruta: string) => void }) {
  const { usuario } = useSesion();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [grupos, setGrupos] = useState<GrupoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setGrupos([]); return; }
    let vigente = true;
    setBuscando(true);
    const h = window.setTimeout(() => {
      api<{ grupos: GrupoBusqueda[] }>("GET", "/buscar", { consulta: { q: t } })
        .then((r) => vigente && setGrupos(r.grupos))
        .catch(() => vigente && setGrupos([]))
        .finally(() => vigente && setBuscando(false));
    }, 220);
    return () => { vigente = false; window.clearTimeout(h); };
  }, [q]);
  const opciones = useMemo<(Opcion & { detalle: string })[]>(() => {
    const ops: Opcion[] = menuDe(usuario).flatMap((g) => g.items.map((i) => ({ ruta: i.ruta, nombre: i.nombre, icono: i.icono, grupo: g.grupo })));
    if (puede(usuario, "configuracion")) {
      for (const [ruta, nombre, icono] of [
        ["usuarios", "Usuarios y roles", "group"],
        ["permisos", "Matriz de permisos", "admin_panel_settings"],
        ["empresa", "Datos de la empresa", "apartment"],
        ["parametros", "Parámetros y numeración", "tune"],
        ["integraciones", "Integraciones", "hub"],
        ["ia", "Inteligencia artificial", "auto_awesome"],
        ["auditoria", "Auditoría", "history"],
      ])
        ops.push({ ruta: `${CONFIGURACION.ruta}/${ruta}`, nombre, icono, grupo: "Configuración" });
    }
    const t = sinTildes(q.trim());
    const modulos = t ? ops.filter((o) => sinTildes(`${o.nombre} ${o.grupo}`).includes(t)) : ops;
    const datos = grupos.flatMap((g) => g.items.map((i) => ({ ruta: i.ruta, nombre: i.titulo, detalle: i.detalle, icono: i.icono, grupo: g.grupo })));
    return [...modulos.map((o) => ({ ...o, detalle: "" })), ...datos];
  }, [q, usuario, grupos]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" style={{ background: "var(--overlay)" }} onMouseDown={onCerrar}>
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
            placeholder="Buscar proyectos, cotizaciones, productos, módulos…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-3"
          />
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-3">Esc</span>
        </div>
        <div className="overflow-y-auto p-2">
          {opciones.length === 0 ? <div className="p-4 text-center text-[13.5px] text-text-3">{buscando ? "Buscando…" : "No hay coincidencias."}</div> : null}
          {opciones.map((o, i) => (
            <button key={`${o.grupo}-${o.ruta}-${i}`} onMouseEnter={() => setSel(i)} onClick={() => onIr(o.ruta)} className={`flex min-h-11 w-full items-center py-1.5 gap-3 rounded-xl px-3 text-left text-[14px] ${i === sel ? "bg-primary-soft text-primary-ink" : "text-text"}`}>
              <Icono n={o.icono} className={i === sel ? "" : "text-text-3"} />
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{o.nombre}</span>{o.detalle ? <span className="block truncate text-[12px] font-normal text-text-3">{o.detalle}</span> : null}</span>
              <span className="text-[12px] text-text-3">{o.grupo}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-border px-4 py-2.5 text-[12px] text-text-3">{buscando ? "Buscando…" : "Escribe 2 letras o más para buscar datos · ↑ ↓ para elegir · Enter para abrir"}</div>
      </div>
    </div>
  );
}
