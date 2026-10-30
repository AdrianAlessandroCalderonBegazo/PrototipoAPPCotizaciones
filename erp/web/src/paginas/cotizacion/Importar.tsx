import { useRef, useState } from "react";
import { api, subirImagen } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { Pildora } from "../../componentes/Pildora";
import { dinero } from "../../dinero";
import { CAMPOS, leerCsv, mapeoAutomatico } from "./csv";

type FilaRes = { fila: number; codigo: string | null; nombre: string | null; estado: "nuevo" | "actualizado" | "sin_cambios" | "error"; error: string | null; cambios: string[]; precio_anterior: string | null; precio_nuevo: string | null };
type Resumen = { nuevos: number; actualizados: number; sin_cambios: number; errores: number; variacion_promedio_pct: number | null; kits_afectados: number; kits_total: number };
type Resultado = { confirmado: boolean; resumen: Resumen; filas: FilaRes[] };

const PASOS = ["Archivo", "Columnas", "Vista previa", "Confirmar"];
const ESTADO: Record<FilaRes["estado"], [string, "exito" | "primario" | "neutro" | "peligro"]> = {
  nuevo: ["Nuevo", "exito"], actualizado: ["Actualizado", "primario"], sin_cambios: ["Sin cambios", "neutro"], error: ["Error", "peligro"],
};

export function ImportarCsv({ onCerrar, onHecho }: { onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState<{ nombre: string; tam: number } | null>(null);
  const [tabla, setTabla] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<string[]>([]);
  const [res, setRes] = useState<Resultado | null>(null);
  const [verTodo, setVerTodo] = useState<"todos" | "error" | "cambios">("cambios");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const leer = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > 10 * 1024 * 1024) return setError("El archivo pesa más de 10 MB.");
    const filas = leerCsv(await f.text());
    if (filas.length < 2) return setError("El archivo no tiene filas (además de los títulos).");
    setArchivo({ nombre: f.name, tam: f.size });
    setTabla(filas);
    setMapeo(mapeoAutomatico(filas[0]));
  };
  const filasMapeadas = () =>
    tabla.slice(1).map((f) => Object.fromEntries(mapeo.map((k, i) => [k, f[i] ?? ""]).filter(([k]) => k)));
  const enviar = async (confirmar: boolean) => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await api<Resultado>("POST", "/catalogo/importar", { cuerpo: { filas: filasMapeadas(), confirmar, archivo: archivo?.nombre } });
      setRes(r);
      if (confirmar) {
        avisar("Catálogo actualizado", `${r.resumen.nuevos} nuevos · ${r.resumen.actualizados} actualizados`);
        onHecho();
        onCerrar();
      } else setPaso(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar.");
    } finally {
      setTrabajando(false);
    }
  };
  const siguiente = () => {
    if (paso === 1) return tabla.length ? setPaso(2) : setError("Elige el archivo CSV.");
    if (paso === 2) {
      if (!mapeo.includes("codigo")) return setError("Indica qué columna es el Código: es la clave para reconocer cada producto.");
      return void enviar(false);
    }
    if (paso === 3) return setPaso(4);
    void enviar(true);
  };
  const filasVista = (res?.filas ?? []).filter((f) => verTodo === "todos" || (verTodo === "error" ? f.estado === "error" : f.estado === "nuevo" || f.estado === "actualizado" || f.estado === "error"));

  return (
    <Modal titulo="Importar catálogo desde CSV" icono="upload_file" ancho={760} onCerrar={onCerrar}
      pie={<><button className="btn-secundario" onClick={() => (paso === 1 ? onCerrar() : setPaso(paso - 1))}>{paso === 1 ? "Cancelar" : "Atrás"}</button><button className="btn-primario" disabled={trabajando || (paso === 4 && !res)} onClick={siguiente}>{trabajando ? "Procesando…" : paso === 4 ? "Confirmar importación" : "Siguiente"}</button></>}>
      <div className="mb-4 flex flex-wrap gap-2">
        {PASOS.map((l, i) => (
          <div key={l} className={`flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-semibold ${paso === i + 1 ? "bg-primary-soft text-primary-ink" : paso > i + 1 ? "text-success" : "text-text-3"}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-extrabold ${paso > i + 1 ? "bg-success-soft" : "bg-surface-2"}`}>{paso > i + 1 ? "✓" : i + 1}</span>{l}
          </div>
        ))}
      </div>
      {paso === 1 ? (
        <div className="flex flex-col gap-3">
          <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => void leer(e.target.files?.[0])} />
          <button onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void leer(e.dataTransfer.files[0]); }} className="grid place-items-center rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center hover:border-primary-line">
            <Icono n="cloud_upload" t={36} className="text-primary" />
            <div className="mt-2 font-bold">Arrastra tu archivo CSV o haz clic para elegirlo</div>
            <div className="text-[12.5px] text-text-3">Separado por comas o punto y coma · UTF-8 · hasta 10 MB · la primera fila son los títulos</div>
          </button>
          {archivo ? (
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <Icono n="description" className="text-primary" />
              <div className="flex-1"><div className="font-semibold">{archivo.nombre}</div><div className="text-[12px] text-text-3">{tabla.length - 1} filas · {tabla[0].length} columnas · {Math.ceil(archivo.tam / 1024)} KB</div></div>
              <Icono n="check_circle" relleno className="text-success" />
            </div>
          ) : null}
          <p className="text-[12.5px] text-text-3">Desde Excel: Archivo › Guardar como › «CSV UTF-8». Los precios van con IGV, como en el catálogo actual.</p>
        </div>
      ) : null}
      {paso === 2 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-text-2">Indica a qué campo del ERP corresponde cada columna. Detectamos la mayoría automáticamente. El <b>código</b> es obligatorio: con él se reconoce si el producto ya existe.</p>
          {tabla[0].map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
              <span className="min-w-[140px] flex-1 font-semibold">{t || `Columna ${i + 1}`}</span>
              <Icono n="arrow_forward" t={18} className="text-text-3" />
              <select className="campo h-9 w-[220px]" value={mapeo[i]} onChange={(e) => setMapeo(mapeo.map((m, j) => (j === i ? e.target.value : m === e.target.value && e.target.value ? "" : m)))}>
                {CAMPOS.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
              </select>
              <span className="min-w-[120px] flex-1 truncate text-[12px] text-text-3">Ej.: {tabla[1]?.[i] || "—"}</span>
            </div>
          ))}
        </div>
      ) : null}
      {paso >= 3 && res ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Nuevos", res.resumen.nuevos, "var(--success)"], ["Actualizados", res.resumen.actualizados, "var(--primary-ink)"], ["Sin cambios", res.resumen.sin_cambios, "var(--text-3)"], ["Con errores (se omiten)", res.resumen.errores, "var(--danger)"]].map(([l, n, c]) => (
              <div key={l as string} className="rounded-xl border border-border p-3"><div className="num text-[22px] font-extrabold" style={{ color: c as string }}>{n}</div><div className="text-[12px] text-text-3">{l}</div></div>
            ))}
          </div>
          {paso === 3 ? (
            <>
              <div className="flex gap-1.5">
                {([["cambios", "Cambios y errores"], ["error", "Solo errores"], ["todos", "Todas"]] as const).map(([k, l]) => <button key={k} onClick={() => setVerTodo(k)} className={`h-8 rounded-lg px-2.5 text-[12.5px] font-semibold ${verTodo === k ? "bg-primary-soft text-primary-ink" : "text-text-2 hover:bg-surface-2"}`}>{l}</button>)}
              </div>
              <div className="max-h-[320px] overflow-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-left text-[12.5px]">
                  <thead className="sticky top-0 bg-surface"><tr className="border-b border-border text-[11.5px] font-bold uppercase text-text-3"><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2 text-right">Precio</th></tr></thead>
                  <tbody>
                    {filasVista.slice(0, 300).map((f) => (
                      <tr key={f.fila} className="border-b border-border last:border-0 align-top">
                        <td className="num px-3 py-2 text-text-3">{f.fila}</td>
                        <td className="px-3 py-2"><div className="font-semibold">{f.nombre ?? "—"}</div><div className="font-mono text-[11.5px] text-text-3">{f.codigo ?? "sin código"}</div></td>
                        <td className="px-3 py-2"><Pildora tono={ESTADO[f.estado][1]}>{ESTADO[f.estado][0]}</Pildora>{f.error ? <div className="mt-1 text-[11.5px] text-danger">{f.error}</div> : f.cambios.length ? <div className="mt-1 text-[11.5px] text-text-3">{f.cambios.length} campo(s)</div> : null}</td>
                        <td className="num whitespace-nowrap px-3 py-2 text-right">{f.precio_anterior && f.precio_nuevo && f.precio_anterior !== f.precio_nuevo ? <><span className="mr-1 text-text-3 line-through">{dinero(f.precio_anterior)}</span><b>{dinero(f.precio_nuevo)}</b></> : dinero(f.precio_nuevo ?? f.precio_anterior)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filasVista.length ? <div className="p-4 text-center text-[13px] text-text-3">Nada que mostrar con este filtro.</div> : null}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-surface-2 p-3 text-[13px]">
              <div className="mb-1.5 font-bold">Resumen antes de confirmar</div>
              {[["Archivo", archivo?.nombre ?? ""], ["Productos nuevos", String(res.resumen.nuevos)], ["Productos actualizados", `${res.resumen.actualizados}${res.resumen.variacion_promedio_pct !== null ? ` (precio promedio ${res.resumen.variacion_promedio_pct >= 0 ? "+" : ""}${res.resumen.variacion_promedio_pct}%)` : ""}`], ["Filas omitidas por errores", String(res.resumen.errores)], ["Kits afectados por cambio de precio", `${res.resumen.kits_afectados} de ${res.resumen.kits_total}`]].map(([a, b]) => (
                <div key={a} className="flex justify-between gap-3 py-0.5"><span className="text-text-3">{a}</span><b>{b}</b></div>
              ))}
              <div className="mt-2 text-[12.5px] text-text-3">Las cotizaciones ya hechas conservan sus precios originales.</div>
            </div>
          )}
        </div>
      ) : null}
      {error ? <div className="mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</div> : null}
    </Modal>
  );
}

type ImgVerif = { archivo: string; codigo: string; producto_id: number | null; producto: string | null; file: File; estado?: "subiendo" | "listo" | "error" };

export function CargarImagenes({ onCerrar, onHecho }: { onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const [lista, setLista] = useState<ImgVerif[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const elegir = async (files: FileList | null) => {
    const fs = [...(files ?? [])].filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (!fs.length) return setError("Elige imágenes JPG, PNG o WEBP.");
    setError(null);
    try {
      const v = await api<Omit<ImgVerif, "file">[]>("POST", "/catalogo/imagenes/verificar", { cuerpo: { nombres: fs.map((f) => f.name) } });
      setLista(v.map((x, i) => ({ ...x, file: fs[i] })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar.");
    }
  };
  const validas = lista.filter((x) => x.producto_id);
  const asignar = async () => {
    setTrabajando(true);
    const asignaciones: { producto_id: number; ruta: string }[] = [];
    for (const x of validas) {
      setLista((l) => l.map((y) => (y === x ? { ...y, estado: "subiendo" } : y)));
      try {
        asignaciones.push({ producto_id: x.producto_id!, ruta: await subirImagen(x.file) });
        setLista((l) => l.map((y) => (y.archivo === x.archivo ? { ...y, estado: "listo" } : y)));
      } catch {
        setLista((l) => l.map((y) => (y.archivo === x.archivo ? { ...y, estado: "error" } : y)));
      }
    }
    try {
      if (asignaciones.length) {
        const r = await api<{ asignadas: number }>("POST", "/catalogo/imagenes", { cuerpo: { asignaciones } });
        avisar("Imágenes asignadas", `${r.asignadas} productos actualizados`);
        onHecho();
        onCerrar();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron asignar.");
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <Modal titulo="Carga masiva de imágenes" icono="photo_library" ancho={620} onCerrar={onCerrar}
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={!validas.length || trabajando} onClick={asignar}>{trabajando ? "Subiendo…" : `Asignar ${validas.length} imagen${validas.length === 1 ? "" : "es"}`}</button></>}>
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void elegir(e.target.files)} />
      <button onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void elegir(e.dataTransfer.files); }} className="mb-3 grid w-full place-items-center rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center hover:border-primary-line">
        <Icono n="add_photo_alternate" t={32} className="text-primary" />
        <div className="mt-1 font-bold">Arrastra imágenes JPG, PNG o WEBP</div>
        <div className="text-[12.5px] text-text-3">Nombra cada archivo con el código del producto. Ej.: HW-50KTL.jpg → producto con código HW-50KTL</div>
      </button>
      <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
        {lista.map((x) => (
          <div key={x.archivo} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${x.producto_id ? "bg-success" : "bg-danger"}`} />
            <div className="min-w-0 flex-1"><div className="truncate font-mono text-[12.5px] font-semibold">{x.archivo}</div><div className="truncate text-[12px] text-text-3">{x.producto ?? `Ningún producto con el código «${x.codigo}»`}</div></div>
            <span className="text-[12px] font-semibold text-text-3">{x.estado === "subiendo" ? "Subiendo…" : x.estado === "listo" ? "Listo" : x.estado === "error" ? "Error" : x.producto_id ? "Coincide" : "Se omite"}</span>
          </div>
        ))}
      </div>
      {error ? <div className="mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</div> : null}
    </Modal>
  );
}
