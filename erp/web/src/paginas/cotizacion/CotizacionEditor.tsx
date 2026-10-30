import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { aSoles, dinero, leerMonto } from "../../dinero";
import { rucValido } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { Cotizacion as TCot, Empresa, Kit, LineaCot, Parametros, Producto, TarjetaIa } from "../../tipos";
import { calcularTotales, importeLinea } from "./calculo";
import { BuscadorProducto } from "./Kits";

type Form = {
  cliente: string; ruc_dni: string; telefono: string; correo: string; direccion: string; atencion: string; sistema: string; vendedor: string;
  validez_dias: string; condiciones: string; banco: string; moneda: string; nro_cuenta: string; cci: string; descuento: string; kit_id: number | null; proyecto_id: string;
};
const VACIO: Form = { cliente: "", ruc_dni: "", telefono: "", correo: "", direccion: "", atencion: "", sistema: "", vendedor: "", validez_dias: "15", condiciones: "", banco: "", moneda: "", nro_cuenta: "", cci: "", descuento: "", kit_id: null, proyecto_id: "" };

const docValido = (v: string) => !v || (v.length === 8 ? /^\d{8}$/.test(v) : rucValido(v));

export function CotizacionEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const avisar = useAvisos();
  const { usuario } = useSesion();
  const [f, setF] = useState<Form | null>(null);
  const [items, setItems] = useState<LineaCot[]>([]);
  const [version, setVersion] = useState<number | undefined>();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [proyectos, setProyectos] = useState<{ id: number; codigo: string; nombre: string }[]>([]);
  const [param, setParam] = useState<Parametros | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargaError, setCargaError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [kitElegido, setKitElegido] = useState("");
  const tc = param?.tipo_cambio.valor ?? null;

  useEffect(() => {
    (async () => {
      try {
        const [cat, ks, pr, emp] = await Promise.all([
          api<{ productos: Producto[] }>("GET", "/catalogo"), api<Kit[]>("GET", "/kits"), api<Parametros>("GET", "/parametros"), api<Empresa>("GET", "/empresa"),
        ]);
        setProductos(cat.productos);
        setKits(ks);
        setParam(pr);
        if (puede(usuario, "proyectos")) api<{ id: number; codigo: string; nombre: string }[]>("GET", "/proyectos/activos").then(setProyectos).catch(() => {});
        if (id) {
          const c = await api<TCot>("GET", `/ventas/cotizaciones/${id}`);
          setF({
            cliente: c.cliente, ruc_dni: c.ruc_dni ?? "", telefono: c.telefono ?? "", correo: c.correo ?? "", direccion: c.direccion ?? "", atencion: c.atencion ?? "", sistema: c.sistema ?? "",
            vendedor: c.vendedor ?? "", validez_dias: c.validez_dias ? String(c.validez_dias) : "", condiciones: c.condiciones ?? "", banco: c.banco ?? "", moneda: c.moneda ?? "",
            nro_cuenta: c.nro_cuenta ?? "", cci: c.cci ?? "", descuento: c.totales.descuento && c.totales.descuento !== "0.00" ? c.totales.descuento : "", kit_id: c.kit_id, proyecto_id: c.proyecto_id ? String(c.proyecto_id) : "",
          });
          setItems(c.items.map((i) => ({ ...i, cantidad: i.cantidad, precio_unitario: i.precio_unitario, descuento_pct: i.descuento_pct ?? "0" })));
          setVersion(c.version);
        } else {
          setF({ ...VACIO, vendedor: usuario?.nombre ?? "", condiciones: emp.pie_pdf ?? "" });
          const iaId = params.get("ia");
          if (iaId) {
            // Propuesta del Cotizador IA: se trae al editor; una persona revisa, completa los precios «Sin dato» y guarda.
            const p = await api<TarjetaIa>("GET", `/ia/cotizador/propuesta/${iaId}`);
            setItems(p.items.map((i) => ({ producto_id: i.producto_id, codigo: i.codigo, descripcion: i.descripcion, detalle: null, unidad: i.unidad, cantidad: i.cantidad, precio_unitario: i.precio_unitario ?? "", descuento_pct: "0" })));
            setF((x) => (x ? { ...x, sistema: x.sistema || p.titulo } : x));
          }
          const kitId = params.get("kit");
          if (kitId) {
            const k = await api<Kit>("GET", `/kits/${kitId}`);
            setItems((k.items ?? []).map((i) => ({ producto_id: i.producto_id, codigo: i.codigo ?? null, descripcion: i.descripcion, detalle: null, unidad: i.unidad, cantidad: i.cantidad, precio_unitario: i.precio_efectivo ?? "", descuento_pct: i.descuento_pct ?? "0" })));
            setF((x) => (x ? { ...x, kit_id: k.id, sistema: x.sistema || [k.nombre, k.descripcion].filter(Boolean).join(" · ") } : x));
          }
        }
      } catch (e) {
        setCargaError(e instanceof Error ? e.message : "No se pudo cargar.");
      }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totales = useMemo(() => (items.length ? calcularTotales(items.map((i) => ({ ...i, descuento_pct: i.descuento_pct || "0" })), f?.descuento ? leerMonto(f.descuento) ?? "x" : "0") : null), [items, f?.descuento]);

  if (cargaError) return <ErrorCarga mensaje={cargaError} />;
  if (!f) return <Cargando />;

  const poner = (k: keyof Form, v: string) => setF({ ...f, [k]: v });
  const setItem = (n: number, c: Partial<LineaCot>) => setItems(items.map((x, i) => (i === n ? { ...x, ...c } : x)));
  const agregarProducto = (p: Producto) => {
    const precio = p.precio ? (p.moneda === "USD" ? aSoles(p.precio, tc) : p.precio) : null;
    if (p.precio && p.moneda === "USD" && !precio) return avisar("Falta el tipo de cambio", "El producto está en dólares: registra el tipo de cambio en Configuración › Parámetros.", "error");
    const ya = items.findIndex((x) => x.producto_id === p.id);
    if (ya >= 0) return setItem(ya, { cantidad: String(Number(items[ya].cantidad) + 1) });
    setItems([...items, { producto_id: p.id, codigo: p.codigo, descripcion: p.nombre, detalle: null, unidad: p.unidad, cantidad: "1", precio_unitario: precio ?? "", descuento_pct: "0" }]);
  };
  const agregarKit = async (kid: string) => {
    setKitElegido("");
    if (!kid) return;
    const k = await api<Kit>("GET", `/kits/${kid}`);
    setItems([...items, ...(k.items ?? []).map((i) => ({ producto_id: i.producto_id, codigo: i.codigo ?? null, descripcion: i.descripcion, detalle: null, unidad: i.unidad, cantidad: i.cantidad, precio_unitario: i.precio_efectivo ?? "", descuento_pct: i.descuento_pct ?? "0" }))]);
    setF({ ...f, kit_id: f.kit_id ?? k.id, sistema: f.sistema || [k.nombre, k.descripcion].filter(Boolean).join(" · ") });
    avisar("Kit agregado", `${k.items?.length ?? 0} ítems de «${k.nombre}». La plantilla no cambia.`, "info");
  };
  const mover = (n: number, d: -1 | 1) => {
    const j = n + d;
    if (j < 0 || j >= items.length) return;
    const c = [...items];
    [c[n], c[j]] = [c[j], c[n]];
    setItems(c);
  };
  const guardar = async () => {
    if (!f.cliente.trim()) return setError("Escribe el nombre del cliente.");
    if (!docValido(f.ruc_dni.trim())) return setError("El RUC o DNI no es válido (DNI: 8 dígitos; RUC: 11 dígitos con su dígito verificador).");
    if (!items.length) return setError("Agrega al menos un ítem.");
    if (!totales) return setError("Revisa las cantidades, precios y descuentos: hay algún número mal escrito o un descuento mayor que el total.");
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = { ...f, ruc_dni: f.ruc_dni.trim(), descuento: f.descuento ? leerMonto(f.descuento) : "0", validez_dias: f.validez_dias ? Number(f.validez_dias) : null, proyecto_id: f.proyecto_id ? Number(f.proyecto_id) : null, version, items: items.map((i) => ({ ...i, descuento_pct: i.descuento_pct || "0" })) };
      const r = id ? await api<TCot>("PUT", `/ventas/cotizaciones/${id}`, { cuerpo }) : await api<TCot>("POST", "/ventas/cotizaciones", { cuerpo });
      avisar(id ? "Cotización guardada" : "Cotización creada", `${r.numero} · ${dinero(r.totales.total)}`);
      navegar(`/cotizacion/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const campo = (k: keyof Form, l: string, ph = "", extra = "") => (
    <label className={extra}><span className="etiqueta">{l}</span><input className="campo" placeholder={ph} value={f[k] as string} onChange={(e) => poner(k, e.target.value)} /></label>
  );
  const usd = totales && tc ? (() => {
    const t = totales.total.split(".");
    const c = BigInt(t[0]) * 100n + BigInt((t[1] ?? "").padEnd(2, "0"));
    const [e, d = ""] = tc.split(".");
    const tc4 = BigInt(e) * 10000n + BigInt((d + "0000").slice(0, 4));
    const r = (c * 10000n + tc4 / 2n) / tc4;
    return `${r / 100n}.${String(r % 100n).padStart(2, "0")}`;
  })() : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-[13px] text-text-3">
        <Link to="/cotizacion" className="inline-flex items-center gap-1"><Icono n="arrow_back" t={18} />Cotización</Link><span>/</span><span>{id ? "Editar" : "Nueva"}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-extrabold tracking-tight">{id ? "Editar cotización" : "Nueva cotización"}</h1>
        <div className="flex gap-2">
          <button className="btn-secundario" onClick={() => navegar(id ? `/cotizacion/${id}` : "/cotizacion")}>Cancelar</button>
          <button className="btn-primario" disabled={guardando} onClick={guardar}><Icono n="save" t={18} />{guardando ? "Guardando…" : id ? "Guardar cambios" : "Crear borrador"}</button>
        </div>
      </div>
      {error ? <div className="rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] font-semibold text-danger">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          <section className="tarjeta grid gap-3.5 p-5 sm:grid-cols-2">
            <div className="titulo-seccion sm:col-span-2">Cliente</div>
            {campo("cliente", "Razón social o nombre", "Ej. Granja Avícola Tiabaya S.A.C.", "sm:col-span-2")}
            <label>
              <span className="etiqueta">RUC / DNI</span>
              <input className={`campo num ${f.ruc_dni && !docValido(f.ruc_dni.trim()) ? "border-danger" : ""}`} inputMode="numeric" value={f.ruc_dni} onChange={(e) => poner("ruc_dni", e.target.value.replace(/\D/g, ""))} />
              {f.ruc_dni && !docValido(f.ruc_dni.trim()) ? <span className="mt-1 block text-[12px] font-semibold text-danger">{f.ruc_dni.length === 11 ? "El dígito verificador del RUC no cuadra." : "DNI: 8 dígitos · RUC: 11 dígitos."}</span> : null}
            </label>
            {campo("telefono", "Teléfono / WhatsApp", "Ej. 959 214 377")}
            {campo("atencion", "Atención (persona de contacto)", "Ej. Marco Zegarra")}
            {campo("correo", "Correo", "contacto@cliente.com")}
            {campo("direccion", "Dirección", "", "sm:col-span-2")}
          </section>

          <section className="tarjeta overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
              <div className="titulo-seccion">Ítems <span className="font-medium text-text-3">· {items.length}</span></div>
              <select className="campo h-9 w-auto min-w-[220px]" value={kitElegido} onChange={(e) => void agregarKit(e.target.value)}>
                <option value="">+ Agregar un kit…</option>
                {kits.map((k) => <option key={k.id} value={k.id}>{k.nombre}{k.totales ? ` · ${dinero(k.totales.total)}` : ""}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-[13.5px]">
                <thead><tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3"><th className="w-8 px-3 py-2.5">#</th><th className="px-3 py-2.5">Descripción</th><th className="px-2 py-2.5">Cant.</th><th className="px-2 py-2.5 text-right">P. unit. (con IGV)</th><th className="px-2 py-2.5">Desc. %</th><th className="px-3 py-2.5 text-right">Importe</th><th className="w-20" /></tr></thead>
                <tbody>
                  {items.map((i, n) => {
                    const imp = importeLinea({ ...i, descuento_pct: i.descuento_pct || "0" });
                    return (
                      <tr key={n} className="border-b border-border align-top last:border-0">
                        <td className="num px-3 py-2.5 text-text-3">{n + 1}</td>
                        <td className="px-3 py-2">
                          <input className="w-full bg-transparent font-semibold outline-none" value={i.descripcion} onChange={(e) => setItem(n, { descripcion: e.target.value })} />
                          <input className="w-full bg-transparent text-[12px] text-text-3 outline-none placeholder:text-text-3/60" placeholder={[i.codigo, i.unidad].filter(Boolean).join(" · ") || "Detalle (opcional)"} value={i.detalle ?? ""} onChange={(e) => setItem(n, { detalle: e.target.value || null })} />
                        </td>
                        <td className="px-2 py-2"><input className="campo num h-8 w-16 px-2 text-center" value={i.cantidad} onChange={(e) => setItem(n, { cantidad: e.target.value })} /></td>
                        <td className="px-2 py-2 text-right"><input className={`campo num h-8 w-28 px-2 text-right ${i.precio_unitario === "" ? "border-danger" : ""}`} placeholder="precio" value={i.precio_unitario} onChange={(e) => setItem(n, { precio_unitario: e.target.value })} /></td>
                        <td className="px-2 py-2"><input className="campo num h-8 w-16 px-2 text-center" value={i.descuento_pct} onChange={(e) => setItem(n, { descuento_pct: e.target.value })} /></td>
                        <td className="num whitespace-nowrap px-3 py-2.5 text-right font-bold">{imp ? dinero(imp) : <span className="text-danger">—</span>}</td>
                        <td className="px-1 py-1.5">
                          <div className="flex">
                            <button className="grid h-7 w-6 place-items-center text-text-3 hover:text-text" title="Subir" onClick={() => mover(n, -1)}><Icono n="arrow_upward" t={15} /></button>
                            <button className="grid h-7 w-6 place-items-center text-text-3 hover:text-text" title="Bajar" onClick={() => mover(n, 1)}><Icono n="arrow_downward" t={15} /></button>
                            <button className="grid h-7 w-7 place-items-center rounded-lg text-text-3 hover:bg-danger-soft hover:text-danger" title="Quitar" onClick={() => setItems(items.filter((_, j) => j !== n))}><Icono n="close" t={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!items.length ? <div className="p-6 text-center text-[13px] text-text-3">Busca productos del catálogo abajo, o agrega un kit.</div> : null}
            </div>
            <div className="flex flex-col gap-2 border-t border-border p-4">
              <BuscadorProducto productos={productos} onElegir={agregarProducto} />
              <button className="w-fit text-[13px] font-semibold text-primary-ink" onClick={() => setItems([...items, { producto_id: null, codigo: null, descripcion: "", detalle: null, unidad: null, cantidad: "1", precio_unitario: "", descuento_pct: "0" }])}>+ Agregar ítem libre (servicio, mano de obra…)</button>
              <p className="text-[12px] text-text-3">Los precios del catálogo ya incluyen IGV. Lo que cambies aquí queda solo en esta cotización (no cambia el catálogo ni el kit).</p>
            </div>
          </section>

          <section className="tarjeta grid gap-3.5 p-5 sm:grid-cols-2">
            <div className="titulo-seccion sm:col-span-2">Sistema propuesto y condiciones</div>
            <label className="sm:col-span-2"><span className="etiqueta">Sistema propuesto</span><textarea className="campo h-auto py-2.5" rows={2} placeholder="Ej. Sistema híbrido 20 kWp · Victron — 36 paneles 550 W, 3 inversores 5 kVA" value={f.sistema} onChange={(e) => poner("sistema", e.target.value)} /></label>
            <label className="sm:col-span-2"><span className="etiqueta">Condiciones (forma de pago, plazo, garantía, qué incluye)</span><textarea className="campo h-auto py-2.5" rows={5} value={f.condiciones} onChange={(e) => poner("condiciones", e.target.value)} /></label>
            {campo("banco", "Banco para el depósito", "Ej. BCP")}
            {campo("moneda", "Moneda de la cuenta", "Ej. Soles")}
            {campo("nro_cuenta", "N.º de cuenta")}
            {campo("cci", "CCI")}
            <p className="text-[12px] text-text-3 sm:col-span-2">Si dejas vacíos los datos del depósito, el PDF usa las cuentas bancarias de Configuración › Datos de la empresa.</p>
          </section>
        </div>

        <aside className="flex h-fit flex-col gap-4 xl:sticky xl:top-4">
          <section className="tarjeta p-5">
            <div className="titulo-seccion mb-3">Totales</div>
            <label className="mb-3 block"><span className="etiqueta">Descuento comercial (S/)</span><input className="campo num" inputMode="decimal" placeholder="0.00" value={f.descuento} onChange={(e) => poner("descuento", e.target.value)} /></label>
            {totales ? (
              <div className="text-[13.5px]">
                {[["Subtotal (con IGV)", totales.subtotal], ["Descuentos por ítem", totales.descuento_lineas, true], ["Descuento comercial", totales.descuento, true], ["Valor de venta", totales.valor_venta], ["IGV 18%", totales.igv]].map(([a, b, menos]) =>
                  menos && b === "0.00" ? null : <div key={a as string} className="flex justify-between py-0.5"><span className="text-text-3">{a}</span><span className="num">{menos ? `− ${dinero(b as string)}` : dinero(b as string)}</span></div>,
                )}
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-[17px] font-extrabold"><span>Total</span><span className="num">{dinero(totales.total)}</span></div>
                {usd ? <div className="num mt-0.5 text-right text-[12px] text-text-3">≈ {dinero(usd, "USD")} · TC {tc}</div> : null}
              </div>
            ) : <div className="text-[13px] text-text-3">{items.length ? "Hay algún número mal escrito o el descuento supera el total." : "Agrega ítems para ver el total."}</div>}
            <p className="mt-3 text-[11.5px] text-text-3">Vista previa: al guardar, el servidor vuelve a calcular todo.</p>
          </section>
          <section className="tarjeta flex flex-col gap-3.5 p-5">
            {campo("vendedor", "Asesor", "")}
            <label><span className="etiqueta">Validez (días)</span><input className="campo num" inputMode="numeric" value={f.validez_dias} onChange={(e) => poner("validez_dias", e.target.value.replace(/\D/g, ""))} /></label>
            {proyectos.length ? (
              <label><span className="etiqueta">Proyecto (opcional)</span>
                <select className="campo" value={f.proyecto_id} onChange={(e) => poner("proyecto_id", e.target.value)}><option value="">Ninguno</option>{proyectos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select>
              </label>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
