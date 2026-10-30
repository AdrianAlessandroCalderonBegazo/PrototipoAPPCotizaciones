// Almacén: registrar movimientos (entrada, salida, ajuste por conteo), crear/editar artículos, agregar desde el catálogo y el kardex.
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { Pildora, type TonoPildora } from "../../componentes/Pildora";
import { dinero } from "../../dinero";
import { fecha, fechaHora, hoyLima } from "../../formato";
import type { Articulo, Kardex, MovAlmacen, OpcionesAlmacen, PropuestaSalida, TipoMovAlmacen } from "../../tipos";
import { useDatos } from "../../usarDatos";

const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);
export const TIPO_MOV: Record<TipoMovAlmacen, [string, TonoPildora, string]> = {
  entrada: ["Entrada", "exito", "login"],
  salida: ["Salida", "primario", "logout"],
  ajuste: ["Ajuste", "aviso", "tune"],
  anulacion: ["Anulación", "neutro", "undo"],
};
/** «12.50» → «12.5», «40.00» → «40» (las cantidades se muestran sin ceros de más). */
export const cant = (v: string | null | undefined) => (v === null || v === undefined ? "Sin dato" : String(Number(v)).replace(/^-/, "−"));
export const conSigno = (v: string) => (Number(v) > 0 ? `+${cant(v)}` : cant(v));

type Linea = { articulo_id: string; cantidad: string; texto?: string };

/** Registrar una entrada, salida o ajuste de uno o varios artículos (todo o nada). Con `requerimiento` propone la salida de ese pedido. */
export function ModalMovimiento({ articulos, inicial, requerimiento, onCerrar, onHecho }: {
  articulos: Articulo[]; inicial?: { tipo?: TipoMovAlmacen; articulo_id?: number }; requerimiento?: number; onCerrar: () => void; onHecho: () => void;
}) {
  const avisar = useAvisos();
  const op = useDatos(() => api<OpcionesAlmacen>("GET", "/almacen/opciones"));
  const [tipo, setTipo] = useState<"entrada" | "salida" | "ajuste">(requerimiento ? "salida" : (inicial?.tipo as "entrada") ?? "entrada");
  const [f, setF] = useState(hoyLima());
  const [lineas, setLineas] = useState<Linea[]>([{ articulo_id: inicial?.articulo_id ? String(inicial.articulo_id) : "", cantidad: "" }]);
  const [extra, setExtra] = useState({ proyecto_id: "", requerimiento_id: requerimiento ? String(requerimiento) : "", proveedor_id: "", documento: "", costo_unitario: "", moneda: "PEN", nota: "" });
  const [prop, setProp] = useState<PropuestaSalida | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [repetido, setRepetido] = useState(false);
  const activos = useMemo(() => articulos.filter((a) => a.activo), [articulos]);
  const porId = useMemo(() => new Map(articulos.map((a) => [String(a.id), a])), [articulos]);

  // Salida de un requerimiento: se proponen sus materiales con el artículo del mismo nombre (la persona revisa y confirma).
  useEffect(() => {
    const rid = Number(extra.requerimiento_id);
    if (tipo !== "salida" || !rid) return setProp(null);
    let vivo = true;
    api<PropuestaSalida>("GET", `/almacen/requerimientos/${rid}/salida`).then((p) => {
      if (!vivo) return;
      setProp(p);
      setLineas(p.items.map((i) => ({ articulo_id: i.articulo ? String(i.articulo.id) : "", cantidad: i.cantidad.replace(/\.00$/, ""), texto: `${i.texto} · ${cant(i.cantidad)} ${i.unidad ?? ""}`.trim() })));
    }).catch((x) => avisar("No se pudo leer el requerimiento", msg(x), "error"));
    return () => void (vivo = false);
  }, [extra.requerimiento_id, tipo, avisar]);

  const set = (i: number, c: Partial<Linea>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...c } : l)));
  const validas = lineas.filter((l) => l.articulo_id && l.cantidad.trim());
  const guardar = async (repetir = false) => {
    setGuardando(true);
    try {
      await api("POST", "/almacen/movimientos", {
        cuerpo: {
          tipo, fecha: f, items: validas.map((l) => ({ articulo_id: Number(l.articulo_id), cantidad: l.cantidad })),
          proyecto_id: tipo === "salida" ? extra.proyecto_id || null : null, requerimiento_id: tipo === "salida" ? extra.requerimiento_id || null : null,
          proveedor_id: tipo === "entrada" ? extra.proveedor_id || null : null, documento: extra.documento, nota: extra.nota,
          costo_unitario: tipo === "entrada" && validas.length === 1 ? extra.costo_unitario || null : null, moneda: extra.moneda, repetir,
        },
      });
      avisar(`${TIPO_MOV[tipo][0]} registrada`, `${validas.length} artículo${validas.length === 1 ? "" : "s"} · el kardex quedó actualizado.`);
      onHecho();
    } catch (x) {
      const e = x as Error & { estado?: number };
      if (/Ya se registró la salida/.test(e.message ?? "")) setRepetido(true);
      avisar("No se pudo registrar", msg(x), "error");
    } finally {
      setGuardando(false);
    }
  };
  const ex = (k: keyof typeof extra) => ({ value: extra[k], onChange: (e: { target: { value: string } }) => setExtra({ ...extra, [k]: e.target.value }) });

  return (
    <Modal titulo="Registrar movimiento" icono="swap_vert" onCerrar={onCerrar} ancho={720}
      pie={<>
        <button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
        {repetido ? <button className="btn-secundario" disabled={guardando} onClick={() => void guardar(true)}>Sí, registrar otra salida</button> : null}
        <button className="btn-primario" disabled={guardando || !validas.length || (tipo === "ajuste" && !extra.nota.trim())} onClick={() => void guardar()}>{guardando ? "Guardando…" : `Registrar ${TIPO_MOV[tipo][0].toLowerCase()}`}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {(["entrada", "salida", "ajuste"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTipo(k)} className={`flex h-14 flex-col items-center justify-center rounded-xl border text-[13px] font-bold ${tipo === k ? "border-primary bg-primary-soft text-primary-ink" : "border-border-strong text-text-2"}`}>
              <Icono n={TIPO_MOV[k][2]} t={20} />{k === "ajuste" ? "Ajuste (conteo)" : TIPO_MOV[k][0]}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-[12.5px] text-text-3">
          {tipo === "entrada" ? "Llegó material: se suma al stock." : tipo === "salida" ? "Sale material a una obra o proyecto: se resta del stock (nunca queda negativo)." : "Escribe lo que contaste físicamente: el stock pasa a ese número y la diferencia queda registrada."}
        </p>
        {op.cargando && !op.datos ? <Cargando /> : op.error ? <ErrorCarga mensaje={op.error} reintentar={op.recargar} /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="etiqueta">Fecha *</span><input className="campo" type="date" max={hoyLima()} value={f} onChange={(e) => setF(e.target.value)} /></label>
            {tipo === "salida" ? (
              <>
                <label><span className="etiqueta">Requerimiento de Logística</span>
                  <select className="campo" {...ex("requerimiento_id")}><option value="">Ninguno</option>{op.datos!.requerimientos.map((r) => <option key={r.id} value={r.id}>{r.numero} · {r.obra}{r.con_salida ? " (ya tiene salida)" : ""}</option>)}</select>
                </label>
                <label className="sm:col-span-2"><span className="etiqueta">Proyecto</span>
                  <select className="campo" {...ex("proyecto_id")}><option value="">Sin proyecto</option>{op.datos!.proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                </label>
              </>
            ) : null}
            {tipo === "entrada" ? (
              <>
                <label><span className="etiqueta">Proveedor</span>
                  <select className="campo" {...ex("proveedor_id")}><option value="">Sin dato</option>{op.datos!.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                </label>
                <label><span className="etiqueta">Guía o factura</span><input className="campo" {...ex("documento")} placeholder="GR 001-123" /></label>
              </>
            ) : tipo === "salida" ? <label className="sm:col-span-2"><span className="etiqueta">Documento</span><input className="campo" {...ex("documento")} placeholder="Guía de salida (opcional)" /></label> : null}
          </div>
        )}
        {prop?.salida_registrada ? <div className="rounded-xl border px-3 py-2 text-[12.5px]" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}>Este requerimiento ya tiene una salida registrada el {fecha(prop.salida_registrada)}. Registra otra solo si de verdad salió más material.</div> : null}
        <div className="flex flex-col gap-2">
          <div className="etiqueta">Artículos *</div>
          {lineas.map((l, i) => {
            const a = porId.get(l.articulo_id);
            return (
              <div key={i} className="rounded-xl border border-border p-2.5">
                {l.texto ? <div className="mb-1.5 text-[12px] text-text-3">Pedido: <b className="text-text-2">{l.texto}</b>{!l.articulo_id ? <span className="text-warning"> · no hay un artículo con ese nombre: elige uno o déjalo vacío para no descontarlo</span> : null}</div> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <select className="campo min-w-[220px] flex-1" value={l.articulo_id} onChange={(e) => set(i, { articulo_id: e.target.value })}>
                    <option value="">Elige el artículo…</option>
                    {activos.map((x) => <option key={x.id} value={x.id}>{x.nombre} · hay {cant(x.stock)} {x.unidad}</option>)}
                  </select>
                  <input className="campo num w-[120px]" inputMode="decimal" placeholder={tipo === "ajuste" ? "Conteo" : "Cantidad"} value={l.cantidad} onChange={(e) => set(i, { cantidad: e.target.value.replace(/[^0-9.,]/g, "") })} />
                  <span className="w-[42px] text-[12.5px] text-text-3">{a?.unidad ?? ""}</span>
                  {lineas.length > 1 ? <button className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:bg-surface-2" title="Quitar" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}><Icono n="close" t={18} /></button> : null}
                </div>
                {a && tipo === "salida" && l.cantidad && Number(l.cantidad.replace(",", ".")) > Number(a.stock) ? <div className="mt-1 text-[12px] text-danger">Solo hay {cant(a.stock)} {a.unidad}.</div> : null}
              </div>
            );
          })}
          <button className="self-start text-[13px] font-semibold text-primary-ink" onClick={() => setLineas([...lineas, { articulo_id: "", cantidad: "" }])}>+ Agregar otro artículo</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {tipo === "entrada" && validas.length <= 1 ? (
            <label><span className="etiqueta">Costo unitario (opcional)</span>
              <div className="flex gap-2"><select className="campo w-[90px]" {...ex("moneda")}><option value="PEN">S/</option><option value="USD">US$</option></select><input className="campo num flex-1" inputMode="decimal" {...ex("costo_unitario")} /></div>
            </label>
          ) : null}
          <label className={tipo === "entrada" && validas.length <= 1 ? "" : "sm:col-span-2"}><span className="etiqueta">Nota{tipo === "ajuste" ? " *" : ""}</span><input className="campo" {...ex("nota")} placeholder={tipo === "ajuste" ? "Por qué se ajusta (ej. conteo de fin de mes)" : "Opcional"} /></label>
        </div>
      </div>
    </Modal>
  );
}

/** Crear o editar un artículo del almacén. */
export function ModalArticulo({ a, categorias, onCerrar, onHecho }: { a: Articulo | null; categorias: string[]; onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const [d, setD] = useState({ nombre: a?.nombre ?? "", codigo: a?.codigo ?? "", categoria: a?.categoria ?? "", unidad: a?.unidad ?? "und", ubicacion: a?.ubicacion ?? "", stock_minimo: a?.stock_minimo ? cant(a.stock_minimo) : "", stock_inicial: "", activo: a?.activo ?? true });
  const [guardando, setGuardando] = useState(false);
  const c = (k: keyof typeof d) => ({ value: String(d[k]), onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  const guardar = async () => {
    setGuardando(true);
    try {
      const { stock_inicial, ...resto } = d;
      if (a) await api("PUT", `/almacen/articulos/${a.id}`, { cuerpo: resto });
      else await api("POST", "/almacen/articulos", { cuerpo: { ...resto, stock_inicial } });
      avisar(a ? "Artículo actualizado" : "Artículo creado");
      onHecho();
    } catch (x) {
      avisar("No se pudo guardar", msg(x), "error");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo={a ? `Editar ${a.nombre}` : "Nuevo artículo"} icono="inventory_2" onCerrar={onCerrar} ancho={560}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || !d.nombre.trim()} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="etiqueta">Nombre *</span><input className="campo" {...c("nombre")} placeholder="Cable solar 6 mm² rojo" /></label>
        <label><span className="etiqueta">Código</span><input className="campo" {...c("codigo")} /></label>
        <label><span className="etiqueta">Categoría</span><input className="campo" list="cats-almacen" {...c("categoria")} /><datalist id="cats-almacen">{categorias.map((x) => <option key={x} value={x} />)}</datalist></label>
        <label><span className="etiqueta">Unidad</span><input className="campo" list="unidades-almacen" {...c("unidad")} /><datalist id="unidades-almacen">{["und", "m", "par", "rollo", "caja", "kg", "juego"].map((x) => <option key={x} value={x} />)}</datalist></label>
        <label><span className="etiqueta">Ubicación</span><input className="campo" {...c("ubicacion")} placeholder="Estante A2" /></label>
        <label><span className="etiqueta">Stock mínimo (aviso)</span><input className="campo num" inputMode="decimal" {...c("stock_minimo")} placeholder="Vacío = sin aviso" /></label>
        {!a ? <label><span className="etiqueta">Stock inicial</span><input className="campo num" inputMode="decimal" {...c("stock_inicial")} placeholder="Lo que hay hoy" /></label> : null}
        {a ? <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} />Activo (si se desactiva, no se puede mover; su kardex se conserva)</label> : null}
        {a ? <p className="text-[12px] text-text-3 sm:col-span-2">El stock no se edita aquí: se cambia con una entrada, salida o ajuste para que quede registrado.</p> : null}
      </div>
    </Modal>
  );
}

/** Agregar artículos desde el catálogo de Cotización (paneles, inversores, baterías…). */
export function ModalCatalogo({ onCerrar, onHecho }: { onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const op = useDatos(() => api<OpcionesAlmacen>("GET", "/almacen/opciones"));
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = (op.datos?.productos ?? []).filter((p) => !q.trim() || n(`${p.codigo ?? ""} ${p.nombre} ${p.categoria ?? ""}`).includes(n(q.trim()))).slice(0, 200);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api<{ agregados: number; saltados: number }>("POST", "/almacen/articulos/desde-catalogo", { cuerpo: { productos: [...sel] } });
      avisar(`${r.agregados} artículo${r.agregados === 1 ? "" : "s"} agregado${r.agregados === 1 ? "" : "s"}`, r.saltados ? `${r.saltados} ya estaban en el almacén.` : "Empiezan con stock 0: registra su entrada.");
      onHecho();
    } catch (x) {
      avisar("No se pudo agregar", msg(x), "error");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo="Agregar desde el catálogo" icono="library_add" onCerrar={onCerrar} ancho={640}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || !sel.size} onClick={() => void guardar()}>Agregar {sel.size || ""}</button></>}>
      {op.cargando && !op.datos ? <Cargando /> : op.error ? <ErrorCarga mensaje={op.error} reintentar={op.recargar} /> : (
        <div className="flex flex-col gap-3">
          <input className="campo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el catálogo" />
          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border">
            {lista.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2">
                <input type="checkbox" checked={sel.has(p.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(p.id); else s.delete(p.id); setSel(s); }} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.nombre}</span><span className="text-[12px] text-text-3">{p.codigo ?? "Sin código"} · {p.categoria ?? "Sin categoría"}</span></span>
              </label>
            ))}
            {!lista.length ? <div className="p-4 text-center text-[13px] text-text-3">Sin productos con esa búsqueda.</div> : null}
          </div>
          <p className="text-[12px] text-text-3">Los que ya están en el almacén (mismo nombre o producto) se saltan. Entran con stock 0.</p>
        </div>
      )}
    </Modal>
  );
}

/** Kardex de un artículo: cada movimiento con stock resultante; se puede anular (queda registrado). */
export function ModalKardex({ id, editar, onCerrar, onCambio, onMover }: { id: number; editar: boolean; onCerrar: () => void; onCambio: () => void; onMover: (tipo: TipoMovAlmacen) => void }) {
  const k = useDatos(() => api<Kardex>("GET", `/almacen/articulos/${id}`), [id]);
  const a = k.datos?.articulo;
  return (
    <Modal titulo={a ? a.nombre : "Kardex"} icono="receipt_long" onCerrar={onCerrar} ancho={900}>
      {k.cargando && !k.datos ? <Cargando /> : k.error || !k.datos || !a ? <ErrorCarga mensaje={k.error ?? "No se pudo cargar."} reintentar={k.recargar} /> : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Stock", `${cant(a.stock)} ${a.unidad}`], ["Mínimo", a.stock_minimo ? `${cant(a.stock_minimo)} ${a.unidad}` : "Sin aviso"], ["Entradas", `+${cant(k.datos.entradas)}`], ["Salidas", cant(k.datos.salidas)]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-border p-3"><div className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">{l}</div><div className="num text-[18px] font-extrabold" style={l === "Stock" && a.bajo ? { color: "var(--danger)" } : undefined}>{v}</div></div>
            ))}
          </div>
          <div className="text-[12.5px] text-text-2">{a.codigo ?? "Sin código"} · {a.categoria ?? "Sin categoría"} · {a.ubicacion ?? "Ubicación: Sin dato"}</div>
          {editar && a.activo ? (
            <div className="flex flex-wrap gap-2">
              {(["entrada", "salida", "ajuste"] as const).map((t) => <button key={t} className="btn-secundario h-9" onClick={() => onMover(t)}><Icono n={TIPO_MOV[t][2]} t={17} />{t === "ajuste" ? "Ajustar por conteo" : `Registrar ${TIPO_MOV[t][0].toLowerCase()}`}</button>)}
            </div>
          ) : null}
          <TablaMovimientos movs={k.datos.movimientos} editar={editar} sinArticulo onCambio={() => { void k.recargar(); onCambio(); }} />
        </div>
      )}
    </Modal>
  );
}

/** Tabla de movimientos (kardex o lista general) con «Anular». */
export function TablaMovimientos({ movs, editar, sinArticulo = false, onCambio }: { movs: MovAlmacen[]; editar: boolean; sinArticulo?: boolean; onCambio: () => void }) {
  const avisar = useAvisos();
  const [anular, setAnular] = useState<MovAlmacen | null>(null);
  const [motivo, setMotivo] = useState("");
  const confirmar = async () => {
    if (!anular) return;
    try {
      await api("POST", `/almacen/movimientos/${anular.id}/anular`, { cuerpo: { motivo } });
      avisar("Movimiento anulado", "Se registró un movimiento contrario; el original queda en el kardex.");
      setAnular(null);
      setMotivo("");
      onCambio();
    } catch (x) {
      avisar("No se pudo anular", msg(x), "error");
    }
  };
  if (!movs.length) return <div className="rounded-xl border border-dashed border-border-strong p-6 text-center text-[13px] text-text-3">Sin movimientos.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border text-[11.5px] font-bold uppercase tracking-wide text-text-3">
            <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Tipo</th>{sinArticulo ? null : <th className="px-3 py-2">Artículo</th>}<th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2">Destino / origen</th><th className="px-3 py-2">Registró</th>{editar ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {movs.map((m) => {
            const [l, t] = TIPO_MOV[m.tipo];
            const destino = [m.requerimiento ? `${m.requerimiento} · ${m.obra}` : null, m.proyecto, m.proveedor, m.documento, m.costo_unitario ? `${dinero(m.costo_unitario, m.moneda ?? "PEN")} c/u` : null].filter(Boolean).join(" · ");
            return (
              <tr key={m.id} className={`border-b border-border last:border-0 ${m.anulado ? "text-text-3" : ""}`}>
                <td className="whitespace-nowrap px-3 py-2">{fecha(m.fecha)}</td>
                <td className="px-3 py-2"><Pildora tono={t}>{l}</Pildora>{m.anulado ? <div className="mt-0.5 text-[11px] font-semibold text-text-3">Anulado</div> : null}</td>
                {sinArticulo ? null : <td className="max-w-[240px] px-3 py-2 font-semibold">{m.articulo}</td>}
                <td className="num whitespace-nowrap px-3 py-2 text-right font-bold" style={{ color: m.anulado ? undefined : Number(m.delta) > 0 ? "var(--success)" : Number(m.delta) < 0 ? "var(--text)" : undefined }}>{conSigno(m.delta)} {m.unidad}</td>
                <td className="num whitespace-nowrap px-3 py-2 text-right">{cant(m.stock_despues)}</td>
                <td className="max-w-[260px] px-3 py-2 text-text-2">{destino || "—"}{m.nota ? <div className="text-[12px] text-text-3">{m.nota}</div> : null}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[12px] text-text-3">{m.creado_por ?? "Sin dato"}<div>{fechaHora(m.creado_en)}</div></td>
                {editar ? <td className="px-3 py-2 text-right">{!m.anulado && m.tipo !== "anulacion" ? <button className="text-[12.5px] font-semibold text-danger" onClick={() => setAnular(m)}>Anular</button> : null}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {anular ? (
        <Modal titulo="Anular movimiento" icono="undo" onCerrar={() => setAnular(null)}
          pie={<><button className="btn-secundario" onClick={() => setAnular(null)}>Cancelar</button><button className="btn-primario" style={{ background: "var(--danger)" }} disabled={!motivo.trim()} onClick={() => void confirmar()}>Anular</button></>}>
          <p className="text-[13.5px]">{TIPO_MOV[anular.tipo][0]} de <b>{conSigno(anular.delta)} {anular.unidad}</b> de {anular.articulo} ({fecha(anular.fecha)}). Se registra un movimiento contrario; el original no se borra.</p>
          <label className="mt-3 block"><span className="etiqueta">Motivo *</span><input className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></label>
        </Modal>
      ) : null}
    </div>
  );
}
