// Piezas compartidas del Cotizador IA y del Asistente IA (diseño ERP_ICR.zip: insignia «Generado por IA», estados del servidor, voz).
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import { Icono } from "../../componentes/Icono";
import { fechaHora } from "../../formato";
import type { BloqueIa, ConvIa, EstadoIa, MensajeIa, ModuloIa } from "../../tipos";
import { preguntarIa } from "./stream";

// ---------------------------------------------------------------------------------------------
// Estado del servidor de IA
// ---------------------------------------------------------------------------------------------

export function useEstadoIa() {
  const [estado, setEstado] = useState<EstadoIa | null>(null);
  const [revisando, setRevisando] = useState(false);
  const revisar = useCallback(async () => {
    setRevisando(true);
    try {
      setEstado(await api<EstadoIa>("GET", "/ia/estado"));
    } catch {
      setEstado(null);
    } finally {
      setRevisando(false);
    }
  }, []);
  useEffect(() => {
    void revisar();
  }, [revisar]);
  return { estado, revisando, revisar };
}

export function ChipEstado({ estado, lento }: { estado: EstadoIa | null; lento: boolean }) {
  const [bg, fg, l] = !estado
    ? ["var(--neutral-soft)", "var(--neutral)", "Comprobando…"]
    : !estado.disponible
      ? ["var(--neutral-soft)", "var(--neutral)", estado.motivo === "no_instalada" ? "IA no instalada" : "Modelo no disponible"]
      : lento
        ? ["var(--warning-soft)", "var(--warning)", `Lento · ${estado.modelo}`]
        : ["var(--success-soft)", "var(--success)", `En línea · ${estado.modelo}`];
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] font-bold" style={{ background: bg, color: fg }}>
      <span className="h-2 w-2 rounded-full" style={{ background: fg }} />{l}
    </span>
  );
}

export function AvisoSinIa({ estado, revisando, revisar }: { estado: EstadoIa; revisando: boolean; revisar: () => void }) {
  const texto =
    estado.motivo === "no_instalada" ? "La IA todavía no está instalada en el servidor (ver DESPLIEGUE.md › IA)." : estado.motivo === "falta_modelo" ? `Ollama responde, pero falta descargar el modelo ${estado.modelo}.` : "El servidor de IA está apagado o no responde.";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-[13px]">
      <Icono n="power_off" className="text-text-3" />
      <div className="min-w-0 flex-1"><b>Modelo no disponible.</b> {texto} Puedes revisar el historial; las consultas nuevas se habilitan cuando vuelva.</div>
      <button className="btn-secundario h-9" disabled={revisando} onClick={revisar}><Icono n="refresh" t={18} />{revisando ? "Comprobando…" : "Comprobar de nuevo"}</button>
    </div>
  );
}

export const InsigniaIa = () => (
  <span className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11.5px] font-bold" style={{ background: "var(--ai-soft)", color: "var(--ai)", borderColor: "var(--ai-line)" }}>
    <Icono n="auto_awesome" t={14} />Generado por IA
  </span>
);

const ICONO_FUENTE: Record<string, string> = { Catálogo: "inventory_2", Kits: "inventory", Contabilidad: "account_balance", Proyectos: "solar_power", "Caja chica": "savings", "Caja diaria": "point_of_sale", Cotización: "request_quote", "Facturación SUNAT": "verified", Logística: "local_shipping", "Generado por IA": "auto_awesome" };
export function Fuentes({ fuentes }: { fuentes: string[] }) {
  if (!fuentes.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-3">
      Fuentes:
      {fuentes.map((f) => {
        const ia = f === "Generado por IA";
        return (
          <span key={f} className="inline-flex h-6 items-center gap-1 rounded-md border px-2 font-bold" style={ia ? { background: "var(--ai-soft)", color: "var(--ai)", borderColor: "var(--ai-line)" } : { background: "var(--surface-2)", color: "var(--text-2)", borderColor: "var(--border)" }}>
            <Icono n={ICONO_FUENTE[f] ?? "database"} t={14} />{f}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Texto con **negritas** y listas (sin HTML del modelo)
// ---------------------------------------------------------------------------------------------

function enLinea(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}
export function TextoIa({ t }: { t: string }) {
  const lineas = t.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let lista: string[] = [];
  const cerrar = () => {
    if (lista.length) out.push(<ul key={`l${out.length}`} className="my-1 list-disc pl-5">{lista.map((x, i) => <li key={i}>{enLinea(x)}</li>)}</ul>);
    lista = [];
  };
  for (const l of lineas) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
    if (m) lista.push(m[1]);
    else {
      cerrar();
      if (l.trim()) out.push(<p key={`p${out.length}`} className="my-1">{enLinea(l.replace(/^#+\s*/, ""))}</p>);
    }
  }
  cerrar();
  return <div className="text-[14px] leading-relaxed">{out}</div>;
}

// ---------------------------------------------------------------------------------------------
// Bloques del Asistente (los arma el servidor con datos reales)
// ---------------------------------------------------------------------------------------------

export function Bloques({ bloques }: { bloques: BloqueIa[] }) {
  return (
    <div className="flex flex-col gap-3">
      {bloques.map((b, n) => {
        if (b.tipo === "kpis")
          return (
            <div key={n} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {b.items.map((k) => (
                <div key={k.l} className="rounded-xl border border-border bg-surface p-3">
                  <div className="text-[11.5px] font-semibold text-text-3">{k.l}</div>
                  <div className="num mt-0.5 text-[16px] font-extrabold" style={{ color: k.c === "primario" ? "var(--primary-ink)" : k.c === "peligro" ? "var(--danger)" : undefined }}>{k.v}</div>
                </div>
              ))}
            </div>
          );
        if (b.tipo === "grafico") {
          const max = Math.max(1, ...b.barras.map((x) => x.v));
          return (
            <div key={n} className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 text-[12.5px] font-bold">{b.titulo}</div>
              <div className="flex h-36 items-end gap-2">
                {b.barras.map((x, i) => (
                  <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${x.l}: ${x.texto}`}>
                    <span className="num truncate text-[10.5px] text-text-3">{x.v >= 1000 ? `${(x.v / 1000).toFixed(1)}k` : x.v.toFixed(0)}</span>
                    <div className="w-full max-w-[42px] rounded-t-md" style={{ height: `${Math.max(2, (x.v / max) * 72)}%`, background: x.v === max ? "var(--ai)" : "var(--primary)" }} />
                    <span className="w-full truncate text-center text-[10.5px] text-text-2">{x.l}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div key={n} className="overflow-x-auto rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-3 py-2 text-[12.5px] font-bold">{b.titulo}</div>
            <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
              <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-3">{b.columnas.map((c) => <th key={c.l} className={`px-3 py-1.5 ${c.a === "right" ? "text-right" : ""}`}>{c.l}</th>)}</tr></thead>
              <tbody>
                {b.filas.map((f, i) => (
                  <tr key={i} className="border-t border-border" style={b.destacar === i ? { background: "var(--success-soft)" } : undefined}>
                    {f.map((v, j) => <td key={j} className={`px-3 py-1.5 ${b.columnas[j]?.a === "right" ? "num text-right" : ""} ${j === 0 || b.destacar === i ? "font-semibold" : ""}`}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Voz (Web Speech API del navegador: Chrome y Edge). La transcripción se puede corregir antes de enviar.
// ---------------------------------------------------------------------------------------------

type Reconocedor = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const Reconocimiento = (): (new () => Reconocedor) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function useVoz(alTexto: (t: string) => void) {
  const [estado, setEstado] = useState<"quieto" | "grabando" | "listo" | "error">("quieto");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Reconocedor | null>(null);
  const soportado = !!Reconocimiento();
  useEffect(() => {
    if (estado !== "grabando") return;
    setSegundos(0);
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [estado]);
  const iniciar = (base: string) => {
    const R = Reconocimiento();
    if (!R) return;
    const r = new R();
    r.lang = "es-PE";
    r.continuous = true;
    r.interimResults = true;
    let finales = "";
    r.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) finales += `${x[0].transcript} `;
        else parcial += x[0].transcript;
      }
      alTexto(`${base}${base && !base.endsWith(" ") ? " " : ""}${finales}${parcial}`.trimStart());
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "El navegador no tiene permiso para usar el micrófono." : "No se pudo usar el micrófono.");
      setEstado("error");
    };
    r.onend = () => setEstado((s) => (s === "grabando" ? "listo" : s));
    rec.current = r;
    setError(null);
    setEstado("grabando");
    r.start();
  };
  const detener = () => rec.current?.stop();
  const reiniciar = () => setEstado("quieto");
  return { soportado, estado, segundos, error, iniciar, detener, reiniciar };
}

// ---------------------------------------------------------------------------------------------
// Chat: conversación, envío y respuesta en vivo
// ---------------------------------------------------------------------------------------------

export type EnVivo = { pregunta: string; texto: string; consultando: string[]; porVoz: boolean };

export function useChat(modulo: ModuloIa, alCambiarLista: () => void) {
  const [conv, setConv] = useState<(ConvIa & { mensajes: MensajeIa[] }) | null>(null);
  const [vivo, setVivo] = useState<EnVivo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [lento, setLento] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const cargar = useCallback(async (id: number) => {
    setCargando(true);
    try {
      setConv(await api<ConvIa & { mensajes: MensajeIa[] }>("GET", `/ia/${modulo}/conversaciones/${id}`));
    } finally {
      setCargando(false);
    }
  }, [modulo]);
  const nueva = () => {
    ctl.current?.abort();
    setConv(null);
    setVivo(null);
  };
  const enviar = async (texto: string, porVoz = false) => {
    const t = texto.trim();
    if (!t || vivo) return;
    const c = new AbortController();
    ctl.current = c;
    setVivo({ pregunta: t, texto: "", consultando: [], porVoz });
    setLento(false);
    const reloj = window.setTimeout(() => setLento(true), 12_000);
    let idConv = conv?.id ?? null;
    await preguntarIa(modulo, { conversacion_id: conv?.id ?? null, texto: t, por_voz: porVoz }, (e) => {
      if (e.tipo === "conversacion") idConv = e.id;
      if (e.tipo === "texto") {
        window.clearTimeout(reloj);
        setVivo((v) => (v ? { ...v, texto: v.texto + e.t } : v));
      }
      if (e.tipo === "herramienta" && e.fuente) setVivo((v) => (v && !v.consultando.includes(e.fuente!) ? { ...v, consultando: [...v.consultando, e.fuente!] } : v));
    }, c.signal);
    window.clearTimeout(reloj);
    setLento(false);
    if (idConv) await cargar(idConv).catch(() => null);
    setVivo(null);
    alCambiarLista();
  };
  return { conv, vivo, cargando, lento, cargar, nueva, enviar };
}

/** Caja de texto con micrófono y botón de enviar (Enter envía, Mayús+Enter salta de línea). */
export function EntradaChat({ deshabilitado, ocupado, placeholder, onEnviar }: { deshabilitado: boolean; ocupado: boolean; placeholder: string; onEnviar: (t: string, porVoz: boolean) => void }) {
  const [t, setT] = useState("");
  const voz = useVoz(setT);
  const mandar = () => {
    if (!t.trim() || ocupado || deshabilitado) return;
    onEnviar(t, voz.estado === "listo");
    setT("");
    voz.reiniciar();
  };
  return (
    <div className="flex flex-col gap-2">
      {voz.estado === "grabando" ? (
        <div className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" />Grabando · {Math.floor(voz.segundos / 60)}:{String(voz.segundos % 60).padStart(2, "0")}
          <button className="btn-secundario ml-auto h-8" onClick={voz.detener}>Detener</button>
        </div>
      ) : voz.estado === "listo" ? (
        <div className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-[12.5px] text-primary-ink"><Icono n="edit_note" t={18} />Transcripción lista. Revísala y corrige antes de enviar.</div>
      ) : voz.error ? <div className="rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{voz.error}</div> : null}
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 focus-within:border-primary-line">
        <textarea
          rows={2}
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] outline-none placeholder:text-text-3"
          placeholder={deshabilitado ? "La IA no está disponible ahora." : placeholder}
          disabled={deshabilitado}
          value={t}
          onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              mandar();
            }
          }}
        />
        {voz.soportado ? (
          <button title={voz.estado === "grabando" ? "Detener" : "Dictar por voz"} disabled={deshabilitado} onClick={() => (voz.estado === "grabando" ? voz.detener() : voz.iniciar(t))}
            className={`grid h-10 w-10 place-items-center rounded-xl border ${voz.estado === "grabando" ? "border-danger text-danger" : "border-border text-text-2 hover:bg-surface-2"}`}>
            <Icono n={voz.estado === "grabando" ? "stop" : "mic"} t={20} />
          </button>
        ) : null}
        <button title="Enviar" disabled={deshabilitado || ocupado || !t.trim()} onClick={mandar} className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white disabled:opacity-40">
          <Icono n="arrow_upward" t={20} />
        </button>
      </div>
    </div>
  );
}

export function Pensando({ consultando, lento }: { consultando: string[]; lento: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--ai)" }}>
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Pensando…{consultando.length ? ` consultando ${consultando.join(", ")}` : ""}
      </div>
      {lento ? <div className="flex items-center gap-1.5 text-[12px] text-warning"><Icono n="hourglass_top" t={15} />El servidor responde lento (la IA corre en el VPS sin tarjeta gráfica). Puedes seguir esperando.</div> : null}
    </div>
  );
}

export function BurbujaUsuario({ texto, porVoz, autor, cuando }: { texto: string; porVoz: boolean; autor?: string | null; cuando?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[14px] text-white">
        {porVoz ? <Icono n="mic" t={15} className="mr-1 align-[-2px] opacity-80" /> : null}{texto}
      </div>
      {autor || cuando ? <div className="text-[11px] text-text-3">{[autor, cuando].filter(Boolean).join(" · ")}</div> : null}
    </div>
  );
}

export function BurbujaError({ texto, onReintentar }: { texto: string; onReintentar?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-danger px-3 py-2.5 text-[13px] text-danger">
      <Icono n="error" t={18} /><span className="flex-1">{texto}</span>
      {onReintentar ? <button className="btn-secundario h-8" onClick={onReintentar}>Reintentar</button> : null}
    </div>
  );
}

/** Lista de conversaciones con buscador (y filtro por autor en el historial compartido). */
export function Historial({ lista, activa, onElegir, autores }: { lista: ConvIa[]; activa: number | null; onElegir: (id: number) => void; autores: boolean }) {
  const [q, setQ] = useState("");
  const [autor, setAutor] = useState("");
  const nombres = [...new Set(lista.map((c) => c.autor_nombre).filter(Boolean))] as string[];
  const filas = lista.filter((c) => (!q.trim() || c.titulo.toLowerCase().includes(q.trim().toLowerCase())) && (!autor || c.autor_nombre === autor));
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative"><Icono n="search" className="pointer-events-none absolute left-3 top-2.5 text-text-3" t={18} /><input className="campo h-9 pl-9 text-[13px]" placeholder="Buscar consultas" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {autores && nombres.length > 1 ? (
        <select className="campo h-9 text-[13px]" value={autor} onChange={(e) => setAutor(e.target.value)}><option value="">Todos los usuarios</option>{nombres.map((n) => <option key={n}>{n}</option>)}</select>
      ) : null}
      <div className="min-h-0 overflow-y-auto">
        {filas.length ? filas.map((c) => (
          <button key={c.id} onClick={() => onElegir(c.id)} className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left ${activa === c.id ? "bg-primary-soft" : "hover:bg-surface-2"}`}>
            {autores ? <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-surface-2 text-[11px] font-extrabold text-text-2">{(c.autor_nombre ?? "?").split(" ").map((x) => x[0]).slice(0, 2).join("")}</span> : null}
            <span className="min-w-0 flex-1"><span className={`block truncate text-[13px] font-semibold ${activa === c.id ? "text-primary-ink" : ""}`}>{c.titulo}</span><span className="block truncate text-[11.5px] text-text-3">{[autores ? c.autor_nombre : null, fechaHora(c.actualizado_en)].filter(Boolean).join(" · ")}</span></span>
          </button>
        )) : <div className="px-2 py-4 text-center text-[12.5px] text-text-3">Sin consultas con ese filtro.</div>}
      </div>
    </div>
  );
}
