import { useState } from "react";
import { api } from "../../api";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { fechaHora } from "../../formato";
import type { RegistroAuditoria } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { ACCIONES, ENTIDADES, diferencias } from "./auditoriaLogica";

const ROL: Record<string, string> = { admin: "Administrador", ventas: "Ventas", contabilidad: "Contabilidad", tecnico: "Técnico" };

export function Auditoria() {
  const [f, setF] = useState({ entidad: "", usuario: "", desde: "", hasta: "" });
  const [abierto, setAbierto] = useState<number | null>(null);
  const { datos, error, cargando, recargar } = useDatos(() => api<RegistroAuditoria[]>("GET", "/auditoria", { consulta: { ...f, limite: 300 } }), [f.entidad, f.desde, f.hasta, f.usuario]);

  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="titulo-seccion">Auditoría</div>
          <div className="mt-0.5 text-[13px] text-text-2">Quién cambió qué y cuándo, con el valor anterior. Nadie puede editar ni borrar este registro.</div>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="min-w-[180px] flex-1">
            <span className="etiqueta">Qué</span>
            <select className="campo" value={f.entidad} onChange={(e) => setF({ ...f, entidad: e.target.value })}>
              <option value="">Todo</option>
              {Object.entries(ENTIDADES).map(([k, l]) => (
                <option key={k} value={k}>{l[0]!.toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="min-w-[180px] flex-1">
            <span className="etiqueta">Quién</span>
            <input className="campo" placeholder="Nombre" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} />
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
      </div>
      {cargando && !datos ? <Cargando /> : error ? <div className="p-4"><ErrorCarga mensaje={error} reintentar={recargar} /></div> : !datos?.length ? (
        <Vacio icono="history" titulo="Sin registros">No hay cambios con esos filtros.</Vacio>
      ) : (
        <ul>
          {datos.map((r) => {
            const difs = diferencias(r.antes, r.despues);
            const abiertoAqui = abierto === r.id;
            return (
              <li key={r.id} className="border-b border-border last:border-0">
                <button onClick={() => setAbierto(abiertoAqui ? null : r.id)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-surface-2">
                  <Icono n={r.accion === "eliminar" ? "delete" : r.accion === "crear" ? "add_circle" : "edit"} t={20} className={r.accion === "eliminar" ? "mt-0.5 text-danger" : "mt-0.5 text-text-3"} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px]">
                      <b>{r.usuario ?? "Sistema"}</b>
                      {r.rol ? <span className="text-text-3"> ({ROL[r.rol] ?? r.rol})</span> : null} {(ACCIONES[r.accion] ?? r.accion).toLowerCase()} {ENTIDADES[r.entidad] ?? r.entidad}
                      {r.entidad_id ? <span className="text-text-3"> #{r.entidad_id}</span> : null}
                    </div>
                    <div className="num mt-0.5 text-[12px] text-text-3">
                      {fechaHora(r.fecha)}
                      {difs.length ? ` · ${difs.length} ${difs.length === 1 ? "campo" : "campos"}` : ""}
                      {r.detalle ? ` · ${r.detalle}` : ""}
                    </div>
                  </div>
                  {difs.length ? <Icono n={abiertoAqui ? "expand_less" : "expand_more"} className="text-text-3" /> : null}
                </button>
                {abiertoAqui && difs.length ? (
                  <div className="overflow-x-auto px-5 pb-4">
                    <table className="w-full min-w-[520px] border-collapse rounded-xl text-[12.5px]">
                      <thead>
                        <tr className="text-left text-[11.5px] font-bold uppercase tracking-wide text-text-3"><th className="py-1.5 pr-3">Campo</th><th className="py-1.5 pr-3">Antes</th><th className="py-1.5">Después</th></tr>
                      </thead>
                      <tbody>
                        {difs.slice(0, 80).map((d) => (
                          <tr key={d.campo} className="border-t border-border align-top">
                            <td className="py-1.5 pr-3 font-mono text-[12px]">{d.campo}</td>
                            <td className="max-w-[320px] break-words py-1.5 pr-3 text-danger">{d.antes}</td>
                            <td className="max-w-[320px] break-words py-1.5 text-success">{d.despues}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
