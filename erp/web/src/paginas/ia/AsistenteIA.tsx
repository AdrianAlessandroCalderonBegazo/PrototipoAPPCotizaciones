// Asistente IA (diseño ERP_ICR.zip › Asistente IA): consultas e informes sobre el ERP. Solo lee datos y respeta los permisos
// de quien pregunta. Las cifras, tablas y gráficos los arma el servidor; el modelo solo los resume.
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Icono } from "../../componentes/Icono";
import { fechaHora } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { BloqueIa, ConvIa, MensajeIa } from "../../tipos";
import { AvisoSinIa, Bloques, BurbujaError, BurbujaUsuario, ChipEstado, EntradaChat, Fuentes, Historial, InsigniaIa, Pensando, TextoIa, useChat, useEstadoIa } from "./comun";

// Se responden con una consulta fija, sin IA (servidor/api/src/ia/rapidas.js › FRECUENTES): al instante.
const FRECUENTES: [string, string, string][] = [
  ["account_balance", "Resumen de finanzas del mes", "Resumen de ingresos y egresos de este mes"],
  ["solar_power", "Cómo van los proyectos activos", "¿Cómo van los proyectos activos y su presupuesto?"],
  ["verified", "Ventas facturadas del mes", "Facturas y boletas emitidas este mes"],
  ["savings", "Caja chica este mes", "¿Cuánto se gastó de caja chica este mes?"],
  ["request_quote", "Cotizaciones enviadas", "¿Qué cotizaciones están enviadas y sin respuesta?"],
  ["inventory", "Stock bajo en almacén", "¿Qué artículos del almacén están con stock bajo?"],
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function bloquesHtml(bs: BloqueIa[]) {
  return bs.map((b) => {
    if (b.tipo === "kpis") return `<div class="kpis">${b.items.map((k) => `<div><small>${esc(k.l)}</small><b>${esc(k.v)}</b></div>`).join("")}</div>`;
    if (b.tipo === "grafico") return `<h4>${esc(b.titulo)}</h4><table>${b.barras.map((x) => `<tr><td>${esc(x.l)}</td><td class="r">${esc(x.texto)}</td></tr>`).join("")}</table>`;
    return `<h4>${esc(b.titulo)}</h4><table><tr>${b.columnas.map((c) => `<th class="${c.a === "right" ? "r" : ""}">${esc(c.l)}</th>`).join("")}</tr>${b.filas.map((f) => `<tr>${f.map((v, j) => `<td class="${b.columnas[j]?.a === "right" ? "r" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</table>`;
  }).join("");
}
/** Abre el informe en una ventana para imprimir o «Guardar como PDF». */
function exportarPdf(titulo: string, mensajes: MensajeIa[], autor: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  const cuerpo = mensajes.map((m) =>
    m.rol === "usuario" ? `<p class="q">${esc(m.texto)}</p>`
      : m.rol === "ia" ? `<div class="a"><p>${esc(m.texto).replace(/\n/g, "<br>")}</p>${bloquesHtml(m.datos?.bloques ?? [])}<p class="f">Fuentes: ${esc((m.datos?.fuentes ?? []).join(", "))}</p></div>` : "",
  ).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    body{font-family:Manrope,Arial,sans-serif;color:#0e2233;margin:32px;font-size:13px} h1{font-size:20px;margin:0} .m{color:#6b7f90;margin:4px 0 20px}
    .q{background:#e8f3f6;border-radius:10px;padding:8px 12px;font-weight:700} .a{margin:8px 0 20px} .f{color:#6b7f90;font-size:11px}
    .kpis{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0} .kpis div{border:1px solid #d6e0e8;border-radius:8px;padding:6px 10px} .kpis small{display:block;color:#6b7f90}
    table{border-collapse:collapse;width:100%;margin:6px 0 12px} th,td{border-bottom:1px solid #e3eaef;padding:4px 6px;text-align:left} .r{text-align:right} h4{margin:10px 0 2px}
  </style></head><body><h1>${esc(titulo)}</h1><div class="m">Informe del Asistente IA · ${esc(autor)} · ${esc(new Date().toLocaleString("es-PE", { timeZone: "America/Lima" }))} · Las cifras salen del ERP; el texto lo generó la IA: verifícalo antes de compartir.</div>${cuerpo}</body></html>`);
  w.document.close();
  w.focus();
  window.setTimeout(() => w.print(), 300);
}

function Respuesta({ m, onPdf }: { m: MensajeIa; onPdf: () => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "var(--ai-soft)", color: "var(--ai)" }}><Icono n="psychology" t={17} /></span><InsigniaIa directa={!!m.datos?.rapida} /><span className="text-[11px] text-text-3">{m.modelo ?? ""}{m.duracion_ms ? ` · ${(m.duracion_ms / 1000).toFixed(1)} s` : ""}</span></div>
      {m.texto ? <div className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-2.5"><TextoIa t={m.texto} /></div> : null}
      {m.datos?.bloques?.length ? <Bloques bloques={m.datos.bloques} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Fuentes fuentes={m.datos?.fuentes ?? []} />
        <div className="flex-1" />
        <button className="btn-secundario h-8 text-[12px]" onClick={onPdf}><Icono n="picture_as_pdf" t={16} />PDF</button>
      </div>
    </div>
  );
}

export function AsistenteIA() {
  const { usuario } = useSesion();
  const editar = puede(usuario, "asistente_ia", "completo");
  const ia = useEstadoIa();
  const [lista, setLista] = useState<ConvIa[]>([]);
  const cargarLista = () => api<ConvIa[]>("GET", "/ia/asistente/conversaciones").then(setLista).catch(() => null);
  useEffect(() => void cargarLista(), []);
  const chat = useChat("asistente", () => void cargarLista());
  const sinIa = ia.estado && !ia.estado.disponible;
  const fin = useRef<HTMLDivElement>(null);
  const mensajes = chat.conv?.mensajes ?? [];
  useEffect(() => {
    const caja = fin.current?.closest(".overflow-y-auto");
    if (caja) caja.scrollTop = caja.scrollHeight;
  }, [mensajes.length, chat.vivo?.texto, chat.vivo?.consultando.length]);
  const ultimaPregunta = (i: number) => [...mensajes.slice(0, i)].reverse().find((x) => x.rol === "usuario")?.texto;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="sobretitulo">Inteligencia</div><h1 className="mt-1 flex items-center gap-2 text-[28px] font-extrabold tracking-tight"><Icono n="psychology" t={30} className="text-[color:var(--ai)]" />Asistente IA</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <ChipEstado estado={ia.estado} lento={chat.lento} />
          <button className="btn-secundario" disabled={!chat.conv?.mensajes.length} onClick={() => chat.conv && exportarPdf(chat.conv.titulo, chat.conv.mensajes, usuario?.nombre ?? "")}><Icono n="picture_as_pdf" t={18} />Exportar informe PDF</button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="tarjeta flex max-h-[calc(100vh-200px)] flex-col gap-3 p-3">
          <button className="btn-primario" onClick={chat.nueva}><Icono n="add" t={18} />Nueva conversación</button>
          <div className="px-1 text-[11.5px] font-bold uppercase tracking-wide text-text-3">Consultas frecuentes <span className="font-medium normal-case">· al instante</span></div>
          <div className="flex flex-col gap-1">
            {FRECUENTES.map(([i, l, q]) => (
              <button key={l} disabled={!editar || !!chat.vivo} onClick={() => { chat.nueva(); void chat.enviar(q); }} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold text-text-2 hover:bg-surface-2 disabled:opacity-50">
                <Icono n={i} t={18} className="text-primary-ink" />{l}
              </button>
            ))}
          </div>
          <div className="px-1 text-[11.5px] font-bold uppercase tracking-wide text-text-3">Historial (solo tuyo)</div>
          <Historial lista={lista} activa={chat.conv?.id ?? null} onElegir={(id) => void chat.cargar(id)} autores={false} />
        </aside>
        <section className="tarjeta flex h-[calc(100vh-200px)] min-h-[520px] flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {sinIa ? <div className="mb-4"><AvisoSinIa estado={ia.estado!} revisando={ia.revisando} revisar={() => void ia.revisar()} /></div> : null}
            {!chat.conv && !chat.vivo ? (
              <div className="grid h-full place-items-center py-10 text-center">
                <div className="max-w-md">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "var(--ai-soft)", color: "var(--ai)" }}><Icono n="psychology" t={30} /></span>
                  <div className="mt-3 text-[17px] font-extrabold">Pregunta sobre el ERP</div>
                  <p className="mt-1 text-[13.5px] text-text-2">Finanzas, proyectos, caja chica, cotizaciones, facturas y almacén: el asistente consulta los datos que tu rol puede ver y te responde con tablas y gráficos.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {mensajes.map((m, i) =>
                  m.rol === "usuario" ? <BurbujaUsuario key={m.id} texto={m.texto} porVoz={m.por_voz} cuando={fechaHora(m.creado_en)} />
                    : m.rol === "error" ? <BurbujaError key={m.id} texto={m.texto} onReintentar={editar && !chat.vivo && ultimaPregunta(i) ? () => void chat.enviar(ultimaPregunta(i)!) : undefined} />
                      : <Respuesta key={m.id} m={m} onPdf={() => exportarPdf(ultimaPregunta(i) ?? "Informe", [mensajes[i - 1], m].filter(Boolean), usuario?.nombre ?? "")} />,
                )}
                {chat.vivo ? (
                  <>
                    <BurbujaUsuario texto={chat.vivo.pregunta} porVoz={chat.vivo.porVoz} />
                    <div className="flex flex-col gap-2">
                      {chat.vivo.texto ? <div className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-2.5"><TextoIa t={chat.vivo.texto} /></div> : null}
                      <Pensando consultando={chat.vivo.consultando} lento={chat.lento} />
                    </div>
                  </>
                ) : null}
                <div ref={fin} />
              </div>
            )}
          </div>
          <div className="border-t border-border p-3">
            {editar ? <EntradaChat deshabilitado={false} ocupado={!!chat.vivo} placeholder="Ej. ¿Cuánto gastamos en el proyecto Hostal Los Tambos este mes?" onEnviar={(t, v) => void chat.enviar(t, v)} /> : <div className="text-center text-[12.5px] text-text-3">Tu rol puede ver su historial, pero no hacer consultas.</div>}
            <div className="mt-2 text-center text-[11.5px] text-text-3">El asistente solo lee datos; no modifica registros. Verifica las cifras antes de compartir un informe.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
