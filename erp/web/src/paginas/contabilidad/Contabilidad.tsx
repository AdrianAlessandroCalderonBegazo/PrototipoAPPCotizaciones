import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { VisorFotos, type FotoVisor } from "../../componentes/VisorFotos";
import { aSoles, dinero, esNegativo, paraDibujar, restar } from "../../dinero";
import { fecha, texto } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { CajaChicaErp, Empresa, MovimientoCuenta, Parametros, ResumenConta } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { exportarExcel, exportarPdf } from "./exportar";
import { Cuentas, DetalleMovimiento, EnviarFondos, NuevoMovimiento } from "./Modales";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const mesLargo = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
const POR_PAGINA = 15;

function variacion(actual: string, anterior: string) {
  const a = paraDibujar(actual);
  const b = paraDibujar(anterior);
  if (!b) return null;
  return Math.round(((a - b) / b) * 1000) / 10;
}

function Kpi({ l, v, delta, sub, malo }: { l: string; v: string; delta?: number | null; sub: string; malo?: boolean }) {
  const sube = (delta ?? 0) >= 0;
  return (
    <div className="tarjeta flex flex-col gap-1.5 p-4">
      <div className="text-[12.5px] font-semibold text-text-2">{l}</div>
      <div className="num text-[22px] font-extrabold tracking-tight">{v}</div>
      <div className="text-[12px] text-text-3">
        {delta !== undefined && delta !== null ? <b style={{ color: sube !== !!malo ? "var(--success)" : "var(--danger)" }}>{sube ? "▲" : "▼"} {Math.abs(delta)}% </b> : null}
        {sub}
      </div>
    </div>
  );
}

export function Contabilidad() {
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const editar = puede(usuario, "contabilidad", "completo");
  const [tab, setTab] = useState<"principal" | "caja">("principal");
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [f, setF] = useState({ q: new URLSearchParams(window.location.search).get("q") ?? "", desde: "", hasta: "", tipo: "", categoria: "", anulados: false });
  const [pagina, setPagina] = useState(1);
  const [modal, setModal] = useState<"nuevo" | "cuentas" | "fondos" | null>(() => (new URLSearchParams(window.location.search).get("accion") === "enviar" ? "fondos" : null));
  const [detalle, setDetalle] = useState<MovimientoCuenta | null>(null);
  const [exp, setExp] = useState(false);
  const [visor, setVisor] = useState<FotoVisor[] | null>(null);
  const expRef = useRef<HTMLDivElement>(null);

  const res = useDatos(() => api<ResumenConta>("GET", "/contabilidad/resumen", { consulta: { cuenta_id: cuentaId } }), [cuentaId]);
  const cuenta = res.datos?.cuenta ?? null;
  const movs = useDatos(
    () => (cuenta ? api<{ movimientos: MovimientoCuenta[]; totales: { ingresos: string; egresos: string } }>("GET", "/contabilidad/movimientos", { consulta: { cuenta_id: cuenta.id, anulados: "1" } }) : Promise.resolve(null)),
    [cuenta?.id],
  );
  const caja = useDatos(() => api<CajaChicaErp>("GET", "/contabilidad/caja-chica"));
  const param = useDatos(() => api<Parametros>("GET", "/parametros"));
  const empresa = useDatos(() => api<Empresa>("GET", "/empresa"));
  useEffect(() => {
    if (!exp) return;
    const c = (e: MouseEvent) => expRef.current && !expRef.current.contains(e.target as Node) && setExp(false);
    document.addEventListener("mousedown", c);
    return () => document.removeEventListener("mousedown", c);
  }, [exp]);

  const recargarTodo = () => Promise.all([res.recargar(), movs.recargar(), caja.recargar()]);
  const lista = useMemo(() => {
    const t = f.q.trim().toLowerCase();
    return (movs.datos?.movimientos ?? []).filter((m) =>
      (f.anulados || !m.anulado) && (!f.desde || m.fecha >= f.desde) && (!f.hasta || m.fecha <= f.hasta) && (!f.tipo || m.tipo === f.tipo) && (!f.categoria || m.categoria === f.categoria) &&
      (!t || [m.concepto, m.documento, m.contraparte, m.proyecto_nombre, m.proyecto_codigo].some((x) => x?.toLowerCase().includes(t))),
    );
  }, [movs.datos, f]);
  const totales = useMemo(() => {
    let i = "0";
    let e = "0";
    for (const m of lista) if (!m.anulado) (m.tipo === "ingreso" ? (i = restar(i, `-${m.monto}`)) : (e = restar(e, `-${m.monto}`)));
    return { ingresos: i, egresos: e };
  }, [lista]);
  useEffect(() => setPagina(1), [f, cuenta?.id]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const visibles = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const hayFiltros = !!(f.q || f.desde || f.hasta || f.tipo || f.categoria || f.anulados);
  const textoFiltros = [f.desde || f.hasta ? `del ${f.desde ? fecha(f.desde) : "inicio"} al ${f.hasta ? fecha(f.hasta) : "hoy"}` : "todas las fechas", f.tipo ? `${f.tipo}s` : null, f.categoria || null, f.q ? `«${f.q}»` : null].filter(Boolean).join(" · ");

  const exportar = async (tipo: "xlsx" | "pdf") => {
    setExp(false);
    if (!cuenta) return;
    const d = { cuenta, movimientos: lista, filtros: textoFiltros, totales, empresa: empresa.datos?.razon_social ?? null };
    try {
      if (tipo === "xlsx") await exportarExcel(d);
      else exportarPdf(d);
    } catch (e) {
      avisar("No se pudo exportar", e instanceof Error ? e.message : undefined, "error");
    }
  };

  if (res.cargando && !res.datos) return <Cargando />;
  if (res.error) return <ErrorCarga mensaje={res.error} reintentar={res.recargar} />;
  const r = res.datos!;
  const otras = r.cuentas.filter((c) => c.id !== cuenta?.id && c.activa);
  const maxFlujo = Math.max(1, ...r.flujo.flatMap((m) => [paraDibujar(m.ingresos), paraDibujar(m.egresos)]));
  const maxProy = Math.max(1, ...r.egresos_por_proyecto.map((p) => paraDibujar(p.total)));
  const mon = cuenta?.moneda ?? "PEN";
  const tc = param.datos?.tipo_cambio;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="sobretitulo">Finanzas</div>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Contabilidad</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "principal" && cuenta ? (
            <div className="relative" ref={expRef}>
              <button className="btn-secundario" onClick={() => setExp(!exp)}><Icono n="download" t={18} />Exportar<Icono n="expand_more" t={18} /></button>
              {exp ? (
                <div className="aparecer absolute right-0 top-12 z-30 w-[250px] rounded-2xl border border-border bg-surface p-2 shadow-menu">
                  {([["xlsx", "Excel (.xlsx)", "Con números para filtrar y sumar", "table_view"], ["pdf", "PDF", "Hoja lista para imprimir o guardar", "picture_as_pdf"]] as const).map(([k, l, h, i]) => (
                    <button key={k} onClick={() => void exportar(k)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-surface-2">
                      <Icono n={i} className="text-primary" /><span><span className="block text-[13.5px] font-bold">{l}</span><span className="block text-[12px] text-text-3">{h}</span></span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button className="btn-secundario" onClick={() => setModal("cuentas")}><Icono n="account_balance" t={18} />Cuentas</button>
          {editar && cuenta ? <button className="btn-secundario" onClick={() => setModal("nuevo")}><Icono n="add" t={18} />Nuevo movimiento</button> : null}
          {editar ? <button className="btn-primario" onClick={() => setModal("fondos")}><Icono n="savings" t={18} />Enviar fondos a caja chica</button> : null}
        </div>
      </div>

      <div className="flex gap-1.5">
        {([["principal", "Cuenta principal", "account_balance"], ["caja", "Caja chica", "savings"]] as const).map(([k, l, i]) => (
          <button key={k} onClick={() => setTab(k)} className={`btn h-10 ${tab === k ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}><Icono n={i} t={19} />{l}</button>
        ))}
      </div>

      {tab === "principal" ? (
        !cuenta ? (
          <div className="tarjeta">
            <Vacio icono="account_balance" titulo="Todavía no hay cuentas">
              {editar ? <>Crea la cuenta principal (banco, número y, si lo sabes, el saldo inicial). <button className="font-bold text-primary-ink" onClick={() => setModal("cuentas")}>Crear cuenta</button></> : "Contabilidad debe registrar la cuenta principal."}
            </Vacio>
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
              <div className="flex flex-col gap-2 rounded-[18px] p-5 text-white" style={{ background: "linear-gradient(120deg, var(--navy-a), var(--navy-b))" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {r.cuentas.length > 1 ? (
                    <select className="rounded-lg bg-white/10 px-2 py-1 text-[12.5px] font-bold text-white outline-none" value={cuenta.id} onChange={(e) => setCuentaId(Number(e.target.value))}>
                      {r.cuentas.map((c) => <option key={c.id} value={c.id} className="text-black">{c.nombre}</option>)}
                    </select>
                  ) : <div className="text-[12.5px] font-bold opacity-90">{cuenta.principal ? "Cuenta principal · " : ""}{cuenta.nombre}</div>}
                  {cuenta.numero ? <span className="num text-[11.5px] opacity-75">N.º {cuenta.numero}</span> : null}
                </div>
                <div className="num text-[30px] font-extrabold tracking-tight">{dinero(cuenta.saldo, mon)}</div>
                <div className="text-[12px] opacity-80">
                  {cuenta.saldo === null ? "Falta el saldo inicial: regístralo en «Cuentas»." : `Saldo inicial ${dinero(cuenta.saldo_inicial, mon)} al ${fecha(cuenta.saldo_inicial_fecha)}`}
                </div>
                {otras.map((o) => (
                  <div key={o.id} className="num text-[12px] opacity-90">
                    {o.nombre}: <b>{dinero(o.saldo, o.moneda)}</b>
                    {o.moneda === "USD" && o.saldo && tc?.valor ? ` ≈ ${dinero(aSoles(o.saldo, tc.valor))} · TC ${tc.valor}` : ""}
                  </div>
                ))}
              </div>
              <Kpi l={`Ingresos · ${mesLargo(r.mes)}`} v={dinero(r.kpis.ingresos_mes, mon)} delta={variacion(r.kpis.ingresos_mes, r.kpis.ingresos_mes_anterior)} sub="vs. mes anterior" />
              <Kpi l={`Egresos · ${mesLargo(r.mes)}`} v={dinero(r.kpis.egresos_mes, mon)} delta={variacion(r.kpis.egresos_mes, r.kpis.egresos_mes_anterior)} sub="vs. mes anterior" malo />
              <Kpi l="Resultado del mes" v={dinero(restar(r.kpis.ingresos_mes, r.kpis.egresos_mes), mon)} sub={`${r.kpis.movimientos_mes} movimientos`} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <section className="tarjeta p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="titulo-seccion">Flujo mensual · {mesCorto(r.flujo[0].mes)} – {mesCorto(r.flujo.at(-1)!.mes)}</div>
                  <div className="flex gap-3 text-[12px] text-text-2"><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />Ingresos</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-solar" />Egresos</span></div>
                </div>
                <div className="flex h-[180px] items-end gap-3">
                  {r.flujo.map((m) => (
                    <div key={m.mes} className="flex h-full flex-1 items-end justify-center gap-1">
                      <div title={`Ingresos ${dinero(m.ingresos, mon)}`} className="w-1/3 max-w-[22px] rounded-t-md bg-primary" style={{ height: `${(paraDibujar(m.ingresos) / maxFlujo) * 100}%`, minHeight: paraDibujar(m.ingresos) ? 3 : 0 }} />
                      <div title={`Egresos ${dinero(m.egresos, mon)}`} className="w-1/3 max-w-[22px] rounded-t-md bg-solar" style={{ height: `${(paraDibujar(m.egresos) / maxFlujo) * 100}%`, minHeight: paraDibujar(m.egresos) ? 3 : 0 }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-3">
                  {r.flujo.map((m) => {
                    const neto = restar(m.ingresos, m.egresos);
                    return (
                      <div key={m.mes} className="flex-1 text-center">
                        <div className="text-[11.5px] font-semibold text-text-2">{mesCorto(m.mes)}</div>
                        <div className="num text-[11px]" style={{ color: esNegativo(neto) ? "var(--danger)" : "var(--success)" }}>{neto === "0.00" ? "—" : dinero(neto, mon)}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="tarjeta p-5">
                <div className="titulo-seccion mb-3">Egresos por categoría · {MESES[Number(r.mes.slice(5)) - 1]}</div>
                {r.egresos_por_categoria.length ? (
                  <div className="flex flex-col gap-2.5">
                    {r.egresos_por_categoria.map((c) => (
                      <div key={c.categoria}>
                        <div className="mb-1 flex justify-between text-[13px]"><span>{c.categoria}</span><span><span className="mr-2 text-text-3">{c.porcentaje}%</span><b className="num">{dinero(c.monto, mon)}</b></span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full bg-primary" style={{ width: `${c.porcentaje}%` }} /></div>
                      </div>
                    ))}
                    <div className="mt-1 flex justify-between border-t border-border pt-2 text-[13px]"><span className="text-text-2">Total egresos</span><b className="num">{dinero(r.kpis.egresos_mes, mon)}</b></div>
                  </div>
                ) : <div className="py-8 text-center text-[13px] text-text-3">Sin egresos este mes.</div>}
              </section>
            </div>

            <section className="tarjeta p-5">
              <div className="titulo-seccion mb-3">Egresos por proyecto · {MESES[Number(r.mes.slice(5)) - 1]} <span className="font-medium text-text-3">(cuenta principal + caja de Finanzas)</span></div>
              {r.egresos_por_proyecto.length ? (
                <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
                  {r.egresos_por_proyecto.map((p) => (
                    <Link key={p.id} to={`/proyectos/${p.id}`} className="flex items-center gap-3 rounded-lg p-1 font-normal text-text no-underline hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2 text-[13px]"><span className="truncate font-semibold">{p.nombre}</span><span className="font-mono text-[11.5px] text-text-3">{p.codigo}</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full bg-solar" style={{ width: `${(paraDibujar(p.total) / maxProy) * 100}%` }} /></div>
                      </div>
                      <b className="num text-[13px]">{dinero(p.total)}</b>
                    </Link>
                  ))}
                </div>
              ) : <div className="py-6 text-center text-[13px] text-text-3">Ningún gasto asignado a proyectos este mes.</div>}
            </section>

            <section className="tarjeta overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
                <div className="titulo-seccion">Movimientos · {cuenta.nombre}</div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="relative min-w-[220px] flex-[2]">
                    <Icono n="search" className="pointer-events-none absolute left-3 top-2.5 text-text-3" />
                    <input className="campo pl-10" placeholder="Concepto, documento o proyecto" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
                  </div>
                  <label className="min-w-[140px] flex-1"><span className="etiqueta">Desde</span><input className="campo" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
                  <label className="min-w-[140px] flex-1"><span className="etiqueta">Hasta</span><input className="campo" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
                  <div className="flex gap-1">
                    {[["", "Todos"], ["ingreso", "Ingresos"], ["egreso", "Egresos"]].map(([k, l]) => (
                      <button key={k} onClick={() => setF({ ...f, tipo: k })} className={`btn h-10 px-3 ${f.tipo === k ? "bg-primary-soft text-primary-ink" : "border border-border font-semibold text-text-2"}`}>{l}</button>
                    ))}
                  </div>
                  <select className="campo w-auto min-w-[170px]" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
                    <option value="">Todas las categorías</option>
                    {[...new Set([...r.categorias.ingreso, ...r.categorias.egreso])].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <label className="flex h-10 items-center gap-2 text-[13px] text-text-2"><input type="checkbox" className="h-4 w-4" checked={f.anulados} onChange={(e) => setF({ ...f, anulados: e.target.checked })} />Ver anulados</label>
                  {hayFiltros ? <button className="h-10 text-[13px] font-semibold text-primary-ink" onClick={() => setF({ q: "", desde: "", hasta: "", tipo: "", categoria: "", anulados: false })}>Limpiar filtros</button> : null}
                </div>
              </div>
              {movs.cargando && !movs.datos ? <Cargando /> : movs.error ? <div className="p-4"><ErrorCarga mensaje={movs.error} reintentar={movs.recargar} /></div> : !lista.length ? (
                <Vacio icono="receipt_long" titulo={movs.datos?.movimientos.length ? "Sin movimientos con estos filtros" : "Aún no hay movimientos"}>{movs.datos?.movimientos.length ? "Amplía el rango de fechas o cambia el tipo y la categoría." : editar ? "Registra el primero con «Nuevo movimiento»." : ""}</Vacio>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse text-left text-[13.5px]">
                      <thead>
                        <tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3">
                          <th className="px-5 py-2.5">Fecha</th><th className="px-3 py-2.5">Concepto</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Categoría</th><th className="px-3 py-2.5">Proyecto</th><th className="px-3 py-2.5">Documento</th><th className="px-3 py-2.5 text-right">Monto</th><th className="px-5 py-2.5 text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibles.map((m) => (
                          <tr key={m.id} onClick={() => setDetalle(m)} className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${m.anulado ? "text-text-3 line-through" : ""}`}>
                            <td className="num whitespace-nowrap px-5 py-3">{fecha(m.fecha)}</td>
                            <td className="px-3 py-3"><div className="font-semibold">{m.concepto}</div><div className="text-[12px] text-text-3 no-underline">{texto(m.registrado_por)}{m.contraparte ? ` · ${m.contraparte}` : ""}</div></td>
                            <td className="px-3 py-3"><span className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold" style={{ background: m.tipo === "ingreso" ? "var(--success-soft)" : "var(--danger-soft)", color: m.tipo === "ingreso" ? "var(--success)" : "var(--danger)" }}>{m.anulado ? "Anulado" : m.tipo === "ingreso" ? "Ingreso" : "Egreso"}</span></td>
                            <td className="px-3 py-3">{texto(m.categoria)}</td>
                            <td className="px-3 py-3">{m.proyecto_nombre ?? <span className="text-text-3">—</span>}</td>
                            <td className="px-3 py-3">
                              {m.source === "envio_caja_chica" ? <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2 text-[11.5px] font-bold text-text-2"><Icono n="savings" t={14} />Caja chica</span> : m.documento ? <span className="font-mono text-[12px]">{m.documento}</span> : <span className="text-text-3">Sin dato</span>}
                            </td>
                            <td className="num whitespace-nowrap px-3 py-3 text-right font-bold" style={{ color: m.anulado ? undefined : m.tipo === "ingreso" ? "var(--success)" : "var(--text)" }}>{m.tipo === "ingreso" ? "+" : "−"}{dinero(m.monto, mon)}</td>
                            <td className="num whitespace-nowrap px-5 py-3 text-right text-text-2">{m.saldo ? dinero(m.saldo, mon) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-[13px]">
                    <span className="text-text-3">{(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, lista.length)} de {lista.length}</span>
                    <span>Ingresos <b className="num text-success">{dinero(totales.ingresos, mon)}</b> · Egresos <b className="num">{dinero(totales.egresos, mon)}</b></span>
                    <div className="flex gap-1">
                      <button disabled={pagina === 1} onClick={() => setPagina(pagina - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border disabled:opacity-40"><Icono n="chevron_left" t={18} /></button>
                      <span className="grid h-8 min-w-8 place-items-center px-2 font-semibold">{pagina} / {paginas}</span>
                      <button disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border disabled:opacity-40"><Icono n="chevron_right" t={18} /></button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </>
        )
      ) : caja.cargando && !caja.datos ? <Cargando /> : caja.error ? <ErrorCarga mensaje={caja.error} reintentar={caja.recargar} /> : !caja.datos?.disponible ? (
        <div className="tarjeta"><Vacio icono="sync_problem" titulo="La caja chica no está disponible">La API de Finanzas todavía no creó sus tablas en el servidor (o falta actualizarla).</Vacio></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-[13px] text-text-2">
            <Icono n="lock" t={18} />Solo lectura. Los movimientos de caja chica se registran en la app de Finanzas y aparecen aquí al instante.
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="tarjeta flex flex-col gap-1.5 p-5">
              <div className="text-[12.5px] font-semibold text-text-2">Saldo de caja chica</div>
              <div className="num text-[26px] font-extrabold">{dinero(caja.datos.saldo_total)}</div>
              <div className="flex flex-wrap gap-x-4 text-[12.5px] text-text-2">{caja.datos.saldos.map((s) => <span key={s.ciudad}>{s.nombre} <b className="num" style={{ color: esNegativo(s.saldo) ? "var(--danger)" : undefined }}>{dinero(s.saldo)}</b></span>)}</div>
            </div>
            <div className="tarjeta flex flex-col gap-1.5 p-5"><div className="text-[12.5px] font-semibold text-text-2">Ingresos · {mesLargo(caja.datos.mes)}</div><div className="num text-[26px] font-extrabold">{dinero(caja.datos.ingresos_mes)}</div><div className="text-[12px] text-text-3">Fondos de la cuenta principal y envíos desde la caja diaria</div></div>
            <div className="tarjeta flex flex-col gap-1.5 p-5"><div className="text-[12.5px] font-semibold text-text-2">Egresos · {mesLargo(caja.datos.mes)}</div><div className="num text-[26px] font-extrabold">{dinero(caja.datos.egresos_mes)}</div><div className="text-[12px] text-text-3">{caja.datos.gastos_mes} gastos · {caja.datos.sin_comprobante_mes} sin foto del recibo</div></div>
          </div>
          <section className="tarjeta overflow-hidden">
            <div className="border-b border-border px-5 py-4"><div className="titulo-seccion">Últimos movimientos de caja chica</div></div>
            {!caja.datos.movimientos.length ? <Vacio icono="savings" titulo="Sin movimientos" /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-[13.5px]">
                  <thead><tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3"><th className="px-5 py-2.5">Fecha</th><th className="px-3 py-2.5">Concepto</th><th className="px-3 py-2.5">Caja</th><th className="px-3 py-2.5">Origen</th><th className="px-3 py-2.5">Comprobante</th><th className="px-5 py-2.5 text-right">Monto</th></tr></thead>
                  <tbody>
                    {caja.datos.movimientos.map((m) => {
                      const entra = m.tipo !== "EGRESO";
                      return (
                        <tr key={m.id} className="border-b border-border last:border-0">
                          <td className="num whitespace-nowrap px-5 py-3">{fecha(m.fecha)}</td>
                          <td className="px-3 py-3"><div className="font-semibold">{m.descripcion}</div><div className="text-[12px] text-text-3">{[m.persona || null, m.proyecto_nombre ?? m.categoria].filter(Boolean).join(" · ") || "Sin dato"}</div></td>
                          <td className="px-3 py-3">{m.ciudad === "AQP" ? "Arequipa" : m.ciudad === "MOQ" ? "Moquegua" : m.ciudad}</td>
                          <td className="px-3 py-3 text-[12.5px]">{m.tipo === "FONDO" ? "Cuenta principal" : m.tipo === "TRANSFERENCIA" ? "Caja diaria" : m.origen === "CAPTURA" ? "Foto de recibo" : "Manual"}</td>
                          <td className="px-3 py-3">{m.adjuntos.length ? <button className="inline-flex items-center gap-1 font-semibold text-primary-ink hover:underline" onClick={() => setVisor(m.adjuntos.map((a, i) => ({ idCaja: a, titulo: m.descripcion, detalle: `${fecha(m.fecha)} · foto ${i + 1}` })))}><Icono n="attach_file" t={16} />Foto{m.adjuntos.length > 1 ? ` (${m.adjuntos.length})` : ""}</button> : entra ? <span className="text-text-3">—</span> : <span className="text-text-3">Sin dato</span>}</td>
                          <td className="num whitespace-nowrap px-5 py-3 text-right font-bold" style={{ color: entra ? "var(--success)" : undefined }}>{entra ? "+" : "−"}{dinero(m.monto)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {modal === "nuevo" && cuenta ? <NuevoMovimiento cuentas={r.cuentas} cuentaId={cuenta.id} categorias={r.categorias} onCerrar={() => setModal(null)} onHecho={recargarTodo} /> : null}
      {modal === "cuentas" ? <Cuentas cuentas={r.cuentas} editar={editar} onCerrar={() => setModal(null)} onHecho={recargarTodo} /> : null}
      {modal === "fondos" && caja.datos ? <EnviarFondos cuentas={r.cuentas} caja={caja.datos} onCerrar={() => setModal(null)} onHecho={recargarTodo} /> : null}
      {detalle ? <DetalleMovimiento m={detalle} moneda={mon} puedeAnular={editar} onCerrar={() => setDetalle(null)} onHecho={recargarTodo} /> : null}
      {visor ? <VisorFotos fotos={visor} onCerrar={() => setVisor(null)} /> : null}
    </div>
  );
}
