import { useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Pildora, type TonoPildora } from "../../componentes/Pildora";
import { fechaHora } from "../../formato";
import type { EstadoIntegracion, Integracion } from "../../tipos";
import { useDatos } from "../../usarDatos";

const ICONO: Record<string, string> = { logistica: "local_shipping", finanzas: "savings", ollama: "dns", vrm: "solar_power", sunat: "extension" };
const ESTADO: Record<EstadoIntegracion, [string, TonoPildora]> = {
  conectado: ["Conectado", "exito"],
  error: ["Con errores", "peligro"],
  no_configurado: ["No configurado", "neutro"],
  en_navegador: ["Se revisa en tu navegador", "primario"],
};

/** La extensión de Chrome (fase 5) avisará que está instalada poniendo este atributo en la página. */
const extensionSunat = () => document.documentElement.dataset.icrSunat ?? null;

export function Integraciones() {
  const avisar = useAvisos();
  const { datos, error, cargando, recargar, setDatos } = useDatos(() => api<Integracion[]>("GET", "/integraciones"));
  const [probando, setProbando] = useState<string | null>(null);

  if (cargando && !datos) return <Cargando texto="Probando cada conexión…" />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;

  const probar = async (i: Integracion) => {
    setProbando(i.clave);
    try {
      const r = await api<Omit<Integracion, "clave" | "nombre" | "descripcion">>("POST", `/integraciones/${i.clave}/probar`);
      setDatos((d) => d?.map((x) => (x.clave === i.clave ? { ...x, ...r } : x)) ?? d);
      avisar(i.nombre, r.detalle, r.estado === "conectado" || r.estado === "en_navegador" ? "exito" : r.estado === "error" ? "error" : "info");
    } catch (e) {
      avisar("No se pudo probar", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setProbando(null);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(datos ?? []).map((i) => {
        let estado = i.estado;
        let detalle = i.detalle;
        if (i.clave === "sunat") {
          const v = extensionSunat();
          estado = v ? "conectado" : "no_configurado";
          detalle = v ? `Extensión instalada en este navegador (versión ${v}).` : "La extensión no está instalada en este navegador. Se publica en la fase de Facturación SUNAT.";
        }
        const [l, t] = ESTADO[estado];
        return (
          <div key={i.clave} className="tarjeta flex flex-col gap-3.5 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink">
                <Icono n={ICONO[i.clave] ?? "hub"} t={23} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">{i.nombre}</div>
                <div className="text-[12.5px] text-text-3">{i.descripcion}</div>
              </div>
            </div>
            <div><Pildora tono={t}>{l}</Pildora></div>
            <div className="flex-1 text-[13px] text-text-2">{detalle}</div>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-[12px] text-text-3">Probado: {fechaHora(i.probado_en)}</span>
              {i.clave !== "sunat" ? (
                <button className="btn-secundario h-9" disabled={probando === i.clave} onClick={() => void probar(i)}>
                  <Icono n="sync" t={18} className={probando === i.clave ? "animate-spin" : ""} />
                  {probando === i.clave ? "Probando…" : "Probar conexión"}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <p className="text-[12.5px] text-text-3 md:col-span-2 xl:col-span-3">
        Los tokens y direcciones (VRM_TOKEN, OLLAMA_URL) se guardan en el archivo .env del servidor, nunca en la base de datos ni en esta pantalla.
      </p>
    </div>
  );
}
