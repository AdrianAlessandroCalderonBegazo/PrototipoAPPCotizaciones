import { useMemo, useState } from "react";
import { api } from "../api";
import { Cargando, ErrorCarga, Vacio } from "../componentes/Estado";
import { Icono } from "../componentes/Icono";
import { Pildora, type TonoPildora } from "../componentes/Pildora";
import { enlaceApp } from "../enlaces";
import { fecha, texto } from "../formato";
import { useDatos } from "../usarDatos";

type Requerimiento = { id: number; numero: string; obra: string; solicitante: string; urgente: boolean; estado: string; fecha_creacion: string; aprobado_por?: string | null; categorias_json: string };
type Salida = { id: number; numero: string; obra: string; responsable: string; maleta: string | null; estado: string; fecha_salida: string; fecha_devolucion: string | null; categorias_json: string };

const EST_REQ: Record<string, [string, TonoPildora]> = {
  pendiente: ["Por aprobar", "aviso"],
  aprobado: ["Aprobado · por alistar", "primario"],
  listo: ["Listo para entregar", "exito"],
  entregado: ["Entregado", "neutro"],
};
const EST_SAL: Record<string, [string, TonoPildora]> = {
  registrado: ["Salida por confirmar", "aviso"],
  pendiente: ["En obra", "primario"],
  conforme: ["Devuelto", "exito"],
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function contarItems(json: string) {
  try {
    return (JSON.parse(json) as { items?: unknown[] }[]).reduce((n, c) => n + (c.items?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

type Filtros = { q: string; desde: string; hasta: string; estado: string };
const enRango = (f: string, desde: string, hasta: string) => {
  const d = f.slice(0, 10);
  return (!desde || d >= desde) && (!hasta || d <= hasta);
};

function BarraFiltros({ f, setF, estados, persona }: { f: Filtros; setF: (f: Filtros) => void; estados: Record<string, [string, TonoPildora]>; persona: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <label className="min-w-[220px] flex-[2]">
        <span className="etiqueta">Buscar</span>
        <input className="campo" placeholder={`Número, obra o ${persona}`} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      </label>
      <label className="min-w-[150px] flex-1">
        <span className="etiqueta">Estado</span>
        <select className="campo" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
          <option value="">Todos</option>
          {Object.entries(estados).map(([k, [l]]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </label>
      <label className="min-w-[140px] flex-1">
        <span className="etiqueta">Desde</span>
        <input className="campo" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
      </label>
      <label className="min-w-[140px] flex-1">
        <span className="etiqueta">Hasta</span>
        <input className="campo" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
      </label>
    </div>
  );
}

const VACIO: Filtros = { q: "", desde: "", hasta: "", estado: "" };

export function Almacen() {
  const [pestana, setPestana] = useState<"req" | "her">("req");
  const [f, setF] = useState<Filtros>(VACIO);
  const req = useDatos(() => api<Requerimiento[]>("GET", "/requerimientos"));
  const her = useDatos(() => api<Salida[]>("GET", "/herramientas"));
  const logistica = enlaceApp("cotizador");

  const reqs = useMemo(() => {
    const t = sinTildes(f.q.trim());
    return (req.datos ?? []).filter((r) => (!t || sinTildes(`${r.numero} ${r.obra} ${r.solicitante}`).includes(t)) && (!f.estado || r.estado === f.estado) && enRango(r.fecha_creacion, f.desde, f.hasta));
  }, [req.datos, f]);
  const sals = useMemo(() => {
    const t = sinTildes(f.q.trim());
    return (her.datos ?? []).filter((s) => (!t || sinTildes(`${s.numero} ${s.obra} ${s.responsable} ${s.maleta ?? ""}`).includes(t)) && (!f.estado || s.estado === f.estado) && enRango(s.fecha_salida, f.desde, f.hasta));
  }, [her.datos, f]);

  const cambiar = (p: "req" | "her") => {
    setPestana(p);
    setF(VACIO);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="sobretitulo">Operación</div>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Almacén</h1>
        </div>
        {logistica ? (
          <a href={logistica} target="_blank" rel="noreferrer" className="btn-secundario no-underline">
            <Icono n="open_in_new" t={18} />
            Abrir Logística
          </a>
        ) : null}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-solar bg-solar-soft p-4 text-[13.5px]">
        <Icono n="construction" t={22} className="text-warning" />
        <div>
          <div className="font-bold">En construcción</div>
          <div className="text-text-2">El inventario todavía no está digitalizado. Aquí ves, solo para consulta, los requerimientos de materiales y las salidas de herramientas que se registran en la app de Logística.</div>
        </div>
      </div>

      <div className="flex gap-1.5">
        {([["req", "Requerimientos de materiales", "inventory_2"], ["her", "Salidas de herramientas", "construction"]] as const).map(([k, l, i]) => (
          <button key={k} onClick={() => cambiar(k)} className={`btn h-10 ${pestana === k ? "bg-primary-soft text-primary-ink" : "text-text-2 hover:bg-surface-2"}`}>
            <Icono n={i} t={19} />
            {l}
          </button>
        ))}
      </div>

      <div className="tarjeta flex flex-col gap-4 p-4 sm:p-5">
        <BarraFiltros f={f} setF={setF} estados={pestana === "req" ? EST_REQ : EST_SAL} persona={pestana === "req" ? "solicitante" : "responsable"} />
        {pestana === "req" ? (
          req.cargando ? <Cargando /> : req.error ? <ErrorCarga mensaje={req.error} reintentar={req.recargar} /> : reqs.length === 0 ? (
            <Vacio icono="inventory_2" titulo="No hay requerimientos">{req.datos?.length ? "Ninguno coincide con los filtros." : "Cuando alguien pida materiales en Logística, aparecerá aquí."}</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3">
                    <th className="px-3 py-2.5">Número</th><th className="px-3 py-2.5">Obra</th><th className="px-3 py-2.5">Solicitante</th><th className="px-3 py-2.5">Ítems</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r) => {
                    const [l, t] = EST_REQ[r.estado] ?? [r.estado, "neutro"];
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-2.5 font-bold">{r.numero}{r.urgente ? <span className="ml-2"><Pildora tono="peligro">Urgente</Pildora></span> : null}</td>
                        <td className="px-3 py-2.5">{texto(r.obra)}</td>
                        <td className="px-3 py-2.5">{texto(r.solicitante)}</td>
                        <td className="num px-3 py-2.5">{contarItems(r.categorias_json)}</td>
                        <td className="px-3 py-2.5"><Pildora tono={t}>{l}</Pildora></td>
                        <td className="num whitespace-nowrap px-3 py-2.5">{fecha(r.fecha_creacion)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : her.cargando ? <Cargando /> : her.error ? <ErrorCarga mensaje={her.error} reintentar={her.recargar} /> : sals.length === 0 ? (
          <Vacio icono="construction" titulo="No hay salidas de herramientas">{her.datos?.length ? "Ninguna coincide con los filtros." : "Cuando se registre una salida en Logística, aparecerá aquí."}</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3">
                  <th className="px-3 py-2.5">Número</th><th className="px-3 py-2.5">Obra</th><th className="px-3 py-2.5">Responsable</th><th className="px-3 py-2.5">Maleta</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5">Salida</th><th className="px-3 py-2.5">Devolución</th>
                </tr>
              </thead>
              <tbody>
                {sals.map((s) => {
                  const [l, t] = EST_SAL[s.estado] ?? [s.estado, "neutro"];
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5 font-bold">{s.numero}</td>
                      <td className="px-3 py-2.5">{texto(s.obra)}</td>
                      <td className="px-3 py-2.5">{texto(s.responsable)}</td>
                      <td className="px-3 py-2.5">{s.maleta ? s.maleta : <span className="text-text-3">Por checklist</span>}</td>
                      <td className="px-3 py-2.5"><Pildora tono={t}>{l}</Pildora></td>
                      <td className="num whitespace-nowrap px-3 py-2.5">{fecha(s.fecha_salida)}</td>
                      <td className="num whitespace-nowrap px-3 py-2.5">{s.fecha_devolucion ? fecha(s.fecha_devolucion) : <span className="text-text-3">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
