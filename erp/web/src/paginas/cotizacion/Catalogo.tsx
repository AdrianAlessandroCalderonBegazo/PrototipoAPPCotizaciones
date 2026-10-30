import { useEffect, useMemo, useRef, useState } from "react";
import { api, subirImagen } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { aSoles, dinero, leerMonto } from "../../dinero";
import { fecha, texto } from "../../formato";
import type { Parametros, Producto } from "../../tipos";
import { Miniatura } from "./comun";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const POR_PAGINA = 48;

function leerVista(): "grilla" | "tabla" {
  try {
    return localStorage.getItem("erp.catalogo.vista") === "tabla" ? "tabla" : "grilla";
  } catch {
    return "grilla";
  }
}

/** Precio en soles (si el producto está en dólares, convertido con el tipo de cambio de Configuración). */
export function enSoles(p: Producto, tc: string | null | undefined): string | null {
  if (!p.precio) return null;
  return p.moneda === "USD" ? aSoles(p.precio, tc ?? null) : p.precio;
}

type Form = { codigo: string; nombre: string; marca: string; modelo: string; categoria: string; unidad: string; precio: string; costo: string; moneda: "PEN" | "USD"; caracteristicas: string; imagen?: string | null };

function DetalleProducto({ p, editar, tc, categorias, onCerrar, onGuardado, onAgregar, textoAgregar }: {
  p: Producto | null; editar: boolean; tc: string | null | undefined; categorias: string[]; onCerrar: () => void; onGuardado: (p: Producto) => void;
  onAgregar?: (p: Producto) => void; textoAgregar?: string;
}) {
  const avisar = useAvisos();
  const [modo, setModo] = useState<"ver" | "editar">(p ? "ver" : "editar");
  const [f, setF] = useState<Form>(() => ({
    codigo: p?.codigo ?? "", nombre: p?.nombre ?? "", marca: p?.marca ?? "", modelo: p?.modelo ?? "", categoria: p?.categoria ?? "", unidad: p?.unidad ?? "Unidades",
    precio: p?.precio ?? "", costo: p?.costo ?? "", moneda: p?.moneda ?? "PEN", caracteristicas: p?.caracteristicas ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const guardar = async () => {
    if (!f.nombre.trim()) return setError("Escribe el nombre del producto.");
    if (f.precio && !leerMonto(f.precio)) return setError("El precio no es un monto válido.");
    if (f.costo && !leerMonto(f.costo)) return setError("El costo no es un monto válido.");
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = { ...f, precio: f.precio ? leerMonto(f.precio) : null, costo: f.costo ? leerMonto(f.costo) : null };
      const r = p ? await api<Producto>("PUT", `/catalogo/${p.id}`, { cuerpo }) : await api<Producto>("POST", "/catalogo", { cuerpo });
      avisar(p ? "Producto actualizado" : "Producto agregado", r.nombre);
      onGuardado(r);
      if (!p) onCerrar();
      else setModo("ver");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };
  const cambiarImagen = async (a: File | undefined) => {
    if (!a || !p) return;
    try {
      const ruta = await subirImagen(a);
      const r = await api<Producto>("PUT", `/catalogo/${p.id}`, { cuerpo: { imagen: ruta } });
      onGuardado(r);
      avisar("Imagen actualizada");
    } catch (e) {
      avisar("No se pudo subir la imagen", e instanceof Error ? e.message : undefined, "error");
    }
  };
  const soles = p ? enSoles(p, tc) : null;
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "var(--overlay)" }} onMouseDown={onCerrar} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[460px] flex-col border-l border-border bg-surface shadow-menu" style={{ animation: "icrIn .15s ease" }}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="text-[15px] font-bold">{p ? (modo === "ver" ? "Detalle de producto" : "Editar producto") : "Nuevo producto"}</div>
          <button className="grid h-9 w-9 place-items-center rounded-[10px] text-text-3 hover:bg-surface-2" onClick={onCerrar} title="Cerrar"><Icono n="close" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {p && modo === "ver" ? (
            <div className="flex flex-col gap-4">
              <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-border bg-white">
                {p.imagen ? <img src={p.imagen} alt={p.nombre} className="h-full w-full object-contain" /> : <span className="text-[13px] text-text-3">Sin imagen</span>}
                {editar ? (
                  <>
                    <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void cambiarImagen(e.target.files?.[0])} />
                    <button onClick={() => archivo.current?.click()} className="absolute bottom-2 right-2 inline-flex h-8 items-center gap-1 rounded-lg bg-black/60 px-2.5 text-[12px] font-semibold text-white"><Icono n="photo_camera" t={16} />Cambiar</button>
                  </>
                ) : null}
              </div>
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wide text-text-3">{[p.marca, p.categoria].filter(Boolean).join(" · ")}</div>
                <div className="mt-0.5 text-[18px] font-extrabold leading-tight">{p.nombre}</div>
                <div className="mt-1 font-mono text-[12.5px] text-text-2">{p.codigo ?? "Código: Sin dato"}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border p-3">
                  <div className="text-[12px] text-text-3">Precio de venta (con IGV)</div>
                  <div className="num text-[18px] font-extrabold">{dinero(p.precio, p.moneda)}</div>
                  {p.moneda === "USD" ? <div className="num text-[12px] text-text-3">{soles ? `≈ ${dinero(soles)}` : "TC: Sin dato"}</div> : null}
                </div>
                <div className="rounded-xl border border-border p-3">
                  <div className="text-[12px] text-text-3">Costo</div>
                  <div className="num text-[18px] font-extrabold">{p.costo === undefined ? "—" : dinero(p.costo, p.moneda)}</div>
                  <div className="text-[12px] text-text-3">{p.costo === undefined ? "Solo con acceso completo" : "Sin IGV"}</div>
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[13px] font-bold">Características</div>
                {p.caracteristicas ? <div className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-[13px] text-text-2">{p.caracteristicas}</div> : <div className="text-[13px] text-text-3">Sin dato</div>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                <div><span className="text-text-3">Modelo</span><div className="font-semibold">{texto(p.modelo)}</div></div>
                <div><span className="text-text-3">Unidad</span><div className="font-semibold">{texto(p.unidad)}</div></div>
                <div><span className="text-text-3">Referencia interna</span><div className="font-semibold">{texto(p.referencia_interna)}</div></div>
                <div><span className="text-text-3">Precio actualizado</span><div className="font-semibold">{p.precio_actualizado_en ? fecha(p.precio_actualizado_en) : "Sin dato"}</div></div>
              </div>
              <div className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-text-2">
                <Icono n={p.source === "csv" ? "list_alt" : "inventory_2"} t={15} />
                {p.source === "csv" ? "Lista de precios (CSV)" : p.source === "erp" ? "Registrado en el ERP" : "Catálogo de Logística"}
              </div>
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="etiqueta">Nombre</span><input className="campo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
              <label><span className="etiqueta">Código</span><input className="campo font-mono" placeholder="Ej. HW-50KTL" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} /></label>
              <label><span className="etiqueta">Marca</span><input className="campo" value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} /></label>
              <label><span className="etiqueta">Modelo</span><input className="campo" value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></label>
              <label>
                <span className="etiqueta">Categoría</span>
                <input className="campo" list="cats-erp" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} />
                <datalist id="cats-erp">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label><span className="etiqueta">Precio de venta (con IGV)</span><input className="campo num" inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} /></label>
              <label><span className="etiqueta">Moneda</span><select className="campo" value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value as "PEN" | "USD" })}><option value="PEN">Soles</option><option value="USD">Dólares</option></select></label>
              <label><span className="etiqueta">Costo (opcional)</span><input className="campo num" inputMode="decimal" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} /></label>
              <label><span className="etiqueta">Unidad</span><input className="campo" value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} /></label>
              <label className="sm:col-span-2"><span className="etiqueta">Características</span><textarea className="campo h-auto py-2.5" rows={4} placeholder={"Potencia: 50 kW\nGarantía: 10 años"} value={f.caracteristicas} onChange={(e) => setF({ ...f, caracteristicas: e.target.value })} /></label>
              {error ? <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger sm:col-span-2">{error}</div> : null}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          {p && modo === "ver" ? (
            <>
              {editar ? <button className="btn-secundario" onClick={() => setModo("editar")}><Icono n="edit" t={18} />Editar</button> : null}
              {onAgregar ? <button className="btn-primario" onClick={() => onAgregar(p)}><Icono n="add" t={18} />{textoAgregar}</button> : null}
            </>
          ) : (
            <>
              <button className="btn-secundario" onClick={() => (p ? setModo("ver") : onCerrar())}>Cancelar</button>
              <button className="btn-primario" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export function Catalogo({ productos, setProductos, editar, param, nuevo, onNuevoCerrado, onAgregar, textoAgregar }: {
  productos: Producto[]; setProductos: (f: (p: Producto[]) => Producto[]) => void; editar: boolean; param: Parametros | null;
  nuevo: boolean; onNuevoCerrado: () => void; onAgregar?: (p: Producto) => void; textoAgregar?: string;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [marca, setMarca] = useState("");
  const [pmin, setPmin] = useState("");
  const [pmax, setPmax] = useState("");
  const [vista, setVistaRaw] = useState(leerVista);
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<Producto | null>(null);
  const tc = param?.tipo_cambio.valor;
  const setVista = (v: "grilla" | "tabla") => {
    setVistaRaw(v);
    try {
      localStorage.setItem("erp.catalogo.vista", v);
    } catch {
      // no pasa nada
    }
  };
  const categorias = useMemo(() => [...new Set(productos.map((p) => p.categoria))].sort(), [productos]);
  const marcas = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of productos) if (p.marca && (!cat || p.categoria === cat)) m.set(p.marca, (m.get(p.marca) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  }, [productos, cat]);
  const filas = useMemo(() => {
    const t = sinTildes(q.trim());
    const min = pmin ? Number(leerMonto(pmin) ?? NaN) : null;
    const max = pmax ? Number(leerMonto(pmax) ?? NaN) : null;
    return productos.filter((p) => {
      if (cat && p.categoria !== cat) return false;
      if (marca && p.marca !== marca) return false;
      if (t && !sinTildes(`${p.nombre} ${p.codigo ?? ""} ${p.marca ?? ""} ${p.modelo ?? ""} ${p.referencia_interna ?? ""}`).includes(t)) return false;
      const s = enSoles(p, tc);
      if ((min !== null || max !== null) && !s) return false;
      if (min !== null && !Number.isNaN(min) && Number(s) < min) return false;
      if (max !== null && !Number.isNaN(max) && Number(s) > max) return false;
      return true;
    });
  }, [productos, q, cat, marca, pmin, pmax, tc]);
  useEffect(() => setPagina(1), [q, cat, marca, pmin, pmax]);
  const visibles = filas.slice(0, pagina * POR_PAGINA);
  const guardado = (p: Producto) => {
    setProductos((lista) => (lista.some((x) => x.id === p.id) ? lista.map((x) => (x.id === p.id ? p : x)) : [p, ...lista]));
    setAbierto((a) => (a && a.id === p.id ? p : a));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-[2]">
          <Icono n="search" className="pointer-events-none absolute left-3 top-2.5 text-text-3" />
          <input className="campo pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, modelo o código" />
        </div>
        <select className="campo w-auto min-w-[190px] flex-1" value={cat} onChange={(e) => { setCat(e.target.value); setMarca(""); }}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-1.5 text-[13px] text-text-2">S/
          <input className="campo num h-10 w-24" placeholder="mín." value={pmin} onChange={(e) => setPmin(e.target.value)} />–
          <input className="campo num h-10 w-24" placeholder="máx." value={pmax} onChange={(e) => setPmax(e.target.value)} />
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {([["grilla", "Tarjetas", "grid_view"], ["tabla", "Tabla", "table_rows"]] as const).map(([k, l, i]) => (
            <button key={k} title={l} onClick={() => setVista(k)} className={`btn h-8 px-2.5 text-[12.5px] ${vista === k ? "bg-primary-soft text-primary-ink" : "text-text-2"}`}><Icono n={i} t={18} /><span className="hidden sm:inline">{l}</span></button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-wide text-text-3">Marca</span>
        {["", ...marcas].map((m) => (
          <button key={m || "todas"} onClick={() => setMarca(m)} className={`h-7 rounded-full border px-2.5 text-[12px] font-semibold ${marca === m ? "border-primary bg-primary-soft text-primary-ink" : "border-border text-text-2 hover:bg-surface-2"}`}>{m || "Todas"}</button>
        ))}
        {!marcas.length ? <span className="text-[12px] text-text-3">Sin dato (se completa al editar o importar)</span> : null}
        <span className="ml-auto text-[12.5px] text-text-3">{filas.length} de {productos.length} productos</span>
      </div>

      {!filas.length ? (
        <div className="tarjeta"><Vacio icono="search_off" titulo="Ningún producto coincide">Quita algún filtro de marca, categoría o precio.</Vacio></div>
      ) : vista === "grilla" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {visibles.map((p) => {
            const s = enSoles(p, tc);
            return (
              <button key={p.id} onClick={() => setAbierto(p)} className="tarjeta flex flex-col overflow-hidden text-left hover:border-primary-line">
                <div className="relative grid aspect-[4/3] place-items-center border-b border-border bg-white">
                  {p.imagen ? <img src={p.imagen} alt="" loading="lazy" className="h-full w-full object-contain p-2" onError={(e) => ((e.currentTarget.style.display = "none"))} /> : <span className="text-[12px] text-text-3">Sin imagen</span>}
                  <span className="absolute left-2 top-2 max-w-[80%] truncate rounded-md bg-surface-2/90 px-1.5 py-0.5 text-[10.5px] font-bold text-text-2">{p.categoria}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-text-3">{p.marca ?? " "}</div>
                  <div className="line-clamp-2 text-[13.5px] font-bold leading-snug">{p.nombre}</div>
                  <div className="font-mono text-[11.5px] text-text-3">{p.codigo ?? "Sin código"}</div>
                  <div className="mt-auto pt-1.5">
                    <div className="num text-[15px] font-extrabold">{dinero(p.precio, p.moneda)}</div>
                    {p.moneda === "USD" ? <div className="num text-[11.5px] text-text-3">{s ? `≈ ${dinero(s)}` : "TC: Sin dato"}</div> : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13.5px]">
            <thead><tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3"><th className="px-4 py-2.5">Producto</th><th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5">Marca</th><th className="px-3 py-2.5">Categoría</th><th className="px-3 py-2.5 text-right">Precio</th><th className="px-3 py-2.5 text-right">En soles</th><th className="px-4 py-2.5">Actualizado</th></tr></thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} onClick={() => setAbierto(p)} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2"><div className="flex items-center gap-2.5"><Miniatura src={p.imagen} nombre={p.nombre} tam={36} /><span className="font-semibold">{p.nombre}</span></div></td>
                  <td className="px-3 py-2 font-mono text-[12px]">{p.codigo ?? <span className="text-text-3">—</span>}</td>
                  <td className="px-3 py-2">{p.marca ?? <span className="text-text-3">—</span>}</td>
                  <td className="px-3 py-2 text-[12.5px]">{p.categoria}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right">{dinero(p.precio, p.moneda)}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold">{dinero(enSoles(p, tc))}</td>
                  <td className="num whitespace-nowrap px-4 py-2 text-text-2">{p.precio_actualizado_en ? fecha(p.precio_actualizado_en) : "Sin dato"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visibles.length < filas.length ? <button className="btn-secundario mx-auto" onClick={() => setPagina(pagina + 1)}>Ver más ({filas.length - visibles.length} restantes)</button> : null}
      {abierto || nuevo ? (
        <DetalleProducto
          key={abierto?.id ?? "nuevo"}
          p={abierto}
          editar={editar}
          tc={tc}
          categorias={categorias}
          onCerrar={() => { setAbierto(null); onNuevoCerrado(); }}
          onGuardado={guardado}
          onAgregar={onAgregar ? (p) => { onAgregar(p); setAbierto(null); } : undefined}
          textoAgregar={textoAgregar}
        />
      ) : null}
    </div>
  );
}
