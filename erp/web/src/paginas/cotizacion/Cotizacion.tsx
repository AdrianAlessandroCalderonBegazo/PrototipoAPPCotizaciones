import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { dinero } from "../../dinero";
import { fecha } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { CotizacionResumen, EstadoCot, Parametros, Producto } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { Catalogo } from "./Catalogo";
import { PillCot } from "./comun";
import { CargarImagenes, ImportarCsv } from "./Importar";
import { Kits } from "./Kits";

type Pestana = "cotizaciones" | "catalogo" | "kits";
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function ListaCotizaciones({ lista }: { lista: CotizacionResumen[] }) {
  const navegar = useNavigate();
  const [estado, setEstado] = useState<EstadoCot | "" | "sin">("");
  const [q, setQ] = useState("");
  const filas = useMemo(() => {
    const t = sinTildes(q.trim());
    return lista.filter((c) => (estado === "" || (estado === "sin" ? c.estado === null : c.estado === estado)) && (!t || sinTildes(`${c.numero} ${c.cliente} ${c.vendedor ?? ""} ${c.ruc_dni ?? ""}`).includes(t)));
  }, [lista, estado, q]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1">
          {([["", "Todas"], ["borrador", "Borradores"], ["enviada", "Enviadas"], ["aceptada", "Aceptadas"], ["rechazada", "Rechazadas"], ["sin", "De Logística"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setEstado(k)} className={`btn h-9 px-3 ${estado === k ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}>
              {l}<span className={`rounded-md px-1.5 text-[11.5px] ${estado === k ? "bg-surface" : "bg-surface-2"}`}>{k === "" ? lista.length : lista.filter((c) => (k === "sin" ? c.estado === null : c.estado === k)).length}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Icono n="search" className="pointer-events-none absolute left-3 top-2.5 text-text-3" />
          <input className="campo pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, cliente, RUC o asesor" />
        </div>
      </div>
      {!filas.length ? (
        <div className="tarjeta"><Vacio icono="request_quote" titulo={lista.length ? "Ninguna cotización coincide" : "Aún no hay cotizaciones"}>{lista.length ? "Cambia el filtro o la búsqueda." : "Crea la primera con «Nueva cotización»."}</Vacio></div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[13.5px]">
            <thead><tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3"><th className="px-5 py-2.5">Número</th><th className="px-3 py-2.5">Cliente</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5">Asesor</th><th className="px-3 py-2.5">Fecha</th><th className="px-3 py-2.5">Vigencia</th><th className="px-5 py-2.5 text-right">Total</th></tr></thead>
            <tbody>
              {filas.map((c) => {
                const vencida = c.valida_hasta && c.valida_hasta < hoy && (c.estado === "enviada" || c.estado === "borrador");
                return (
                  <tr key={c.id} onClick={() => navegar(`/cotizacion/${c.id}`)} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="whitespace-nowrap px-5 py-3 font-mono font-bold">{c.numero}</td>
                    <td className="px-3 py-3"><div className="font-semibold">{c.cliente || "Cliente sin nombre"}</div><div className="text-[12px] text-text-3">{c.ruc_dni ?? ""}{c.origen === "logistica" ? `${c.ruc_dni ? " · " : ""}hecha en Logística` : ""}</div></td>
                    <td className="px-3 py-3"><PillCot e={c.estado} /></td>
                    <td className="px-3 py-3">{c.vendedor ?? <span className="text-text-3">Sin dato</span>}</td>
                    <td className="num whitespace-nowrap px-3 py-3">{fecha(c.fecha)}</td>
                    <td className="num whitespace-nowrap px-3 py-3">{c.valida_hasta ? <span className={vencida ? "font-semibold text-danger" : ""}>{vencida ? "Venció " : "Hasta "}{fecha(c.valida_hasta)}</span> : <span className="text-text-3">—</span>}</td>
                    <td className="num whitespace-nowrap px-5 py-3 text-right font-bold">{dinero(c.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Cotizacion() {
  const { usuario } = useSesion();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Pestana) || "cotizaciones";
  const editar = puede(usuario, "cotizacion", "completo");
  const cat = useDatos(() => api<{ productos: Producto[] }>("GET", "/catalogo"));
  const cots = useDatos(() => api<{ cotizaciones: CotizacionResumen[] }>("GET", "/ventas/cotizaciones"));
  const kits = useDatos(() => api<unknown[]>("GET", "/kits"));
  const param = useDatos(() => api<Parametros>("GET", "/parametros"));
  const [modal, setModal] = useState<"csv" | "imagenes" | null>(null);
  const [nuevoProducto, setNuevoProducto] = useState(false);
  const setTab = (t: Pestana) => setParams(t === "cotizaciones" ? {} : { tab: t }, { replace: true });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="sobretitulo">Comercial</div>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Cotización</h1>
        </div>
        {editar ? (
          <div className="flex flex-wrap gap-2">
            {tab === "catalogo" ? (
              <>
                <button className="btn-secundario" onClick={() => setModal("imagenes")}><Icono n="photo_library" t={18} />Cargar imágenes</button>
                <button className="btn-secundario" onClick={() => setModal("csv")}><Icono n="upload_file" t={18} />Importar CSV</button>
                <button className="btn-secundario" onClick={() => setNuevoProducto(true)}><Icono n="add" t={18} />Nuevo producto</button>
              </>
            ) : null}
            <button className="btn-primario" onClick={() => navegar("/cotizacion/nueva")}><Icono n="add" t={18} />Nueva cotización</button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {([["cotizaciones", "Cotizaciones", "request_quote", cots.datos?.cotizaciones.length], ["catalogo", "Catálogo", "inventory_2", cat.datos?.productos.length], ["kits", "Kits", "inventory", kits.datos?.length]] as const).map(([k, l, i, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`btn h-10 ${tab === k ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}>
            <Icono n={i} t={19} />{l}{n !== undefined ? <span className={`rounded-md px-1.5 text-[11.5px] ${tab === k ? "bg-surface" : "bg-surface-2"}`}>{n}</span> : null}
          </button>
        ))}
      </div>
      {tab === "cotizaciones" ? (cots.cargando && !cots.datos ? <Cargando /> : cots.error ? <ErrorCarga mensaje={cots.error} reintentar={cots.recargar} /> : <ListaCotizaciones lista={cots.datos!.cotizaciones} />) : null}
      {tab === "catalogo" ? (cat.cargando && !cat.datos ? <Cargando texto="Cargando el catálogo…" /> : cat.error ? <ErrorCarga mensaje={cat.error} reintentar={cat.recargar} /> : (
        <Catalogo
          productos={cat.datos!.productos}
          setProductos={(f) => cat.setDatos((d) => (d ? { ...d, productos: f(d.productos) } : d))}
          editar={editar}
          param={param.datos}
          nuevo={nuevoProducto}
          onNuevoCerrado={() => setNuevoProducto(false)}
        />
      )) : null}
      {tab === "kits" ? (cat.datos ? <Kits productos={cat.datos.productos} editar={editar} /> : <Cargando />) : null}
      {modal === "csv" ? <ImportarCsv onCerrar={() => setModal(null)} onHecho={() => void cat.recargar()} /> : null}
      {modal === "imagenes" ? <CargarImagenes onCerrar={() => setModal(null)} onHecho={() => void cat.recargar()} /> : null}
    </div>
  );
}
