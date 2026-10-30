// Historial de precios (diseño ERP_ICR.zip › Comparador › Historial): precio mensual en soles con IGV de cada proveedor
// para el mismo producto. Colores en orden fijo por proveedor (validados para daltonismo), leyenda, etiqueta al final de cada línea,
// guía al pasar el mouse y la tabla con el origen de cada precio.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { dinero } from "../../dinero";
import { fecha, fechaHora } from "../../formato";
import type { BusquedaProv, DetalleProv, ResultadoProv } from "../../tipos";
import { useDatos } from "../../usarDatos";

const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const color = (i: number) => (i < 5 ? `var(--serie-${i + 1})` : "var(--neutral)");

export function Historial({ id, onElegir }: { id: number | null; onElegir: (id: number | null) => void }) {
  if (!id) return <Elegir onElegir={onElegir} />;
  return <Detalle key={id} id={id} onCambiar={() => onElegir(null)} />;
}

function Elegir({ onElegir }: { onElegir: (id: number) => void }) {
  const avisar = useAvisos();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ResultadoProv[] | null>(null);
  const buscar = async () => {
    if (!q.trim()) return;
    try {
      setRes((await api<BusquedaProv>("GET", "/comparador/buscar", { consulta: { q } })).resultados);
    } catch (x) {
      avisar("No se pudo buscar", msg(x), "error");
    }
  };
  return (
    <div className="tarjeta flex flex-col gap-3 p-5">
      <div className="text-[13.5px] text-text-2">Elige un producto para ver cómo cambió su precio en cada proveedor.</div>
      <div className="flex gap-2">
        <input className="campo flex-1" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void buscar()} placeholder="Producto, modelo o código" />
        <button className="btn-primario" disabled={!q.trim()} onClick={() => void buscar()}><Icono n="search" t={18} />Buscar</button>
      </div>
      {res ? (
        res.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {res.slice(0, 15).map((r) => (
              <li key={r.id}><button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2" onClick={() => onElegir(r.id)}>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold">{r.descripcion}</span><span className="text-[12px] text-text-3">{r.proveedor} · {r.modelo ?? r.codigo ?? "Sin modelo"}</span></span>
                <Icono n="monitoring" t={18} className="text-text-3" />
              </button></li>
            ))}
          </ul>
        ) : <Vacio icono="search_off" titulo="Sin resultados">Prueba con otro nombre o modelo.</Vacio>
      ) : null}
    </div>
  );
}

function Detalle({ id, onCambiar }: { id: number; onCambiar: () => void }) {
  const { datos: d, error, cargando, recargar } = useDatos(() => api<DetalleProv>("GET", `/comparador/productos/${id}`), [id]);
  if (cargando && !d) return <Cargando />;
  if (error || !d) return <ErrorCarga mensaje={error ?? "No se pudo cargar."} reintentar={recargar} />;
  const p = d.producto;
  // Orden fijo de color: por proveedor (id), igual en todos los productos.
  const provs = [...new Map([p, ...d.mismos].map((x) => [x.proveedor, x.proveedor_id])).entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  const meses = [...new Set(Object.values(d.serie).flatMap((s) => Object.keys(s)))].sort();
  return (
    <div className="flex flex-col gap-4">
      <div className="tarjeta flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold">{p.descripcion}</div>
          <div className="text-[12.5px] text-text-2">{p.marca ?? "Marca: Sin dato"} · {p.modelo ?? p.codigo ?? "Modelo: Sin dato"} · {provs.length} proveedor{provs.length === 1 ? "" : "es"} con el mismo producto</div>
        </div>
        <button className="btn-secundario" onClick={onCambiar}><Icono n="swap_horiz" t={18} />Otro producto</button>
      </div>
      <div className="tarjeta p-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <div className="titulo-seccion">Precio por mes · soles con IGV</div>
          <div className="text-[12px] text-text-3">Dólares pasados a soles con el tipo de cambio guardado cuando se obtuvo el precio{d.tipo_cambio ? ` (hoy: ${d.tipo_cambio})` : ""}.</div>
        </div>
        {meses.length ? <Grafico serie={d.serie} provs={provs} meses={meses} /> : <Vacio icono="show_chart" titulo="Aún no hay precios en soles">Falta el tipo de cambio en Configuración para pasar los precios en dólares.</Vacio>}
      </div>
      <div className="tarjeta overflow-x-auto">
        <div className="titulo-seccion px-4 pt-4">Todos los precios registrados</div>
        <table className="mt-2 w-full min-w-[820px] border-collapse text-left text-[12.5px]">
          <thead><tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-text-3">{["Fecha de la lista", "Proveedor", "Precio", "IGV", "TC usado", "Origen", "Obtenido"].map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr></thead>
          <tbody>
            {[...d.historial].reverse().map((h, i) => (
              <tr key={i} className="border-b border-border">
                <td className="px-3 py-1.5">{fecha(h.fecha_lista)}</td>
                <td className="px-3 py-1.5"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: color(provs.indexOf(h.proveedor)) }} />{h.proveedor}</td>
                <td className="num whitespace-nowrap px-3 py-1.5">{dinero(h.precio, h.moneda)}</td>
                <td className="px-3 py-1.5">{h.incluye_igv ? "Incluido" : "Sin IGV"}</td>
                <td className="num px-3 py-1.5">{h.moneda === "USD" ? h.tc_usado ?? "Sin dato" : "—"}</td>
                <td className="max-w-[280px] truncate px-3 py-1.5 text-text-2">{h.origen === "web" ? "Página web · " : "Lista · "}{h.origen_detalle ?? "Sin dato"}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-text-3">{fechaHora(h.obtenido_en)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Grafico({ serie, provs, meses }: { serie: DetalleProv["serie"]; provs: string[]; meses: string[] }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lineas = provs.filter((n) => serie[n]);
  const directas = lineas.length <= 4;
  const M = { izq: 64, der: directas ? 150 : 16, arr: 12, aba: 28 };
  const alto = 260;
  const vals = lineas.flatMap((n) => Object.values(serie[n]).map(Number));
  const { min, max, ticks } = useMemo(() => {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo *= 0.9; hi *= 1.1; }
    const paso = Math.pow(10, Math.floor(Math.log10((hi - lo) / 4)));
    const p = [1, 2, 2.5, 5, 10].map((k) => k * paso).find((s) => (hi - lo) / s <= 5) ?? paso * 10;
    const a = Math.floor(lo / p) * p, b = Math.ceil(hi / p) * p;
    return { min: a, max: b, ticks: Array.from({ length: Math.round((b - a) / p) + 1 }, (_, i) => a + i * p) };
  }, [vals.join()]);
  const x = (i: number) => M.izq + (meses.length === 1 ? (ancho - M.izq - M.der) / 2 : (i * (ancho - M.izq - M.der)) / (meses.length - 1));
  const y = (v: number) => M.arr + (1 - (v - min) / (max - min || 1)) * (alto - M.arr - M.aba);
  const cada = Math.ceil(meses.length / Math.max(2, Math.floor((ancho - M.izq - M.der) / 60)));
  const corto = (v: number) => `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
  const mover = (cx: number) => {
    const i = Math.round(((cx - M.izq) / (ancho - M.izq - M.der || 1)) * (meses.length - 1));
    setHover(Math.min(meses.length - 1, Math.max(0, i)));
  };
  // Etiquetas al final: se separan si quedan encimadas.
  const finales = lineas.map((n) => {
    const ks = meses.filter((m) => serie[n][m]);
    const u = ks[ks.length - 1];
    return { n, i: meses.indexOf(u), v: Number(serie[n][u]) };
  }).sort((a, b) => y(a.v) - y(b.v));
  let previo = -Infinity;
  const posEtiqueta = finales.map((f) => { const yy = Math.max(y(f.v), previo + 15); previo = yy; return { ...f, yy }; });

  return (
    <div>
      {lineas.length >= 2 ? (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-text-2">
          {lineas.map((n) => <span key={n} className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded" style={{ background: color(provs.indexOf(n)) }} />{n}</span>)}
        </div>
      ) : null}
      <div ref={caja} className="relative w-full">
        <svg width={ancho} height={alto} role="img" aria-label="Precio por mes de cada proveedor" className="block select-none"
          onMouseMove={(e) => mover(e.clientX - e.currentTarget.getBoundingClientRect().left)} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.izq} x2={ancho - M.der} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={M.izq - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-3)">{corto(t)}</text>
            </g>
          ))}
          {meses.map((m, i) => (i % cada === 0 || i === meses.length - 1 ? <text key={m} x={x(i)} y={alto - 8} textAnchor="middle" fontSize={11} fill="var(--text-3)">{mes(m)}</text> : null))}
          {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={M.arr} y2={alto - M.aba} stroke="var(--border-strong)" strokeWidth={1} /> : null}
          {lineas.map((n) => {
            const c = color(provs.indexOf(n));
            const pts = meses.map((m, i) => (serie[n][m] ? [x(i), y(Number(serie[n][m]))] : null)).filter(Boolean) as number[][];
            return (
              <g key={n}>
                {pts.length > 1 ? <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={provs.indexOf(n) >= 5 ? "5 4" : undefined} /> : null}
                {pts.map(([px, py], k) => <circle key={k} cx={px} cy={py} r={4} fill={c} stroke="var(--surface)" strokeWidth={2} />)}
              </g>
            );
          })}
          {directas ? posEtiqueta.map((f) => <text key={f.n} x={x(f.i) + 10} y={f.yy + 4} fontSize={11.5} fontWeight={600} fill="var(--text-2)">{f.n.length > 20 ? `${f.n.slice(0, 19)}…` : f.n}</text>) : null}
          <rect x={M.izq} y={M.arr} width={Math.max(0, ancho - M.izq - M.der)} height={alto - M.arr - M.aba} fill="transparent" />
        </svg>
        {hover !== null ? (
          <div className="pointer-events-none absolute top-2 z-10 min-w-[180px] rounded-xl border border-border bg-surface p-2.5 text-[12px] shadow-menu" style={{ left: Math.min(x(hover) + 12, ancho - 200) }}>
            <div className="mb-1 font-bold">{mes(meses[hover])}</div>
            {lineas.map((n) => (
              <div key={n} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-text-2"><span className="inline-block h-2 w-2 rounded-full" style={{ background: color(provs.indexOf(n)) }} />{n}</span>
                <span className="num font-semibold">{serie[n][meses[hover]] ? dinero(serie[n][meses[hover]]) : "Sin dato"}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
