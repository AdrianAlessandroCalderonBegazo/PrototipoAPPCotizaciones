// Activos y control (diseño ERP_ICR.zip › Activos y control). Decisión del dueño: VRM solo embebido (iframe), sin la API de VRM.
// Pestañas: «Sistemas» (sitios instalados, sus equipos con serie y garantía) y «Victron VRM» (el portal a pantalla completa).
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { Pildora } from "../../componentes/Pildora";
import { fecha, hoyLima } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { Equipo, ListaSistemas, OpcionesAlmacen, Sistema, TipoEquipo } from "../../tipos";
import { useDatos } from "../../usarDatos";

const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);
const VRM = "https://vrm.victronenergy.com/";
const TIPO: Record<TipoEquipo, [string, string]> = {
  inversor: ["Inversor", "bolt"], bateria: ["Batería", "battery_charging_full"], panel: ["Paneles", "solar_power"],
  controlador: ["Controlador", "tune"], monitoreo: ["Monitoreo (GX)", "router"], otro: ["Otro", "category"],
};

export function Activos() {
  const { usuario } = useSesion();
  const editar = puede(usuario, "activos", "completo");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "vrm" ? "vrm" : "sistemas";
  const lista = useDatos(() => api<ListaSistemas>("GET", "/activos"));
  const verVrm = (id: number) => setParams({ tab: "vrm", sistema: String(id) });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="sobretitulo">Operación</div><h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Activos y control</h1></div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {([["sistemas", "Sistemas instalados", "solar_power"], ["vrm", "Victron VRM", "dashboard"]] as const).map(([k, l, i]) => (
          <button key={k} onClick={() => setParams(k === "vrm" ? { tab: "vrm", ...(params.get("sistema") ? { sistema: params.get("sistema")! } : {}) } : {})} className={`btn h-10 px-4 ${tab === k ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}><Icono n={i} t={18} />{l}</button>
        ))}
      </div>
      {lista.cargando && !lista.datos ? <Cargando /> : lista.error ? <ErrorCarga mensaje={lista.error} reintentar={lista.recargar} /> : tab === "vrm" ? (
        <PortalVrm sistemas={lista.datos!.activos} elegido={Number(params.get("sistema")) || null} onElegir={(id) => setParams(id ? { tab: "vrm", sistema: String(id) } : { tab: "vrm" })} />
      ) : (
        <Sistemas datos={lista.datos!} editar={editar} resaltar={Number(params.get("sistema")) || null} onCambio={lista.recargar} onVrm={verVrm} />
      )}
    </div>
  );
}

function PortalVrm({ sistemas, elegido, onElegir }: { sistemas: Sistema[]; elegido: number | null; onElegir: (id: number | null) => void }) {
  const conVrm = sistemas.filter((s) => s.vrm_url);
  const s = conVrm.find((x) => x.id === elegido) ?? null;
  const url = s?.vrm_url ?? VRM;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <select className="campo h-[42px] w-auto min-w-[240px] font-bold" value={s?.id ?? ""} onChange={(e) => onElegir(Number(e.target.value) || null)}>
          <option value="">Portal VRM · todas mis instalaciones</option>
          {conVrm.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primario no-underline"><Icono n="open_in_new" t={20} />Abrir en pestaña nueva</a>
      </div>
      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-surface" style={{ height: "calc(100vh - 290px)" }}>
        <div className="flex h-10 items-center gap-2 border-b border-border bg-surface-2 px-3.5 text-[12.5px] text-text-2">
          <Icono n="lock" t={16} className="text-success" />
          <span className="truncate font-mono">{url.replace(/^https:\/\//, "")}</span>
        </div>
        <iframe key={url} src={url} title={`Victron VRM${s ? ` · ${s.nombre}` : ""}`} className="w-full flex-1 border-0 bg-surface" allow="fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <p className="flex items-start gap-2 text-[12.5px] text-text-3">
        <Icono n="info" t={16} />
        <span>El portal se abre con tu propia sesión de VRM (inicia sesión dentro del recuadro la primera vez). Si se ve en blanco o dice que no se puede mostrar,
          VRM bloqueó la vista embebida o el navegador no guardó la sesión: usa «Abrir en pestaña nueva». {conVrm.length ? null : "Para elegir una instalación, agrega su dirección de VRM en «Sistemas instalados»."}</span>
      </p>
    </div>
  );
}

function Sistemas({ datos, editar, resaltar, onCambio, onVrm }: { datos: ListaSistemas; editar: boolean; resaltar: number | null; onCambio: () => void; onVrm: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Sistema | "nuevo" | null>(null);
  const [equipo, setEquipo] = useState<{ s: Sistema; e: Equipo | null } | null>(null);
  const n = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = datos.activos.filter((s) => !q.trim() || n([s.nombre, s.cliente, s.ubicacion, s.proyecto, ...s.equipos.flatMap((e) => [e.marca, e.modelo, e.serie])].filter(Boolean).join(" ")).includes(n(q.trim())));
  const r = datos.resumen;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5 rounded-[20px] p-5 text-white" style={{ background: "linear-gradient(115deg,var(--hero-a),var(--hero-b))" }}>
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider"><span className="h-2 w-2 rounded-full" style={{ background: "var(--solar)" }} />Sistemas instalados</div>
          <div className="num text-[34px] font-extrabold leading-none">{r.sistemas}</div>
          <div className="text-[13px] opacity-90">{r.con_vrm} con portal VRM</div>
        </div>
        {[["Equipos registrados", String(r.equipos), "inversores, baterías, paneles…", undefined], ["Garantías por vencer", String(r.por_vencer), `en los próximos ${datos.dias_aviso} días`, r.por_vencer ? "var(--warning)" : "var(--success)"]].map(([l, v, sub, c]) => (
          <div key={l} className="tarjeta flex flex-col gap-1.5 p-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wide text-text-2">{l}</div>
            <div className="num text-[26px] font-extrabold" style={{ color: c }}>{v}</div>
            <div className="text-[12px] text-text-3">{sub}</div>
          </div>
        ))}
        <div className="tarjeta flex flex-col justify-center gap-2 p-4">
          {editar ? <button className="btn-primario" onClick={() => setForm("nuevo")}><Icono n="add" t={18} />Nuevo sistema</button> : null}
          <a href={VRM} target="_blank" rel="noopener noreferrer" className="btn-secundario no-underline"><Icono n="open_in_new" t={18} />Portal VRM</a>
        </div>
      </div>
      {datos.activos.length ? <input className="campo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por sitio, cliente, marca, modelo o número de serie" /> : null}
      {!datos.activos.length ? (
        <div className="tarjeta"><Vacio icono="solar_power" titulo="Aún no hay sistemas registrados">Registra cada sistema instalado (cliente o sitio), su dirección en VRM y sus equipos con número de serie y garantía.</Vacio></div>
      ) : !lista.length ? <div className="tarjeta"><Vacio icono="search_off" titulo="Ningún sistema con esa búsqueda" /></div> : (
        lista.map((s) => (
          <section key={s.id} className="tarjeta overflow-hidden" style={resaltar === s.id ? { borderColor: "var(--primary)" } : undefined}>
            <div className="flex flex-wrap items-start gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink"><Icono n="solar_power" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-extrabold">{s.nombre}</div>
                <div className="text-[12.5px] text-text-2">{s.cliente ?? "Cliente: Sin dato"} · {s.ubicacion ?? "Ubicación: Sin dato"} · instalado {s.fecha_instalacion ? fecha(s.fecha_instalacion) : "Sin dato"}{s.proyecto ? ` · proyecto ${s.proyecto}` : ""}</div>
                {s.notas ? <div className="mt-0.5 text-[12.5px] text-text-3">{s.notas}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {s.vrm_url ? <button className="btn-secundario h-9" onClick={() => onVrm(s.id)}><Icono n="dashboard" t={18} />Ver en VRM</button> : <span className="inline-flex h-9 items-center text-[12.5px] text-text-3">Sin dirección de VRM</span>}
                {editar ? <button className="btn-secundario h-9" onClick={() => setForm(s)}><Icono n="edit" t={18} />Editar</button> : null}
              </div>
            </div>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                <thead><tr className="bg-surface-2 text-[11px] font-bold uppercase tracking-wide text-text-3">{["Equipo", "Marca y modelo", "N.° de serie", "Cant.", "Garantía hasta", ""].map((c, i) => <th key={i} className={`px-4 py-2 ${c === "Cant." ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
                <tbody>
                  {s.equipos.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-4 py-2"><span className="inline-flex items-center gap-1.5 font-semibold"><Icono n={TIPO[e.tipo][1]} t={17} className="text-text-3" />{TIPO[e.tipo][0]}</span></td>
                      <td className="px-4 py-2">{[e.marca, e.modelo].filter(Boolean).join(" · ")}</td>
                      <td className="px-4 py-2 font-mono text-[12px]">{e.serie ?? <span className="font-sans text-text-3">Sin dato</span>}</td>
                      <td className="num px-4 py-2 text-right">{e.cantidad}</td>
                      <td className="px-4 py-2">{e.garantia_hasta ? <span className="inline-flex items-center gap-2">{fecha(e.garantia_hasta)}{e.garantia === "vencida" ? <Pildora tono="neutro">Vencida</Pildora> : e.garantia === "por_vencer" ? <Pildora tono="aviso">Por vencer</Pildora> : null}</span> : <span className="text-text-3">Sin dato</span>}</td>
                      <td className="px-4 py-2 text-right">{editar ? <button className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface-2" title="Editar equipo" onClick={() => setEquipo({ s, e })}><Icono n="edit" t={17} /></button> : null}</td>
                    </tr>
                  ))}
                  {!s.equipos.length ? <tr><td colSpan={6} className="px-4 py-3 text-[12.5px] text-text-3">Sin equipos registrados.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {editar ? <div className="border-t border-border px-4 py-2.5"><button className="text-[13px] font-semibold text-primary-ink" onClick={() => setEquipo({ s, e: null })}>+ Agregar equipo</button></div> : null}
          </section>
        ))
      )}
      {form ? <FormSistema s={form === "nuevo" ? null : form} onCerrar={() => setForm(null)} onHecho={() => { setForm(null); onCambio(); }} /> : null}
      {equipo ? <FormEquipo s={equipo.s} e={equipo.e} tipos={datos.tipos} onCerrar={() => setEquipo(null)} onHecho={() => { setEquipo(null); onCambio(); }} /> : null}
    </div>
  );
}

function FormSistema({ s, onCerrar, onHecho }: { s: Sistema | null; onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const proyectos = useDatos(() => api<OpcionesAlmacen>("GET", "/almacen/opciones").then((o) => o.proyectos).catch(() => []));
  const [d, setD] = useState({ nombre: s?.nombre ?? "", cliente: s?.cliente ?? "", ubicacion: s?.ubicacion ?? "", fecha_instalacion: s?.fecha_instalacion ?? "", vrm_url: s?.vrm_url ?? "", proyecto_id: s?.proyecto_id ? String(s.proyecto_id) : "", notas: s?.notas ?? "", activo: s?.activo ?? true });
  const [guardando, setGuardando] = useState(false);
  const c = (k: keyof typeof d) => ({ value: String(d[k]), onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  const vrmMal = d.vrm_url.trim() !== "" && !d.vrm_url.trim().startsWith(VRM);
  const guardar = async () => {
    setGuardando(true);
    try {
      const cuerpo = { ...d, proyecto_id: d.proyecto_id || null };
      if (s) await api("PUT", `/activos/${s.id}`, { cuerpo });
      else await api("POST", "/activos", { cuerpo });
      avisar(s ? "Sistema actualizado" : "Sistema registrado");
      onHecho();
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo={s ? `Editar ${s.nombre}` : "Nuevo sistema"} icono="solar_power" onCerrar={onCerrar} ancho={600}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || !d.nombre.trim() || vrmMal} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="etiqueta">Nombre del sistema o sitio *</span><input className="campo" {...c("nombre")} placeholder="Hostal Los Tambos" /></label>
        <label><span className="etiqueta">Cliente</span><input className="campo" {...c("cliente")} /></label>
        <label><span className="etiqueta">Ubicación</span><input className="campo" {...c("ubicacion")} placeholder="Distrito, ciudad" /></label>
        <label><span className="etiqueta">Fecha de instalación</span><input className="campo" type="date" max={hoyLima()} {...c("fecha_instalacion")} /></label>
        <label><span className="etiqueta">Proyecto</span>
          <select className="campo" {...c("proyecto_id")}><option value="">Sin proyecto</option>{(proyectos.datos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}{s?.proyecto_id && !(proyectos.datos ?? []).some((p) => p.id === s.proyecto_id) ? <option value={s.proyecto_id}>{s.proyecto}</option> : null}</select>
        </label>
        <label className="sm:col-span-2"><span className="etiqueta">Dirección en VRM</span><input className="campo" {...c("vrm_url")} placeholder="https://vrm.victronenergy.com/installation/…/dashboard" />
          <span className={`mt-1 block text-[12px] ${vrmMal ? "text-danger" : "text-text-3"}`}>{vrmMal ? "Debe empezar con https://vrm.victronenergy.com/" : "Abre la instalación en VRM y copia la dirección del navegador. Vacío = Sin dato."}</span>
        </label>
        <label className="sm:col-span-2"><span className="etiqueta">Notas</span><textarea className="campo min-h-[64px] py-2" {...c("notas")} /></label>
        {s ? <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} />Activo (si se desactiva, deja de mostrarse y de avisar garantías)</label> : null}
      </div>
    </Modal>
  );
}

function FormEquipo({ s, e, tipos, onCerrar, onHecho }: { s: Sistema; e: Equipo | null; tipos: TipoEquipo[]; onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const [d, setD] = useState({ tipo: e?.tipo ?? "inversor", marca: e?.marca ?? "", modelo: e?.modelo ?? "", serie: e?.serie ?? "", cantidad: String(e?.cantidad ?? 1), garantia_hasta: e?.garantia_hasta ?? "", notas: e?.notas ?? "" });
  const [guardando, setGuardando] = useState(false);
  const c = (k: keyof typeof d) => ({ value: d[k], onChange: (ev: { target: { value: string } }) => setD({ ...d, [k]: ev.target.value }) });
  const guardar = async () => {
    setGuardando(true);
    try {
      if (e) await api("PUT", `/activos/equipos/${e.id}`, { cuerpo: d });
      else await api("POST", `/activos/${s.id}/equipos`, { cuerpo: d });
      avisar(e ? "Equipo actualizado" : "Equipo agregado");
      onHecho();
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    } finally {
      setGuardando(false);
    }
  };
  const quitar = async () => {
    if (!e || !window.confirm(`¿Quitar ${[e.marca, e.modelo].filter(Boolean).join(" ")} de ${s.nombre}?`)) return;
    try {
      await api("DELETE", `/activos/equipos/${e.id}`);
      avisar("Equipo quitado");
      onHecho();
    } catch (x) {
      avisar("No se pudo quitar", msg(x), "error");
    }
  };
  return (
    <Modal titulo={`${e ? "Editar equipo" : "Agregar equipo"} · ${s.nombre}`} icono="memory" onCerrar={onCerrar} ancho={560}
      pie={<>{e ? <button className="btn-secundario mr-auto text-danger" onClick={() => void quitar()}>Quitar</button> : null}<button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || (!d.marca.trim() && !d.modelo.trim())} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="etiqueta">Tipo *</span><select className="campo" {...c("tipo")}>{tipos.map((t) => <option key={t} value={t}>{TIPO[t][0]}</option>)}</select></label>
        <label><span className="etiqueta">Cantidad</span><input className="campo num" inputMode="numeric" {...c("cantidad")} /></label>
        <label><span className="etiqueta">Marca</span><input className="campo" {...c("marca")} placeholder="Victron" /></label>
        <label><span className="etiqueta">Modelo</span><input className="campo" {...c("modelo")} placeholder="MultiPlus-II 48/5000" /></label>
        <label><span className="etiqueta">N.° de serie</span><input className="campo font-mono" {...c("serie")} /></label>
        <label><span className="etiqueta">Garantía hasta</span><input className="campo" type="date" {...c("garantia_hasta")} /></label>
        <label className="sm:col-span-2"><span className="etiqueta">Notas</span><input className="campo" {...c("notas")} /></label>
      </div>
    </Modal>
  );
}
