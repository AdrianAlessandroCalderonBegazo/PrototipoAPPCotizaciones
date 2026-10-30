// Buscador (diseño ERP_ICR.zip › Comparador › Buscador): resultados de todos los proveedores ordenados por costo total,
// la mejor opción (coincidencia exacta con precio vigente) y la trazabilidad de cada precio.
import { useMemo, useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { dinero } from "../../dinero";
import { fecha, fechaHora } from "../../formato";
import type { BusquedaProv, ResultadoProv } from "../../tipos";

const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);
const COINC: Record<ResultadoProv["coincidencia"], [string, string, string]> = {
  exacta: ["Exacta", "var(--success-soft)", "var(--success)"],
  alternativa: ["Alternativa – verificar", "var(--warning-soft)", "var(--warning)"],
  distinta: ["No es el mismo", "var(--neutral-soft)", "var(--neutral)"],
};
const EJEMPLOS = ["MultiPlus-II 48/3000/35-32", "BlueSolar MPPT 150/35", "SmartSolar MPPT 250/100", "Batería litio 5 kWh 48V"];

function Chip({ on, l, go }: { on: boolean; l: string; go: () => void }) {
  return <button onClick={go} className={`h-8 rounded-full border px-3 text-[12.5px] font-semibold ${on ? "border-primary bg-primary-soft text-primary-ink" : "border-border-strong bg-surface text-text-2"}`}>{l}</button>;
}

export function Buscador({ editar, onHistorial }: { editar: boolean; onHistorial: (id: number) => void }) {
  const avisar = useAvisos();
  const [q, setQ] = useState("");
  const [r, setR] = useState<BusquedaProv | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [fProv, setFProv] = useState<string[]>([]);
  const [fMarca, setFMarca] = useState<string[]>([]);
  const [fMatch, setFMatch] = useState<"todas" | "exacta" | "alternativa">("todas");
  const [fStock, setFStock] = useState(false);
  const [pmax, setPmax] = useState("");
  const [verDistintas, setVerDistintas] = useState(false);

  const buscar = async (texto = q) => {
    if (!texto.trim()) return;
    setQ(texto);
    setBuscando(true);
    try {
      setR(await api<BusquedaProv>("GET", "/comparador/buscar", { consulta: { q: texto, distintas: verDistintas ? "1" : undefined } }));
      setAbierto(null);
    } catch (x) {
      avisar("No se pudo buscar", msg(x), "error");
    } finally {
      setBuscando(false);
    }
  };
  const decidir = async (b: ResultadoProv, estado: "confirmada" | "rechazada" | "quitar") => {
    if (!r?.referencia) return;
    try {
      await api("POST", "/comparador/equivalencias", { cuerpo: { a_id: r.referencia.id, b_id: b.id, estado } });
      avisar(estado === "confirmada" ? "Guardado: es el mismo producto" : estado === "rechazada" ? "Guardado: no es el mismo producto" : "Decisión quitada", "Se respeta en las próximas búsquedas.");
      void buscar();
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    }
  };

  const provs = useMemo(() => [...new Set(r?.resultados.map((x) => x.proveedor) ?? [])], [r]);
  const marcas = useMemo(() => [...new Set(r?.resultados.map((x) => x.marca).filter(Boolean) as string[])], [r]);
  const lista = useMemo(() => (r?.resultados ?? []).filter((x) =>
    (!fProv.length || fProv.includes(x.proveedor)) && (!fMarca.length || (x.marca && fMarca.includes(x.marca)))
    && (fMatch === "todas" || (fMatch === "exacta" ? x.coincidencia === "exacta" : x.coincidencia !== "exacta"))
    && (!fStock || /stock|dispon/i.test(x.disponibilidad ?? "")) && (!pmax || (x.total !== null && Number(x.total) <= Number(pmax)))), [r, fProv, fMarca, fMatch, fStock, pmax]);
  const mejor = lista.find((x) => x.id === r?.mejor?.id) ?? null;
  const tog = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="flex flex-col gap-4">
      <div className="tarjeta flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[240px] flex-1">
          <Icono n="search" className="pointer-events-none absolute left-3 top-2.5 text-text-3" />
          <input className="campo pl-10" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void buscar()} placeholder="Producto, modelo o código (ej. MultiPlus-II 48/3000)" />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-text-2"><input type="checkbox" checked={verDistintas} onChange={(e) => setVerDistintas(e.target.checked)} />Ver los marcados «no es el mismo»</label>
        <button className="btn-primario" disabled={buscando || !q.trim()} onClick={() => void buscar()}><Icono n="auto_awesome" t={18} />{buscando ? "Buscando…" : "Buscar"}</button>
      </div>

      {!r ? (
        <div className="tarjeta p-6">
          <Vacio icono="compare_arrows" titulo="Compara precios entre proveedores">Busca por nombre, modelo o código. Se comparan las listas cargadas y las páginas web, en soles con IGV.</Vacio>
          <div className="mt-3 flex flex-wrap justify-center gap-2">{EJEMPLOS.map((e) => <button key={e} className="btn-secundario h-9" onClick={() => void buscar(e)}>{e}</button>)}</div>
        </div>
      ) : (
        <div className="grid gap-4 2xl:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="tarjeta flex h-fit flex-wrap items-start gap-x-8 gap-y-4 p-4 2xl:flex-col 2xl:flex-nowrap">
            <div className="flex w-full items-center justify-between"><div className="titulo-seccion">Filtros</div><button className="text-[12.5px] font-semibold text-primary-ink" onClick={() => { setFProv([]); setFMarca([]); setFMatch("todas"); setFStock(false); setPmax(""); }}>Limpiar</button></div>
            {[["Proveedor", provs, fProv, setFProv], ["Marca", marcas, fMarca, setFMarca]].map(([l, ops, sel, set]) => (ops as string[]).length ? (
              <div key={l as string}><div className="etiqueta">{l as string}</div><div className="flex flex-wrap gap-1.5">{(ops as string[]).map((o) => <Chip key={o} on={(sel as string[]).includes(o)} l={o} go={() => tog(sel as string[], set as (v: string[]) => void, o)} />)}</div></div>
            ) : null)}
            <div><div className="etiqueta">Coincidencia</div><div className="flex flex-wrap gap-1.5">{(["todas", "exacta", "alternativa"] as const).map((m) => <Chip key={m} on={fMatch === m} l={m === "todas" ? "Todas" : m === "exacta" ? "Exacta" : "Alternativa"} go={() => setFMatch(m)} />)}</div></div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={fStock} onChange={(e) => setFStock(e.target.checked)} />Solo en stock</label>
            <label className="w-[170px]"><span className="etiqueta">Precio máx. (S/)</span><input className="campo num" inputMode="decimal" value={pmax} onChange={(e) => setPmax(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
          </aside>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="text-[13px] text-text-2">
              {r.interpretado.length ? <>Se buscó: <b>{r.interpretado.join(" · ")}</b> · </> : null}{lista.length} resultado{lista.length === 1 ? "" : "s"} de {r.proveedores} proveedor{r.proveedores === 1 ? "" : "es"} · el mismo producto primero, luego alternativas; cada grupo por costo total
              {r.referencia ? <> · «exacta» = el mismo producto que <b>{r.referencia.descripcion}</b> ({r.referencia.proveedor})</> : null}
              {r.tipo_cambio ? <> · TC US$ 1 = S/ {r.tipo_cambio}</> : <span className="text-warning"> · Falta el tipo de cambio: los precios en dólares no se pasan a soles</span>}
            </div>
            {mejor ? (
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4" style={{ background: "var(--success-soft)", borderColor: "var(--success)" }}>
                <Icono n="workspace_premium" t={30} className="text-success" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold uppercase tracking-wide text-success">Mejor opción · coincidencia exacta y precio vigente</div>
                  <div className="truncate text-[15px] font-extrabold">{mejor.proveedor} · {mejor.descripcion}</div>
                  <div className="text-[12.5px] text-text-2">{mejor.disponibilidad ?? "Disponibilidad: Sin dato"} · {mejor.costo_envio === null ? "costos adicionales: Sin dato" : Number(mejor.costo_envio) ? `envío ${dinero(mejor.costo_envio)}` : "envío incluido"}</div>
                </div>
                <div className="text-right"><div className="num text-[22px] font-extrabold">{dinero(mejor.total)}</div>{r.mejor?.ahorro ? <div className="text-[12.5px] font-semibold text-success">Ahorro {dinero(r.mejor.ahorro)} vs. el siguiente</div> : null}</div>
              </div>
            ) : null}
            {!lista.length ? (
              <div className="tarjeta"><Vacio icono="search_off" titulo="Ningún resultado con estos filtros">Quita filtros o permite coincidencias alternativas.</Vacio></div>
            ) : (
              <div className="tarjeta overflow-x-auto">
                <table className="w-full min-w-[1000px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[11.5px] font-bold uppercase tracking-wide text-text-3">
                      {["Proveedor", "Descripción", "Modelo / código", "Precio", "En soles (con IGV)", "Disponibilidad", "Costos adic.", "Costo total ↑", "Coincidencia · fecha"].map((c, i) => <th key={c} className={`px-3 py-2.5 ${[3, 4, 6, 7].includes(i) ? "text-right" : ""} ${i === 7 ? "text-primary-ink" : ""}`}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((x) => {
                      const esMejor = x.id === mejor?.id;
                      const [cl, cbg, cfg] = COINC[x.coincidencia];
                      return [
                        <tr key={x.id} onClick={() => setAbierto(abierto === x.id ? null : x.id)} className="cursor-pointer border-b border-border hover:bg-surface-2" style={esMejor ? { background: "var(--success-soft)", boxShadow: "inset 3px 0 0 var(--success)" } : undefined}>
                          <td className="px-3 py-2.5 font-semibold">{x.proveedor}{esMejor ? <div className="text-[10.5px] font-extrabold text-success">MEJOR OPCIÓN</div> : null}</td>
                          <td className="max-w-[280px] px-3 py-2.5">{x.descripcion}</td>
                          <td className="px-3 py-2.5 font-mono text-[12px]">{x.modelo ?? x.codigo ?? "Sin dato"}</td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-right">{dinero(x.precio, x.moneda)}<div className="text-[11px] text-text-3">{x.incluye_igv ? "con IGV" : "sin IGV"}</div></td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-right">{x.soles ? dinero(x.soles) : "Sin dato"}</td>
                          <td className="px-3 py-2.5" style={{ color: !x.disponibilidad ? "var(--text-3)" : /stock/i.test(x.disponibilidad) ? "var(--success)" : undefined }}>{x.disponibilidad ?? "Sin dato"}</td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-right text-text-2">{x.costo_envio === null ? "Sin dato" : Number(x.costo_envio) ? `+ ${dinero(x.costo_envio)}` : "Incluido"}</td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-right font-extrabold">{x.total ? `${dinero(x.total)}${x.costo_envio === null ? " +" : ""}` : "Sin dato"}</td>
                          <td className="px-3 py-2.5"><span className="inline-flex h-6 items-center rounded-full px-2 text-[11.5px] font-bold" style={{ background: cbg, color: cfg }}>{cl}</span><div className="mt-0.5 text-[11.5px]" style={{ color: x.vigente ? "var(--text-3)" : "var(--danger)" }}>{x.vigente ? "Vigente" : "Desactualizado"} · {fecha(x.fecha_lista)}</div></td>
                        </tr>,
                        abierto === x.id ? (
                          <tr key={`${x.id}-d`} className="border-b border-border bg-surface-2">
                            <td colSpan={9} className="px-4 py-3 text-[12.5px]">
                              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 font-bold text-text-2"><Icono n={x.origen === "web" ? "travel_explore" : "list_alt"} t={15} />{x.origen === "web" ? "Página web" : "Lista de proveedor"}</span>
                                <span><b>Origen:</b> {x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.origen_detalle ?? x.url}</a> : x.origen_detalle ?? "Sin dato"}</span>
                                <span><b>Fecha de la lista:</b> {fecha(x.fecha_lista)} · <b>obtenido:</b> {fechaHora(x.obtenido_en)}</span>
                                <span><b>Estado:</b> {x.vigente ? "Vigente" : `Desactualizado (más de ${r.vigencia_dias} días)`}</span>
                                {x.moneda === "USD" ? <span><b>TC usado:</b> {r.tipo_cambio ?? "Sin dato"}</span> : null}
                                {x.categoria ? <span><b>Categoría:</b> {x.categoria}</span> : null}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button className="btn-secundario h-8" onClick={() => onHistorial(x.id)}><Icono n="monitoring" t={16} />Ver historial de precios</button>
                                {editar && r.referencia && x.id !== r.referencia.id ? (
                                  <>
                                    <button className="btn-secundario h-8" onClick={() => void decidir(x, "confirmada")}><Icono n="check" t={16} />Es el mismo producto</button>
                                    <button className="btn-secundario h-8" onClick={() => void decidir(x, "rechazada")}><Icono n="block" t={16} />No es el mismo</button>
                                    {x.decidida ? <button className="btn-secundario h-8" onClick={() => void decidir(x, "quitar")}>Quitar decisión</button> : null}
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[12px] text-text-3">Haz clic en una fila para ver de dónde salió el precio. Costo total = precio en soles con IGV + costos adicionales conocidos («+» = hay costos sin dato).</p>
          </div>
        </div>
      )}
    </div>
  );
}
