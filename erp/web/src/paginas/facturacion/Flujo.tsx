// Emitir un comprobante en 5 pasos (diseño ERP_ICR.zip › Facturación SUNAT):
// 1 Completar (datos y validaciones) · 2 Revisar (resumen) · 3 Abrir en SUNAT (la extensión rellena) · 4 Emitir en SUNAT (lo haces tú) · 5 Marcar emitido.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, descargarBlob } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { dinero } from "../../dinero";
import { fecha, fechaHora, hoyLima } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { Comprobante, CotizacionResumen, CuotaCpe, Empresa, ItemCpe, Padron, Parametros, PropuestaCpe, TipoCpe, UnidadCpe } from "../../tipos";
import { centimos, linea, reglas, totales } from "./calculo";
import { Copiable, FUENTE, PillCpe, TIPO_CPE, UNIDADES, nombreCpe } from "./comun";
import { URL_SOL, ZIP_EXTENSION, llenarEnSunat, useExtension } from "./extension";

type Form = {
  tipo: TipoCpe; moneda: "PEN" | "USD"; cliente_doc: string; cliente_nombre: string; cliente_direccion: string; cliente_fuente: Comprobante["cliente_fuente"];
  forma_pago: "contado" | "credito"; cuotas: CuotaCpe[]; items: ItemCpe[]; observacion: string; cotizacion_id: number | null; proyecto_id: number | null;
};
type Paso = "editar" | "revisar" | "abrir" | "emitir";
const ITEM_VACIO: ItemCpe = { descripcion: "", unidad: "ZZ", cantidad: "1", valor_unitario: "" };
const VACIO: Form = { tipo: "factura", moneda: "PEN", cliente_doc: "", cliente_nombre: "", cliente_direccion: "", cliente_fuente: null, forma_pago: "contado", cuotas: [], items: [{ ...ITEM_VACIO }], observacion: "", cotizacion_id: null, proyecto_id: null };
const PASOS: [string, string][] = [["Completar", "Datos y validaciones"], ["Revisar", "Resumen"], ["Abrir en SUNAT", "La extensión rellena"], ["Emitir en SUNAT", "Lo haces tú"], ["Marcar emitido", "Cierra el flujo"]];
const INDICE: Record<Paso, number> = { editar: 0, revisar: 1, abrir: 2, emitir: 3 };
const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);

const deComprobante = (c: Comprobante): Form => ({
  tipo: c.tipo, moneda: c.moneda, cliente_doc: c.cliente_doc ?? "", cliente_nombre: c.cliente_nombre ?? "", cliente_direccion: c.cliente_direccion ?? "",
  cliente_fuente: c.cliente_fuente, forma_pago: c.forma_pago, cuotas: c.cuotas, items: c.items.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad, valor_unitario: i.valor_unitario })),
  observacion: c.observacion ?? "", cotizacion_id: c.cotizacion_id, proyecto_id: c.proyecto_id,
});
const sumarDias = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

async function bajar(id: number, tipo: "pdf" | "xml", nombre: string) {
  const b = await descargarBlob(`/facturacion/${id}/archivo/${tipo}`);
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.${tipo}`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function Pasos({ actual }: { actual: number }) {
  return (
    <div className="tarjeta flex gap-1 overflow-x-auto p-2">
      {PASOS.map(([l, h], i) => {
        const hecho = i < actual;
        const ahora = i === actual;
        return (
          <div key={l} className={`flex min-w-[150px] flex-1 items-center gap-2.5 rounded-xl px-3 py-2 ${ahora ? "bg-primary-soft" : ""}`}>
            <span className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold ${hecho ? "bg-success text-white" : ahora ? "bg-primary text-white" : "bg-surface-2 text-text-3"}`}>{hecho ? <Icono n="check" t={16} /> : i + 1}</span>
            <div className="min-w-0"><div className={`truncate text-[13px] font-bold ${ahora ? "text-primary-ink" : hecho ? "text-text" : "text-text-3"}`}>{l}</div><div className="truncate text-[11.5px] text-text-3">{h}</div></div>
          </div>
        );
      })}
    </div>
  );
}

/** Resumen del comprobante (paso 2 y vista final). */
export function ResumenCpe({ c, empresa }: { c: Pick<Comprobante, "tipo" | "numero" | "moneda" | "cliente_tipo_doc" | "cliente_doc" | "cliente_nombre" | "cliente_direccion" | "items" | "totales" | "forma_pago" | "cuotas" | "fecha_emision" | "observacion">; empresa: Empresa | null }) {
  const m = c.moneda;
  return (
    <div className="tarjeta mx-auto w-full max-w-[760px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-4">
        <div>
          <div className="text-[16px] font-extrabold">{empresa?.razon_social ?? "Sin dato"}</div>
          <div className="text-[12.5px] text-text-2">RUC {empresa?.ruc ?? "Sin dato"}{empresa?.direccion ? ` · ${empresa.direccion}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-primary-ink">{TIPO_CPE[c.tipo].largo}</div>
          <div className="font-mono text-[18px] font-extrabold">{c.numero ?? "Número: lo asigna SUNAT"}</div>
          <div className="text-[12px] text-text-3">{c.fecha_emision ? `Emisión ${fecha(c.fecha_emision)}` : "Fecha: la del día en que se emite"} · {c.forma_pago === "credito" ? `Crédito · ${c.cuotas.length} cuota${c.cuotas.length === 1 ? "" : "s"}` : "Contado"}</div>
        </div>
      </div>
      <div className="py-4">
        <div className="sobretitulo">Cliente</div>
        <div className="mt-1 font-bold">{c.cliente_nombre || "Cliente sin identificar"}</div>
        <div className="text-[12.5px] text-text-2">{c.cliente_doc ? `${c.cliente_tipo_doc ?? "Doc."} ${c.cliente_doc}` : "Sin documento"}{c.cliente_direccion ? ` · ${c.cliente_direccion}` : ""}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead><tr className="bg-primary text-left text-[12px] text-white"><th className="px-3 py-2">Descripción</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">V. unit.</th><th className="px-3 py-2 text-right">Valor venta</th></tr></thead>
          <tbody>
            {c.items.map((i, n) => (
              <tr key={n} className="border-b border-border"><td className="px-3 py-2 font-semibold">{i.descripcion}</td><td className="px-3 py-2 text-text-2">{i.unidad}</td><td className="num px-3 py-2 text-right">{i.cantidad}</td><td className="num px-3 py-2 text-right">{i.valor_unitario}</td><td className="num px-3 py-2 text-right font-bold">{dinero(i.valor_venta ?? linea(i)?.valor_venta, m)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-4">
        <div className="min-w-[200px] flex-1 text-[12.5px] text-text-2">
          {c.cuotas.length ? <><div className="sobretitulo mb-1">Cuotas</div>{c.cuotas.map((q, i) => <div key={i} className="num">Cuota {i + 1}: {dinero(q.monto, m)} · vence {fecha(q.fecha)}</div>)}</> : null}
          {c.observacion ? <div className="mt-2"><b>Observación:</b> {c.observacion}</div> : null}
        </div>
        <div className="w-full max-w-[260px] text-[13px]">
          <div className="flex justify-between py-1"><span className="text-text-2">Op. gravada</span><b className="num">{dinero(c.totales.op_gravada, m)}</b></div>
          <div className="flex justify-between py-1"><span className="text-text-2">IGV 18%</span><b className="num">{dinero(c.totales.igv, m)}</b></div>
          <div className="mt-1 flex justify-between rounded-lg px-3 py-2 text-white" style={{ background: "var(--navy-a)" }}><b>Total</b><b className="num">{dinero(c.totales.total, m)}</b></div>
        </div>
      </div>
    </div>
  );
}

function ImportarCotizacion({ inicial, onCerrar, onImportar }: { inicial: number | null; onCerrar: () => void; onImportar: (p: PropuestaCpe) => void }) {
  const [lista, setLista] = useState<CotizacionResumen[] | null>(null);
  const [sel, setSel] = useState<number | null>(inicial);
  const [modo, setModo] = useState<"resumen" | "detalle">("resumen");
  const [pct, setPct] = useState("100");
  const [prop, setProp] = useState<PropuestaCpe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<{ cotizaciones: CotizacionResumen[] }>("GET", "/ventas/cotizaciones").then((r) => setLista(r.cotizaciones)).catch((x) => setError(msg(x) ?? "No se pudo cargar"));
  }, []);
  useEffect(() => {
    if (!sel) return setProp(null);
    setError(null);
    const h = window.setTimeout(() => {
      api<PropuestaCpe>("GET", `/facturacion/desde-cotizacion/${sel}`, { consulta: { modo, porcentaje: pct } }).then(setProp).catch((x) => { setProp(null); setError(msg(x) ?? "No se pudo preparar"); });
    }, 250);
    return () => window.clearTimeout(h);
  }, [sel, modo, pct]);
  const orden: Record<string, number> = { aceptada: 0, enviada: 1, borrador: 2 };
  const filas = (lista ?? []).filter((c) => !q.trim() || `${c.numero} ${c.cliente}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (orden[a.estado ?? ""] ?? 3) - (orden[b.estado ?? ""] ?? 3)).slice(0, 40);
  return (
    <Modal titulo="Importar desde cotización" icono="request_quote" ancho={640} onCerrar={onCerrar}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={!prop} onClick={() => prop && onImportar(prop)}>Importar</button></>}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-text-2">Se reemplazan los ítems actuales. Los precios de la cotización incluyen IGV: aquí se pasan a <b>valor unitario sin IGV</b>, como lo pide SUNAT.</p>
        <input className="campo" placeholder="Buscar cotización por número o cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[220px] overflow-y-auto rounded-xl border border-border">
          {lista === null ? <div className="p-4 text-[13px] text-text-3">Cargando…</div> : filas.length ? filas.map((c) => (
            <button key={c.id} onClick={() => setSel(c.id)} className={`flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-0 ${sel === c.id ? "bg-primary-soft" : "hover:bg-surface-2"}`}>
              <span className="font-mono text-[12.5px] font-bold">{c.numero}</span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{c.cliente || "Cliente sin nombre"}</span>
              <span className="text-[11.5px] text-text-3">{c.estado ?? "Logística"}</span>
              <span className="num text-[13px] font-bold">{dinero(c.total)}</span>
            </button>
          )) : <div className="p-4 text-[13px] text-text-3">No hay cotizaciones.</div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="etiqueta">Cómo pasar los ítems</span>
            <select className="campo" value={modo} onChange={(e) => setModo(e.target.value as "resumen" | "detalle")}>
              <option value="resumen">Una línea con el sistema (hito o adelanto)</option>
              <option value="detalle">Cada ítem de la cotización</option>
            </select>
          </label>
          <label><span className="etiqueta">Porcentaje a facturar</span>
            <div className="flex gap-1.5"><input className="campo num" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />{["30", "50", "100"].map((p) => <button key={p} className={`btn-secundario px-2.5 ${pct === p ? "border-primary-line text-primary-ink" : ""}`} onClick={() => setPct(p)}>{p}%</button>)}</div>
          </label>
        </div>
        {error ? <div className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</div> : null}
        {prop ? (
          <div className="rounded-xl border border-border bg-surface-2 p-3 text-[13px]">
            <div className="flex justify-between"><span>A facturar (con IGV)</span><b className="num">{dinero(prop.objetivo)}</b></div>
            <div className="flex justify-between"><span>Total del comprobante</span><b className="num">{dinero(prop.totales.total)}</b></div>
            {prop.diferencia !== "0.00" ? <div className="mt-1 text-[12px] text-warning">Diferencia de {dinero(prop.diferencia.replace("-", ""))} por redondeo: SUNAT calcula el IGV sobre el valor sin IGV. Puedes ajustar un valor unitario.</div> : null}
            <div className="mt-1 text-[12px] text-text-3">{prop.items.length} ítem{prop.items.length === 1 ? "" : "s"} · {prop.tipo === "factura" ? "Factura (el cliente tiene RUC)" : "Boleta"}</div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function ModalEmitir({ c, onCerrar, onHecho }: { c: Comprobante; onCerrar: () => void; onHecho: (c: Comprobante) => void }) {
  const avisar = useAvisos();
  const [numero, setNumero] = useState("");
  const [dia, setDia] = useState(hoyLima());
  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const confirmar = async () => {
    setTrabajando(true);
    try {
      let r = await api<Comprobante>("POST", `/facturacion/${c.id}/emitir`, { cuerpo: { numero, fecha_emision: dia, version: c.version } });
      for (const [tipo, f] of [["pdf", pdf], ["xml", xml]] as const) {
        if (f) r = await api<Comprobante>("POST", `/facturacion/${c.id}/archivo`, { binario: f, consulta: { tipo } }).catch((x) => { avisar(`No se adjuntó el ${tipo.toUpperCase()}`, msg(x), "error"); return r; });
      }
      avisar("Comprobante emitido", r.numero ?? undefined);
      onHecho(r);
    } catch (x) {
      avisar("No se pudo marcar como emitido", msg(x), "error");
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <Modal titulo="Marcar como emitido" icono="task_alt" ancho={520} onCerrar={onCerrar}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={trabajando || !numero.trim()} onClick={() => void confirmar()}>{trabajando ? "Guardando…" : "Marcar como emitido"}</button></>}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-text-2">Confirma que SUNAT aceptó el comprobante y escribe el número que asignó.</p>
        <label><span className="etiqueta">Número asignado por SUNAT <span className="text-danger">*</span></span><input className="campo font-mono uppercase" autoFocus placeholder={c.tipo === "factura" ? "Ej. E001-123" : "Ej. EB01-45"} value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
        <label><span className="etiqueta">Fecha de emisión</span><input type="date" className="campo" max={hoyLima()} value={dia} onChange={(e) => setDia(e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="etiqueta"><Icono n="attach_file" t={15} /> PDF de SUNAT (opcional)</span><input type="file" accept="application/pdf,.pdf" className="text-[12.5px]" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} /></label>
          <label className="block"><span className="etiqueta"><Icono n="attach_file" t={15} /> XML de SUNAT (opcional)</span><input type="file" accept=".xml,text/xml,application/xml" className="text-[12.5px]" onChange={(e) => setXml(e.target.files?.[0] ?? null)} /></label>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3 text-[13px]">
          <div className="mb-1 font-bold">Resumen antes de confirmar</div>
          {[["Tipo", TIPO_CPE[c.tipo].l], ["Cliente", c.cliente_nombre ?? "Sin dato"], ["Op. gravada", dinero(c.totales.op_gravada, c.moneda)], ["IGV 18%", dinero(c.totales.igv, c.moneda)], ["Total", dinero(c.totales.total, c.moneda)]].map(([a, b]) => <div key={a} className="flex justify-between py-0.5"><span className="text-text-2">{a}</span><b className="num">{b}</b></div>)}
        </div>
      </div>
    </Modal>
  );
}

function DatosParaCopiar({ c }: { c: Comprobante }) {
  return (
    <details className="tarjeta p-4">
      <summary className="cursor-pointer font-bold text-primary-ink">Datos para copiar en SUNAT</summary>
      <div className="mt-2">
        <Copiable l={c.cliente_tipo_doc ?? "Documento"} v={c.cliente_doc} />
        <Copiable l="Cliente" v={c.cliente_nombre} />
        {c.items.map((i, n) => (
          <div key={n} className="mt-2 rounded-xl border border-border px-3 py-1">
            <div className="pt-1 text-[12px] font-bold text-text-3">Ítem {n + 1} · {UNIDADES[i.unidad]}</div>
            <Copiable l="Descripción" v={i.descripcion} /><Copiable l="Cantidad" v={i.cantidad} /><Copiable l="Valor unitario (sin IGV)" v={i.valor_unitario} />
          </div>
        ))}
        {c.cuotas.map((q, n) => <Copiable key={n} l={`Cuota ${n + 1} · vence ${fecha(q.fecha)}`} v={q.monto} />)}
        <Copiable l="Observación" v={c.observacion} />
      </div>
    </details>
  );
}

/** Comprobante emitido o anulado: resumen, archivos de SUNAT y anulación. */
function VistaFinal({ c, empresa, editar, onCambio }: { c: Comprobante; empresa: Empresa | null; editar: boolean; onCambio: (c: Comprobante) => void }) {
  const avisar = useAvisos();
  const [anular, setAnular] = useState<string | null>(null);
  const nombre = nombreCpe(c);
  const adjuntar = async (tipo: "pdf" | "xml", f: File | undefined) => {
    if (!f) return;
    try {
      onCambio(await api<Comprobante>("POST", `/facturacion/${c.id}/archivo`, { binario: f, consulta: { tipo } }));
      avisar(`${tipo.toUpperCase()} adjuntado`, nombre);
    } catch (x) {
      avisar("No se pudo adjuntar", msg(x), "error");
    }
  };
  const confirmarAnular = async () => {
    try {
      onCambio(await api<Comprobante>("POST", `/facturacion/${c.id}/anular`, { cuerpo: { motivo: anular, version: c.version } }));
      setAnular(null);
      avisar("Comprobante anulado", nombre);
    } catch (x) {
      avisar("No se pudo anular", msg(x), "error");
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {c.estado === "anulado" ? <div className="flex gap-2 rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger"><Icono n="block" t={18} /><span><b>Anulado {fechaHora(c.anulado_en)}.</b> Motivo: {c.motivo_anulacion}</span></div> : null}
      <div className="flex flex-wrap items-center gap-2">
        {(["pdf", "xml"] as const).map((t) =>
          (t === "pdf" ? c.tiene_pdf : c.tiene_xml) ? (
            <button key={t} className="btn-secundario" onClick={() => void bajar(c.id, t, nombre).catch((x) => avisar("No se pudo descargar", msg(x), "error"))}><Icono n="download" t={18} />{t.toUpperCase()} de SUNAT</button>
          ) : editar && c.estado === "emitido" ? (
            <label key={t} className="btn-secundario cursor-pointer"><Icono n="attach_file" t={18} />Adjuntar {t.toUpperCase()}<input type="file" hidden accept={t === "pdf" ? "application/pdf,.pdf" : ".xml,text/xml,application/xml"} onChange={(e) => void adjuntar(t, e.target.files?.[0])} /></label>
          ) : null,
        )}
        <div className="flex-1" />
        {editar && c.estado === "emitido" ? <button className="btn-secundario text-danger" onClick={() => setAnular("")}><Icono n="block" t={18} />Anular</button> : null}
      </div>
      <ResumenCpe c={c} empresa={empresa} />
      <div className="text-center text-[12px] text-text-3">Preparado por {c.creado_por ?? "Sin dato"} · enviado a SUNAT {fechaHora(c.enviado_en)} · registrado como emitido {fechaHora(c.emitido_en)}{c.cotizacion_numero ? ` · desde la cotización ${c.cotizacion_numero}` : ""}</div>
      {anular !== null ? (
        <Modal titulo="Anular comprobante" icono="block" onCerrar={() => setAnular(null)}
          pie={<><button className="btn-secundario" onClick={() => setAnular(null)}>Cancelar</button><button className="btn-peligro" disabled={!anular.trim()} onClick={() => void confirmarAnular()}>Anular comprobante</button></>}>
          <div className="flex flex-col gap-3 text-[13px]">
            <div className="rounded-xl border border-border bg-surface-2 p-3">{[["Comprobante", nombre], ["Fecha de emisión", fecha(c.fecha_emision)], ["Total", dinero(c.totales.total, c.moneda)], ["Estado", "Emitido → Anulado"]].map(([a, b]) => <div key={a} className="flex justify-between py-0.5"><span className="text-text-2">{a}</span><b>{b}</b></div>)}</div>
            <label><span className="etiqueta">Motivo de anulación <span className="text-danger">*</span></span><textarea className="campo h-auto py-2" rows={2} value={anular} onChange={(e) => setAnular(e.target.value)} placeholder="Ej. RUC del cliente incorrecto" /></label>
            <p className="text-warning">Esto solo lo marca en el ERP. En SUNAT presenta la comunicación de baja (o emite la nota de crédito) dentro del plazo.</p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function FlujoComprobante({ id }: { id?: number }) {
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [params] = useSearchParams();
  const editar = puede(usuario, "facturacion", "completo");
  const ext = useExtension();
  const [c, setC] = useState<Comprobante | null>(null);
  const [f, setF] = useState<Form>(VACIO);
  const [paso, setPaso] = useState<Paso>(((ubicacion.state as { paso?: Paso } | null)?.paso) ?? "editar");
  const [cargando, setCargando] = useState(!!id);
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [tc, setTc] = useState<string | null>(null);
  const [padron, setPadron] = useState<Padron | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [importar, setImportar] = useState<number | null | false>(false);
  const [emitir, setEmitir] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [verifico, setVerifico] = useState([false, false, false, false]);

  useEffect(() => {
    api<Empresa>("GET", "/empresa").then(setEmpresa).catch(() => null);
    api<Parametros>("GET", "/parametros").then((p) => setTc(p.tipo_cambio?.valor ?? null)).catch(() => null);
  }, []);
  useEffect(() => {
    if (!id) {
      const cot = Number(params.get("cotizacion"));
      if (cot > 0) setImportar(cot);
      return;
    }
    setCargando(true);
    api<Comprobante>("GET", `/facturacion/${id}`)
      .then((r) => {
        setC(r);
        setF(deComprobante(r));
        setPaso((p) => (r.estado === "enviado" ? (p === "abrir" ? "abrir" : "emitir") : r.estado === "borrador" ? (p === "revisar" ? "revisar" : "editar") : p));
      })
      .catch((x) => setError(msg(x) ?? "No se pudo cargar"))
      .finally(() => setCargando(false));
  }, [id, params]);

  const t = useMemo(() => totales(f.items), [f.items]);
  const r = useMemo(() => reglas(f, tc), [f, tc]);
  const todoOk = r.every((x) => x.ok);
  const poner = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const ponerItem = (n: number, p: Partial<ItemCpe>) => setF((x) => ({ ...x, items: x.items.map((i, k) => (k === n ? { ...i, ...p } : i)) }));

  if (cargando) return <Cargando texto="Abriendo el comprobante…" />;
  if (error) return <ErrorCarga mensaje={error} />;

  const cuerpo = () => ({ ...f, cliente_doc: f.cliente_doc.trim() || null, version: c?.version });
  const guardar = async (): Promise<Comprobante | null> => {
    setTrabajando(true);
    try {
      const g = c ? await api<Comprobante>("PUT", `/facturacion/${c.id}`, { cuerpo: cuerpo() }) : await api<Comprobante>("POST", "/facturacion", { cuerpo: cuerpo() });
      setC(g);
      return g;
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
      return null;
    } finally {
      setTrabajando(false);
    }
  };
  const irA = (g: Comprobante, p: Paso) => {
    if (!id || id !== g.id) navegar(`/facturacion/${g.id}`, { replace: true, state: { paso: p } });
    else setPaso(p);
  };
  const guardarBorrador = async () => {
    const g = await guardar();
    if (g) {
      avisar("Borrador guardado", nombreCpe(g));
      irA(g, "editar");
    }
  };
  const revisar = async () => {
    const g = await guardar();
    if (g) irA(g, "revisar");
  };
  const abrirEnSunat = async () => {
    if (!c) return;
    setTrabajando(true);
    try {
      setC(await api<Comprobante>("POST", `/facturacion/${c.id}/enviar`, { cuerpo: { version: c.version } }));
      setPaso("abrir");
    } catch (x) {
      avisar("Falta corregir algo", msg(x), "error");
    } finally {
      setTrabajando(false);
    }
  };
  const lanzar = async () => {
    if (!c) return;
    try {
      await llenarEnSunat(c, empresa);
      setPaso("emitir");
    } catch (x) {
      avisar("No se pudo abrir SUNAT", msg(x), "error");
    }
  };
  const sinExtension = () => {
    window.open(URL_SOL, "_blank", "noopener");
    setPaso("emitir");
  };
  const aBorrador = async () => {
    if (!c) return;
    try {
      const g = await api<Comprobante>("POST", `/facturacion/${c.id}/borrador`, { cuerpo: { version: c.version } });
      setC(g);
      setF(deComprobante(g));
      setPaso("editar");
    } catch (x) {
      avisar("No se pudo volver a borrador", msg(x), "error");
    }
  };
  const eliminar = async () => {
    if (!c || !window.confirm("¿Eliminar este borrador?")) return;
    try {
      await api("DELETE", `/facturacion/${c.id}`);
      avisar("Borrador eliminado");
      navegar("/facturacion?tab=comprobantes");
    } catch (x) {
      avisar("No se pudo eliminar", msg(x), "error");
    }
  };
  const consultar = async () => {
    const d = f.cliente_doc.trim();
    if (!d) return;
    setConsultando(true);
    setPadron(null);
    try {
      const p = await api<Padron>("GET", `/facturacion/padron/${d}`);
      setPadron(p);
      if (p.encontrado) setF((x) => ({ ...x, cliente_nombre: p.nombre ?? x.cliente_nombre, cliente_direccion: p.direccion ?? x.cliente_direccion, cliente_fuente: p.fuente }));
    } catch (x) {
      avisar("No se pudo consultar", msg(x), "error");
    } finally {
      setConsultando(false);
    }
  };
  const aplicarPropuesta = (p: PropuestaCpe) => {
    setF((x) => ({
      ...x, tipo: p.tipo, cliente_doc: p.cliente_doc ?? x.cliente_doc, cliente_nombre: p.cliente_nombre ?? x.cliente_nombre, cliente_direccion: p.cliente_direccion ?? x.cliente_direccion,
      cliente_fuente: null, items: p.items.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad, valor_unitario: i.valor_unitario })),
      cotizacion_id: p.cotizacion.id, proyecto_id: p.proyecto_id, cuotas: [], forma_pago: x.forma_pago,
    }));
    setPadron(null);
    setImportar(false);
    avisar("Ítems importados", `De la cotización ${p.cotizacion.numero}. Puedes editarlos antes de emitir.`, "info");
  };
  const repartir = (n: number) => {
    const total = centimos(t.total) ?? 0n;
    if (n < 1 || total <= 0n) return;
    const base = total / BigInt(n);
    const cuotas = Array.from({ length: n }, (_, i) => {
      const m = i === n - 1 ? total - base * BigInt(n - 1) : base;
      return { fecha: f.cuotas[i]?.fecha || sumarDias(30 * (i + 1)), monto: `${m / 100n}.${String(m % 100n).padStart(2, "0")}` };
    });
    poner("cuotas", cuotas);
  };

  // ---- comprobante cerrado ----
  if (c && (c.estado === "emitido" || c.estado === "anulado")) {
    return (
      <div className="flex flex-col gap-4">
        <Encabezado c={c} onVolver={() => navegar("/facturacion?tab=comprobantes")} />
        <VistaFinal c={c} empresa={empresa} editar={editar} onCambio={setC} />
      </div>
    );
  }
  if (c && !editar) {
    return (
      <div className="flex flex-col gap-4">
        <Encabezado c={c} onVolver={() => navegar("/facturacion?tab=comprobantes")} />
        <ResumenCpe c={c} empresa={empresa} />
      </div>
    );
  }

  const factura = f.tipo === "factura";
  const docLabel = factura ? "RUC" : "DNI o RUC";
  return (
    <div className="flex flex-col gap-4">
      {c ? <Encabezado c={c} onVolver={() => navegar("/facturacion?tab=comprobantes")} /> : null}
      <Pasos actual={INDICE[paso]} />

      {paso === "editar" ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5">
            <section className="tarjeta grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="etiqueta">Tipo de comprobante</span>
                <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1">
                  {(["factura", "boleta"] as const).map((k) => (
                    <button key={k} onClick={() => poner("tipo", k)} className={`flex h-9 items-center gap-2 rounded-[9px] px-4 text-[13.5px] font-bold ${f.tipo === k ? "bg-surface text-primary-ink shadow-sm" : "text-text-2"}`}><Icono n={TIPO_CPE[k].icono} t={18} />{TIPO_CPE[k].l}</button>
                  ))}
                </div>
              </div>
              <div><span className="etiqueta">Serie y número</span><div className="campo flex items-center text-text-3">Lo asigna SUNAT al emitir</div></div>
              <label><span className="etiqueta">Moneda</span>
                <select className="campo" value={f.moneda} onChange={(e) => poner("moneda", e.target.value as "PEN" | "USD")}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select>
              </label>
            </section>

            <section className="tarjeta flex flex-col gap-3 p-5">
              <div className="titulo-seccion">Cliente</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[200px] flex-1"><span className="etiqueta">{docLabel} del cliente{!factura ? " (opcional hasta S/ 700)" : ""}</span>
                  <input className="campo num" inputMode="numeric" maxLength={11} value={f.cliente_doc} onChange={(e) => { poner("cliente_doc", e.target.value.replace(/\D/g, "")); setPadron(null); }} onKeyDown={(e) => e.key === "Enter" && void consultar()} placeholder={factura ? "11 dígitos" : "8 u 11 dígitos"} />
                </label>
                <button className="btn-secundario" disabled={consultando || !(f.cliente_doc.length === 8 || f.cliente_doc.length === 11)} onClick={() => void consultar()}><Icono n="search" t={18} />{consultando ? "Consultando…" : "Consultar padrón"}</button>
              </div>
              {padron ? (
                padron.encontrado ? (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                    <Icono n={f.cliente_doc.length === 11 ? "domain" : "person"} className="text-primary-ink" />
                    <div className="min-w-0 flex-1 text-[13px]"><div className="font-bold">{padron.nombre}</div><div className="text-text-3">{[padron.direccion, padron.estado, padron.condicion].filter(Boolean).join(" · ") || "Sin dirección registrada"}</div></div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-[11.5px] font-bold text-success"><Icono n="verified" t={14} />{FUENTE[padron.fuente ?? ""] ?? ""}</span>
                  </div>
                ) : (
                  <div className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">{padron.aviso ?? "No hay datos de este documento."} {padron.configurado ? "" : "La consulta automática a SUNAT/RENIEC no está configurada: escribe el nombre a mano."}</div>
                )
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className="etiqueta">{factura ? "Razón social" : "Nombre"}</span><input className="campo" value={f.cliente_nombre} onChange={(e) => { poner("cliente_nombre", e.target.value); poner("cliente_fuente", null); }} /></label>
                <label><span className="etiqueta">Dirección (opcional)</span><input className="campo" value={f.cliente_direccion} onChange={(e) => poner("cliente_direccion", e.target.value)} /></label>
              </div>
            </section>

            <section className="tarjeta overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5">
                <div className="titulo-seccion flex-1">Ítems <span className="font-medium text-text-3">· {f.items.length}</span></div>
                <button className="btn-secundario h-9" onClick={() => setImportar(null)}><Icono n="request_quote" t={18} />Importar desde cotización</button>
                <button className="btn-secundario h-9" onClick={() => poner("items", [...f.items, { ...ITEM_VACIO }])}><Icono n="add" t={18} />Ítem</button>
              </div>
              {f.cotizacion_id ? <div className="border-b border-border bg-primary-soft px-5 py-2 text-[12.5px] text-primary-ink">Ítems importados de una cotización. Puedes editarlos antes de emitir.</div> : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead><tr className="border-b border-border text-left text-[11.5px] font-bold uppercase tracking-wide text-text-3"><th className="px-4 py-2">Descripción</th><th className="px-2 py-2">Unidad</th><th className="px-2 py-2 text-right">Cant.</th><th className="px-2 py-2 text-right">V. unit. (sin IGV)</th><th className="px-2 py-2 text-right">Valor venta</th><th className="w-10" /></tr></thead>
                  <tbody>
                    {f.items.map((i, n) => {
                      const l = linea(i);
                      return (
                        <tr key={n} className="border-b border-border align-top last:border-0">
                          <td className="px-4 py-2"><textarea rows={1} className="campo h-auto min-h-9 py-1.5" value={i.descripcion} onChange={(e) => ponerItem(n, { descripcion: e.target.value })} placeholder="Ej. Sistema fotovoltaico On-Grid 20 kWp – adelanto 50%" /></td>
                          <td className="px-2 py-2"><select className="campo h-9 w-36" value={i.unidad} onChange={(e) => ponerItem(n, { unidad: e.target.value as UnidadCpe })}>{Object.entries(UNIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                          <td className="px-2 py-2"><input className="campo num h-9 w-20 text-right" inputMode="decimal" value={i.cantidad} onChange={(e) => ponerItem(n, { cantidad: e.target.value })} /></td>
                          <td className="px-2 py-2"><input className={`campo num h-9 w-32 text-right ${i.valor_unitario && !l ? "border-danger" : ""}`} inputMode="decimal" value={i.valor_unitario} onChange={(e) => ponerItem(n, { valor_unitario: e.target.value })} placeholder="0.00" />{l ? <div className="num mt-0.5 text-right text-[11px] text-text-3">con IGV {dinero(l.importe, f.moneda)}</div> : null}</td>
                          <td className="num px-2 py-2 pt-4 text-right font-bold">{l ? dinero(l.valor_venta, f.moneda) : "—"}</td>
                          <td className="py-2 pr-2"><button title="Quitar" className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:bg-surface-2" onClick={() => poner("items", f.items.filter((_, k) => k !== n))}><Icono n="close" t={18} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!f.items.length ? <div className="p-6 text-center text-[13px] text-text-3">Sin ítems. Agrega uno o impórtalos desde una cotización.</div> : null}
            </section>

            <section className="tarjeta flex flex-col gap-3 p-5">
              <div className="titulo-seccion">Forma de pago</div>
              <div className="inline-flex w-fit rounded-xl border border-border bg-surface-2 p-1">
                {(["contado", "credito"] as const).map((k) => <button key={k} onClick={() => { poner("forma_pago", k); if (k === "credito" && !f.cuotas.length) repartir(1); }} className={`h-9 rounded-[9px] px-4 text-[13.5px] font-bold ${f.forma_pago === k ? "bg-surface text-primary-ink shadow-sm" : "text-text-2"}`}>{k === "contado" ? "Contado" : "Crédito"}</button>)}
              </div>
              {f.forma_pago === "credito" ? (
                <div className="flex flex-col gap-2">
                  {f.cuotas.map((q, n) => (
                    <div key={n} className="flex flex-wrap items-center gap-2">
                      <span className="w-16 text-[13px] font-semibold">Cuota {n + 1}</span>
                      <input type="date" className="campo h-9 w-44" min={sumarDias(1)} value={q.fecha} onChange={(e) => poner("cuotas", f.cuotas.map((x, k) => (k === n ? { ...x, fecha: e.target.value } : x)))} />
                      <input className="campo num h-9 w-36 text-right" inputMode="decimal" value={q.monto} onChange={(e) => poner("cuotas", f.cuotas.map((x, k) => (k === n ? { ...x, monto: e.target.value } : x)))} />
                      <button className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:bg-surface-2" title="Quitar" onClick={() => poner("cuotas", f.cuotas.filter((_, k) => k !== n))}><Icono n="close" t={18} /></button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secundario h-9" onClick={() => poner("cuotas", [...f.cuotas, { fecha: sumarDias(30 * (f.cuotas.length + 1)), monto: "" }])}><Icono n="add" t={18} />Cuota</button>
                    {[1, 2, 3].map((k) => <button key={k} className="btn-secundario h-9" onClick={() => repartir(k)}>Repartir en {k}</button>)}
                  </div>
                </div>
              ) : null}
              <label><span className="etiqueta">Observación (opcional)</span><input className="campo" maxLength={500} value={f.observacion} onChange={(e) => poner("observacion", e.target.value)} /></label>
            </section>
          </div>

          <div className="flex flex-col gap-4 xl:sticky xl:top-0 xl:self-start">
            <section className="tarjeta p-5 text-[13.5px]">
              <div className="flex justify-between py-1"><span className="text-text-2">Op. gravada</span><b className="num">{dinero(t.op_gravada, f.moneda)}</b></div>
              <div className="flex justify-between py-1"><span className="text-text-2">IGV 18%</span><b className="num">{dinero(t.igv, f.moneda)}</b></div>
              <div className="mt-2 flex justify-between border-t border-border pt-3 text-[16px]"><b>Importe total</b><b className="num text-primary-ink">{dinero(t.total, f.moneda)}</b></div>
            </section>
            <section className="tarjeta p-5">
              <div className="titulo-seccion mb-2">Validaciones</div>
              {r.map((x) => <div key={x.texto} className={`flex gap-2 py-1 text-[13px] ${x.ok ? "text-text-2" : "text-danger"}`}><Icono n={x.ok ? "check_circle" : "cancel"} t={18} relleno className={x.ok ? "text-success" : ""} />{x.texto}</div>)}
            </section>
            <button className="btn-primario h-11" disabled={!todoOk || trabajando} onClick={() => void revisar()}>Revisar resumen<Icono n="arrow_forward" t={18} /></button>
            <button className="btn-secundario" disabled={trabajando} onClick={() => void guardarBorrador()}><Icono n="save" t={18} />Guardar borrador</button>
            {c ? <button className="btn-secundario text-danger" onClick={() => void eliminar()}><Icono n="delete" t={18} />Eliminar borrador</button> : null}
          </div>
        </div>
      ) : null}

      {paso === "revisar" && c ? (
        <div className="flex flex-col gap-4">
          <ResumenCpe c={c} empresa={empresa} />
          <div className="mx-auto flex w-full max-w-[760px] gap-2 rounded-xl bg-warning-soft px-4 py-3 text-[13px] text-warning"><Icono n="warning" t={18} />Revisa con cuidado: una vez emitido en SUNAT, el comprobante solo se corrige con nota de crédito o comunicación de baja.</div>
          <div className="mx-auto flex w-full max-w-[760px] flex-wrap justify-end gap-2">
            <button className="btn-secundario" onClick={() => setPaso("editar")}><Icono n="edit" t={18} />Volver a editar</button>
            <button className="btn-primario" disabled={trabajando} onClick={() => void abrirEnSunat()}><Icono n="open_in_new" t={18} />Abrir en SUNAT</button>
          </div>
        </div>
      ) : null}

      {paso === "abrir" && c ? (
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
          {ext.estado === "conectada" ? (
            <section className="tarjeta flex flex-col items-center gap-3 p-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary-ink"><Icono n="extension" t={30} /></span>
              <div className="text-[17px] font-extrabold">La extensión rellenará SUNAT por ti</div>
              <p className="text-[13.5px] text-text-2">Se abrirá el portal SUNAT Operaciones en Línea en una pestaña nueva. Inicia sesión con tu clave SOL; la extensión ICR Autollenado tendrá el cliente, los ítems y los totales de este comprobante, y nunca pulsa «Emitir».</p>
              <button className="btn-primario h-11" onClick={() => void lanzar()}><Icono n="open_in_new" t={18} />Abrir SUNAT en pestaña nueva</button>
              <div className="text-[12px] text-text-3">Extensión conectada · versión {ext.version}</div>
            </section>
          ) : (
            <section className="tarjeta flex flex-col gap-3 p-6">
              <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-warning-soft text-warning"><Icono n="extension_off" t={26} /></span><div className="text-[16px] font-extrabold">{ext.estado === "buscando" ? "Buscando la extensión…" : "No detectamos la extensión ICR Autollenado"}</div></div>
              <p className="text-[13.5px] text-text-2">Sin la extensión tendrás que copiar los datos a mano en SUNAT. Instalarla toma un minuto y solo se hace una vez por navegador (Chrome o Edge):</p>
              <ol className="list-decimal pl-5 text-[13.5px] leading-relaxed text-text-2">
                <li>Descarga la extensión y descomprime el zip en una carpeta que no vayas a borrar.</li>
                <li>Abre <b>chrome://extensions</b> (en Edge: edge://extensions) y activa <b>Modo de desarrollador</b>.</li>
                <li>Pulsa <b>Cargar descomprimida</b>, elige la carpeta y vuelve a esta pestaña.</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <a className="btn-primario no-underline" href={ZIP_EXTENSION} download><Icono n="download" t={18} />Instalar extensión</a>
                <button className="btn-secundario" onClick={ext.verificar}><Icono n="refresh" t={18} />Ya la instalé, verificar</button>
                <button className="btn-secundario" onClick={sinExtension}>Continuar sin extensión</button>
              </div>
            </section>
          )}
          <button className="btn-secundario w-fit" onClick={() => void aBorrador()}><Icono n="arrow_back" t={18} />Volver a editar</button>
        </div>
      ) : null}

      {paso === "emitir" && c ? (
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
          <section className="tarjeta flex flex-col gap-3 p-6">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-primary-ink"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Esperando que emitas en SUNAT</div>
            <div className="text-[17px] font-extrabold">Revisa y emite en la pestaña de SUNAT</div>
            <p className="text-[13.5px] text-text-2">Antes de pulsar «Emitir» en SUNAT, verifica:</p>
            {[["Cliente", `${c.cliente_tipo_doc ?? "Sin documento"} ${c.cliente_doc ?? ""} · ${c.cliente_nombre ?? ""}`], ["Ítems", `${c.items.length} ítem${c.items.length === 1 ? "" : "s"}`], ["Op. gravada e IGV", `${dinero(c.totales.op_gravada, c.moneda)} + ${dinero(c.totales.igv, c.moneda)}`], ["Importe total", dinero(c.totales.total, c.moneda)]].map(([l, v], n) => (
              <label key={l} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                <input type="checkbox" className="h-4 w-4" checked={verifico[n]} onChange={(e) => setVerifico((x) => x.map((y, k) => (k === n ? e.target.checked : y)))} />
                <span className="flex-1 text-[13px] text-text-2">{l}</span><b className="num text-[13px]">{v}</b>
              </label>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-primario" onClick={() => setEmitir(true)}><Icono n="task_alt" t={18} />Ya lo emití en SUNAT</button>
              <button className="btn-secundario" onClick={() => (ext.estado === "conectada" ? void lanzar() : window.open(URL_SOL, "_blank", "noopener"))}><Icono n="open_in_new" t={18} />Volver a abrir SUNAT</button>
            </div>
            <p className="text-[12.5px] text-text-3">Si SUNAT rechazó el comprobante, <button className="font-semibold text-primary-ink underline" onClick={() => void aBorrador()}>vuelve al paso 1</button> para corregirlo.</p>
          </section>
          <DatosParaCopiar c={c} />
        </div>
      ) : null}

      {importar !== false ? <ImportarCotizacion inicial={importar} onCerrar={() => setImportar(false)} onImportar={aplicarPropuesta} /> : null}
      {emitir && c ? <ModalEmitir c={c} onCerrar={() => setEmitir(false)} onHecho={(g) => { setEmitir(false); setC(g); }} /> : null}
    </div>
  );
}

function Encabezado({ c, onVolver }: { c: Comprobante; onVolver: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="flex items-center gap-1 text-[13px] font-semibold text-text-2 hover:text-primary-ink" onClick={onVolver}><Icono n="arrow_back" t={18} />Comprobantes</button>
      <span className="text-text-3">/</span>
      <span className="font-mono text-[15px] font-extrabold">{nombreCpe(c)}</span>
      <PillCpe e={c.estado} />
      <span className="text-[12.5px] text-text-3">{c.cliente_nombre ?? ""}</span>
    </div>
  );
}
