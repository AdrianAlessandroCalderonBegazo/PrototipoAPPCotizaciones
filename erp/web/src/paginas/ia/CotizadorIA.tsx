// Cotizador IA (diseño ERP_ICR.zip › Cotizador IA): chat con historial compartido, contexto editable y consultas guardadas.
// La IA solo propone: «Abrir en Cotización» lleva la propuesta al editor y una persona la revisa, completa y guarda.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { dinero } from "../../dinero";
import { fecha, fechaHora } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { ContextoIa, ConvIa, MensajeIa, TarjetaIa } from "../../tipos";
import { AvisoSinIa, BurbujaError, BurbujaUsuario, ChipEstado, EntradaChat, Fuentes, Historial, InsigniaIa, Pensando, TextoIa, useChat, useEstadoIa } from "./comun";
import { FormGuiada, PreferidosGuiada } from "./Guiada";

const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);
const EJEMPLOS = ["Cotiza un sistema híbrido de 10 kW con baterías de litio para una bodega con consumo de 900 kWh/mes", "Sistema On-Grid de 25 kWp para un comercio, la opción más económica", "Kit de 5 kW Victron para un hostal con respaldo de 4 horas"];

function Tarjeta({ t, mensajeId, abrir, directa = false }: { t: TarjetaIa; mensajeId: number; abrir: boolean; directa?: boolean }) {
  const navegar = useNavigate();
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Icono n="request_quote" className="text-primary-ink" />
        <div className="min-w-0 flex-1"><div className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">{directa ? "Cotización guiada" : "Cotización propuesta"}</div><div className="truncate font-bold">{t.titulo}</div></div>
        <InsigniaIa directa={directa} />
      </div>
      <div className="divide-y divide-border">
        {t.items.map((i, n) => (
          <div key={n} className="flex items-center gap-3 px-4 py-2 text-[13px]">
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{i.descripcion}</div><div className="truncate text-[11.5px] text-text-3">{[i.codigo, i.origen, i.nota].filter(Boolean).join(" · ")}</div></div>
            <span className="num text-text-2">×{Number(i.cantidad).toLocaleString("es-PE")}</span>
            <span className={`num w-28 text-right font-bold ${i.importe === null ? "text-warning" : ""}`}>{i.importe === null ? "Sin dato" : dinero(i.importe)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-border bg-surface-2 px-4 py-3 text-[13px]">
        {t.totales ? (
          <>
            <div className="flex justify-between"><span className="text-text-2">Valor de venta</span><b className="num">{dinero(t.totales.valor_venta)}</b></div>
            <div className="flex justify-between"><span className="text-text-2">IGV 18%</span><b className="num">{dinero(t.totales.igv)}</b></div>
            <div className="mt-1 flex justify-between text-[15px]"><b>Total{t.faltan_precios ? " (ítems con precio)" : ""}</b><b className="num text-primary-ink">{dinero(t.totales.total)}</b></div>
          </>
        ) : <div className="text-text-2">Sin ítems con precio del catálogo.</div>}
        {t.notas?.length ? <div className="mt-2 text-[12px] text-text-3">{t.notas.join(" · ")}</div> : null}
        {t.faltan_precios ? <div className="mt-2 flex gap-1.5 text-[12.5px] text-warning"><Icono n="info" t={16} />{t.faltan_precios} ítem{t.faltan_precios === 1 ? "" : "s"} sin precio: una persona lo completa en Cotización (la IA no inventa precios).</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-[11.5px] font-bold text-text-2"><Icono n="inventory_2" t={14} />Catálogo · precios al {fecha(t.fecha_precios)}{t.tipo_cambio ? ` · TC ${t.tipo_cambio}` : ""}</span>
        <div className="flex-1" />
        {abrir ? <button className="btn-primario h-9" onClick={() => navegar(`/cotizacion/nueva?ia=${mensajeId}`)}>Abrir en Cotización<Icono n="arrow_forward" t={18} /></button> : null}
      </div>
    </div>
  );
}

function Mensajes({ mensajes, vivo, lento, abrir }: { mensajes: MensajeIa[]; vivo: ReturnType<typeof useChat>["vivo"]; lento: boolean; abrir: boolean }) {
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Solo se desplaza la caja del chat (no toda la página).
    const caja = fin.current?.closest(".overflow-y-auto");
    if (caja) caja.scrollTop = caja.scrollHeight;
  }, [mensajes.length, vivo?.texto, vivo?.consultando.length]);
  return (
    <div className="flex flex-col gap-4">
      {mensajes.map((m) =>
        m.rol === "usuario" ? <BurbujaUsuario key={m.id} texto={m.texto} porVoz={m.por_voz} autor={m.autor_nombre} cuando={fechaHora(m.creado_en)} />
          : m.rol === "error" ? <BurbujaError key={m.id} texto={`No se pudo generar la respuesta: ${m.texto}`} />
            : (
              <div key={m.id} className="flex max-w-[92%] flex-col gap-2">
                <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "var(--ai-soft)", color: "var(--ai)" }}><Icono n="auto_awesome" t={16} /></span><InsigniaIa directa={!!m.datos?.rapida} /><span className="text-[11px] text-text-3">{m.modelo ?? ""}{m.duracion_ms ? ` · ${(m.duracion_ms / 1000).toFixed(1)} s` : ""}</span></div>
                {m.texto ? <div className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-2.5"><TextoIa t={m.texto} /></div> : null}
                {m.datos?.tarjeta ? <Tarjeta t={m.datos.tarjeta} mensajeId={m.id} abrir={abrir} directa={!!m.datos?.guiada} /> : null}
                {m.datos?.fuentes?.length ? <Fuentes fuentes={m.datos.fuentes} /> : null}
              </div>
            ),
      )}
      {vivo ? (
        <>
          <BurbujaUsuario texto={vivo.pregunta} porVoz={vivo.porVoz} />
          <div className="flex max-w-[92%] flex-col gap-2">
            {vivo.texto ? <div className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-2.5"><TextoIa t={vivo.texto} /></div> : null}
            <Pensando consultando={vivo.consultando} lento={lento} />
          </div>
        </>
      ) : null}
      <div ref={fin} />
    </div>
  );
}

function PanelContexto({ editar }: { editar: boolean }) {
  const avisar = useAvisos();
  const [c, setC] = useState<ContextoIa | null>(null);
  const [reglas, setReglas] = useState("");
  const [notas, setNotas] = useState("");
  useEffect(() => {
    api<ContextoIa>("GET", "/ia/contexto").then((x) => { setC(x); setReglas(x.reglas ?? ""); setNotas(x.notas ?? ""); }).catch(() => null);
  }, []);
  if (!c) return null;
  const cambiado = reglas !== (c.reglas ?? "") || notas !== (c.notas ?? "");
  const guardar = async () => {
    try {
      const r = await api<ContextoIa>("PUT", "/ia/contexto", { cuerpo: { reglas, notas } });
      setC({ ...c, ...r });
      avisar("Contexto guardado", "La IA lo usará desde la próxima consulta.");
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div><div className="titulo-seccion">Contexto de la IA</div><div className="text-[12px] text-text-3">Lo que el modelo considera al cotizar</div></div>
      <div className="flex items-center gap-2.5 rounded-xl border border-border p-2.5 text-[12.5px]"><Icono n="inventory_2" className="text-primary-ink" /><div className="flex-1"><b>Catálogo</b><div className="text-text-3">{c.catalogo.total} productos · {c.catalogo.indexados} en el índice</div></div>{c.catalogo.indexados >= c.catalogo.total && c.catalogo.total ? <Icono n="check_circle" className="text-success" relleno /> : null}</div>
      <div className="flex items-center gap-2.5 rounded-xl border border-border p-2.5 text-[12.5px]"><Icono n="payments" className="text-primary-ink" /><div className="flex-1"><b>Precios base</b><div className="text-text-3">IGV {c.igv_pct}% incluido · TC {c.tipo_cambio.valor ?? "Sin dato"}</div></div></div>
      <label><span className="etiqueta">Reglas de cotización</span><textarea className="campo h-auto py-2 text-[13px]" rows={6} disabled={!editar} value={reglas} onChange={(e) => setReglas(e.target.value)} placeholder="Ej. Incluir siempre instalación. Para híbridos usar litio salvo que el cliente pida AGM. Validez 15 días." /></label>
      <label><span className="etiqueta">Notas</span><textarea className="campo h-auto py-2 text-[13px]" rows={4} disabled={!editar} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Qué marcas priorizar, qué hay en stock en Arequipa." /></label>
      {editar ? <button className="btn-primario" disabled={!cambiado} onClick={() => void guardar()}><Icono n="save" t={18} />Guardar</button> : null}
    </div>
  );
}

function ConsultasGuardadas({ lista, editar, recargar }: { lista: ConvIa[]; editar: boolean; recargar: () => void }) {
  const avisar = useAvisos();
  const [sel, setSel] = useState<number[]>([]);
  const [confirmar, setConfirmar] = useState(false);
  const borrar = async () => {
    try {
      const r = await api<{ eliminadas: number }>("POST", "/ia/cotizador/conversaciones/eliminar", { cuerpo: { ids: sel } });
      avisar(`${r.eliminadas} consulta${r.eliminadas === 1 ? "" : "s"} eliminada${r.eliminadas === 1 ? "" : "s"}`, "Quedó registrado en la auditoría.");
      setSel([]);
      setConfirmar(false);
      recargar();
    } catch (x) {
      avisar("No se pudo eliminar", msg(x), "error");
    }
  };
  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5">
        <div className="titulo-seccion flex-1">Consultas guardadas <span className="font-medium text-text-3">· {lista.length}</span></div>
        {editar ? <button className="btn-secundario text-danger" disabled={!sel.length} onClick={() => setConfirmar(true)}><Icono n="delete" t={18} />Eliminar seleccionadas ({sel.length})</button> : null}
      </div>
      {lista.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
            <thead><tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3">{editar ? <th className="w-10 px-4 py-2"><input type="checkbox" checked={sel.length === lista.length} onChange={(e) => setSel(e.target.checked ? lista.map((c) => c.id) : [])} /></th> : null}<th className="px-4 py-2">Consulta</th><th className="px-3 py-2">Autor</th><th className="px-3 py-2">Fecha</th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  {editar ? <td className="px-4 py-2.5"><input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} /></td> : null}
                  <td className="px-4 py-2.5"><div className="font-semibold">{c.titulo}</div><div className="text-[12px] text-text-3">{c.n_mensajes} mensajes</div></td>
                  <td className="px-3 py-2.5">{c.autor_nombre ?? "Sin dato"}</td>
                  <td className="num px-3 py-2.5">{fechaHora(c.actualizado_en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="p-6 text-center text-[13px] text-text-3">No quedan consultas guardadas.</div>}
      {confirmar ? (
        <Modal titulo="Eliminar consultas" icono="delete" onCerrar={() => setConfirmar(false)} pie={<><button className="btn-secundario" onClick={() => setConfirmar(false)}>Cancelar</button><button className="btn-peligro" onClick={() => void borrar()}>Eliminar {sel.length}</button></>}>
          <p className="text-[13.5px] text-text-2">Se quitarán {sel.length} consulta{sel.length === 1 ? "" : "s"} del historial compartido para todos. Queda registrado en la auditoría.</p>
        </Modal>
      ) : null}
    </section>
  );
}

type ClaveCtx = "usar_catalogo" | "usar_precios" | "usar_reglas" | "usar_notas";

function GestionarContexto() {
  const avisar = useAvisos();
  const [c, setC] = useState<ContextoIa | null>(null);
  const [indexando, setIndexando] = useState(false);
  const cargar = () => api<ContextoIa>("GET", "/ia/contexto").then(setC).catch(() => null);
  useEffect(() => void cargar(), []);
  if (!c) return null;
  const cambiar = async (k: ClaveCtx, v: boolean) => {
    try {
      const r = await api<ContextoIa>("PUT", "/ia/contexto", { cuerpo: { [k]: v } });
      setC({ ...c, ...r });
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    }
  };
  const reindexar = async () => {
    setIndexando(true);
    try {
      const r = await api<{ total: number; indexados: number; nuevos: number; disponible: boolean }>("POST", "/ia/reindexar");
      avisar(r.disponible ? "Índice actualizado" : "La IA no está instalada", r.disponible ? `${r.indexados} de ${r.total} productos · ${r.nuevos} recalculados` : undefined, r.disponible ? "exito" : "error");
      void cargar();
    } catch (x) {
      avisar("No se pudo actualizar el índice", msg(x), "error");
    } finally {
      setIndexando(false);
    }
  };
  const bloques: [ClaveCtx, string, string, string][] = [
    ["usar_catalogo", "inventory_2", "Catálogo", `${c.catalogo.total} productos · ${c.catalogo.indexados} en el índice de búsqueda${c.catalogo.actualizado_en ? ` · ${fechaHora(c.catalogo.actualizado_en)}` : ""}`],
    ["usar_precios", "payments", "Precios base", `IGV ${c.igv_pct}% incluido en el catálogo · TC ${c.tipo_cambio.valor ?? "Sin dato"}`],
    ["usar_reglas", "rule", "Reglas de cotización", c.reglas ? `${c.reglas.slice(0, 90)}${c.reglas.length > 90 ? "…" : ""}` : "Sin reglas escritas"],
    ["usar_notas", "sticky_note_2", "Notas", c.notas ? `${c.notas.slice(0, 90)}${c.notas.length > 90 ? "…" : ""}` : "Sin notas"],
  ];
  return (
    <section className="tarjeta flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2"><div className="titulo-seccion flex-1">Gestionar contexto</div><button className="btn-secundario" disabled={indexando} onClick={() => void reindexar()}><Icono n="sync" t={18} />{indexando ? "Actualizando…" : "Actualizar índice del catálogo"}</button></div>
      {bloques.map(([k, i, l, d]) => (
        <label key={k} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary-ink"><Icono n={i} t={20} /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{l}</span><span className="block truncate text-[12.5px] text-text-3">{d}</span></span>
          <input type="checkbox" className="h-5 w-5" checked={c[k]} onChange={(e) => void cambiar(k, e.target.checked)} />
        </label>
      ))}
      <p className="text-[12.5px] text-text-3">Los bloques desactivados no se envían al modelo. Las reglas y notas se editan en el panel lateral del chat.</p>
    </section>
  );
}

export function CotizadorIA() {
  const { usuario } = useSesion();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "chat";
  const editar = puede(usuario, "cotizador_ia", "completo");
  const abrir = puede(usuario, "cotizacion", "completo");
  const ia = useEstadoIa();
  const [lista, setLista] = useState<ConvIa[]>([]);
  const cargarLista = () => api<ConvIa[]>("GET", "/ia/cotizador/conversaciones").then(setLista).catch(() => null);
  useEffect(() => void cargarLista(), []);
  const chat = useChat("cotizador", () => void cargarLista());
  const sinIa = ia.estado && !ia.estado.disponible;
  const [guiada, setGuiada] = useState(false);
  const abrirGuiada = (id: number) => {
    setGuiada(false);
    void chat.cargar(id);
    void cargarLista();
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="sobretitulo">Comercial</div><h1 className="mt-1 flex items-center gap-2 text-[28px] font-extrabold tracking-tight"><Icono n="auto_awesome" t={28} className="text-[color:var(--ai)]" />Cotizador IA</h1></div>
        <ChipEstado estado={ia.estado} lento={chat.lento} />
      </div>
      <div className="flex gap-1.5">
        {([["chat", "Chat", "forum"], ["consultas", "Consultas guardadas", "history"], ["contexto", "Contexto", "tune"]] as const).map(([k, l, i]) => (
          <button key={k} onClick={() => setParams(k === "chat" ? {} : { tab: k })} className={`btn h-10 px-4 ${tab === k ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}><Icono n={i} t={18} />{l}</button>
        ))}
      </div>
      {tab === "consultas" ? <ConsultasGuardadas lista={lista} editar={editar} recargar={() => void cargarLista()} /> : tab === "contexto" ? <div className="flex flex-col gap-4"><PreferidosGuiada editar={editar} /><GestionarContexto /></div> : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
          <aside className="tarjeta flex max-h-[calc(100vh-220px)] flex-col gap-3 p-3">
            <button className="btn-primario" onClick={chat.nueva}><Icono n="add" t={18} />Nueva consulta</button>
            {editar ? <button className="btn-secundario" onClick={() => setGuiada(true)}><Icono n="bolt" t={18} />Cotización guiada</button> : null}
            <div className="px-1 text-[11.5px] font-bold uppercase tracking-wide text-text-3">Historial compartido</div>
            <Historial lista={lista} activa={chat.conv?.id ?? null} onElegir={(id) => void chat.cargar(id)} autores />
          </aside>
          <section className="tarjeta flex h-[calc(100vh-230px)] min-h-[520px] flex-col">
            <div className="border-b border-border px-5 py-3">
              <div className="truncate font-bold">{chat.conv?.titulo ?? "Nueva consulta"}</div>
              <div className="text-[12px] text-text-3">{chat.conv ? `${chat.conv.autor_nombre ?? "Sin dato"} · ${fechaHora(chat.conv.creado_en)} · visible para todos los que usan el Cotizador IA` : "Describe el sistema que necesita el cliente. La IA busca en el catálogo y propone; tú revisas y guardas."}</div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {sinIa ? <div className="mb-4"><AvisoSinIa estado={ia.estado!} revisando={ia.revisando} revisar={() => void ia.revisar()} /></div> : null}
              {!chat.conv && !chat.vivo ? (
                <div className="flex flex-col gap-4">
                  {editar ? (
                    <div className="rounded-2xl border border-border p-4">
                      <div className="mb-3 flex items-center gap-2"><Icono n="bolt" className="text-success" /><div className="font-bold">Cotización guiada</div><span className="text-[12px] text-text-3">· al instante, sin IA</span></div>
                      <FormGuiada onListo={abrirGuiada} />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    <div className="text-[13px] font-semibold text-text-2">O pídelo en palabras (si el pedido es claro también se calcula al instante; lo demás lo responde la IA):</div>
                    {EJEMPLOS.map((e) => <button key={e} disabled={!editar} onClick={() => void chat.enviar(e)} className="rounded-xl border border-border px-3 py-2 text-left text-[13px] hover:border-primary-line disabled:opacity-50">{e}</button>)}
                  </div>
                </div>
              ) : <Mensajes mensajes={chat.conv?.mensajes ?? []} vivo={chat.vivo} lento={chat.lento} abrir={abrir} />}
            </div>
            <div className="border-t border-border p-3">
              {editar ? <EntradaChat deshabilitado={false} ocupado={!!chat.vivo} placeholder="Ej. Cotiza un On-Grid de 20 kWp con Huawei para un colegio…" onEnviar={(t, v) => void chat.enviar(t, v)} /> : <div className="text-center text-[12.5px] text-text-3">Tu rol puede ver el historial, pero no hacer consultas.</div>}
              <div className="mt-2 text-center text-[11.5px] text-text-3">La IA usa solo productos y precios del catálogo. Revisa la propuesta antes de enviarla al cliente.</div>
            </div>
          </section>
          <aside className="tarjeta hidden max-h-[calc(100vh-230px)] overflow-y-auto p-4 xl:block"><PanelContexto editar={editar} /></aside>
        </div>
      )}
      {guiada ? <Modal titulo="Cotización guiada" icono="bolt" ancho={620} onCerrar={() => setGuiada(false)}><FormGuiada onListo={abrirGuiada} compacto /></Modal> : null}
    </div>
  );
}
