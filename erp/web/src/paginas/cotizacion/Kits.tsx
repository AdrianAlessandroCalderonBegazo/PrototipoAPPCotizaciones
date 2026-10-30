import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga, Vacio } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { dinero } from "../../dinero";
import type { Kit, KitItem, Producto } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { calcularTotales, importeLinea } from "./calculo";
import { Miniatura } from "./comun";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Campo de búsqueda que lista productos del catálogo para agregarlos. */
export function BuscadorProducto({ productos, onElegir, placeholder = "+ Agregar producto (busca por nombre o código)…" }: { productos: Producto[]; onElegir: (p: Producto) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const lista = useMemo(() => {
    const t = sinTildes(q.trim());
    if (!t) return [];
    return productos.filter((p) => sinTildes(`${p.nombre} ${p.codigo ?? ""} ${p.marca ?? ""} ${p.referencia_interna ?? ""}`).includes(t)).slice(0, 8);
  }, [q, productos]);
  useEffect(() => {
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const elegir = (p: Producto) => {
    onElegir(p);
    setQ("");
    setAbierto(false);
  };
  return (
    <div className="relative" ref={ref}>
      <Icono n="add_circle" className="pointer-events-none absolute left-3 top-2.5 text-primary" />
      <input
        className="campo pl-10"
        value={q}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); setSel(0); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === "Enter" && lista[sel]) { e.preventDefault(); elegir(lista[sel]); }
          if (e.key === "Escape") setAbierto(false);
        }}
      />
      {abierto && lista.length ? (
        <div className="aparecer absolute left-0 right-0 top-11 z-30 max-h-[320px] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-menu">
          {lista.map((p, i) => (
            <button key={p.id} onMouseEnter={() => setSel(i)} onClick={() => elegir(p)} className={`flex w-full items-center gap-2.5 rounded-lg p-2 text-left ${i === sel ? "bg-primary-soft" : ""}`}>
              <Miniatura src={p.imagen} nombre={p.nombre} tam={32} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{p.nombre}</span><span className="block font-mono text-[11.5px] text-text-3">{p.codigo ?? "sin código"}</span></span>
              <b className="num text-[12.5px]">{dinero(p.precio, p.moneda)}</b>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Edit = { id?: number; nombre: string; descripcion: string; version?: number; items: KitItem[] };
const nuevoKit = (): Edit => ({ nombre: "", descripcion: "", items: [] });

export function Kits({ productos, editar }: { productos: Producto[]; editar: boolean }) {
  const avisar = useAvisos();
  const navegar = useNavigate();
  const { datos, error, cargando, recargar } = useDatos(() => api<Kit[]>("GET", "/kits"));
  const [activo, setActivo] = useState<number | "nuevo" | null>(null);
  const [k, setK] = useState<Edit | null>(null);
  const [cambiado, setCambiado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [variante, setVariante] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  useEffect(() => {
    if (activo === null && datos?.length) setActivo(datos[0].id);
  }, [datos, activo]);
  useEffect(() => {
    if (activo === "nuevo") {
      setK(nuevoKit());
      setCambiado(false);
    } else if (activo !== null) {
      api<Kit>("GET", `/kits/${activo}`).then((d) => {
        setK({ id: d.id, nombre: d.nombre, descripcion: d.descripcion ?? "", version: d.version, items: d.items ?? [] });
        setCambiado(false);
      });
    }
  }, [activo]);

  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;

  const precioDe = (i: KitItem) => i.precio_unitario ?? (i.producto_id ? porId.get(i.producto_id)?.precio ?? i.precio_catalogo ?? null : null);
  const lineas = (k?.items ?? []).map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: precioDe(i) ?? "", descuento_pct: i.descuento_pct || "0" }));
  const totales = k && k.items.length && lineas.every((l) => l.precio_unitario) ? calcularTotales(lineas) : null;
  const tocar = (items: KitItem[]) => {
    if (!k) return;
    setK({ ...k, items });
    setCambiado(true);
  };
  const setItem = (i: number, cambio: Partial<KitItem>) => tocar(k!.items.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  const sumar = (i: number, d: number) => {
    const n = Math.max(1, Number(k!.items[i].cantidad || "0") + d);
    setItem(i, { cantidad: String(n) });
  };
  const agregar = (p: Producto) => {
    const ya = k!.items.findIndex((x) => x.producto_id === p.id);
    if (ya >= 0) return sumar(ya, 1);
    tocar([...k!.items, { producto_id: p.id, descripcion: p.nombre, unidad: p.unidad, cantidad: "1", precio_unitario: null, descuento_pct: "0", codigo: p.codigo, precio_catalogo: p.precio }]);
  };
  const guardar = async () => {
    if (!k) return;
    if (!k.nombre.trim()) return avisar("Falta el nombre del kit", undefined, "error");
    setGuardando(true);
    try {
      const cuerpo = { nombre: k.nombre, descripcion: k.descripcion, version: k.version, items: k.items.map((i) => ({ producto_id: i.producto_id, descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad, precio_unitario: i.precio_unitario, descuento_pct: i.descuento_pct || "0" })) };
      const r = k.id ? await api<Kit>("PUT", `/kits/${k.id}`, { cuerpo }) : await api<Kit>("POST", "/kits", { cuerpo });
      avisar("Kit guardado", r.nombre);
      await recargar();
      setActivo(r.id);
      setK({ id: r.id, nombre: r.nombre, descripcion: r.descripcion ?? "", version: r.version, items: r.items ?? [] });
      setCambiado(false);
    } catch (e) {
      avisar("No se pudo guardar", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setGuardando(false);
    }
  };
  const guardarVariante = async () => {
    if (!k?.id || !variante?.trim()) return;
    try {
      const r = await api<Kit>("POST", `/kits/${k.id}/variante`, { cuerpo: { nombre: variante, items: k.items.map((i) => ({ producto_id: i.producto_id, descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad, precio_unitario: i.precio_unitario, descuento_pct: i.descuento_pct || "0" })) } });
      avisar("Variante creada", r.nombre);
      setVariante(null);
      await recargar();
      setActivo(r.id);
    } catch (e) {
      avisar("No se pudo crear", e instanceof Error ? e.message : undefined, "error");
    }
  };
  const eliminar = async () => {
    if (!k?.id) return;
    await api("DELETE", `/kits/${k.id}`);
    avisar("Kit eliminado", k.nombre);
    setBorrar(false);
    setActivo(null);
    setK(null);
    await recargar();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-2">
        {editar ? <button className="btn-secundario" onClick={() => setActivo("nuevo")}><Icono n="add" t={18} />Nuevo kit</button> : null}
        {!datos?.length ? (
          <div className="tarjeta"><Vacio icono="inventory" titulo="Aún no hay kits">{editar ? "Crea uno con «Nuevo kit». Los kits que me pases en zip se cargan aquí." : "Cuando Ventas cree kits, aparecerán aquí."}</Vacio></div>
        ) : datos.map((x) => (
          <button key={x.id} onClick={() => setActivo(x.id)} className={`tarjeta flex flex-col gap-1 p-3.5 text-left ${activo === x.id ? "border-primary ring-1 ring-primary" : "hover:border-primary-line"}`}>
            <div className="flex items-center gap-2"><b className="text-[13.5px]">{x.nombre}</b>{x.variante_de ? <span className="rounded-md bg-ai-soft px-1.5 py-0.5 text-[10.5px] font-bold text-ai">Variante</span> : null}</div>
            {x.descripcion ? <div className="line-clamp-2 text-[12px] text-text-3">{x.descripcion}</div> : null}
            <div className="mt-1 flex items-center justify-between text-[12.5px]"><span className="text-text-3">{x.n_items} ítems{x.sin_precio ? ` · ${x.sin_precio} sin precio` : ""}</span><b className="num">{x.totales ? dinero(x.totales.total) : "Sin dato"}</b></div>
          </button>
        ))}
      </div>

      {k ? (
        <section className="tarjeta overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-[240px] flex-1">
              <div className="text-[12px] font-bold uppercase tracking-wide text-text-3">Editor de kit</div>
              {editar ? (
                <>
                  <input className="mt-1 w-full bg-transparent text-[18px] font-extrabold outline-none placeholder:text-text-3" placeholder="Nombre del kit" value={k.nombre} onChange={(e) => { setK({ ...k, nombre: e.target.value }); setCambiado(true); }} />
                  <input className="w-full bg-transparent text-[13px] text-text-2 outline-none placeholder:text-text-3" placeholder="Descripción (opcional)" value={k.descripcion} onChange={(e) => { setK({ ...k, descripcion: e.target.value }); setCambiado(true); }} />
                </>
              ) : (
                <><div className="mt-1 text-[18px] font-extrabold">{k.nombre}</div><div className="text-[13px] text-text-2">{k.descripcion}</div></>
              )}
            </div>
            {editar ? (
              <div className="flex flex-wrap gap-2">
                {k.id ? <button className="grid h-10 w-10 place-items-center rounded-[11px] border border-border text-danger hover:bg-danger-soft" title="Eliminar kit" onClick={() => setBorrar(true)}><Icono n="delete" t={19} /></button> : null}
                {k.id ? <button className="btn-secundario" onClick={() => setVariante(`${k.nombre} (variante)`)}>Guardar como variante</button> : null}
                <button className="btn-primario" disabled={!cambiado || guardando || !k.items.length} onClick={guardar}>{guardando ? "Guardando…" : "Guardar kit"}</button>
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
              <thead><tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3"><th className="px-5 py-2.5">Producto</th><th className="px-3 py-2.5">Cantidad</th><th className="px-3 py-2.5 text-right">P. unitario</th><th className="px-3 py-2.5">Desc. %</th><th className="px-3 py-2.5 text-right">Total</th><th className="w-10" /></tr></thead>
              <tbody>
                {k.items.map((i, n) => {
                  const p = i.producto_id ? porId.get(i.producto_id) : null;
                  const precio = precioDe(i);
                  const imp = precio ? importeLinea({ descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: precio, descuento_pct: i.descuento_pct }) : null;
                  return (
                    <tr key={n} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5"><div className="font-semibold">{i.descripcion}</div><div className="font-mono text-[11.5px] text-text-3">{p?.codigo ?? i.codigo ?? (i.producto_id ? "" : "Ítem libre")}</div></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {editar ? <button className="grid h-8 w-8 place-items-center rounded-lg border border-border" onClick={() => sumar(n, -1)}><Icono n="remove" t={16} /></button> : null}
                          <input className="campo num h-8 w-16 px-2 text-center" disabled={!editar} value={i.cantidad} onChange={(e) => setItem(n, { cantidad: e.target.value })} />
                          {editar ? <button className="grid h-8 w-8 place-items-center rounded-lg border border-border" onClick={() => sumar(n, 1)}><Icono n="add" t={16} /></button> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input className="campo num h-8 w-28 px-2 text-right" disabled={!editar} placeholder={p?.precio ?? i.precio_catalogo ?? "precio"} value={i.precio_unitario ?? ""} onChange={(e) => setItem(n, { precio_unitario: e.target.value || null })} />
                        <div className="text-[11px] text-text-3">{i.precio_unitario ? `catálogo ${dinero(p?.precio ?? i.precio_catalogo)}` : p ? "precio del catálogo" : ""}</div>
                      </td>
                      <td className="px-3 py-2.5"><input className="campo num h-8 w-16 px-2 text-center" disabled={!editar} value={i.descuento_pct} onChange={(e) => setItem(n, { descuento_pct: e.target.value })} /></td>
                      <td className="num whitespace-nowrap px-3 py-2.5 text-right font-bold">{imp ? dinero(imp) : <span className="text-danger">Sin dato</span>}</td>
                      <td className="px-2">{editar ? <button className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-danger-soft hover:text-danger" title="Quitar" onClick={() => tocar(k.items.filter((_, j) => j !== n))}><Icono n="close" t={17} /></button> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!k.items.length ? <div className="p-6 text-center text-[13px] text-text-3">Agrega productos del catálogo con el buscador de abajo.</div> : null}
          </div>
          <div className="grid gap-4 border-t border-border p-5 md:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-2">
              {editar ? (
                <>
                  <BuscadorProducto productos={productos} onElegir={agregar} />
                  <button className="w-fit text-[13px] font-semibold text-primary-ink" onClick={() => tocar([...k.items, { producto_id: null, descripcion: "Instalación y puesta en marcha", unidad: "Servicio", cantidad: "1", precio_unitario: "", descuento_pct: "0" }])}>+ Agregar ítem libre (servicio, mano de obra…)</button>
                </>
              ) : null}
              <p className="text-[12px] text-text-3">Si dejas vacío el precio de un producto, el kit usa el precio del catálogo del día. Al cotizar, el kit se copia: cambiar la cotización no cambia el kit.</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface-2 p-4 text-[13px]">
              {totales ? (
                <>
                  {[["Subtotal (con IGV)", totales.subtotal], ["Descuentos", `-${totales.descuento_lineas}`], ["Valor de venta", totales.valor_venta], ["IGV 18%", totales.igv]].map(([a, b]) => <div key={a} className="flex justify-between py-0.5"><span className="text-text-3">{a}</span><span className="num">{b.startsWith("-") ? `− ${dinero(b.slice(1))}` : dinero(b)}</span></div>)}
                  <div className="mt-1.5 flex justify-between border-t border-border pt-2 text-[15px] font-extrabold"><span>Total</span><span className="num">{dinero(totales.total)}</span></div>
                </>
              ) : <div className="text-text-3">{k.items.length ? "Falta el precio de algún ítem (o hay un número mal escrito)." : "Sin ítems."}</div>}
              {k.id ? <button className="btn-primario mt-3 w-full" disabled={cambiado} title={cambiado ? "Guarda el kit primero" : undefined} onClick={() => navegar(`/cotizacion/nueva?kit=${k.id}`)}><Icono n="request_quote" t={18} />Crear cotización con este kit</button> : null}
            </div>
          </div>
        </section>
      ) : datos?.length ? <div className="tarjeta"><Vacio icono="touch_app" titulo="Elige un kit" /></div> : null}

      {variante !== null ? (
        <Modal titulo="Guardar como variante" icono="content_copy" onCerrar={() => setVariante(null)} pie={<><button className="btn-secundario" onClick={() => setVariante(null)}>Cancelar</button><button className="btn-primario" disabled={!variante.trim()} onClick={guardarVariante}>Crear variante</button></>}>
          <label><span className="etiqueta">Nombre de la variante</span><input className="campo" autoFocus value={variante} onChange={(e) => setVariante(e.target.value)} /></label>
          <p className="mt-2 text-[12.5px] text-text-3">Se crea un kit nuevo con los ítems actuales (incluidos los cambios sin guardar). El original no cambia.</p>
        </Modal>
      ) : null}
      {borrar && k ? (
        <Modal titulo="Eliminar kit" icono="delete" onCerrar={() => setBorrar(false)} pie={<><button className="btn-secundario" onClick={() => setBorrar(false)}>Cancelar</button><button className="btn-peligro" onClick={eliminar}>Eliminar</button></>}>
          <p className="text-[13.5px]">¿Eliminar el kit <b>{k.nombre}</b>? Las cotizaciones que ya se hicieron con él no cambian.</p>
          <p className="mt-1 text-[12.5px] text-text-3">{k.items.length} ítems · {totales ? dinero(totales.total) : "Sin dato"}</p>
        </Modal>
      ) : null}
    </div>
  );
}
