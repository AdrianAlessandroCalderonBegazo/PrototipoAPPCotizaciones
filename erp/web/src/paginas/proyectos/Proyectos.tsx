import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { dinero, leerMonto } from "../../dinero";
import { fecha, texto } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { EstadoProyecto, Parametros, Proyecto } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { BarraAvance, PillEstado, colorAvance, pctTexto } from "./comun";

type Lista = { proyectos: Proyecto[]; conteo: Record<EstadoProyecto, number> };
const FILTROS: { k: EstadoProyecto | ""; l: string }[] = [{ k: "", l: "Todos" }, { k: "activo", l: "Activos" }, { k: "pausado", l: "Pausados" }, { k: "finalizado", l: "Finalizados" }];
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function leerVista(): "tabla" | "tarjetas" {
  try {
    return localStorage.getItem("erp.proyectos.vista") === "tarjetas" ? "tarjetas" : "tabla";
  } catch {
    return "tabla";
  }
}

function NuevoProyecto({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: (p: Proyecto) => void }) {
  const [nombre, setNombre] = useState("");
  const [pres, setPres] = useState("");
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const monto = leerMonto(pres);
  const crear = async () => {
    setIntento(true);
    if (!nombre.trim() || !monto) return;
    setGuardando(true);
    setError(null);
    try {
      onCreado(await api<Proyecto>("POST", "/proyectos", { cuerpo: { nombre, presupuesto: monto } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo="Nuevo proyecto" icono="solar_power" onCerrar={onCerrar} pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando} onClick={crear}>{guardando ? "Creando…" : "Crear proyecto"}</button></>}>
      <div className="flex flex-col gap-4">
        <label>
          <span className="etiqueta">Nombre del proyecto</span>
          <input className="campo" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Granja Avícola Tiabaya" />
          {intento && !nombre.trim() ? <span className="mt-1 block text-[12px] font-semibold text-danger">Escribe un nombre para el proyecto.</span> : null}
        </label>
        <label>
          <span className="etiqueta">Presupuesto</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-2.5 text-[14px] font-bold text-text-3">S/</span>
            <input className="campo num pl-9" inputMode="decimal" value={pres} onChange={(e) => setPres(e.target.value)} placeholder="0.00" />
          </div>
          {intento && !monto ? <span className="mt-1 block text-[12px] font-semibold text-danger">Ingresa un monto mayor a 0 (hasta 2 decimales).</span> : monto ? <span className="mt-1 block text-[12px] text-text-3">{dinero(monto)}</span> : null}
        </label>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-text-2">El cliente, el tipo de sistema y el responsable se completan después en el detalle.</div>
        {error ? <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</div> : null}
      </div>
    </Modal>
  );
}

export function Proyectos() {
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const navegar = useNavigate();
  const editar = puede(usuario, "proyectos", "completo");
  const { datos, error, cargando, recargar } = useDatos(() => api<Lista>("GET", "/proyectos"));
  const umbrales = useDatos(() => api<Parametros>("GET", "/parametros"));
  const [filtro, setFiltro] = useState<EstadoProyecto | "">("");
  const [q, setQ] = useState("");
  const [vista, setVistaRaw] = useState(leerVista);
  const [nuevo, setNuevo] = useState(() => editar && new URLSearchParams(window.location.search).get("nuevo") === "1");
  const setVista = (v: "tabla" | "tarjetas") => {
    setVistaRaw(v);
    try {
      localStorage.setItem("erp.proyectos.vista", v);
    } catch {
      // no pasa nada
    }
  };
  const aviso = umbrales.datos?.presupuesto_aviso_pct ?? 80;
  const limite = umbrales.datos?.presupuesto_limite_pct ?? 100;

  const filas = useMemo(() => {
    const t = sinTildes(q.trim());
    return (datos?.proyectos ?? []).filter((p) => (!filtro || p.estado === filtro) && (!t || sinTildes(`${p.codigo} ${p.nombre} ${p.cliente ?? ""}`).includes(t)));
  }, [datos, filtro, q]);
  const total = datos ? datos.conteo.activo + datos.conteo.pausado + datos.conteo.finalizado : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="sobretitulo">Operación</div>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Proyectos</h1>
        </div>
        {editar ? (
          <button className="btn-primario" onClick={() => setNuevo(true)}>
            <Icono n="add" t={19} />
            Nuevo proyecto
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => {
            const n = f.k ? datos?.conteo[f.k] ?? 0 : total;
            const on = filtro === f.k;
            return (
              <button key={f.l} onClick={() => setFiltro(f.k)} className={`btn h-9 px-3 ${on ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}>
                {f.l}
                <span className={`rounded-md px-1.5 text-[11.5px] ${on ? "bg-surface" : "bg-surface-2"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Icono n="search" className="pointer-events-none absolute left-3 top-2.5 text-text-3" />
          <input className="campo pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, cliente o código" />
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {([["tabla", "Tabla", "table_rows"], ["tarjetas", "Tarjetas", "grid_view"]] as const).map(([k, l, i]) => (
            <button key={k} title={l} onClick={() => setVista(k)} className={`btn h-8 px-2.5 text-[12.5px] ${vista === k ? "bg-primary-soft text-primary-ink" : "text-text-2"}`}>
              <Icono n={i} t={18} />
              <span className="hidden sm:inline">{l}</span>
            </button>
          ))}
        </div>
      </div>

      {cargando && !datos ? <Cargando /> : error ? <ErrorCarga mensaje={error} reintentar={recargar} /> : !filas.length ? (
        <div className="tarjeta">
          {total ? (
            <Vacio icono="search_off" titulo={q ? `Sin resultados para “${q}”` : "No hay proyectos en este estado"}>Prueba con otro nombre, cliente o cambia el filtro de estado.</Vacio>
          ) : (
            <Vacio icono="solar_power" titulo="Aún no hay proyectos">{editar ? "Crea el primero con su nombre y presupuesto." : "Cuando Contabilidad o un administrador cree uno, aparecerá aquí."}</Vacio>
          )}
        </div>
      ) : vista === "tabla" ? (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3">
                <th className="px-5 py-2.5">Código</th><th className="px-3 py-2.5">Proyecto</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5 text-right">Presupuesto</th><th className="px-3 py-2.5 text-right">Gastado</th><th className="w-[180px] px-3 py-2.5">Avance</th><th className="px-5 py-2.5">Último gasto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} onClick={() => navegar(`/proyectos/${p.id}`)} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-[12.5px] font-bold text-text-2">{p.codigo}</td>
                  <td className="px-3 py-3">
                    <div className="font-bold">{p.nombre}</div>
                    <div className="text-[12.5px] text-text-3">{[p.cliente, p.tipo_sistema].filter(Boolean).join(" · ") || "Sin dato"}</div>
                  </td>
                  <td className="px-3 py-3"><PillEstado e={p.estado} /></td>
                  <td className="num whitespace-nowrap px-3 py-3 text-right">{dinero(p.presupuesto, p.moneda)}</td>
                  <td className="num whitespace-nowrap px-3 py-3 text-right font-semibold">{dinero(p.gastado, p.moneda)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <BarraAvance pct={p.porcentaje} aviso={aviso} limite={limite} />
                      <span className="num w-12 text-right text-[12px] font-bold" style={{ color: colorAvance(p.porcentaje, aviso, limite) }}>{pctTexto(p.porcentaje)}</span>
                    </div>
                  </td>
                  <td className="num whitespace-nowrap px-5 py-3 text-text-2">{p.ultimo_gasto ? fecha(p.ultimo_gasto) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((p) => (
            <button key={p.id} onClick={() => navegar(`/proyectos/${p.id}`)} className="tarjeta flex flex-col gap-3 p-5 text-left hover:border-primary-line">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary-ink"><Icono n="solar_power" t={22} /></span>
                <PillEstado e={p.estado} />
              </div>
              <div>
                <div className="text-[15px] font-bold">{p.nombre}</div>
                <div className="text-[12.5px] text-text-3">{[p.codigo, p.tipo_sistema, p.marca].filter(Boolean).join(" · ")}</div>
                <div className="text-[12.5px] text-text-3">{texto(p.ubicacion)}</div>
              </div>
              {p.causa_pausa ? <div className="rounded-lg bg-warning-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-warning">{p.causa_pausa}</div> : null}
              <div className="mt-auto">
                <div className="mb-1.5 flex justify-between text-[12.5px]"><span className="text-text-2">Gastado {dinero(p.gastado, p.moneda)}</span><b style={{ color: colorAvance(p.porcentaje, aviso, limite) }}>{pctTexto(p.porcentaje)}</b></div>
                <BarraAvance pct={p.porcentaje} aviso={aviso} limite={limite} />
                <div className="mt-1.5 text-[12px] text-text-3">Presupuesto {dinero(p.presupuesto, p.moneda)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {nuevo ? (
        <NuevoProyecto
          onCerrar={() => setNuevo(false)}
          onCreado={(p) => {
            setNuevo(false);
            avisar("Proyecto creado", `${p.codigo} · ${p.nombre}`);
            navegar(`/proyectos/${p.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
