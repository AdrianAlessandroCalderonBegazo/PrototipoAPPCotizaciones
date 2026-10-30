// Cargar lista (diseño ERP_ICR.zip › Comparador › Cargar lista): 4 pasos. El archivo se lee en el navegador; el servidor valida,
// muestra la vista previa y solo guarda al confirmar (los precios se agregan al historial, nunca se borran).
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { hoyLima } from "../../formato";
import type { FilaImport, Proveedor, RespuestaImport } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { CAMPOS_LISTA, claveTitulo, filasParaImportar, leerArchivo, mapeoInicial, type Tabla } from "./lector";

const msg = (x: unknown) => (x instanceof Error ? x.message : undefined);
const PASOS = ["Proveedor y archivo", "Columnas", "Revisar", "Confirmar"];
const ESTADO_FILA: Record<FilaImport["estado"], [string, string]> = {
  nuevo: ["Nuevo", "var(--success)"], cambio: ["Cambió de precio", "var(--primary)"], igual: ["Sin cambios", "var(--text-3)"], error: ["Error", "var(--danger)"], duplicado: ["Repetido", "var(--warning)"],
};
type Config = { mapeo?: Record<string, string>; moneda?: "PEN" | "USD" | null; incluye_igv?: boolean } | null;

export function CargarLista({ inicial, onListo }: { inicial: number | null; onListo: () => void }) {
  const { datos, error, cargando, recargar } = useDatos(() => api<{ proveedores: Proveedor[] }>("GET", "/comparador/proveedores"));
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  const activos = (datos?.proveedores ?? []).filter((p) => p.activo);
  if (!activos.length) return <div className="tarjeta p-6 text-center text-[13.5px] text-text-2">Primero registra al proveedor en la pestaña «Proveedores».</div>;
  return <Asistente proveedores={activos} inicial={inicial} onListo={onListo} />;
}

function Asistente({ proveedores, inicial, onListo }: { proveedores: Proveedor[]; inicial: number | null; onListo: () => void }) {
  const avisar = useAvisos();
  const [paso, setPaso] = useState(0);
  const [provId, setProvId] = useState<number>(inicial && proveedores.some((p) => p.id === inicial) ? inicial : proveedores[0].id);
  const [fechaLista, setFechaLista] = useState(hoyLima());
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tablas, setTablas] = useState<Tabla[] | null>(null);
  const [hoja, setHoja] = useState(0);
  const [titulos, setTitulos] = useState(0);
  const [moneda, setMoneda] = useState<"" | "PEN" | "USD">("");
  const [igv, setIgv] = useState<boolean | null>(null);
  const [config, setConfig] = useState<Config>(null);
  const [mapeo, setMapeo] = useState<string[]>([]);
  const [secciones, setSecciones] = useState(true);
  const [duplicados, setDuplicados] = useState<"ultimo" | "omitir">("ultimo");
  const [vista, setVista] = useState<RespuestaImport | null>(null);
  const [filtro, setFiltro] = useState<FilaImport["estado"] | "todas">("todas");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [hecho, setHecho] = useState<RespuestaImport | null>(null);
  const prov = proveedores.find((p) => p.id === provId)!;

  // Lo que se recuerda del proveedor: cómo se leyó su última lista (columnas, moneda, IGV).
  useEffect(() => {
    let vivo = true;
    api<Config>("GET", `/comparador/proveedores/${provId}/mapeo`).then((c) => {
      if (!vivo) return;
      setConfig(c);
      setMoneda(c?.moneda ?? prov.moneda ?? "");
      setIgv(typeof c?.incluye_igv === "boolean" ? c.incluye_igv : null);
    }).catch(() => vivo && setConfig(null));
    return () => void (vivo = false);
  }, [provId, prov.moneda]);

  const tabla = tablas?.[hoja] ?? null;
  const conTitulos = useMemo<Tabla | null>(() => (tabla ? { ...tabla, encabezado: titulos } : null), [tabla, titulos]);
  const filaTitulos = useMemo(() => conTitulos?.filas[titulos] ?? [], [conTitulos, titulos]);
  const nCols = useMemo(() => Math.max(0, ...(conTitulos?.filas.slice(titulos, titulos + 50).map((f) => f.length) ?? [0])), [conTitulos, titulos]);
  useEffect(() => {
    const t = Array.from({ length: nCols }, (_, i) => filaTitulos[i] ?? "");
    setMapeo(mapeoInicial(t, config?.mapeo));
  }, [filaTitulos, nCols, config]);
  const filas = useMemo(() => (conTitulos ? filasParaImportar(conTitulos, mapeo, secciones) : []), [conTitulos, mapeo, secciones]);

  const abrir = async (f: File | null) => {
    setArchivo(f);
    setTablas(null);
    setVista(null);
    if (!f) return;
    setOcupado("Leyendo el archivo…");
    try {
      const t = await leerArchivo(f);
      const i = Math.max(0, t.findIndex((x) => x.filas.length > 1));
      setTablas(t);
      setHoja(i);
      setTitulos(t[i]?.encabezado ?? 0);
    } catch (x) {
      avisar("No se pudo leer el archivo", msg(x) ?? "Revisa que sea un Excel, CSV o PDF con texto (no una foto).", "error");
      setArchivo(null);
    } finally {
      setOcupado(null);
    }
  };
  const cuerpo = (confirmar: boolean, dup = duplicados) => ({
    proveedor_id: provId, fecha_lista: fechaLista, moneda: moneda || null, incluye_igv: igv, archivo: archivo?.name, duplicados: dup, confirmar, filas,
    mapeo: Object.fromEntries(mapeo.map((c, i) => [claveTitulo(filaTitulos[i] ?? `col${i + 1}`), c]).filter(([k, c]) => k && c !== undefined)),
  });
  const revisar = async (dup = duplicados) => {
    setOcupado("Revisando la lista…");
    try {
      setVista(await api<RespuestaImport>("POST", "/comparador/importar", { cuerpo: cuerpo(false, dup) }));
      setPaso(2);
    } catch (x) {
      avisar("No se pudo revisar la lista", msg(x), "error");
    } finally {
      setOcupado(null);
    }
  };
  const confirmar = async () => {
    setOcupado("Guardando los precios…");
    try {
      const r = await api<RespuestaImport>("POST", "/comparador/importar", { cuerpo: cuerpo(true) });
      setHecho(r);
      avisar("Lista cargada", `${r.resumen.nuevos} nuevos · ${r.resumen.cambiaron} cambiaron · ${r.resumen.sin_cambios} sin cambios`);
    } catch (x) {
      avisar("No se pudo guardar la lista", msg(x), "error");
    } finally {
      setOcupado(null);
    }
  };

  const listo1 = !!tabla && !!fechaLista && igv !== null;
  const tieneDesc = mapeo.includes("descripcion");
  const tienePrecio = mapeo.includes("precio");
  const sinMoneda = !moneda && !mapeo.includes("moneda");

  if (hecho) {
    const r = hecho.resumen;
    return (
      <div className="tarjeta flex flex-col items-center gap-3 p-8 text-center">
        <Icono n="task_alt" t={44} className="text-success" />
        <div className="text-[18px] font-extrabold">Lista de {prov.nombre} cargada</div>
        <div className="text-[13.5px] text-text-2"><b>{r.nuevos}</b> productos nuevos · <b>{r.cambiaron}</b> cambiaron de precio · <b>{r.sin_cambios}</b> sin cambios · <b>{r.errores}</b> filas con error (no se guardaron) · <b>{r.duplicados}</b> repetidas</div>
        <div className="text-[12.5px] text-text-3">Los precios anteriores se conservan en el historial.</div>
        <div className="flex gap-2"><button className="btn-secundario" onClick={() => { setHecho(null); setPaso(0); void abrir(null); }}>Cargar otra lista</button><button className="btn-primario" onClick={onListo}><Icono n="search" t={18} />Ir al buscador</button></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-2">
        {PASOS.map((p, i) => (
          <li key={p} className={`flex h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] font-semibold ${i === paso ? "border-primary bg-primary-soft text-primary-ink" : i < paso ? "border-border text-success" : "border-border text-text-3"}`}>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-surface text-[11px] font-extrabold">{i < paso ? "✓" : i + 1}</span>{p}
          </li>
        ))}
      </ol>
      {ocupado ? <div className="tarjeta flex items-center gap-2 p-3 text-[13px] text-text-2"><Icono n="hourglass_top" t={18} />{ocupado}</div> : null}

      {paso === 0 ? (
        <div className="tarjeta grid gap-4 p-5 md:grid-cols-2">
          <label><span className="etiqueta">Proveedor *</span>
            <select className="campo" value={provId} onChange={(e) => setProvId(Number(e.target.value))}>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </label>
          <label><span className="etiqueta">Fecha de la lista *</span><input className="campo" type="date" max={hoyLima()} value={fechaLista} onChange={(e) => setFechaLista(e.target.value)} /></label>
          <label className="md:col-span-2"><span className="etiqueta">Archivo (Excel .xlsx, CSV o PDF) *</span>
            <input className="campo pt-2" type="file" accept=".xlsx,.csv,.txt,.pdf" onChange={(e) => void abrir(e.target.files?.[0] ?? null)} />
          </label>
          {tablas && tablas.length > 1 ? (
            <label><span className="etiqueta">Hoja</span>
              <select className="campo" value={hoja} onChange={(e) => { const i = Number(e.target.value); setHoja(i); setTitulos(tablas[i].encabezado); }}>{tablas.map((t, i) => <option key={i} value={i}>{t.nombre} ({t.filas.length} filas)</option>)}</select>
            </label>
          ) : null}
          {tabla ? (
            <label><span className="etiqueta">Fila de títulos</span>
              <input className="campo num" type="number" min={1} max={tabla.filas.length} value={titulos + 1} onChange={(e) => setTitulos(Math.min(tabla.filas.length - 1, Math.max(0, Number(e.target.value) - 1)))} />
              <span className="mt-1 block truncate text-[12px] text-text-3">{(tabla.filas[titulos] ?? []).filter(Boolean).join(" · ") || "Fila vacía"}</span>
            </label>
          ) : null}
          <label><span className="etiqueta">Moneda de la lista</span>
            <select className="campo" value={moneda} onChange={(e) => setMoneda(e.target.value as "" | "PEN" | "USD")}>
              <option value="">Según cada precio (S/ o $)</option><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option>
            </select>
          </label>
          <fieldset><span className="etiqueta">¿Los precios incluyen IGV? *</span>
            <div className="flex gap-2">
              {[[true, "Sí, incluyen IGV"], [false, "No, son sin IGV"]].map(([v, l]) => (
                <button key={String(v)} type="button" onClick={() => setIgv(v as boolean)} className={`h-10 flex-1 rounded-xl border px-3 text-[13px] font-semibold ${igv === v ? "border-primary bg-primary-soft text-primary-ink" : "border-border-strong text-text-2"}`}>{l as string}</button>
              ))}
            </div>
            {igv === null ? <span className="mt-1 block text-[12px] text-warning">Elige una opción: cambia el precio comparado en 18 %.</span> : null}
          </fieldset>
          {config ? <p className="text-[12px] text-text-3 md:col-span-2">Se recuerda cómo se leyó la última lista de {prov.nombre} (columnas, moneda e IGV). Revísalo igual.</p> : null}
          <div className="flex justify-end md:col-span-2"><button className="btn-primario" disabled={!listo1 || !!ocupado} onClick={() => setPaso(1)}>Siguiente<Icono n="arrow_forward" t={18} /></button></div>
        </div>
      ) : null}

      {paso === 1 && conTitulos ? (
        <div className="tarjeta flex flex-col gap-4 p-5">
          <div className="text-[13px] text-text-2">Indica qué es cada columna. Lo que no se elija no se importa. Se necesitan al menos <b>Descripción</b> y <b>Precio</b>.</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr>{Array.from({ length: nCols }, (_, i) => (
                  <th key={i} className="min-w-[130px] border-b border-border px-2 pb-2 align-bottom">
                    <div className="mb-1 truncate text-[11.5px] font-bold text-text-3">{filaTitulos[i] || `Columna ${i + 1}`}</div>
                    <select className="campo h-9 text-[12.5px]" value={mapeo[i] ?? ""} onChange={(e) => setMapeo(mapeo.map((m, j) => (j === i ? e.target.value : m === e.target.value && e.target.value ? "" : m)))}>
                      {CAMPOS_LISTA.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
                    </select>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {conTitulos.filas.slice(titulos + 1, titulos + 9).map((f, j) => (
                  <tr key={j} className="border-b border-border">{Array.from({ length: nCols }, (_, i) => <td key={i} className={`max-w-[220px] truncate px-2 py-1.5 ${mapeo[i] ? "" : "text-text-3"}`}>{f[i] ?? ""}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={secciones} onChange={(e) => setSecciones(e.target.checked)} />Usar los títulos de sección (filas con un solo texto, ej. «CARGADORES») como categoría</label>
          <div className="text-[12.5px] text-text-3">{filas.length} filas para revisar{sinMoneda ? " · la moneda se toma de cada precio (S/ o $); si no se ve, la fila sale con error" : ""}.</div>
          <div className="flex justify-between">
            <button className="btn-secundario" onClick={() => setPaso(0)}><Icono n="arrow_back" t={18} />Atrás</button>
            <button className="btn-primario" disabled={!tieneDesc || !tienePrecio || !filas.length || !!ocupado} onClick={() => void revisar()}>Revisar la lista<Icono n="arrow_forward" t={18} /></button>
          </div>
        </div>
      ) : null}

      {paso === 2 && vista ? (
        <div className="tarjeta flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {([["nuevo", vista.resumen.nuevos], ["cambio", vista.resumen.cambiaron], ["igual", vista.resumen.sin_cambios], ["duplicado", vista.resumen.duplicados], ["error", vista.resumen.errores]] as const).map(([k, n]) => (
              <button key={k} onClick={() => setFiltro(filtro === k ? "todas" : k)} className={`rounded-xl border p-3 text-left ${filtro === k ? "border-primary" : "border-border"}`}>
                <div className="num text-[20px] font-extrabold">{n}</div><div className="text-[12px] font-semibold" style={{ color: ESTADO_FILA[k][1] }}>{ESTADO_FILA[k][0]}</div>
              </button>
            ))}
          </div>
          {vista.duplicados.length ? (
            <div className="rounded-xl border border-border p-3 text-[12.5px]">
              <div className="mb-1 font-bold">{vista.duplicados.length} producto{vista.duplicados.length === 1 ? "" : "s"} repetido{vista.duplicados.length === 1 ? "" : "s"} en el archivo</div>
              <div className="flex flex-wrap items-center gap-2">
                ¿Qué hacer?
                {([["ultimo", "Conservar la última fila"], ["omitir", "No importarlos"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setDuplicados(k); void revisar(k); }} className={`h-8 rounded-full border px-3 font-semibold ${duplicados === k ? "border-primary bg-primary-soft text-primary-ink" : "border-border-strong text-text-2"}`}>{l}</button>
                ))}
              </div>
              <ul className="mt-2 list-disc pl-5 text-text-2">{vista.duplicados.slice(0, 5).map((d) => <li key={d.filas.join()}>{d.descripcion} · filas {d.filas.join(", ")} · precios {d.precios.join(" / ")}</li>)}</ul>
            </div>
          ) : null}
          <div className="text-[12.5px] text-text-2">
            Sin dato (se guardan vacíos, no se inventan): {Object.entries(vista.resumen.sin_dato).filter(([, n]) => n).map(([k, n]) => `${CAMPOS_LISTA.find((c) => c.k === k)?.l ?? k} en ${n} filas`).join(" · ") || "ninguno"}.
          </div>
          <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[820px] border-collapse text-left text-[12.5px]">
              <thead className="sticky top-0 bg-surface"><tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-text-3">{["Fila", "Descripción", "Modelo / código", "Categoría", "Precio", "Antes", "Estado"].map((c) => <th key={c} className="px-2 py-2">{c}</th>)}</tr></thead>
              <tbody>
                {vista.filas.filter((f) => filtro === "todas" || f.estado === filtro).slice(0, 500).map((f) => (
                  <tr key={f.fila} className="border-b border-border">
                    <td className="num px-2 py-1.5 text-text-3">{f.fila}</td>
                    <td className="max-w-[300px] px-2 py-1.5">{f.descripcion ?? "Sin dato"}</td>
                    <td className="px-2 py-1.5 font-mono text-[11.5px]">{f.modelo ?? f.codigo ?? "Sin dato"}</td>
                    <td className="px-2 py-1.5 text-text-2">{f.categoria ?? ""}</td>
                    <td className="num whitespace-nowrap px-2 py-1.5">{f.precio ? `${f.moneda === "USD" ? "US$" : "S/"} ${f.precio}` : ""}{f.aviso ? <div className="text-[11px] text-warning">{f.aviso}</div> : null}</td>
                    <td className="num whitespace-nowrap px-2 py-1.5 text-text-3">{f.precio_anterior ?? ""}</td>
                    <td className="px-2 py-1.5 font-semibold" style={{ color: ESTADO_FILA[f.estado][1] }}>{ESTADO_FILA[f.estado][0]}{f.mensaje ? <div className="font-normal">{f.mensaje}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <button className="btn-secundario" onClick={() => setPaso(1)}><Icono n="arrow_back" t={18} />Atrás</button>
            <button className="btn-primario" disabled={!(vista.resumen.nuevos + vista.resumen.cambiaron + vista.resumen.sin_cambios)} onClick={() => setPaso(3)}>Siguiente<Icono n="arrow_forward" t={18} /></button>
          </div>
        </div>
      ) : null}

      {paso === 3 && vista ? (
        <div className="tarjeta flex flex-col gap-3 p-5 text-[13.5px]">
          <div className="text-[16px] font-extrabold">¿Guardar la lista de {prov.nombre}?</div>
          <ul className="list-disc pl-5 text-text-2">
            <li>Archivo: <b>{archivo?.name}</b> · fecha de la lista <b>{fechaLista}</b> · precios <b>{igv ? "con IGV" : "sin IGV"}</b>{moneda ? <> · en <b>{moneda === "USD" ? "dólares" : "soles"}</b></> : null}</li>
            <li><b>{vista.resumen.nuevos}</b> productos nuevos, <b>{vista.resumen.cambiaron}</b> con precio nuevo y <b>{vista.resumen.sin_cambios}</b> sin cambios (igual se registra el precio de esta fecha).</li>
            <li><b>{vista.resumen.errores}</b> filas con error no se guardan.</li>
            <li>No se borra ni se cambia ningún precio anterior: quedan en el historial.</li>
          </ul>
          <div className="flex justify-between">
            <button className="btn-secundario" onClick={() => setPaso(2)}><Icono n="arrow_back" t={18} />Atrás</button>
            <button className="btn-primario" disabled={!!ocupado} onClick={() => void confirmar()}><Icono n="save" t={18} />Guardar precios</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
