import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, subirImagen } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { VisorFotos, type FotoVisor } from "../../componentes/VisorFotos";
import { dinero, esNegativo, leerMonto } from "../../dinero";
import { fecha, fechaHora, iniciales, texto } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { DetalleProyecto, GastoProyecto, Parametros, Proyecto } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { PillEstado, colorAvance, pctTexto } from "./comun";

const ORIGEN: Record<GastoProyecto["origen"], { l: string; i: string }> = {
  caja_icr: { l: "Caja ICR", i: "savings" },
  caja_chica: { l: "Caja chica (anterior)", i: "savings" },
  caja_diaria: { l: "Caja diaria (anterior)", i: "point_of_sale" },
  cuenta_principal: { l: "Cuenta principal", i: "account_balance" },
};
const COLORES = ["var(--primary)", "var(--solar)", "var(--navy-a)", "var(--success)", "var(--ai)", "var(--neutral)"];
const CAMPOS: { k: keyof Proyecto; l: string; ph: string; ancho?: boolean }[] = [
  { k: "cliente", l: "Cliente", ph: "Razón social o nombre", ancho: true },
  { k: "ruc_dni", l: "RUC / DNI", ph: "11 u 8 dígitos" },
  { k: "responsable", l: "Responsable", ph: "Ej. Cristhian Quispe" },
  { k: "tipo_sistema", l: "Tipo de sistema", ph: "Ej. On-Grid 60 kWp" },
  { k: "marca", l: "Marca", ph: "Ej. Huawei" },
  { k: "ubicacion", l: "Ubicación", ph: "Distrito, provincia", ancho: true },
];

function EditarDatos({ p, onCerrar, onGuardado }: { p: Proyecto; onCerrar: () => void; onGuardado: () => void }) {
  const avisar = useAvisos();
  const [f, setF] = useState<Record<string, string>>(() => ({
    nombre: p.nombre, presupuesto: p.presupuesto, notas: p.notas ?? "", ...Object.fromEntries(CAMPOS.map((c) => [c.k, (p[c.k] as string | null) ?? ""])),
  }));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const monto = leerMonto(f.presupuesto);
  const guardar = async () => {
    if (!f.nombre.trim()) return setError("El proyecto necesita un nombre.");
    if (!monto) return setError("El presupuesto debe ser un monto mayor a 0.");
    setGuardando(true);
    setError(null);
    try {
      await api("PUT", `/proyectos/${p.id}`, { cuerpo: { ...f, presupuesto: monto, version: p.version } });
      avisar("Proyecto actualizado");
      onGuardado();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo="Datos del proyecto" icono="edit" ancho={620} onCerrar={onCerrar} pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="etiqueta">Nombre</span><input className="campo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
        <label><span className="etiqueta">Presupuesto (S/)</span><input className="campo num" inputMode="decimal" value={f.presupuesto} onChange={(e) => setF({ ...f, presupuesto: e.target.value })} /></label>
        <div className="flex items-end pb-2.5 text-[12.5px] text-text-3">{monto ? dinero(monto) : "Monto no válido"}</div>
        {CAMPOS.map((c) => (
          <label key={c.k} className={c.ancho ? "sm:col-span-2" : ""}>
            <span className="etiqueta">{c.l}</span>
            <input className="campo" placeholder={c.ph} value={f[c.k]} onChange={(e) => setF({ ...f, [c.k]: e.target.value })} />
          </label>
        ))}
        <label className="sm:col-span-2"><span className="etiqueta">Notas</span><textarea className="campo h-auto py-2.5" rows={3} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></label>
        {error ? <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger sm:col-span-2">{error}</div> : null}
      </div>
    </Modal>
  );
}

type Accion = "pausado" | "finalizado" | "activo";

function CambioEstado({ d, accion, onCerrar, onHecho }: { d: DetalleProyecto; accion: Accion; onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const [causa, setCausa] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const p = d.proyecto;
  const sinComprobante = d.gastos.filter((g) => g.origen !== "cuenta_principal" && !g.adjuntos.length && !g.comprobante).length;
  const textoCausa = causa === "Otra causa" ? nota.trim() : [causa, nota.trim()].filter(Boolean).join(" · ");
  const listo = accion === "pausado" ? !!textoCausa : accion === "finalizado" ? ok : true;
  const confirmar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await api("POST", `/proyectos/${p.id}/estado`, { cuerpo: { estado: accion, causa: accion === "pausado" ? textoCausa : undefined, nota: accion === "finalizado" ? nota : undefined, version: p.version } });
      avisar(accion === "pausado" ? "Proyecto pausado" : accion === "finalizado" ? "Proyecto finalizado" : "Proyecto reactivado");
      onHecho();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar.");
    } finally {
      setGuardando(false);
    }
  };
  const titulo = accion === "pausado" ? "Pausar proyecto" : accion === "finalizado" ? "Finalizar proyecto" : "Reactivar proyecto";
  return (
    <Modal titulo={titulo} icono={accion === "pausado" ? "pause_circle" : accion === "finalizado" ? "task_alt" : "play_circle"} onCerrar={onCerrar}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className={accion === "finalizado" ? "btn-peligro" : "btn-primario"} disabled={!listo || guardando} onClick={confirmar}>{guardando ? "Guardando…" : titulo}</button></>}>
      <div className="flex flex-col gap-4">
        {accion === "pausado" ? (
          <div>
            <span className="etiqueta">Causa de la pausa <span className="text-danger">*</span></span>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {d.causas_pausa.map((c) => (
                <button key={c} onClick={() => setCausa(c)} className={`h-8 rounded-lg border px-2.5 text-[12.5px] font-semibold ${causa === c ? "border-warning bg-warning-soft text-warning" : "border-border text-text-2 hover:bg-surface-2"}`}>{c}</button>
              ))}
            </div>
            <textarea className="campo h-auto py-2.5" rows={2} placeholder={causa === "Otra causa" ? "Escribe la causa" : "Detalle (opcional si elegiste una causa)"} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        ) : null}
        {accion === "finalizado" ? (
          <>
            {sinComprobante ? <div className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] font-semibold text-warning"><Icono n="warning" t={18} />{sinComprobante} gastos de la caja no tienen comprobante ni foto.</div> : null}
            <label className="flex items-start gap-2.5 text-[13.5px]">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <span>Confirmo que la obra fue entregada. El proyecto pasará a solo lectura y no aceptará nuevos gastos.</span>
            </label>
            <textarea className="campo h-auto py-2.5" rows={2} placeholder="Nota de cierre (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
          </>
        ) : null}
        {accion === "activo" ? <p className="text-[13.5px] text-text-2">El proyecto vuelve a estado Activo y aparece otra vez en la app de Finanzas para asignarle gastos.</p> : null}
        <div className="rounded-xl border border-border bg-surface-2 p-3 text-[13px]">
          <div className="mb-1.5 font-bold">Resumen antes de confirmar</div>
          {[["Proyecto", `${p.codigo} · ${p.nombre}`], ["Estado actual", p.estado], ["Gastado", `${dinero(p.gastado)} de ${dinero(p.presupuesto)}`]].map(([a, b]) => (
            <div key={a} className="flex justify-between gap-3 py-0.5"><span className="text-text-3">{a}</span><b className="text-right">{b}</b></div>
          ))}
        </div>
        {error ? <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</div> : null}
      </div>
    </Modal>
  );
}

function Anillo({ pct, color }: { pct: number | null; color: string }) {
  const v = Math.min(pct ?? 0, 100);
  return (
    <div className="relative grid h-[132px] w-[132px] flex-shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${v * 3.6}deg, var(--track) 0deg)` }}>
      <div className="grid h-[104px] w-[104px] place-items-center rounded-full bg-surface text-center">
        <div>
          <div className="num text-[22px] font-extrabold" style={{ color }}>{pctTexto(pct)}</div>
          <div className="text-[11.5px] text-text-3">gastado</div>
        </div>
      </div>
    </div>
  );
}

export function ProyectoDetalle() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const editar = puede(usuario, "proyectos", "completo");
  const { datos: d, error, cargando, recargar } = useDatos(() => api<DetalleProyecto>("GET", `/proyectos/${id}`), [id]);
  const umbrales = useDatos(() => api<Parametros>("GET", "/parametros"));
  const [menu, setMenu] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [editando, setEditando] = useState(false);
  const [visor, setVisor] = useState<{ fotos: FotoVisor[]; i: number } | null>(null);
  const [subiendo, setSubiendo] = useState(0);
  const [verTodos, setVerTodos] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const f = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [menu]);

  if (cargando && !d) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!d) return null;
  const p = d.proyecto;
  const aviso = umbrales.datos?.presupuesto_aviso_pct ?? 80;
  const limite = umbrales.datos?.presupuesto_limite_pct ?? 100;
  const color = colorAvance(p.porcentaje, aviso, limite);
  const abierto = p.estado !== "finalizado";
  const alerta = !abierto || p.porcentaje === null ? null : p.porcentaje >= limite ? "Presupuesto excedido. Revisa los gastos o ajusta el presupuesto." : p.porcentaje >= aviso ? `Supera el ${aviso}% del presupuesto.` : null;
  const pausadoDesde = [...d.estados].reverse().find((e) => e.estado === "pausado");
  const gastos = verTodos ? d.gastos : d.gastos.slice(0, 12);

  const subir = async (lista: FileList | null) => {
    const archivos = [...(lista ?? [])];
    if (!archivos.length) return;
    setSubiendo(archivos.length);
    try {
      const rutas: { ruta: string }[] = [];
      for (const a of archivos) {
        rutas.push({ ruta: await subirImagen(a) });
        setSubiendo((n) => n - 1);
      }
      await api("POST", `/proyectos/${p.id}/fotos`, { cuerpo: { fotos: rutas } });
      avisar(rutas.length === 1 ? "Foto subida" : `${rutas.length} fotos subidas`);
      await recargar();
    } catch (e) {
      avisar("No se pudieron subir las fotos", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setSubiendo(0);
      if (archivo.current) archivo.current.value = "";
    }
  };
  const quitar = async (fotoId: number) => {
    if (!confirm("¿Quitar esta foto de la galería?")) return;
    try {
      await api("DELETE", `/proyectos/${p.id}/fotos/${fotoId}`);
      setVisor(null);
      await recargar();
    } catch (e) {
      avisar("No se pudo quitar", e instanceof Error ? e.message : undefined, "error");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-[13px] text-text-3">
        <Link to="/proyectos" className="inline-flex items-center gap-1"><Icono n="arrow_back" t={18} />Proyectos</Link>
        <span>/</span>
        <span className="font-mono">{p.codigo}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-extrabold tracking-tight">{p.nombre}</h1>
            <PillEstado e={p.estado} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-2">
            <span>{texto(p.cliente)}</span>
            {p.ruc_dni ? <span className="num text-text-3">RUC/DNI {p.ruc_dni}</span> : null}
            <span>{[p.tipo_sistema, p.marca].filter(Boolean).join(" · ") || "Sistema: Sin dato"}</span>
            <span>{texto(p.ubicacion)}</span>
            <span>Resp. {texto(p.responsable)}</span>
          </div>
          {p.estado === "pausado" ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning">
              <Icono n="pause_circle" t={18} />
              Pausado desde {pausadoDesde ? fecha(pausadoDesde.fecha) : "Sin dato"} · {p.causa_pausa}
            </div>
          ) : null}
        </div>
        {editar && abierto ? (
          <div className="flex gap-2">
            <button className="btn-secundario" onClick={() => setEditando(true)}><Icono n="edit" t={18} />Editar datos</button>
            <div className="relative" ref={menuRef}>
              <button className="btn-secundario" onClick={() => setMenu(!menu)}>Cambiar estado<Icono n="expand_more" t={18} /></button>
              {menu ? (
                <div className="aparecer absolute right-0 top-12 z-30 w-[270px] rounded-2xl border border-border bg-surface p-2 shadow-menu">
                  {(p.estado === "activo"
                    ? [["pausado", "Pausar proyecto", "Requiere indicar la causa", "pause", "var(--warning-soft)", "var(--warning)"], ["finalizado", "Finalizar proyecto", "Pasa a solo lectura", "task_alt", "var(--neutral-soft)", "var(--neutral)"]]
                    : [["activo", "Reactivar proyecto", "Vuelve a estado Activo", "play_arrow", "var(--success-soft)", "var(--success)"], ["finalizado", "Finalizar proyecto", "Pasa a solo lectura", "task_alt", "var(--neutral-soft)", "var(--neutral)"]]
                  ).map(([k, l, h, i, bg, fg]) => (
                    <button key={k} onClick={() => { setMenu(false); setAccion(k as Accion); }} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-surface-2">
                      <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: bg, color: fg }}><Icono n={i} t={19} /></span>
                      <span><span className="block text-[13.5px] font-bold">{l}</span><span className="block text-[12px] text-text-3">{h}</span></span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="tarjeta flex flex-wrap items-center gap-6 p-5">
          <Anillo pct={p.porcentaje} color={color} />
          <div className="min-w-[220px] flex-1">
            <div className="titulo-seccion mb-2">Presupuesto vs. gastado</div>
            <div className="flex justify-between py-1 text-[13.5px]"><span className="text-text-2">Presupuesto</span><b className="num">{dinero(p.presupuesto)}</b></div>
            <div className="flex justify-between py-1 text-[13.5px]"><span className="text-text-2">Gastado</span><b className="num">{dinero(p.gastado)}</b></div>
            <div className="flex justify-between border-t border-border py-1 pt-2 text-[13.5px]">
              <span className="text-text-2">{esNegativo(p.saldo) ? "Excedido" : "Disponible"}</span>
              <b className="num" style={{ color: esNegativo(p.saldo) ? "var(--danger)" : "var(--success)" }}>{dinero(p.saldo.replace("-", ""))}</b>
            </div>
            {alerta ? <div className="mt-2 flex gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold" style={{ background: p.porcentaje! >= limite ? "var(--danger-soft)" : "var(--warning-soft)", color: p.porcentaje! >= limite ? "var(--danger)" : "var(--warning)" }}><Icono n="warning" t={17} />{alerta}</div> : null}
          </div>
        </section>
        <section className="tarjeta p-5">
          <div className="titulo-seccion mb-3">Gasto por categoría</div>
          {d.categorias.length ? (
            <>
              <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-track">
                {d.categorias.map((c, i) => <div key={c.categoria} style={{ width: `${c.porcentaje}%`, background: COLORES[i % COLORES.length] }} />)}
              </div>
              <div className="flex flex-col gap-1.5">
                {d.categorias.map((c, i) => (
                  <div key={c.categoria} className="flex items-center gap-2 text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
                    <span className="flex-1">{c.categoria}</span>
                    <span className="text-text-3">{c.porcentaje}%</span>
                    <b className="num w-28 text-right">{dinero(c.monto)}</b>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="py-6 text-center text-[13px] text-text-3">Sin gastos todavía.</div>}
        </section>
      </div>

      <section className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="titulo-seccion">Gastos del proyecto <span className="font-medium text-text-3">· {d.gastos.length === d.gastos.slice(0, 12).length || verTodos ? `${d.gastos.length} registros` : `mostrando 12 de ${d.gastos.length}`}</span></div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-text-3">
            <Icono n={d.caja_disponible ? "sync" : "sync_problem"} t={16} />
            Incluye los gastos de la Caja ICR (app de Finanzas)
          </div>
        </div>
        {d.gastos.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3">
                  <th className="px-5 py-2.5">Fecha</th><th className="px-3 py-2.5">Concepto</th><th className="px-3 py-2.5">Origen</th><th className="px-3 py-2.5">Registrado por</th><th className="px-3 py-2.5">Comprobante</th><th className="px-5 py-2.5 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={`${g.origen}-${g.id}`} className="border-b border-border last:border-0">
                    <td className="num whitespace-nowrap px-5 py-3">{fecha(g.fecha)}</td>
                    <td className="px-3 py-3"><div className="font-semibold">{g.concepto}</div><div className="text-[12.5px] text-text-3">{texto(g.categoria)}{g.ciudad ? ` · ${g.ciudad === "AQP" ? "Arequipa" : g.ciudad === "MOQ" ? "Moquegua" : g.ciudad}` : ""}</div></td>
                    <td className="px-3 py-3"><span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2 text-[11.5px] font-bold text-text-2"><Icono n={ORIGEN[g.origen].i} t={14} />{ORIGEN[g.origen].l}</span></td>
                    <td className="px-3 py-3">
                      {g.por ? <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-[11px] font-extrabold text-primary-ink">{iniciales(g.por)}</span>{g.por}</div> : <span className="text-text-3">Sin dato</span>}
                    </td>
                    <td className="px-3 py-3">
                      {g.adjuntos.length ? (
                        <button className="inline-flex items-center gap-1 font-semibold text-primary-ink hover:underline" onClick={() => setVisor({ fotos: g.adjuntos.map((a, i) => ({ ...(g.origen === "caja_icr" ? { idIcr: Number(a) } : { idCaja: a }), titulo: g.concepto, detalle: `${fecha(g.fecha)} · foto ${i + 1} de ${g.adjuntos.length}` })), i: 0 })}>
                          <Icono n="attach_file" t={16} />{g.comprobante ? `${g.comprobante[0]}${g.comprobante.slice(1).toLowerCase()}` : "Foto"}{g.adjuntos.length > 1 ? ` (${g.adjuntos.length})` : ""}
                        </button>
                      ) : g.comprobante ? <span>{g.comprobante[0]}{g.comprobante.slice(1).toLowerCase()}</span> : <span className="text-text-3">Sin dato</span>}
                    </td>
                    <td className="num whitespace-nowrap px-5 py-3 text-right font-bold">{dinero(g.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.gastos.length > 12 ? <div className="border-t border-border px-5 py-3 text-center"><button className="text-[13px] font-semibold text-primary-ink" onClick={() => setVerTodos(!verTodos)}>{verTodos ? "Ver menos" : `Ver los ${d.gastos.length} gastos`}</button></div> : null}
          </div>
        ) : (
          <Vacio icono="receipt" titulo="Aún no hay gastos">Los gastos se registran en la app de Finanzas con la categoría «Gasto de proyecto» (o en Contabilidad) y aparecen aquí automáticamente.</Vacio>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="tarjeta p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="titulo-seccion">Galería de obra <span className="font-medium text-text-3">· {d.fotos.length} fotos</span></div>
            {editar && abierto ? (
              <>
                <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void subir(e.target.files)} />
                <button className="btn-secundario h-9" disabled={subiendo > 0} onClick={() => archivo.current?.click()}><Icono n="upload" t={18} />{subiendo ? `Subiendo… (${subiendo})` : "Subir fotos"}</button>
              </>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {d.fotos.map((f, i) => (
              <button key={f.id} onClick={() => setVisor({ fotos: d.fotos.map((x) => ({ url: x.ruta, titulo: x.descripcion ?? p.nombre, detalle: `${fechaHora(x.subido_en)} · ${x.subido_por ?? "Sin dato"}` })), i })} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-2">
                <img src={f.ruta} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105" />
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">{fecha(f.subido_en)}</span>
                {editar && abierto ? <span role="button" title="Quitar foto" onClick={(e) => { e.stopPropagation(); void quitar(f.id); }} className="absolute right-1.5 top-1.5 hidden h-7 w-7 place-items-center rounded-lg bg-black/55 text-white group-hover:grid"><Icono n="delete" t={16} /></span> : null}
              </button>
            ))}
            {editar && abierto ? (
              <button onClick={() => archivo.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void subir(e.dataTransfer.files); }} className="grid aspect-[4/3] place-items-center rounded-xl border-2 border-dashed border-border text-text-3 hover:border-primary-line hover:text-primary-ink">
                <span className="flex flex-col items-center gap-1 text-[12.5px] font-semibold"><Icono n="add_photo_alternate" t={26} />Arrastra o elige</span>
              </button>
            ) : null}
          </div>
          {!d.fotos.length && !(editar && abierto) ? <div className="py-6 text-center text-[13px] text-text-3">Sin fotos.</div> : null}
        </section>
        <section className="tarjeta p-5">
          <div className="titulo-seccion mb-4">Línea de tiempo de estado</div>
          <ol className="flex flex-col">
            {[...d.estados].reverse().map((e, i, arr) => (
              <li key={e.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: e.estado === "activo" ? "var(--success-soft)" : e.estado === "pausado" ? "var(--warning-soft)" : "var(--neutral-soft)", color: e.estado === "activo" ? "var(--success)" : e.estado === "pausado" ? "var(--warning)" : "var(--neutral)" }}>
                    <Icono n={e.estado === "activo" ? (i === arr.length - 1 ? "add" : "play_arrow") : e.estado === "pausado" ? "pause" : "task_alt"} t={17} />
                  </span>
                  {i < arr.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
                </div>
                <div className="pb-4">
                  <div className="text-[13.5px] font-bold">{i === arr.length - 1 ? "Proyecto creado" : e.estado === "activo" ? "Reactivado" : e.estado === "pausado" ? "Pausado" : "Finalizado"}</div>
                  {e.causa && i !== arr.length - 1 ? <div className="text-[12.5px] text-text-2">{e.causa}</div> : null}
                  <div className="text-[12px] text-text-3">{fechaHora(e.fecha)} · {e.usuario ?? "Sin dato"}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {accion ? <CambioEstado d={d} accion={accion} onCerrar={() => setAccion(null)} onHecho={recargar} /> : null}
      {editando ? <EditarDatos p={p} onCerrar={() => setEditando(false)} onGuardado={recargar} /> : null}
      {visor ? <VisorFotos fotos={visor.fotos} inicio={visor.i} onCerrar={() => setVisor(null)} /> : null}
    </div>
  );
}
