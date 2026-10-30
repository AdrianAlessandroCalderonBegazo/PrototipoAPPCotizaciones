import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, descargarBlob } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { dinero } from "../../dinero";
import { fecha, fechaHora } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { Cotizacion as TCot, Empresa, EstadoCot } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { ESTADO_COT, PillCot, cant } from "./comun";

const TRANSICIONES: Record<string, EstadoCot[]> = { null: ["borrador", "enviada", "aceptada", "rechazada"], borrador: ["enviada"], enviada: ["aceptada", "rechazada", "borrador"], aceptada: ["enviada"], rechazada: ["enviada"] };
const ACCION: Record<EstadoCot, { l: string; i: string }> = {
  borrador: { l: "Volver a borrador", i: "edit_note" }, enviada: { l: "Marcar como enviada", i: "send" }, aceptada: { l: "Marcar como aceptada", i: "thumb_up" }, rechazada: { l: "Marcar como rechazada", i: "thumb_down" },
};

/** Número peruano para wa.me: 9 dígitos → 51 + número. */
export function numeroWhatsapp(t: string | null | undefined): string {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length === 9 && d.startsWith("9")) return `51${d}`;
  return d;
}

function Whatsapp({ c, empresa, onCerrar, onPdf }: { c: TCot; empresa: Empresa | null; onCerrar: () => void; onPdf: () => Promise<Blob> }) {
  const [tel, setTel] = useState(numeroWhatsapp(c.telefono));
  const nombre = c.atencion?.split(" ")[0] || c.cliente;
  const [msg, setMsg] = useState(
    `Hola ${nombre}, le saluda ${c.vendedor ?? "el equipo"} de ${empresa?.nombre_comercial || empresa?.razon_social || "ICR"}. Le envío la cotización ${c.numero}${c.sistema ? ` (${c.sistema.split("\n")[0]})` : ""} por un total de ${dinero(c.totales.total)}${c.valida_hasta ? `, válida hasta el ${fecha(c.valida_hasta)}` : ""}. Le adjunto el PDF. Quedo atento a sus consultas.`,
  );
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const movil = typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);
  const descargar = async () => {
    const b = await onPdf();
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${c.numero}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const compartir = async () => {
    setTrabajando(true);
    try {
      const archivo = new File([await onPdf()], `${c.numero}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], text: msg, title: `Cotización ${c.numero}` });
        onCerrar();
        return;
      }
      await descargar();
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, "_blank");
      setAbierto(true);
    } catch {
      // la persona canceló el menú de compartir
    } finally {
      setTrabajando(false);
    }
  };
  const abrirEscritorio = async () => {
    setTrabajando(true);
    try {
      await descargar();
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, "_blank");
      setAbierto(true);
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <Modal titulo={`Enviar ${c.numero} por WhatsApp`} icono="chat" ancho={540} onCerrar={onCerrar}
      pie={<><button className="btn-secundario" onClick={() => void descargar()}><Icono n="download" t={18} />Solo descargar PDF</button><button className="btn-primario" disabled={trabajando || (!movil && tel.length < 9)} onClick={() => void (movil ? compartir() : abrirEscritorio())}>{movil ? "Compartir PDF" : "Descargar PDF y abrir WhatsApp"}</button></>}>
      <div className="flex flex-col gap-3.5">
        <ol className="flex flex-col gap-2 text-[13px]">
          {(movil
            ? [["Compartir", "Se abre el menú del teléfono: elige WhatsApp y el contacto. El PDF va adjunto."], ["Revisar", "WhatsApp muestra el mensaje y el PDF antes de enviar."]]
            : [["Se descarga el PDF", `Queda en tu carpeta Descargas como ${c.numero}.pdf.`], ["Se abre WhatsApp", "Con el número y el mensaje ya escritos (WhatsApp Web o la app de escritorio)."], ["Adjunta el PDF", "WhatsApp no permite adjuntar archivos automáticamente: toca el clip › Documento › elige el PDF."]]
          ).map(([t, d], i) => (
            <li key={t} className="flex gap-2.5"><span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary-soft text-[12px] font-extrabold text-primary-ink">{i + 1}</span><span><b>{t}.</b> <span className="text-text-2">{d}</span></span></li>
          ))}
        </ol>
        {!movil ? <label><span className="etiqueta">Número de WhatsApp (con código de país)</span><input className="campo num" value={tel} onChange={(e) => setTel(e.target.value.replace(/\D/g, ""))} placeholder="51959214377" /></label> : null}
        <label><span className="etiqueta">Mensaje</span><textarea className="campo h-auto py-2.5" rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
        {abierto ? <div className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] text-warning"><Icono n="attach_file" t={18} /><span><b>Falta adjuntar el PDF.</b> En el chat que se abrió: clip › Documento › {c.numero}.pdf (Descargas) › Enviar.</span></div> : null}
      </div>
    </Modal>
  );
}

export function CotizacionVer() {
  const { id } = useParams();
  const navegar = useNavigate();
  const avisar = useAvisos();
  const { usuario } = useSesion();
  const editar = puede(usuario, "cotizacion", "completo");
  const facturar = puede(usuario, "facturacion", "completo");
  const { datos: c, error, cargando, recargar } = useDatos(() => api<TCot>("GET", `/ventas/cotizaciones/${id}`), [id]);
  const empresa = useDatos(() => api<Empresa>("GET", "/empresa"));
  const [menu, setMenu] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [wa, setWa] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const pdfCache = useRef<{ v: number; b: Blob } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const f = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [menu]);

  if (cargando && !c) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!c) return null;
  const e = empresa.datos;

  const pdf = async () => {
    if (pdfCache.current && pdfCache.current.v === c.version) return pdfCache.current.b;
    const b = await descargarBlob(`/ventas/cotizaciones/${c.id}/pdf`);
    pdfCache.current = { v: c.version, b };
    return b;
  };
  const abrirPdf = async (descargarlo: boolean) => {
    setTrabajando(true);
    try {
      const url = URL.createObjectURL(await pdf());
      if (descargarlo) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${c.numero}.pdf`;
        a.click();
      } else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (x) {
      avisar("No se pudo generar el PDF", x instanceof Error ? x.message : undefined, "error");
    } finally {
      setTrabajando(false);
    }
  };
  const cambiar = async (estado: EstadoCot, motivo?: string) => {
    setMenu(false);
    try {
      await api("POST", `/ventas/cotizaciones/${c.id}/estado`, { cuerpo: { estado, motivo } });
      avisar(`Cotización ${ESTADO_COT[estado].l.toLowerCase()}`, c.numero);
      setRechazo(null);
      await recargar();
    } catch (x) {
      avisar("No se pudo cambiar el estado", x instanceof Error ? x.message : undefined, "error");
    }
  };
  const editable = c.estado === null || c.estado === "borrador" || c.estado === "enviada";
  const t = c.totales;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-[13px] text-text-3">
        <Link to="/cotizacion" className="inline-flex items-center gap-1"><Icono n="arrow_back" t={18} />Cotización</Link><span>/</span><span className="font-mono">{c.numero}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 font-mono text-[24px] font-extrabold">{c.numero}</h1>
        <PillCot e={c.estado} />
        {c.origen === "logistica" ? <span className="rounded-md border border-border px-2 py-0.5 text-[11.5px] font-bold text-text-3">Hecha en Logística</span> : null}
        <div className="flex-1" />
        {editar && editable ? <button className="btn-secundario" onClick={() => navegar(`/cotizacion/${c.id}/editar`)}><Icono n="edit" t={18} />Editar</button> : null}
        {editar ? (
          <div className="relative" ref={menuRef}>
            <button className="btn-secundario" onClick={() => setMenu(!menu)}>Estado<Icono n="expand_more" t={18} /></button>
            {menu ? (
              <div className="aparecer absolute right-0 top-12 z-30 w-[240px] rounded-2xl border border-border bg-surface p-2 shadow-menu">
                {TRANSICIONES[c.estado ?? "null"].map((s) => (
                  <button key={s} onClick={() => (s === "rechazada" ? (setMenu(false), setRechazo("")) : void cambiar(s))} className="flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left text-[13.5px] font-semibold hover:bg-surface-2"><Icono n={ACCION[s].i} t={19} className="text-primary" />{ACCION[s].l}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {facturar && c.estado === "aceptada" ? <button className="btn-secundario" onClick={() => navegar(`/facturacion/nuevo?cotizacion=${c.id}`)}><Icono n="receipt_long" t={18} />Facturar</button> : null}
        <button className="btn-secundario" disabled={trabajando} onClick={() => void abrirPdf(false)}><Icono n="print" t={18} />Imprimir</button>
        <button className="btn-secundario" disabled={trabajando} onClick={() => void abrirPdf(true)}><Icono n="picture_as_pdf" t={18} />Exportar PDF</button>
        <button className="btn-primario" onClick={() => setWa(true)}><Icono n="chat" t={18} />Enviar por WhatsApp</button>
      </div>
      {c.estado === "rechazada" && c.motivo_rechazo ? <div className="rounded-xl bg-danger-soft px-4 py-2.5 text-[13px] text-danger"><b>Motivo del rechazo:</b> {c.motivo_rechazo}</div> : null}

      <div className="overflow-x-auto rounded-[18px] border border-border bg-surface-2 p-3 sm:p-6">
        <div className="mx-auto min-w-[720px] max-w-[860px] rounded-xl bg-white p-9 text-[#0E2233] shadow-menu">
          <div className="flex items-start justify-between gap-6 border-b-2 pb-4" style={{ borderColor: "#0F7590" }}>
            <div className="flex items-start gap-3.5">
              <div className="grid h-14 w-14 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-[#0E2233] text-[13px] font-extrabold text-white">{e?.logo ? <img src={e.logo} alt="" className="h-full w-full bg-white object-contain" /> : "ICR"}</div>
              <div>
                <div className="text-[17px] font-extrabold">{e?.razon_social ?? "Sin dato"}</div>
                <div className="text-[11.5px] text-[#4A5D6E]">{[e?.ruc && `RUC ${e.ruc}`, [e?.direccion, e?.ciudad].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>
                <div className="text-[11.5px] text-[#4A5D6E]">{[e?.correo, e?.telefono, e?.web].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold tracking-[0.1em] text-[#0F7590]">COTIZACIÓN</div>
              <div className="text-[22px] font-extrabold">{c.numero}</div>
              <div className="text-[11.5px] text-[#4A5D6E]">Emitida {fecha(c.fecha)}{c.valida_hasta ? ` · Válida hasta ${fecha(c.valida_hasta)}` : ""}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 py-4">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#7A8B99]">Cliente</div>
              <div className="text-[14px] font-bold">{c.cliente}</div>
              {c.ruc_dni ? <div className="text-[12px] text-[#4A5D6E]">{c.ruc_dni.length === 8 ? "DNI" : "RUC"} {c.ruc_dni}</div> : null}
              {c.direccion ? <div className="text-[12px] text-[#4A5D6E]">{c.direccion}</div> : null}
              {c.atencion || c.telefono || c.correo ? <div className="text-[12px] text-[#4A5D6E]">{[c.atencion && `Atención: ${c.atencion}`, c.telefono, c.correo].filter(Boolean).join(" · ")}</div> : null}
            </div>
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#7A8B99]">Sistema propuesto</div>
              <div className="whitespace-pre-wrap text-[14px] font-bold">{c.sistema ?? "Sin dato"}</div>
              {c.vendedor ? <div className="text-[12px] text-[#4A5D6E]">Asesor: {c.vendedor}</div> : null}
            </div>
          </div>
          <table className="w-full border-collapse text-[12.5px]">
            <thead><tr className="bg-[#0F7590] text-left text-white"><th className="px-2.5 py-2">#</th><th className="px-2.5 py-2">Descripción</th><th className="px-2.5 py-2 text-right">Cant.</th><th className="px-2.5 py-2 text-right">P. unit.</th><th className="px-2.5 py-2 text-right">Desc.</th><th className="px-2.5 py-2 text-right">Importe</th></tr></thead>
            <tbody>
              {c.items.map((i, n) => (
                <tr key={n} className={`border-b border-[#DCE4EA] align-top ${n % 2 ? "bg-[#F2F6F9]" : ""}`}>
                  <td className="px-2.5 py-2">{n + 1}</td>
                  <td className="px-2.5 py-2"><b>{i.descripcion}</b><div className="text-[11px] text-[#7A8B99]">{[i.codigo, i.unidad, i.detalle].filter(Boolean).join(" · ")}</div></td>
                  <td className="num px-2.5 py-2 text-right">{cant(i.cantidad)}</td>
                  <td className="num px-2.5 py-2 text-right">{dinero(i.precio_unitario).replace("S/ ", "")}</td>
                  <td className="num px-2.5 py-2 text-right">{Number(i.descuento_pct) ? `${cant(i.descuento_pct)}%` : "—"}</td>
                  <td className="num px-2.5 py-2 text-right font-bold">{dinero(i.importe ?? i.importe_bruto ?? null).replace("S/ ", "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-5 grid grid-cols-[1fr_250px] gap-6">
            <div className="text-[12px] text-[#4A5D6E]">
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#7A8B99]">Condiciones</div>
              {c.condiciones || e?.pie_pdf ? <div className="whitespace-pre-wrap">{c.condiciones || e?.pie_pdf}</div> : <div>Sin dato</div>}
              {c.validez_dias ? <div className="mt-1">Validez: {c.validez_dias} días. Precios en soles con IGV incluido.</div> : null}
              <div className="mt-1"><b className="text-[#0E2233]">Depósitos:</b> {[c.banco, c.moneda, c.nro_cuenta && `Cta. ${c.nro_cuenta}`, c.cci && `CCI ${c.cci}`].filter(Boolean).join(" · ") || e?.cuentas_bancarias || "Sin dato"}</div>
            </div>
            <div className="text-[12.5px]">
              {[["Subtotal (con IGV)", t.subtotal], ["Descuentos por ítem", t.descuento_lineas, true], ["Descuento comercial", t.descuento, true], ["Valor de venta", t.valor_venta], ["IGV 18%", t.igv]].map(([a, b, menos]) =>
                menos && (!b || b === "0.00") ? null : <div key={a as string} className="flex justify-between py-0.5"><span className="text-[#4A5D6E]">{a}</span><span className="num font-semibold">{menos ? `− ${dinero(b as string)}` : dinero(b as string | null)}</span></div>,
              )}
              <div className="mt-1.5 flex justify-between rounded-md bg-[#0E2233] px-3 py-2 text-white"><b>Total</b><b className="num">{dinero(t.total)}</b></div>
            </div>
          </div>
          <div className="mt-8 flex justify-between border-t border-[#DCE4EA] pt-2 text-[10.5px] text-[#7A8B99]"><span>{e?.razon_social ?? ""}</span><span>Vista previa · el PDF se genera en el servidor</span></div>
        </div>
      </div>
      <div className="text-[12px] text-text-3">
        Creada por {c.creado_por ?? "Sin dato"} · última modificación {fechaHora(c.actualizado_en)}{c.actualizado_por ? ` por ${c.actualizado_por}` : ""}
        {c.enviada_en ? ` · enviada ${fechaHora(c.enviada_en)}` : ""}{c.respondida_en ? ` · respondida ${fechaHora(c.respondida_en)}` : ""}
      </div>

      {rechazo !== null ? (
        <Modal titulo="Marcar como rechazada" icono="thumb_down" onCerrar={() => setRechazo(null)} pie={<><button className="btn-secundario" onClick={() => setRechazo(null)}>Cancelar</button><button className="btn-peligro" onClick={() => void cambiar("rechazada", rechazo)}>Marcar rechazada</button></>}>
          <label><span className="etiqueta">Motivo (opcional)</span><input className="campo" autoFocus placeholder="Ej. Eligió otra marca / precio alto" value={rechazo} onChange={(x) => setRechazo(x.target.value)} /></label>
        </Modal>
      ) : null}
      {wa ? <Whatsapp c={c} empresa={e} onCerrar={() => setWa(false)} onPdf={pdf} /> : null}
    </div>
  );
}
