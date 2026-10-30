// Almacén (Fase 9): inventario con stock y mínimo, kardex de cada artículo, movimientos (entradas, salidas, ajustes) y,
// para consulta, los requerimientos y salidas de herramientas que se registran en la app de Logística.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Pildora } from "../../componentes/Pildora";
import { cuando } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { Articulo, ListaArticulos, MovAlmacen, TipoMovAlmacen } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { ConsultaLogistica } from "./Logistica";
import { cant, ModalArticulo, ModalCatalogo, ModalKardex, ModalMovimiento, TablaMovimientos, TIPO_MOV } from "./Modales";

const TABS = [
  { k: "inventario", l: "Inventario", i: "inventory_2" },
  { k: "movimientos", l: "Movimientos", i: "swap_vert" },
  { k: "req", l: "Requerimientos de materiales", i: "assignment" },
  { k: "her", l: "Salidas de herramientas", i: "handyman" },
] as const;
type Tab = (typeof TABS)[number]["k"];

export function Almacen() {
  const { usuario } = useSesion();
  const editar = puede(usuario, "almacen", "completo");
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.k === params.get("tab"))?.k ?? "inventario";
  const lista = useDatos(() => api<ListaArticulos>("GET", "/almacen/articulos", { consulta: { inactivos: "1" } }));
  const [mover, setMover] = useState<{ tipo?: TipoMovAlmacen; articulo_id?: number; requerimiento?: number } | null>(null);
  const [kardex, setKardex] = useState<number | null>(null);
  const [form, setForm] = useState<Articulo | "nuevo" | null>(null);
  const [catalogo, setCatalogo] = useState(false);
  const [version, setVersion] = useState(0);
  const refrescar = () => { void lista.recargar(); setVersion((v) => v + 1); };
  const r = lista.datos?.resumen;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="sobretitulo">Operación</div><h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Almacén</h1></div>
        {editar ? (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secundario" onClick={() => setCatalogo(true)}><Icono n="library_add" t={18} />Desde el catálogo</button>
            <button className="btn-secundario" onClick={() => setForm("nuevo")}><Icono n="add" t={18} />Nuevo artículo</button>
            <button className="btn-primario" onClick={() => setMover({})}><Icono n="swap_vert" t={18} />Registrar movimiento</button>
          </div>
        ) : null}
      </div>

      {r ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {([["Artículos", r.articulos, "inventory_2", undefined, undefined], ["En o bajo el mínimo", r.bajos, "warning", r.bajos ? "var(--warning)" : undefined, "bajo"], ["Sin stock", r.sin_stock, "remove_shopping_cart", r.sin_stock ? "var(--danger)" : undefined, "cero"]] as const).map(([l, v, i, c, filtro]) => (
            <button key={l} disabled={!filtro} onClick={() => filtro && setParams({ tab: "inventario", [filtro]: "1" })} className="tarjeta flex items-center gap-3 p-3 text-left enabled:hover:border-primary-line sm:p-4">
              <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 sm:grid" style={{ color: c ?? "var(--text-2)" }}><Icono n={i} /></span>
              <span><span className="block text-[10.5px] font-bold uppercase tracking-wide text-text-3 sm:text-[11.5px]">{l}</span><span className="num text-[24px] font-extrabold" style={{ color: c }}>{v}</span></span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setParams({ tab: t.k })} className={`btn h-10 px-4 ${tab === t.k ? "bg-primary-soft text-primary-ink" : "font-semibold text-text-2 hover:bg-surface-2"}`}><Icono n={t.i} t={18} />{t.l}</button>
        ))}
      </div>

      {tab === "inventario" ? (
        lista.cargando && !lista.datos ? <Cargando /> : lista.error ? <ErrorCarga mensaje={lista.error} reintentar={lista.recargar} /> : (
          <Inventario datos={lista.datos!} editar={editar} params={params} setParams={setParams} onAbrir={setKardex} onNuevo={() => setForm("nuevo")} onCatalogo={() => setCatalogo(true)} onEditar={setForm} />
        )
      ) : tab === "movimientos" ? (
        <Movimientos key={version} editar={editar} onCambio={refrescar} />
      ) : (
        <ConsultaLogistica key={tab} pestana={tab} onSalida={editar && tab === "req" ? (id) => setMover({ requerimiento: id }) : undefined} />
      )}

      {mover && lista.datos ? <ModalMovimiento articulos={lista.datos.articulos} inicial={mover} requerimiento={mover.requerimiento} onCerrar={() => setMover(null)} onHecho={() => { setMover(null); refrescar(); }} /> : null}
      {kardex ? <ModalKardex id={kardex} editar={editar} onCerrar={() => setKardex(null)} onCambio={refrescar} onMover={(tipo) => { const id = kardex; setKardex(null); setMover({ tipo, articulo_id: id }); }} /> : null}
      {form ? <ModalArticulo a={form === "nuevo" ? null : form} categorias={lista.datos?.categorias ?? []} onCerrar={() => setForm(null)} onHecho={() => { setForm(null); refrescar(); }} /> : null}
      {catalogo ? <ModalCatalogo onCerrar={() => setCatalogo(false)} onHecho={() => { setCatalogo(false); refrescar(); }} /> : null}
    </div>
  );
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Inventario({ datos, editar, params, setParams, onAbrir, onNuevo, onCatalogo, onEditar }: {
  datos: ListaArticulos; editar: boolean; params: URLSearchParams; setParams: (p: Record<string, string>) => void;
  onAbrir: (id: number) => void; onNuevo: () => void; onCatalogo: () => void; onEditar: (a: Articulo) => void;
}) {
  const [q, setQ] = useState("");
  const cat = params.get("categoria") ?? "";
  const bajo = params.get("bajo") === "1";
  const cero = params.get("cero") === "1";
  const inactivos = params.get("inactivos") === "1";
  const filtro = (k: string, v: string | null) => {
    const p: Record<string, string> = Object.fromEntries(params.entries());
    if (v) p[k] = v;
    else delete p[k];
    setParams({ ...p, tab: "inventario" });
  };
  const lista = useMemo(() => datos.articulos.filter((a) => (inactivos || a.activo) && (!cat || a.categoria === cat) && (!bajo || a.bajo) && (!cero || Number(a.stock) === 0)
    && (!q.trim() || sinTildes(`${a.codigo ?? ""} ${a.nombre} ${a.categoria ?? ""} ${a.ubicacion ?? ""}`).includes(sinTildes(q.trim())))), [datos, q, cat, bajo, cero, inactivos]);

  if (!datos.articulos.length) {
    return (
      <div className="tarjeta p-6">
        <Vacio icono="inventory_2" titulo="El inventario está vacío">Crea los artículos que guardas en el almacén (o tráelos del catálogo de Cotización) con lo que hay hoy como stock inicial.</Vacio>
        {editar ? <div className="mt-3 flex justify-center gap-2"><button className="btn-secundario" onClick={onCatalogo}><Icono n="library_add" t={18} />Desde el catálogo</button><button className="btn-primario" onClick={onNuevo}><Icono n="add" t={18} />Nuevo artículo</button></div> : null}
      </div>
    );
  }
  return (
    <div className="tarjeta flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="min-w-[220px] flex-[2]"><span className="etiqueta">Buscar</span><input className="campo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, código o ubicación" /></label>
        <label className="min-w-[170px] flex-1"><span className="etiqueta">Categoría</span>
          <select className="campo" value={cat} onChange={(e) => filtro("categoria", e.target.value || null)}><option value="">Todas</option>{datos.categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <label className="flex h-11 items-center gap-2 text-[13px]"><input type="checkbox" checked={bajo} onChange={(e) => filtro("bajo", e.target.checked ? "1" : null)} />En o bajo el mínimo</label>
        <label className="flex h-11 items-center gap-2 text-[13px]"><input type="checkbox" checked={cero} onChange={(e) => filtro("cero", e.target.checked ? "1" : null)} />Sin stock</label>
        <label className="flex h-11 items-center gap-2 text-[13px]"><input type="checkbox" checked={inactivos} onChange={(e) => filtro("inactivos", e.target.checked ? "1" : null)} />Ver desactivados</label>
      </div>
      {!lista.length ? <Vacio icono="search_off" titulo="Ningún artículo con estos filtros" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-[11.5px] font-bold uppercase tracking-wide text-text-3">
                <th className="px-3 py-2.5">Artículo</th><th className="px-3 py-2.5">Categoría</th><th className="px-3 py-2.5">Ubicación</th><th className="px-3 py-2.5 text-right">Stock</th><th className="px-3 py-2.5 text-right">Mínimo</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5">Último movimiento</th>{editar ? <th className="px-3 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => {
                const sin = Number(a.stock) === 0;
                return (
                  <tr key={a.id} onClick={() => onAbrir(a.id)} className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${a.activo ? "" : "opacity-60"}`}>
                    <td className="px-3 py-2.5"><div className="font-semibold">{a.nombre}</div><div className="font-mono text-[11.5px] text-text-3">{a.codigo ?? "Sin código"}</div></td>
                    <td className="px-3 py-2.5 text-text-2">{a.categoria ?? "Sin dato"}</td>
                    <td className="px-3 py-2.5 text-text-2">{a.ubicacion ?? "Sin dato"}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right font-extrabold" style={{ color: sin ? "var(--danger)" : a.bajo ? "var(--warning)" : undefined }}>{cant(a.stock)} <span className="font-medium text-text-3">{a.unidad}</span></td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right text-text-2">{a.stock_minimo ? cant(a.stock_minimo) : "—"}</td>
                    <td className="px-3 py-2.5">{!a.activo ? <Pildora tono="neutro">Desactivado</Pildora> : sin ? <Pildora tono="peligro">Sin stock</Pildora> : a.bajo ? <Pildora tono="aviso">Bajo el mínimo</Pildora> : <Pildora tono="exito">Con stock</Pildora>}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-text-3">{a.ultimo_movimiento ? cuando(a.ultimo_movimiento) : "Ninguno"}</td>
                    {editar ? <td className="px-3 py-2.5 text-right"><button className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface" title="Editar" onClick={(e) => { e.stopPropagation(); onEditar(a); }}><Icono n="edit" t={18} /></button></td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-text-3">Haz clic en un artículo para ver su kardex (todas sus entradas y salidas).</p>
    </div>
  );
}

function Movimientos({ editar, onCambio }: { editar: boolean; onCambio: () => void }) {
  const [f, setF] = useState({ tipo: "", desde: "", hasta: "" });
  const movs = useDatos(() => api<MovAlmacen[]>("GET", "/almacen/movimientos", { consulta: f }), [f.tipo, f.desde, f.hasta]);
  return (
    <div className="tarjeta flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="min-w-[160px] flex-1"><span className="etiqueta">Tipo</span>
          <select className="campo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="">Todos</option>{Object.entries(TIPO_MOV).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="min-w-[150px] flex-1"><span className="etiqueta">Desde</span><input className="campo" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
        <label className="min-w-[150px] flex-1"><span className="etiqueta">Hasta</span><input className="campo" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
      </div>
      {movs.cargando && !movs.datos ? <Cargando /> : movs.error ? <ErrorCarga mensaje={movs.error} reintentar={movs.recargar} /> : (
        <TablaMovimientos movs={movs.datos ?? []} editar={editar} onCambio={() => { void movs.recargar(); onCambio(); }} />
      )}
    </div>
  );
}
