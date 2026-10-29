import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { fecha, hoyLima } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { Numeracion, Parametros as TParametros } from "../../tipos";
import { useDatos } from "../../usarDatos";

const ejemplo = (prefijo: string, digitos: number, n: number) => `${prefijo}${String(n).padStart(digitos, "0")}`;

function Numero({ l, v, set, sufijo, min, max, editar, ayuda }: { l: string; v: number; set: (n: number) => void; sufijo: string; min: number; max: number; editar: boolean; ayuda: string }) {
  return (
    <label>
      <span className="etiqueta">{l}</span>
      <div className="relative">
        <input className="campo num pr-14" type="number" min={min} max={max} disabled={!editar} value={Number.isFinite(v) ? v : ""} onChange={(e) => set(e.target.valueAsNumber)} />
        <span className="pointer-events-none absolute right-3 top-2.5 text-[13px] text-text-3">{sufijo}</span>
      </div>
      <span className="mt-1 block text-[12px] text-text-3">{ayuda}</span>
    </label>
  );
}

export function Parametros() {
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const editar = puede(usuario, "configuracion", "completo");
  const { datos, error, cargando, recargar } = useDatos(async () => {
    const [p, n] = await Promise.all([api<TParametros>("GET", "/parametros"), api<Numeracion>("GET", "/numeracion/cotizacion")]);
    return { p, n };
  });
  const [p, setP] = useState<TParametros | null>(null);
  const [n, setN] = useState<{ prefijo: string; digitos: number; siguiente: number } | null>(null);
  const [guardando, setGuardando] = useState<"p" | "n" | null>(null);
  useEffect(() => {
    if (!datos) return;
    setP(structuredClone(datos.p));
    setN({ prefijo: datos.n.prefijo, digitos: datos.n.digitos, siguiente: datos.n.siguiente });
  }, [datos]);

  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!datos || !p || !n) return null;

  const guardarP = async () => {
    setGuardando("p");
    try {
      await api("PUT", "/parametros", { cuerpo: p });
      avisar("Parámetros guardados");
      await recargar();
    } catch (e) {
      avisar("No se pudo guardar", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setGuardando(null);
    }
  };
  const guardarN = async () => {
    setGuardando("n");
    try {
      await api("PUT", "/numeracion/cotizacion", { cuerpo: { prefijo: n.prefijo, digitos: n.digitos, ...(n.siguiente !== datos.n.siguiente ? { siguiente: n.siguiente } : {}) } });
      avisar("Numeración guardada", `La próxima cotización será ${ejemplo(n.prefijo, n.digitos, n.siguiente)}.`);
      await recargar();
    } catch (e) {
      avisar("No se pudo guardar", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setGuardando(null);
    }
  };
  const tc = p.tipo_cambio;
  const pCambiado = JSON.stringify(p) !== JSON.stringify(datos.p);
  const nCambiado = n.prefijo !== datos.n.prefijo || n.digitos !== datos.n.digitos || n.siguiente !== datos.n.siguiente;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="tarjeta flex flex-col gap-4 p-5">
        <div className="titulo-seccion">Parámetros</div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Numero l="Aviso de presupuesto" v={p.presupuesto_aviso_pct} set={(v) => setP({ ...p, presupuesto_aviso_pct: v })} sufijo="%" min={1} max={100} editar={editar} ayuda="Avisa cuando un proyecto llega a este % de su presupuesto." />
          <Numero l="Alerta roja de presupuesto" v={p.presupuesto_limite_pct} set={(v) => setP({ ...p, presupuesto_limite_pct: v })} sufijo="%" min={1} max={500} editar={editar} ayuda="Se marca en rojo desde este %." />
          <Numero l="Vigencia de precios" v={p.vigencia_precios_dias} set={(v) => setP({ ...p, vigencia_precios_dias: v })} sufijo="días" min={1} max={365} editar={editar} ayuda="Un precio de proveedor más antiguo se marca «desactualizado»." />
        </div>
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <div className="font-bold">Tipo de cambio referencial</div>
          <div className="mb-3 text-[12.5px] text-text-3">Se muestra arriba y se guarda en cada conversión. Escríbelo tal como lo publica la fuente (p. ej. SBS).</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="etiqueta">US$ 1 = S/</span>
              <input className="campo num" inputMode="decimal" disabled={!editar} placeholder="Ej. 3.742" value={tc.valor ?? ""} onChange={(e) => setP({ ...p, tipo_cambio: { ...tc, valor: e.target.value.replace(",", ".") || null } })} />
            </label>
            <label>
              <span className="etiqueta">Fecha</span>
              <input className="campo" type="date" disabled={!editar} value={tc.fecha ?? ""} onChange={(e) => setP({ ...p, tipo_cambio: { ...tc, fecha: e.target.value || null } })} />
            </label>
            <label>
              <span className="etiqueta">Fuente</span>
              <input className="campo" disabled={!editar} placeholder="Ej. SBS" value={tc.fuente ?? ""} onChange={(e) => setP({ ...p, tipo_cambio: { ...tc, fuente: e.target.value || null } })} />
            </label>
          </div>
          {editar && tc.valor && !tc.fecha ? (
            <button className="mt-2 text-[12.5px] font-semibold text-primary-ink" onClick={() => setP({ ...p, tipo_cambio: { ...tc, fecha: hoyLima() } })}>Usar la fecha de hoy ({fecha(hoyLima())})</button>
          ) : null}
        </div>
        {editar ? (
          <div className="flex justify-end">
            <button className="btn-primario" disabled={!pCambiado || guardando === "p"} onClick={guardarP}>{guardando === "p" ? "Guardando…" : "Guardar parámetros"}</button>
          </div>
        ) : null}
      </section>

      <section className="tarjeta flex h-fit flex-col gap-4 p-5">
        <div className="titulo-seccion">Numeración de cotizaciones</div>
        <div className="grid gap-3.5 sm:grid-cols-3">
          <label>
            <span className="etiqueta">Prefijo</span>
            <input className="campo" disabled={!editar} maxLength={10} value={n.prefijo} onChange={(e) => setN({ ...n, prefijo: e.target.value.toUpperCase() })} />
          </label>
          <label>
            <span className="etiqueta">Dígitos</span>
            <input className="campo num" type="number" min={1} max={10} disabled={!editar} value={n.digitos} onChange={(e) => setN({ ...n, digitos: e.target.valueAsNumber })} />
          </label>
          <label>
            <span className="etiqueta">Siguiente número</span>
            <input className="campo num" type="number" min={datos.n.siguiente} disabled={!editar} value={n.siguiente} onChange={(e) => setN({ ...n, siguiente: e.target.valueAsNumber })} />
          </label>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-3">
          <span className="text-[13px] text-text-2">La próxima cotización será</span>
          <span className="num font-mono text-[16px] font-bold">{Number.isFinite(n.digitos) && Number.isFinite(n.siguiente) ? ejemplo(n.prefijo, n.digitos, n.siguiente) : "—"}</span>
        </div>
        <p className="text-[12.5px] text-text-3">Es el mismo correlativo que usan las cotizaciones de la app de Logística (última usada: {datos.n.ultimo || "ninguna"}). El número nunca puede ir hacia atrás.</p>
        {editar ? (
          <div className="flex justify-end">
            <button className="btn-primario" disabled={!nCambiado || guardando === "n"} onClick={guardarN}>{guardando === "n" ? "Guardando…" : "Guardar numeración"}</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
