// Proveedores (diseño ERP_ICR.zip › Comparador › Proveedores): datos de cada proveedor, sus páginas web y el registro de lecturas.
import { useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { dinero } from "../../dinero";
import { fecha, fechaHora, texto } from "../../formato";
import type { FuenteProv, Proveedor } from "../../tipos";
import { useDatos } from "../../usarDatos";

const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);
const ESTADO: Record<string, [string, string]> = { ok: ["Correcta", "var(--success)"], parcial: ["Con fallas", "var(--warning)"], error: ["Error", "var(--danger)"], corriendo: ["Leyendo…", "var(--primary)"] };
const ADAPTADOR: Record<string, string> = { auto: "Detectar solo", woocommerce: "WooCommerce", shopify: "Shopify", jsonld: "Páginas con datos de producto" };
type Ejecucion = { id: number; inicio: string; fin: string | null; estado: string; leidos: number; errores: number; mensaje: string | null };

export function Proveedores({ editar, onCargar }: { editar: boolean; onCargar: (id: number) => void }) {
  const { datos, error, cargando, recargar } = useDatos(() => api<{ proveedores: Proveedor[] }>("GET", "/comparador/proveedores"));
  const [form, setForm] = useState<Proveedor | "nuevo" | null>(null);
  const [fuente, setFuente] = useState<{ p: Proveedor; f: FuenteProv | null } | null>(null);
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  const lista = datos?.proveedores ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-2">{lista.length} proveedor{lista.length === 1 ? "" : "es"} · las listas se cargan en «Cargar lista»; las páginas web se leen solas según su frecuencia.</p>
        {editar ? <button className="btn-primario" onClick={() => setForm("nuevo")}><Icono n="add" t={18} />Nuevo proveedor</button> : null}
      </div>
      {!lista.length ? (
        <div className="tarjeta"><Vacio icono="storefront" titulo="Aún no hay proveedores">Registra a Tienda Solar, Electronic Siblings, Dartel y los demás para cargar sus listas.</Vacio></div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((p) => (
            <div key={p.id} className={`tarjeta p-4 ${p.activo ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink"><Icono n="storefront" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[15px] font-bold">{p.nombre}{!p.activo ? <span className="rounded-full bg-neutral-soft px-2 text-[11px] font-bold text-neutral">Inactivo</span> : null}</div>
                  <div className="mt-0.5 text-[12.5px] text-text-2">
                    RUC {texto(p.ruc)} · {p.contacto ?? "Contacto: Sin dato"}{p.telefono ? ` · ${p.telefono}` : ""}{p.correo ? ` · ${p.correo}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                    <span><b className="num">{p.productos}</b> productos</span>
                    <span>Última lista: <b>{p.ultima_fecha_lista ? fecha(p.ultima_fecha_lista) : "Ninguna"}</b></span>
                    <span>Moneda habitual: <b>{p.moneda === "USD" ? "Dólares" : p.moneda === "PEN" ? "Soles" : "Sin dato"}</b></span>
                    <span>Envío: <b>{p.costo_envio === null ? "Sin dato" : Number(p.costo_envio) ? dinero(p.costo_envio) : "Incluido"}</b></span>
                  </div>
                </div>
                {editar ? (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secundario h-9" onClick={() => onCargar(p.id)}><Icono n="upload_file" t={18} />Cargar lista</button>
                    <button className="btn-secundario h-9" onClick={() => setForm(p)}><Icono n="edit" t={18} />Editar</button>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[12px] font-bold uppercase tracking-wide text-text-3">Páginas web</div>
                  {editar ? <button className="text-[12.5px] font-semibold text-primary-ink" onClick={() => setFuente({ p, f: null })}>+ Agregar página</button> : null}
                </div>
                {p.fuentes.filter((f) => f.tipo === "web").length ? (
                  <div className="flex flex-col gap-2">
                    {p.fuentes.filter((f) => f.tipo === "web").map((f) => <FilaFuente key={f.id} f={f} editar={editar} onEditar={() => setFuente({ p, f })} onLeido={recargar} />)}
                  </div>
                ) : (
                  <div className="text-[12.5px] text-text-3">Sin páginas web. Sus precios llegan solo por listas.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {form ? <FormProveedor p={form === "nuevo" ? null : form} onCerrar={() => setForm(null)} onGuardado={() => { setForm(null); void recargar(); }} /> : null}
      {fuente ? <FormFuente p={fuente.p} f={fuente.f} onCerrar={() => setFuente(null)} onGuardado={() => { setFuente(null); void recargar(); }} /> : null}
    </div>
  );
}

function FilaFuente({ f, editar, onEditar, onLeido }: { f: FuenteProv; editar: boolean; onEditar: () => void; onLeido: () => void }) {
  const avisar = useAvisos();
  const [leyendo, setLeyendo] = useState(false);
  const [registro, setRegistro] = useState<Ejecucion[] | null>(null);
  const [e, color] = f.ultimo_estado ? ESTADO[f.ultimo_estado] : ["Nunca leída", "var(--text-3)"];
  const leer = async () => {
    setLeyendo(true);
    try {
      const r = await api<{ estado: string; mensaje: string }>("POST", `/comparador/fuentes/${f.id}/leer`);
      avisar(r.estado === "ok" ? "Página leída" : r.estado === "ocupado" ? "Hay otra lectura en curso" : r.estado === "parcial" ? "Página leída con fallas" : "No se pudo leer la página", r.mensaje, r.estado === "error" ? "error" : r.estado === "ok" ? "exito" : "info");
      onLeido();
      if (registro) setRegistro(await api<Ejecucion[]>("GET", `/comparador/fuentes/${f.id}/ejecuciones`));
    } catch (x) {
      avisar("No se pudo leer la página", msg(x), "error");
    } finally {
      setLeyendo(false);
    }
  };
  const verRegistro = async () => {
    if (registro) return setRegistro(null);
    try {
      setRegistro(await api<Ejecucion[]>("GET", `/comparador/fuentes/${f.id}/ejecuciones`));
    } catch (x) {
      avisar("No se pudo cargar el registro", msg(x), "error");
    }
  };
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
        <Icono n="travel_explore" t={18} className="text-text-3" />
        <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 max-w-full truncate font-semibold">{f.url}</a>
        <span className="text-text-3">{ADAPTADOR[f.adaptador] ?? f.adaptador} · cada {f.frecuencia_dias} día{f.frecuencia_dias === 1 ? "" : "s"} · {f.config?.moneda === "USD" ? "US$" : "S/"} {f.config?.incluye_igv === false ? "sin IGV" : "con IGV"}{f.activa ? "" : " · pausada"}</span>
        <span className="font-bold" style={{ color }}>● {e}</span>
        {f.ultima_ejecucion ? <span className="text-text-3">{fechaHora(f.ultima_ejecucion)}{f.ultimos_leidos !== null ? ` · ${f.ultimos_leidos} productos` : ""}</span> : null}
        <span className="ml-auto flex gap-1.5">
          <button className="btn-secundario h-8" onClick={() => void verRegistro()}><Icono n="list" t={16} />{registro ? "Ocultar registro" : "Registro"}</button>
          {editar ? <button className="btn-secundario h-8" onClick={onEditar}><Icono n="edit" t={16} />Editar</button> : null}
          {editar ? <button className="btn-secundario h-8" disabled={leyendo} onClick={() => void leer()}><Icono n="refresh" t={16} />{leyendo ? "Leyendo…" : "Leer ahora"}</button> : null}
        </span>
      </div>
      {f.ultimo_estado && f.ultimo_estado !== "ok" && f.ultimo_mensaje ? <div className="mt-1.5 text-[12px]" style={{ color }}>{f.ultimo_mensaje}</div> : null}
      {registro ? (
        registro.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead><tr className="text-text-3"><th className="py-1 pr-3">Inicio</th><th className="py-1 pr-3">Estado</th><th className="py-1 pr-3 text-right">Productos</th><th className="py-1 pr-3 text-right">Fallas</th><th className="py-1">Detalle</th></tr></thead>
              <tbody>
                {registro.map((x) => (
                  <tr key={x.id} className="border-t border-border">
                    <td className="whitespace-nowrap py-1 pr-3">{fechaHora(x.inicio)}</td>
                    <td className="py-1 pr-3 font-semibold" style={{ color: ESTADO[x.estado]?.[1] }}>{ESTADO[x.estado]?.[0] ?? x.estado}</td>
                    <td className="num py-1 pr-3 text-right">{x.leidos}</td>
                    <td className="num py-1 pr-3 text-right">{x.errores}</td>
                    <td className="py-1 text-text-2">{x.mensaje ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="mt-2 text-[12px] text-text-3">Aún no se ha leído.</div>
      ) : null}
    </div>
  );
}

function FormProveedor({ p, onCerrar, onGuardado }: { p: Proveedor | null; onCerrar: () => void; onGuardado: () => void }) {
  const avisar = useAvisos();
  const [d, setD] = useState({
    nombre: p?.nombre ?? "", ruc: p?.ruc ?? "", contacto: p?.contacto ?? "", telefono: p?.telefono ?? "", correo: p?.correo ?? "", web: p?.web ?? "",
    moneda: p?.moneda ?? "", costo_envio: p?.costo_envio ?? "", notas: p?.notas ?? "", activo: p?.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof typeof d) => ({ value: String(d[k]), onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  const guardar = async () => {
    setGuardando(true);
    try {
      const cuerpo = { ...d, moneda: d.moneda || null, costo_envio: d.costo_envio.trim() === "" ? null : d.costo_envio };
      if (p) await api("PUT", `/comparador/proveedores/${p.id}`, { cuerpo });
      else await api("POST", "/comparador/proveedores", { cuerpo });
      avisar(p ? "Proveedor actualizado" : "Proveedor registrado");
      onGuardado();
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo={p ? `Editar ${p.nombre}` : "Nuevo proveedor"} icono="storefront" onCerrar={onCerrar} ancho={560}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || !d.nombre.trim()} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="etiqueta">Nombre *</span><input className="campo" {...campo("nombre")} placeholder="Electronic Siblings SAC" /></label>
        <label><span className="etiqueta">RUC</span><input className="campo num" inputMode="numeric" maxLength={11} {...campo("ruc")} /></label>
        <label><span className="etiqueta">Contacto</span><input className="campo" {...campo("contacto")} /></label>
        <label><span className="etiqueta">Teléfono</span><input className="campo" {...campo("telefono")} /></label>
        <label><span className="etiqueta">Correo</span><input className="campo" type="email" {...campo("correo")} /></label>
        <label className="sm:col-span-2"><span className="etiqueta">Página web</span><input className="campo" {...campo("web")} placeholder="https://…" /></label>
        <label><span className="etiqueta">Moneda habitual de sus listas</span>
          <select className="campo" {...campo("moneda")}><option value="">Se elige al cargar</option><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select>
        </label>
        <label><span className="etiqueta">Costo de envío por pedido (S/)</span><input className="campo num" inputMode="decimal" {...campo("costo_envio")} placeholder="Vacío = Sin dato · 0 = incluido" /></label>
        <label className="sm:col-span-2"><span className="etiqueta">Notas</span><textarea className="campo min-h-[70px] py-2" {...campo("notas")} /></label>
        {p ? <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} />Activo (si se desactiva, sus precios no salen en las búsquedas)</label> : null}
      </div>
    </Modal>
  );
}

function FormFuente({ p, f, onCerrar, onGuardado }: { p: Proveedor; f: FuenteProv | null; onCerrar: () => void; onGuardado: () => void }) {
  const avisar = useAvisos();
  const [d, setD] = useState({ url: f?.url ?? "", adaptador: f?.adaptador ?? "auto", frecuencia_dias: String(f?.frecuencia_dias ?? 7), moneda: f?.config?.moneda ?? p.moneda ?? "PEN", incluye_igv: f?.config?.incluye_igv ?? true, activa: f?.activa ?? true });
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      const cuerpo = { ...d, url: d.url.trim(), frecuencia_dias: Number(d.frecuencia_dias) };
      if (f) await api("PUT", `/comparador/fuentes/${f.id}`, { cuerpo });
      else await api("POST", `/comparador/proveedores/${p.id}/fuentes`, { cuerpo });
      avisar("Página guardada", "Usa «Leer ahora» para traer los precios la primera vez.");
      onGuardado();
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo={`Página web de ${p.nombre}`} icono="travel_explore" onCerrar={onCerrar} ancho={560}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || !d.url.trim()} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="etiqueta">Dirección de la tienda *</span><input className="campo" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://www.tienda.pe" /></label>
        <label><span className="etiqueta">Tipo de tienda</span>
          <select className="campo" value={d.adaptador} onChange={(e) => setD({ ...d, adaptador: e.target.value })}>{Object.entries(ADAPTADOR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label><span className="etiqueta">Leer cada (días)</span><input className="campo num" inputMode="numeric" value={d.frecuencia_dias} onChange={(e) => setD({ ...d, frecuencia_dias: e.target.value.replace(/\D/g, "") })} /></label>
        <label><span className="etiqueta">Moneda de la página</span>
          <select className="campo" value={d.moneda} onChange={(e) => setD({ ...d, moneda: e.target.value as "PEN" | "USD" })}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select>
        </label>
        <label><span className="etiqueta">Los precios de la página</span>
          <select className="campo" value={d.incluye_igv ? "1" : "0"} onChange={(e) => setD({ ...d, incluye_igv: e.target.value === "1" })}><option value="1">Incluyen IGV</option><option value="0">No incluyen IGV</option></select>
        </label>
        {f ? <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" checked={d.activa} onChange={(e) => setD({ ...d, activa: e.target.checked })} />Leer sola cada cierto tiempo (si se quita, solo con «Leer ahora»)</label> : null}
        <p className="text-[12px] text-text-3 sm:col-span-2">Se respeta el archivo robots.txt de la tienda y se espera entre página y página. Solo se leen páginas públicas (sin usuario ni clave).</p>
      </div>
    </Modal>
  );
}
