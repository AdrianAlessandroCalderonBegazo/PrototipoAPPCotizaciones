import { NavLink, Navigate, useParams } from "react-router-dom";
import { Icono } from "../../componentes/Icono";
import { Auditoria } from "./Auditoria";
import { Empresa } from "./Empresa";
import { Ia } from "./Ia";
import { Integraciones } from "./Integraciones";
import { Matriz } from "./Matriz";
import { Parametros } from "./Parametros";
import { Usuarios } from "./Usuarios";

export const SECCIONES = [
  { k: "usuarios", l: "Usuarios y roles", i: "group", C: Usuarios },
  { k: "permisos", l: "Matriz de permisos", i: "admin_panel_settings", C: Matriz },
  { k: "empresa", l: "Datos de la empresa", i: "apartment", C: Empresa },
  { k: "parametros", l: "Parámetros y numeración", i: "tune", C: Parametros },
  { k: "integraciones", l: "Integraciones", i: "hub", C: Integraciones },
  { k: "ia", l: "Inteligencia artificial", i: "auto_awesome", C: Ia },
  { k: "auditoria", l: "Auditoría", i: "history", C: Auditoria },
] as const;

export function Configuracion() {
  const { seccion } = useParams();
  const s = SECCIONES.find((x) => x.k === seccion);
  if (!s) return <Navigate to="/configuracion/usuarios" replace />;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="sobretitulo">Sistema</div>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Configuración</h1>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SECCIONES.map((x) => (
          <NavLink key={x.k} to={`/configuracion/${x.k}`} className={({ isActive }) => `btn h-10 flex-shrink-0 no-underline ${isActive ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}>
            <Icono n={x.i} t={19} />
            {x.l}
          </NavLink>
        ))}
      </div>
      <s.C />
    </div>
  );
}
