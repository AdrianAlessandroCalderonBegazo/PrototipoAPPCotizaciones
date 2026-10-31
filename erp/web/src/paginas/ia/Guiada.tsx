// Cotización guiada (sin IA): formulario corto → el servidor elige paneles, inversor y baterías del catálogo y arma la propuesta al instante.
// Reglas: 5.5 h de sol pico; los productos preferidos (hasta 5 de cada uno) se eligen en Cotizador IA › Contexto.
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Icono } from "../../componentes/Icono";
import { dinero } from "../../dinero";
import type { MensajeIa, OpcionesGuiada, ProductoGuiada } from "../../tipos";

const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);
type Tipo = "ongrid" | "hibrido" | "aislado";
const TIPOS: [Tipo, string, string, string][] = [
  ["ongrid", "On-Grid", "electrical_services", "Conectado a la red, sin baterías"],
  ["hibrido", "Híbrido", "battery_charging_full", "Red + baterías de respaldo"],
  ["aislado", "Aislado", "cottage", "Sin red: todo con baterías"],
];
type Clave = "paneles" | "inversores" | "baterias";
const precio = (p: ProductoGuiada) => (p.precio ? dinero(p.precio, p.moneda) : "Sin precio");
const etiqueta = (p: ProductoGuiada) => `${p.nombre} · ${p.valor.toLocaleString("es-PE")} ${p.unidad} · ${precio(p)}`;
const sirve = (tipo: Tipo, p: ProductoGuiada) => (tipo === "ongrid" ? p.uso === "red" : tipo === "hibrido" ? p.uso === "hibrido" : p.uso === "hibrido" || p.uso === "aislado");

export function useOpcionesGuiada() {
  const [o, setO] = useState<OpcionesGuiada | null>(null);
  useEffect(() => void api<OpcionesGuiada>("GET", "/ia/cotizador/guiada/opciones").then(setO).catch(() => null), []);
  return o;
}

/** El formulario de la cotización guiada. Al terminar, abre la consulta creada (queda en el historial compartido). */
export function FormGuiada({ onListo, compacto = false }: { onListo: (conversacionId: number, m: MensajeIa) => void; compacto?: boolean }) {
  const avisar = useAvisos();
  const o = useOpcionesGuiada();
  const [tipo, setTipo] = useState<Tipo>("hibrido");
  const [d, setD] = useState({ consumo_kwh_mes: "", potencia_kw: "", bateria_kwh: "", horas_respaldo: "", panel_id: "", inversor_id: "", bateria_id: "", cliente: "" });
  const [calculando, setCalculando] = useState(false);
  const c = (k: keyof typeof d) => ({ value: d[k], onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  const num = (k: keyof typeof d) => ({ ...c(k), inputMode: "decimal" as const, onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value.replace(/[^0-9.,]/g, "") }) });
  // En cada lista: primero los preferidos (en su orden), luego el resto
  const ordenar = (lista: ProductoGuiada[], pref: number[]) => [...pref.map((id) => lista.find((p) => p.id === id)).filter(Boolean) as ProductoGuiada[], ...lista.filter((p) => !pref.includes(p.id))];
  const paneles = useMemo(() => (o ? ordenar(o.paneles, o.preferidos.paneles) : []), [o]);
  const inversores = useMemo(() => (o ? ordenar(o.inversores.filter((p) => sirve(tipo, p)), o.preferidos.inversores) : []), [o, tipo]);
  const baterias = useMemo(() => (o ? ordenar(o.baterias, o.preferidos.baterias) : []), [o]);
  const listo = !!(d.consumo_kwh_mes || d.potencia_kw);
  const calcular = async () => {
    setCalculando(true);
    try {
      const r = await api<{ conversacion_id: number; mensaje: MensajeIa }>("POST", "/ia/cotizador/guiada", {
        cuerpo: {
          tipo, consumo_kwh_mes: d.consumo_kwh_mes || null, potencia_kw: d.potencia_kw || null, cliente: d.cliente || null,
          bateria_kwh: tipo !== "ongrid" ? d.bateria_kwh || null : null, horas_respaldo: tipo !== "ongrid" ? d.horas_respaldo || null : null,
          panel_id: d.panel_id || null, inversor_id: d.inversor_id || null, bateria_id: tipo !== "ongrid" ? d.bateria_id || null : null,
        },
      });
      onListo(r.conversacion_id, r.mensaje);
    } catch (x) {
      avisar("No se pudo calcular", msg(x), "error");
    } finally {
      setCalculando(false);
    }
  };
  const elegir = (k: "panel_id" | "inversor_id" | "bateria_id", lista: ProductoGuiada[], pref: number[], vacio: string) => (
    <select className="campo" {...c(k)}>
      <option value="">{vacio}</option>
      {lista.map((p) => <option key={p.id} value={p.id}>{pref.includes(p.id) ? "★ " : ""}{etiqueta(p)}</option>)}
    </select>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {TIPOS.map(([k, l, i, sub]) => (
          <button key={k} type="button" onClick={() => setTipo(k)} className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center ${tipo === k ? "border-primary bg-primary-soft text-primary-ink" : "border-border-strong text-text-2"}`}>
            <Icono n={i} t={20} /><span className="text-[13px] font-bold">{l}</span>{compacto ? null : <span className="text-[11px] font-medium text-text-3">{sub}</span>}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="etiqueta">Consumo mensual (kWh)</span><input className="campo num" {...num("consumo_kwh_mes")} placeholder="Ej. 900 (del recibo de luz)" /></label>
        <label><span className="etiqueta">Potencia del sistema (kW)</span><input className="campo num" {...num("potencia_kw")} placeholder="Opcional si pones el consumo" /></label>
        {tipo !== "ongrid" ? (
          <>
            <label><span className="etiqueta">Baterías (kWh)</span><input className="campo num" {...num("bateria_kwh")} placeholder="Opcional" /></label>
            <label><span className="etiqueta">o horas de respaldo</span><input className="campo num" {...num("horas_respaldo")} placeholder={tipo === "aislado" ? "Vacío = 1 día de consumo" : "Vacío = medio día de consumo"} /></label>
          </>
        ) : null}
      </div>
      <details className="rounded-xl border border-border px-3 py-2 text-[13px]">
        <summary className="cursor-pointer font-semibold text-text-2">Elegir equipos (opcional · ★ = preferido)</summary>
        <div className="mt-2 grid gap-2">
          <label><span className="etiqueta">Panel</span>{elegir("panel_id", paneles, o?.preferidos.paneles ?? [], "Automático (preferido o el de menor precio por W)")}</label>
          <label><span className="etiqueta">Inversor</span>{elegir("inversor_id", inversores, o?.preferidos.inversores ?? [], "Automático (el que alcanza la potencia)")}</label>
          {tipo !== "ongrid" ? <label><span className="etiqueta">Batería</span>{elegir("bateria_id", baterias, o?.preferidos.baterias ?? [], "Automático (la combinación más económica)")}</label> : null}
        </div>
      </details>
      <label><span className="etiqueta">Cliente o referencia (opcional)</span><input className="campo" {...c("cliente")} placeholder="Ej. Bodega Cerro Colorado" /></label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-text-3">Paneles con {o?.hsp ?? 5.5} h de sol pico · precios del catálogo · sin IA</span>
        <button className="btn-primario" disabled={!listo || calculando} onClick={() => void calcular()}><Icono n="bolt" t={18} />{calculando ? "Calculando…" : "Calcular cotización"}</button>
      </div>
    </div>
  );
}

/** Cotizador IA › Contexto: hasta 5 paneles, inversores y baterías preferidos (en orden) para la cotización guiada. */
export function PreferidosGuiada({ editar }: { editar: boolean }) {
  const avisar = useAvisos();
  const o = useOpcionesGuiada();
  const [pref, setPref] = useState<Record<Clave, number[]> | null>(null);
  const [guardado, setGuardado] = useState("");
  useEffect(() => {
    if (o) {
      setPref(o.preferidos);
      setGuardado(JSON.stringify(o.preferidos));
    }
  }, [o]);
  if (!o || !pref) return null;
  const guardar = async () => {
    try {
      await api("PUT", "/ia/contexto", { cuerpo: { guiada: pref } });
      setGuardado(JSON.stringify(pref));
      avisar("Preferidos guardados", "La cotización guiada los usará primero.");
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    }
  };
  const bloques: [Clave, string, string][] = [["paneles", "Paneles", "solar_power"], ["inversores", "Inversores", "bolt"], ["baterias", "Baterías", "battery_charging_full"]];
  return (
    <section className="tarjeta flex flex-col gap-4 p-5">
      <div><div className="titulo-seccion">Cotización guiada · productos preferidos</div><div className="text-[12.5px] text-text-3">Hasta 5 de cada uno, en orden de preferencia. Si no eliges ninguno, se usa el de menor precio que cumpla. Horas de sol pico: {o.hsp}.</div></div>
      {bloques.map(([k, l, i]) => {
        const lista = o[k];
        const elegidos = pref[k].map((id) => lista.find((p) => p.id === id)).filter(Boolean) as ProductoGuiada[];
        return (
          <div key={k} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] font-bold"><Icono n={i} t={18} className="text-primary-ink" />{l} <span className="font-medium text-text-3">· {elegidos.length}/5</span></div>
            {elegidos.map((p, n) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[13px]">
                <span className="num w-5 font-bold text-text-3">{n + 1}</span>
                <span className="min-w-0 flex-1 truncate">{etiqueta(p)}{p.uso ? <span className="text-text-3"> · {p.uso === "red" ? "de red" : p.uso}</span> : null}</span>
                {editar ? (
                  <>
                    <button className="grid h-7 w-7 place-items-center rounded-lg text-text-3 hover:bg-surface-2 disabled:opacity-30" disabled={n === 0} title="Subir" onClick={() => { const a = [...pref[k]]; [a[n - 1], a[n]] = [a[n], a[n - 1]]; setPref({ ...pref, [k]: a }); }}><Icono n="arrow_upward" t={16} /></button>
                    <button className="grid h-7 w-7 place-items-center rounded-lg text-text-3 hover:bg-surface-2" title="Quitar" onClick={() => setPref({ ...pref, [k]: pref[k].filter((x) => x !== p.id) })}><Icono n="close" t={16} /></button>
                  </>
                ) : null}
              </div>
            ))}
            {editar && elegidos.length < 5 ? (
              <select className="campo" value="" onChange={(e) => e.target.value && setPref({ ...pref, [k]: [...pref[k], Number(e.target.value)] })}>
                <option value="">+ Agregar {l.toLowerCase()} preferido…</option>
                {lista.filter((p) => !pref[k].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{etiqueta(p)}{p.uso ? ` · ${p.uso === "red" ? "de red" : p.uso}` : ""}</option>)}
              </select>
            ) : null}
            {!lista.length ? <div className="text-[12.5px] text-warning">No hay {l.toLowerCase()} en el catálogo con potencia legible en el nombre (ej. «550W», «10KW», «5.12KWH») y precio.</div> : null}
          </div>
        );
      })}
      {editar ? <button className="btn-primario self-start" disabled={JSON.stringify(pref) === guardado} onClick={() => void guardar()}><Icono n="save" t={18} />Guardar preferidos</button> : null}
    </section>
  );
}
