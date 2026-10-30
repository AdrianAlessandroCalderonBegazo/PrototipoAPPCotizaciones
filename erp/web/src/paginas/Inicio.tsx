import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Cargando, ErrorCarga } from "../componentes/Estado";
import { Icono } from "../componentes/Icono";
import { dinero, esNegativo, paraDibujar, restar } from "../dinero";
import { enlaceApp } from "../enlaces";
import { fecha, hoyLima } from "../formato";
import { FASE_ACTUAL } from "../modulos";
import { useSesion } from "../sesion";
import type { Alerta, InicioDatos } from "../tipos";
import { useDatos } from "../usarDatos";
import { PillCot } from "./cotizacion/comun";
import { BarraAvance, colorAvance, pctTexto } from "./proyectos/comun";

const FASES: [number, string][] = [
  [1, "Base: roles, permisos, auditoría y Configuración"],
  [2, "Proyectos y Contabilidad"],
  [3, "Cotización: catálogo, kits, PDF y WhatsApp"],
  [4, "Inicio completo, búsqueda global y notificaciones"],
  [5, "Facturación SUNAT con extensión de Chrome"],
  [6, "IA: Cotizador IA y Asistente IA"],
  [7, "IA en la app de Finanzas"],
  [8, "Comparador de proveedores"],
  [9, "Activos y control (Victron) y Almacén"],
  [10, "Cierre: pruebas, seguridad y respaldos"],
];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const saludo = () => {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Lima", hour: "numeric", hour12: false }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
};
const diaSemana = () => new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long" });
const NIVEL: Record<Alerta["nivel"], [string, string]> = { alta: ["var(--danger-soft)", "var(--danger)"], media: ["var(--warning-soft)", "var(--warning)"], info: ["var(--primary-soft)", "var(--primary-ink)"] };

function variacion(actual: string, anterior: string): number | null {
  const b = paraDibujar(anterior);
  return b ? Math.round(((paraDibujar(actual) - b) / b) * 1000) / 10 : null;
}

function Kpi({ l, v, delta, sub, bueno = "sube", color }: { l: string; v: string; delta?: number | null; sub: string; bueno?: "sube" | "baja"; color?: string }) {
  const ok = delta === null || delta === undefined ? null : bueno === "sube" ? delta >= 0 : delta <= 0;
  return (
    <div className="tarjeta flex flex-col gap-1.5 p-4">
      <div className="text-[12.5px] font-semibold text-text-2">{l}</div>
      <div className="num text-[22px] font-extrabold tracking-tight" style={{ color }}>{v}</div>
      <div className="flex items-center gap-1.5 text-[12px] text-text-3">
        {delta !== null && delta !== undefined ? <span className="inline-flex items-center gap-0.5 font-bold" style={{ color: ok ? "var(--success)" : "var(--danger)" }}><Icono n={delta >= 0 ? "trending_up" : "trending_down"} t={15} />{delta >= 0 ? "+" : ""}{delta}%</span> : null}
        {sub}
      </div>
    </div>
  );
}

export function AlertaFila({ a, onIr }: { a: Alerta; onIr?: () => void }) {
  const [bg, fg] = NIVEL[a.nivel];
  return (
    <div className="flex gap-3 border-t border-border px-5 py-3 first:border-t-0">
      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px]" style={{ background: bg, color: fg }}><Icono n={a.icono} t={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug">{a.titulo}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-md border border-border bg-surface-2 px-1.5 text-[11px] font-bold text-text-2">{a.origen}</span>
          {a.ruta ? <Link to={a.ruta} onClick={onIr} className="text-[12.5px]">{a.cta}</Link> : null}
        </div>
      </div>
    </div>
  );
}

export function Inicio() {
  const { usuario } = useSesion();
  const navegar = useNavigate();
  const { datos: d, error, cargando, recargar } = useDatos(() => api<InicioDatos>("GET", "/inicio"));
  if (cargando && !d) return <Cargando texto="Armando tu inicio…" />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!d) return null;
  const nombre = usuario?.nombre.split(" ")[0] ?? "";
  const mes = MESES[Number(d.fecha.slice(5, 7)) - 1];
  const f = d.finanzas;
  const k = f?.kpis;
  const neto = k ? restar(k.ingresos_mes, k.egresos_mes) : null;
  const netoAnt = k ? restar(k.ingresos_mes_anterior, k.egresos_mes_anterior) : null;
  const apps = [
    { sub: "cotizador" as const, nombre: "Logística", icono: "local_shipping", ver: !!d.permisos.logistica },
    { sub: "finanzas" as const, nombre: "Finanzas (caja chica)", icono: "savings", ver: !!d.permisos.caja_chica },
  ].filter((a) => a.ver && enlaceApp(a.sub));
  const rapidos = [
    d.permisos.proyectosCompleto && { l: "Nuevo proyecto", i: "add", go: () => navegar("/proyectos?nuevo=1"), primario: true },
    d.permisos.cotizacionCompleto && { l: "Nueva cotización", i: "request_quote", go: () => navegar("/cotizacion/nueva") },
    d.permisos.contabilidadCompleto && { l: "Enviar fondos", i: "savings", go: () => navegar("/contabilidad?accion=enviar") },
  ].filter(Boolean) as { l: string; i: string; go: () => void; primario?: boolean }[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="sobretitulo">Inicio · {diaSemana()} {fecha(hoyLima())}</div>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">{saludo()}, {nombre}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {rapidos.map((r) => <button key={r.l} className={r.primario ? "btn-primario" : "btn-secundario"} onClick={r.go}><Icono n={r.i} t={18} />{r.l}</button>)}
        </div>
      </div>

      {f ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Link to="/contabilidad" className="flex flex-col gap-1.5 rounded-[18px] p-5 font-normal text-white no-underline" style={{ background: "linear-gradient(120deg, var(--navy-a), var(--navy-b))" }}>
              <div className="flex items-center justify-between text-[12.5px] font-bold opacity-90"><span>Cuenta principal{f.cuenta ? ` · ${f.cuenta.nombre}` : ""}</span>{f.cuenta?.ultimo_movimiento ? <span className="font-medium opacity-80">Últ. mov. {fecha(f.cuenta.ultimo_movimiento)}</span> : null}</div>
              <div className="num text-[30px] font-extrabold tracking-tight">{f.cuenta ? dinero(f.cuenta.saldo, f.cuenta.moneda) : "Sin dato"}</div>
              <div className="num text-[12px] opacity-80">{f.cuenta ? (f.cuenta.saldo === null ? "Falta el saldo inicial (Contabilidad › Cuentas)." : `Saldo inicial al ${fecha(f.cuenta.saldo_inicial_fecha)}`) : "Crea la cuenta principal en Contabilidad."}</div>
              {f.cuentas.filter((c) => c.id !== f.cuenta?.id && c.activa).map((c) => <div key={c.id} className="num text-[12px] opacity-90">{c.nombre}: <b>{dinero(c.saldo, c.moneda)}</b></div>)}
            </Link>
            <Link to="/contabilidad" className="tarjeta flex flex-col gap-1.5 p-5 font-normal text-text no-underline hover:border-primary-line">
              <div className="flex items-center justify-between text-[12.5px] font-semibold text-text-2">Caja chica<span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 text-[11px] font-bold"><Icono n="savings" t={14} />Caja chica</span></div>
              <div className="num text-[30px] font-extrabold tracking-tight">{f.caja.disponible ? dinero(f.caja.saldo_total) : "Sin dato"}</div>
              {f.caja.disponible ? <div className="flex flex-wrap gap-x-4 text-[12.5px] text-text-2">{f.caja.saldos.map((s) => <span key={s.ciudad}>{s.nombre} <b className="num" style={{ color: esNegativo(s.saldo) ? "var(--danger)" : undefined }}>{dinero(s.saldo)}</b></span>)}</div> : <div className="text-[12.5px] text-text-3">La caja de Finanzas no está disponible.</div>}
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi l={`Ingresos · ${mes}`} v={dinero(k!.ingresos_mes)} delta={variacion(k!.ingresos_mes, k!.ingresos_mes_anterior)} sub={`vs. mes anterior ${dinero(k!.ingresos_mes_anterior)}`} color="var(--primary-ink)" />
            <Kpi l={`Egresos · ${mes}`} v={dinero(k!.egresos_mes)} delta={variacion(k!.egresos_mes, k!.egresos_mes_anterior)} sub={`vs. mes anterior ${dinero(k!.egresos_mes_anterior)}`} bueno="baja" color="var(--danger)" />
            <Kpi l={`Flujo neto · ${mes}`} v={dinero(neto)} delta={netoAnt ? variacion(neto!, netoAnt) : null} sub={`vs. mes anterior ${dinero(netoAnt)}`} />
            {d.proyectos ? <Kpi l="Proyectos activos" v={String(d.proyectos.total_activos)} sub={`${d.proyectos.con_alerta} con alerta · ${d.proyectos.pausados.length} pausados`} /> : <Kpi l="Movimientos del mes" v={String(k!.movimientos_mes)} sub="en la cuenta principal" />}
          </div>
        </>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-5">
          {d.proyectos ? (
            <>
              <section className="tarjeta overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="titulo-seccion">Proyectos activos <span className="font-medium text-text-3">· {d.proyectos.total_activos}</span></div><Link to="/proyectos" className="text-[13px]">Ver todos</Link></div>
                {d.proyectos.activos.length ? d.proyectos.activos.map((p) => {
                  const alerta = p.porcentaje !== null && p.porcentaje >= d.proyectos!.aviso_pct;
                  return (
                    <Link key={p.id} to={`/proyectos/${p.id}`} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-x-4 gap-y-2 border-b sm:grid-cols-[minmax(0,1fr)_minmax(120px,200px)_64px] border-border px-5 py-3 font-normal text-text no-underline last:border-0 hover:bg-surface-2">
                      <div className="min-w-0"><div className="truncate font-semibold">{p.nombre}</div><div className="truncate text-[12px] text-text-3">{[p.codigo, p.tipo_sistema].filter(Boolean).join(" · ")}</div></div>
                      <div className="col-span-2 sm:order-none sm:col-span-1"><BarraAvance pct={p.porcentaje} aviso={d.proyectos!.aviso_pct} limite={d.proyectos!.limite_pct} /><div className="num mt-1 text-[11.5px] text-text-3">{dinero(p.gastado)} de {dinero(p.presupuesto)}</div></div>
                      <div className="num row-start-1 flex items-center justify-end gap-0.5 text-[13px] font-bold sm:row-auto" style={{ color: colorAvance(p.porcentaje, d.proyectos!.aviso_pct, d.proyectos!.limite_pct) }}>{alerta ? <Icono n="warning" t={15} /> : null}{pctTexto(p.porcentaje)}</div>
                    </Link>
                  );
                }) : <div className="p-6 text-center text-[13px] text-text-3">No hay proyectos activos.</div>}
              </section>
              <section className="tarjeta overflow-hidden">
                <div className="border-b border-border px-5 py-4"><div className="titulo-seccion">Proyectos pausados <span className="font-medium text-text-3">· {d.proyectos.pausados.length}</span></div></div>
                {d.proyectos.pausados.length ? d.proyectos.pausados.map((p) => (
                  <Link key={p.id} to={`/proyectos/${p.id}`} className="flex items-center gap-3 border-b border-border px-5 py-3 font-normal text-text no-underline last:border-0 hover:bg-surface-2">
                    <Icono n="pause_circle" t={22} className="text-warning" />
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold">{p.nombre} <span className="font-normal text-text-3">· {p.codigo}</span></div><div className="truncate text-[12.5px] text-text-2"><b className="text-warning">Causa:</b> {p.causa_pausa}</div></div>
                    <div className="text-right text-[12px] text-text-3">Desde {p.pausado_desde ? fecha(p.pausado_desde) : "Sin dato"}<br /><span className="font-semibold">{pctTexto(p.porcentaje)} gastado</span></div>
                  </Link>
                )) : <div className="px-5 py-4 text-[13px] text-text-3">No hay proyectos pausados.</div>}
              </section>
            </>
          ) : null}
          {d.cotizaciones ? (
            <section className="tarjeta overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="titulo-seccion">Cotizaciones de {mes} <span className="font-medium text-text-3">· {d.cotizaciones.del_mes} · {dinero(d.cotizaciones.monto_mes)} · {d.cotizaciones.aceptadas_mes} aceptadas</span></div>
                <Link to="/cotizacion" className="text-[13px]">Ir a Cotización</Link>
              </div>
              {d.cotizaciones.ultimas.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
                    <thead><tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3"><th className="px-5 py-2">N.º</th><th className="px-3 py-2">Cliente / sistema</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Fecha</th><th className="px-5 py-2 text-right">Total</th></tr></thead>
                    <tbody>
                      {d.cotizaciones.ultimas.map((c) => (
                        <tr key={c.id} onClick={() => navegar(`/cotizacion/${c.id}`)} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2">
                          <td className="px-5 py-2.5 font-mono font-bold">{c.numero}</td>
                          <td className="px-3 py-2.5"><div className="font-semibold">{c.cliente || "Cliente sin nombre"}</div><div className="truncate text-[12px] text-text-3">{c.sistema ?? ""}</div></td>
                          <td className="px-3 py-2.5"><PillCot e={c.estado} /></td>
                          <td className="num whitespace-nowrap px-3 py-2.5">{fecha(c.fecha)}</td>
                          <td className="num whitespace-nowrap px-5 py-2.5 text-right font-bold">{dinero(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="p-6 text-center text-[13px] text-text-3">Aún no hay cotizaciones este mes.</div>}
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <section className="tarjeta overflow-hidden">
            <div className="border-b border-border px-5 py-4"><div className="titulo-seccion">Alertas <span className="font-medium text-text-3">· {d.alertas.length}</span></div></div>
            {d.alertas.length ? d.alertas.slice(0, 8).map((a) => <AlertaFila key={a.clave} a={a} />) : <div className="flex items-center gap-2 px-5 py-4 text-[13px] text-success"><Icono n="check_circle" relleno />Todo en orden por ahora.</div>}
          </section>
          {d.logistica ? (
            <section className="tarjeta p-5">
              <div className="mb-3 flex items-center justify-between"><div className="titulo-seccion">Almacén y logística</div><Link to="/almacen" className="text-[13px]">Abrir</Link></div>
              <div className="grid grid-cols-2 gap-3">
                {[["Por aprobar", d.logistica.por_aprobar, "pending_actions"], ["Por alistar / entregar", d.logistica.por_entregar, "inventory_2"], ["Herramientas fuera", d.logistica.herramientas_fuera, "construction"], ["Urgentes", d.logistica.urgentes, "priority_high"]].map(([l, n, i]) => (
                  <div key={l as string} className="rounded-xl border border-border p-3"><div className="flex items-center justify-between text-[12px] text-text-3">{l}<Icono n={i as string} t={16} /></div><div className="num text-[22px] font-extrabold" style={{ color: l === "Urgentes" && Number(n) ? "var(--danger)" : undefined }}>{n}</div></div>
                ))}
              </div>
            </section>
          ) : null}
          {apps.length ? (
            <section className="tarjeta p-5">
              <div className="titulo-seccion mb-3">Apps de trabajo</div>
              <div className="flex flex-col gap-2">
                {apps.map((a) => (
                  <a key={a.sub} href={enlaceApp(a.sub)!} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-border p-3 font-semibold text-text no-underline hover:border-primary-line">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary-ink"><Icono n={a.icono} t={20} /></span>{a.nombre}<Icono n="open_in_new" t={17} className="ml-auto text-text-3" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}
          <section className="tarjeta p-5">
            <div className="titulo-seccion">Avance del ERP</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full bg-success" style={{ width: `${(FASE_ACTUAL / 10) * 100}%` }} /></div>
            <div className="mt-1.5 text-[12.5px] text-text-3">Fase {FASE_ACTUAL} de 10 terminada · siguiente: {FASES.find(([n]) => n === FASE_ACTUAL + 1)?.[1]}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
