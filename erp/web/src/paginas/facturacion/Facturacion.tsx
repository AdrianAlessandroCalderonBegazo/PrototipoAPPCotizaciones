import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { dinero } from "../../dinero";
import { fecha } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { EstadoCpe, ListaCpe } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { ESTADO_CPE, PillCpe, TIPO_CPE, nombreCpe } from "./comun";
import { useExtension } from "./extension";
import { FlujoComprobante } from "./Flujo";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Comprobantes() {
  const navegar = useNavigate();
  const { datos, error, cargando, recargar } = useDatos(() => api<ListaCpe>("GET", "/facturacion"));
  const [filtro, setFiltro] = useState<EstadoCpe | "">("");
  const [q, setQ] = useState("");
  const filas = useMemo(() => {
    const t = sinTildes(q.trim());
    return (datos?.comprobantes ?? []).filter((c) => (!filtro || c.estado === filtro) && (!t || sinTildes(`${c.numero ?? ""} ${c.cliente_nombre ?? ""} ${c.cliente_doc ?? ""}`).includes(t)));
  }, [datos, filtro, q]);
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!datos) return null;
  const mes = MESES[Number(datos.resumen.mes.slice(5, 7)) - 1];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1">
          {([["", "Todos"], ...Object.entries(ESTADO_CPE).map(([k, v]) => [k, v.l])] as [EstadoCpe | "", string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`btn h-9 px-3 ${filtro === k ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}>
              {l}<span className={`rounded-md px-1.5 text-[11.5px] ${filtro === k ? "bg-surface" : "bg-surface-2"}`}>{k ? datos.resumen.por_estado[k] : datos.comprobantes.length}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Icono n="search" className="pointer-events-none absolute left-3 top-2.5 text-text-3" />
          <input className="campo pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, cliente o RUC/DNI" />
        </div>
        <div className="text-[13px] text-text-2">Emitido en {mes}: <b className="num text-text">{dinero(datos.resumen.emitido_mes)}</b> · {datos.resumen.emitidos_mes} comprobante{datos.resumen.emitidos_mes === 1 ? "" : "s"}</div>
      </div>
      {!filas.length ? (
        <div className="tarjeta"><Vacio icono="receipt_long" titulo={datos.comprobantes.length ? "Ningún comprobante coincide" : "Aún no hay comprobantes"}>{datos.comprobantes.length ? "Cambia el filtro o la búsqueda." : "Prepara el primero en la pestaña «Emitir comprobante»."}</Vacio></div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
            <thead><tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3"><th className="px-5 py-3">Comprobante</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Acción</th></tr></thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.id} onClick={() => navegar(`/facturacion/${c.id}`)} className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${c.estado === "anulado" ? "text-text-3" : ""}`}>
                  <td className="px-5 py-3"><div className="font-mono font-bold">{nombreCpe(c)}</div><div className="text-[12px] text-text-3">{TIPO_CPE[c.tipo].l}{c.cotizacion_numero ? ` · cot. ${c.cotizacion_numero}` : ""}</div></td>
                  <td className="px-3 py-3"><div className="font-semibold">{c.cliente_nombre ?? "Cliente sin identificar"}</div><div className="text-[12px] text-text-3">{c.cliente_doc ? `${c.cliente_tipo_doc} ${c.cliente_doc}` : "Sin documento"}</div></td>
                  <td className="num whitespace-nowrap px-3 py-3">{fecha(c.fecha_emision ?? c.creado_en)}</td>
                  <td className="px-3 py-3"><PillCpe e={c.estado} /></td>
                  <td className="num whitespace-nowrap px-3 py-3 text-right font-bold">{dinero(c.totales.total, c.moneda)}</td>
                  <td className="px-5 py-3 text-right text-[13px] font-semibold text-primary-ink">{c.estado === "borrador" ? "Continuar" : c.estado === "enviado" ? "Marcar emitido" : c.estado === "emitido" ? "Ver" : "Ver motivo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Facturacion() {
  const { usuario } = useSesion();
  const [params, setParams] = useSearchParams();
  const editar = puede(usuario, "facturacion", "completo");
  const tab = params.get("tab") === "comprobantes" || !editar ? "comprobantes" : "emitir";
  const ext = useExtension();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="sobretitulo">Finanzas</div><h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Facturación SUNAT</h1></div>
        <span className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold ${ext.estado === "conectada" ? "border-success text-success" : "border-border text-text-3"}`}>
          <Icono n={ext.estado === "conectada" ? "extension" : "extension_off"} t={18} />{ext.estado === "conectada" ? "Extensión conectada" : ext.estado === "buscando" ? "Buscando extensión…" : "Extensión no instalada"}
        </span>
      </div>
      <div className="flex gap-1.5">
        {editar ? <button onClick={() => setParams({})} className={`btn h-10 px-4 ${tab === "emitir" ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}><Icono n="add_circle" t={18} />Emitir comprobante</button> : null}
        <button onClick={() => setParams({ tab: "comprobantes" })} className={`btn h-10 px-4 ${tab === "comprobantes" ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}><Icono n="history" t={18} />Comprobantes</button>
      </div>
      {tab === "emitir" ? <FlujoComprobante key="nuevo" /> : <Comprobantes />}
    </div>
  );
}

export function ComprobanteVer() {
  const { id } = useParams();
  return <FlujoComprobante key={id} id={Number(id)} />;
}
