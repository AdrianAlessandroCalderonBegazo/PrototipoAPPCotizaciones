import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { fecha } from "../formato";
import { CONFIGURACION, FASE_ACTUAL, menuDe, puede, type EntradaMenu } from "../modulos";
import { useSesion } from "../sesion";
import { ponerTema, temaActual, type Tema } from "../tema";
import type { Parametros } from "../tipos";
import { CambiarClave } from "./CambiarClave";
import { Icono } from "./Icono";
import { Paleta } from "./Paleta";

function useAncho() {
  const [ancho, setAncho] = useState(window.innerWidth);
  useEffect(() => {
    const f = () => setAncho(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return ancho;
}

function leerPlegado() {
  try {
    return localStorage.getItem("erp.menu") === "plegado";
  } catch {
    return false;
  }
}

function Marca({ expandida }: { expandida: boolean }) {
  return (
    <div className="flex h-16 items-center gap-3 border-b border-border px-4">
      <div className="relative grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[11px] bg-navy text-[13px] font-extrabold tracking-tight text-white">
        ICR
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-solar" />
      </div>
      {expandida ? (
        <div className="min-w-0 whitespace-nowrap">
          <div className="text-[15px] font-extrabold tracking-tight">ICR ERP</div>
          <div className="text-[12px] text-text-3">Inversiones ICR · Arequipa</div>
        </div>
      ) : null}
    </div>
  );
}

function Enlace({ item, expandida, onIr }: { item: EntradaMenu; expandida: boolean; onIr?: () => void }) {
  return (
    <NavLink
      to={item.ruta}
      end={item.ruta === "/"}
      title={item.nombre}
      onClick={onIr}
      className={({ isActive }) =>
        `flex h-10 w-full items-center gap-3 whitespace-nowrap rounded-[11px] px-3 text-[14px] ${expandida ? "justify-start" : "justify-center"} ${
          isActive ? "bg-primary-soft font-bold text-primary-ink" : "font-medium text-text-2 hover:bg-surface-2"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icono n={item.icono} t={21} relleno={isActive} style={{ color: item.ia ? "var(--ai)" : isActive ? "var(--primary)" : undefined }} />
          {expandida ? <span className="flex-1 overflow-hidden text-ellipsis">{item.nombre}</span> : null}
          {expandida && item.fase > FASE_ACTUAL ? (
            <span className="rounded-md border border-border px-1.5 py-px text-[10px] font-bold text-text-3" title={`Se construye en la fase ${item.fase}`}>
              F{item.fase}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function BarraLateral({ expandida, onIr, onPlegar }: { expandida: boolean; onIr?: () => void; onPlegar?: () => void }) {
  const { usuario } = useSesion();
  return (
    <>
      <Marca expandida={expandida} />
      <nav className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-3 py-2.5">
        {menuDe(usuario).map((g) => (
          <div key={g.grupo} className="flex flex-col gap-0.5">
            {expandida ? <div className="whitespace-nowrap px-3 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-text-3">{g.grupo}</div> : null}
            {g.items.map((i) => (
              <Enlace key={i.clave} item={i} expandida={expandida} onIr={onIr} />
            ))}
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-0.5 border-t border-border px-3 py-2.5">
        {puede(usuario, "configuracion") ? <Enlace item={CONFIGURACION} expandida={expandida} onIr={onIr} /> : null}
        {onPlegar ? (
          <button onClick={onPlegar} title={expandida ? "Plegar menú" : "Desplegar menú"} className={`flex h-10 w-full items-center gap-3 whitespace-nowrap rounded-[11px] px-3 text-[13px] font-medium text-text-3 hover:bg-surface-2 ${expandida ? "justify-start" : "justify-center"}`}>
            <Icono n={expandida ? "left_panel_close" : "left_panel_open"} t={21} />
            {expandida ? <span>Plegar menú</span> : null}
          </button>
        ) : null}
      </div>
    </>
  );
}

function ChipTipoCambio({ ancho }: { ancho: number }) {
  const [tc, setTc] = useState<Parametros["tipo_cambio"] | null>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    api<Parametros>("GET", "/parametros").then((p) => setTc(p.tipo_cambio)).catch(() => setTc(null));
  }, [pathname]);
  return (
    <div title={tc?.fuente ? `Tipo de cambio · ${tc.fuente}` : "Tipo de cambio (se configura en Configuración › Parámetros)"} className="num flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-border bg-surface-2 px-2.5 text-[12px] text-text-2">
      <span className="font-bold text-text">TC</span>
      {tc?.valor ? `US$ 1 = S/ ${tc.valor}` : "Sin dato"}
      {ancho >= 1100 && tc?.fecha ? <span className="text-text-3">· {fecha(tc.fecha)}</span> : null}
    </div>
  );
}

function MenuUsuario({ ancho }: { ancho: number }) {
  const { usuario, salir } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [abierto]);
  if (!usuario) return null;
  const ini = usuario.nombre.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto(!abierto)} className="flex h-11 items-center gap-2.5 rounded-xl border border-transparent pl-1 pr-2.5 hover:bg-surface-2">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary-soft text-[13px] font-extrabold text-primary-ink">{ini}</span>
        {ancho >= 1100 ? (
          <span className="whitespace-nowrap text-left leading-tight">
            <span className="block text-[13.5px] font-bold">{usuario.nombre}</span>
            <span className="block text-[12px] text-text-3">{usuario.rol_etiqueta}</span>
          </span>
        ) : null}
        <Icono n="expand_more" className="text-text-3" />
      </button>
      {abierto ? (
        <div className="aparecer absolute right-0 top-[52px] z-40 w-[280px] rounded-2xl border border-border bg-surface p-2 shadow-menu">
          <div className="mb-1.5 border-b border-border px-2.5 pb-2.5 pt-2">
            <div className="font-bold">{usuario.nombre}</div>
            <div className="text-[12px] text-text-3">
              {usuario.usuario} · {usuario.rol_etiqueta}
            </div>
          </div>
          <button onClick={() => { setAbierto(false); setClave(true); }} className="flex h-[38px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] text-text-2 hover:bg-surface-2">
            <Icono n="key" t={18} />
            Cambiar mi clave
          </button>
          <button onClick={() => void salir()} className="flex h-[38px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-semibold text-danger hover:bg-danger-soft">
            <Icono n="logout" t={18} />
            Cerrar sesión
          </button>
        </div>
      ) : null}
      {clave ? <CambiarClave onCerrar={() => setClave(false)} /> : null}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const ancho = useAncho();
  const movil = ancho < 900;
  const [plegado, setPlegado] = useState(leerPlegado);
  const [cajon, setCajon] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [tema, setTema] = useState<Tema>(temaActual());
  const navegar = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => setCajon(false), [pathname]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((p) => !p);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const plegar = () => {
    const nuevo = !plegado;
    setPlegado(nuevo);
    try {
      localStorage.setItem("erp.menu", nuevo ? "plegado" : "abierto");
    } catch {
      // no pasa nada
    }
  };
  const cambiarTema = () => {
    const t = tema === "dark" ? "light" : "dark";
    ponerTema(t);
    setTema(t);
  };

  return (
    <div className="flex h-full overflow-hidden bg-bg text-text">
      {!movil ? (
        <aside className="flex flex-shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width] duration-200" style={{ width: plegado ? 72 : 264 }}>
          <BarraLateral expandida={!plegado} onPlegar={plegar} />
        </aside>
      ) : cajon ? (
        <div className="fixed inset-0 z-50" style={{ background: "var(--overlay)" }} onMouseDown={() => setCajon(false)}>
          <aside className="flex h-full w-[284px] max-w-[85vw] flex-col border-r border-border bg-surface" onMouseDown={(e) => e.stopPropagation()}>
            <BarraLateral expandida onIr={() => setCajon(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 flex-shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-3 sm:px-6">
          {movil ? (
            <button onClick={() => setCajon(true)} title="Menú" className="grid h-10 w-10 place-items-center rounded-[11px] text-text-2 hover:bg-surface-2">
              <Icono n="menu" t={22} />
            </button>
          ) : null}
          {movil ? (
            <button onClick={() => setPaleta(true)} title="Ir a un módulo" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px] border border-border bg-surface-2 text-text-3">
              <Icono n="search" />
            </button>
          ) : (
            <button onClick={() => setPaleta(true)} className="flex h-10 min-w-0 max-w-[520px] flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-2 pl-3.5 pr-2.5 text-left text-[13.5px] text-text-3 hover:border-primary-line">
              <Icono n="search" />
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">Ir a un módulo o acción…</span>
              <span className="flex-shrink-0 whitespace-nowrap rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-2">Ctrl K</span>
            </button>
          )}
          <div className="flex-1" />
          {ancho >= 640 ? <ChipTipoCambio ancho={ancho} /> : null}
          <button onClick={cambiarTema} title="Modo claro / oscuro" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px] border border-border bg-surface text-text-2 hover:bg-surface-2">
            <Icono n={tema === "dark" ? "light_mode" : "dark_mode"} t={21} />
          </button>
          <MenuUsuario ancho={ancho} />
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 sm:px-8 sm:pt-7">{children}</div>
        </main>
      </div>
      {paleta ? <Paleta onCerrar={() => setPaleta(false)} onIr={(r) => { setPaleta(false); navegar(r); }} /> : null}
    </div>
  );
}
