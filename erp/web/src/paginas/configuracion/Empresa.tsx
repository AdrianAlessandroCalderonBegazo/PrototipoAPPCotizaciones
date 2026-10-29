import { useEffect, useRef, useState } from "react";
import { api, subirImagen } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { rucValido, SIN_DATO, texto } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { Empresa as TEmpresa } from "../../tipos";
import { useDatos } from "../../usarDatos";

const CAMPOS: { k: keyof TEmpresa; l: string; ph: string; ancho?: boolean }[] = [
  { k: "razon_social", l: "Razón social", ph: "Ej. Inversiones ICR S.R.L.", ancho: true },
  { k: "nombre_comercial", l: "Nombre comercial", ph: "Ej. ICR Energy" },
  { k: "ruc", l: "RUC", ph: "11 dígitos" },
  { k: "direccion", l: "Dirección", ph: "Calle, número, distrito", ancho: true },
  { k: "ciudad", l: "Ciudad", ph: "Ej. Arequipa" },
  { k: "telefono", l: "Teléfono", ph: "Ej. 954 123 456" },
  { k: "correo", l: "Correo", ph: "ventas@…" },
  { k: "web", l: "Página web", ph: "Ej. icrenergy.tech" },
];

export function Empresa() {
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const editar = puede(usuario, "configuracion", "completo");
  const { datos, error, cargando, recargar } = useDatos(() => api<TEmpresa>("GET", "/empresa"));
  const [e, setE] = useState<TEmpresa | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  useEffect(() => setE(datos), [datos]);

  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!e) return null;

  const val = (k: keyof TEmpresa) => e[k] ?? "";
  const poner = (k: keyof TEmpresa, v: string) => setE({ ...e, [k]: v });
  const rucMal = !!e.ruc && e.ruc.trim() !== "" && !rucValido(e.ruc.trim());
  const cambiado = JSON.stringify(e) !== JSON.stringify(datos);

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api<TEmpresa>("PUT", "/empresa", { cuerpo: e });
      setE(r);
      await recargar();
      avisar("Datos de la empresa guardados", "Se usarán en los PDF de cotizaciones y comprobantes.");
    } catch (err) {
      avisar("No se pudo guardar", err instanceof Error ? err.message : undefined, "error");
    } finally {
      setGuardando(false);
    }
  };
  const subirLogo = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    try {
      const ruta = await subirImagen(f);
      setE({ ...e, logo: ruta });
      avisar("Logo cargado", "Guarda los cambios para usarlo.", "info");
    } catch (err) {
      avisar("No se pudo subir el logo", err instanceof Error ? err.message : undefined, "error");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section className="tarjeta flex flex-col gap-4 p-5">
        <div className="titulo-seccion">Datos de la empresa</div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {CAMPOS.map((c) => (
            <label key={c.k} className={c.ancho ? "sm:col-span-2" : ""}>
              <span className="etiqueta">{c.l}</span>
              <input className={`campo ${c.k === "ruc" && rucMal ? "border-danger" : ""}`} disabled={!editar} placeholder={c.ph} value={val(c.k)} onChange={(ev) => poner(c.k, ev.target.value)} inputMode={c.k === "ruc" || c.k === "telefono" ? "numeric" : undefined} />
              {c.k === "ruc" && rucMal ? <span className="mt-1 block text-[12px] font-semibold text-danger">El RUC no es válido (revisa los 11 dígitos).</span> : null}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface-2 p-4">
          <div className="grid h-16 w-16 flex-shrink-0 place-items-center overflow-hidden rounded-2xl bg-navy text-[15px] font-extrabold text-white">
            {e.logo ? <img src={e.logo} alt="Logo" className="h-full w-full bg-white object-contain" /> : "ICR"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold">Logo</div>
            <div className="text-[12.5px] text-text-3">PNG, JPG o WEBP · fondo transparente · mínimo 400 px de ancho</div>
          </div>
          {editar ? (
            <>
              <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(ev) => void subirLogo(ev.target.files?.[0])} />
              {e.logo ? <button className="btn-secundario" onClick={() => setE({ ...e, logo: null })}>Quitar</button> : null}
              <button className="btn-secundario" disabled={subiendo} onClick={() => archivo.current?.click()}>
                <Icono n="upload" t={18} />
                {subiendo ? "Subiendo…" : e.logo ? "Cambiar logo" : "Subir logo"}
              </button>
            </>
          ) : null}
        </div>
        <label>
          <span className="etiqueta">Cuentas bancarias (para los PDF)</span>
          <textarea className="campo h-auto py-2.5" rows={3} disabled={!editar} placeholder="Ej. BCP Cta. cte. S/ … · CCI …" value={val("cuentas_bancarias")} onChange={(ev) => poner("cuentas_bancarias", ev.target.value)} />
        </label>
        <label>
          <span className="etiqueta">Condiciones y pie de los PDF</span>
          <textarea className="campo h-auto py-2.5" rows={4} disabled={!editar} placeholder="Forma de pago, plazos, validez…" value={val("pie_pdf")} onChange={(ev) => poner("pie_pdf", ev.target.value)} />
        </label>
        {editar ? (
          <div className="flex justify-end gap-2">
            {cambiado ? <button className="btn-secundario" onClick={() => setE(datos)}>Descartar</button> : null}
            <button className="btn-primario" disabled={!cambiado || guardando || rucMal} onClick={guardar}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        ) : null}
      </section>

      <section className="tarjeta flex h-fit flex-col gap-3 p-5">
        <div className="titulo-seccion">Vista previa del encabezado PDF</div>
        <div className="overflow-hidden rounded-2xl border border-border bg-white p-5 text-[#0E2233]">
          <div className="flex items-center gap-3.5 border-b-2 pb-3.5" style={{ borderColor: "#0F7590" }}>
            <div className="grid h-14 w-14 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-[#0E2233] text-[14px] font-extrabold text-white">
              {e.logo ? <img src={e.logo} alt="" className="h-full w-full bg-white object-contain" /> : "ICR"}
            </div>
            <div className="min-w-0">
              <div className="text-[16px] font-extrabold">{texto(e.razon_social)}</div>
              <div className="text-[12px] text-[#4A5D6E]">RUC {texto(e.ruc)} · {texto(e.direccion)}{e.ciudad ? `, ${e.ciudad}` : ""}</div>
            </div>
          </div>
          <div className="mt-3 text-[12px] leading-relaxed text-[#4A5D6E]">
            {[e.correo, e.telefono, e.web].filter(Boolean).join(" · ") || SIN_DATO}
            <br />
            {e.cuentas_bancarias || "Cuentas bancarias: Sin dato"}
          </div>
        </div>
        <p className="text-[12.5px] text-text-3">Lo que dejes vacío aparece como «Sin dato»: nunca se inventa.</p>
      </section>
    </div>
  );
}
