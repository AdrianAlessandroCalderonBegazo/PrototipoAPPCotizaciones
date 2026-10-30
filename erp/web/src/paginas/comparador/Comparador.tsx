// Comparador de proveedores (diseño ERP_ICR.zip › Comparador): buscador, proveedores, cargar lista e historial de precios.
import { useSearchParams } from "react-router-dom";
import { Icono } from "../../componentes/Icono";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import { Buscador } from "./Buscador";
import { CargarLista } from "./CargarLista";
import { Historial } from "./Historial";
import { Proveedores } from "./Proveedores";

const TABS = [
  { k: "buscar", l: "Buscador", i: "search" },
  { k: "proveedores", l: "Proveedores", i: "storefront" },
  { k: "cargar", l: "Cargar lista", i: "upload_file", editar: true },
  { k: "historial", l: "Historial de precios", i: "monitoring" },
] as const;

export function Comparador() {
  const { usuario } = useSesion();
  const editar = puede(usuario, "comparador", "completo");
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => editar || !("editar" in t));
  const tab = tabs.find((t) => t.k === params.get("tab"))?.k ?? "buscar";
  const ir = (k: string, extra: Record<string, string> = {}) => setParams({ tab: k, ...extra });
  return (
    <div className="flex flex-col gap-5">
      <div><div className="sobretitulo">Comercial</div><h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Comparador de proveedores</h1></div>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => ir(t.k)} className={`btn h-10 px-4 ${tab === t.k ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}><Icono n={t.i} t={18} />{t.l}</button>
        ))}
      </div>
      {/* El buscador se mantiene montado para no perder la búsqueda al ir y volver. */}
      <div className={tab === "buscar" ? "" : "hidden"}><Buscador editar={editar} onHistorial={(id) => ir("historial", { producto: String(id) })} /></div>
      {tab === "proveedores" ? <Proveedores editar={editar} onCargar={(id) => ir("cargar", { prov: String(id) })} /> : null}
      {tab === "cargar" ? <CargarLista key={params.get("prov") ?? ""} inicial={Number(params.get("prov")) || null} onListo={() => ir("buscar")} /> : null}
      {tab === "historial" ? <Historial id={Number(params.get("producto")) || null} onElegir={(id) => ir("historial", id ? { producto: String(id) } : {})} /> : null}
    </div>
  );
}
