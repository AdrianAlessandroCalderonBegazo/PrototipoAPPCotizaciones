// Conversación con la extensión «ICR Autollenado SUNAT» por window.postMessage (los datos nunca van en la URL).
import { useCallback, useEffect, useState } from "react";
import type { Comprobante, Empresa } from "../../tipos";

export const ZIP_EXTENSION = "/icr-autollenado-sunat.zip";
export const URL_SOL = "https://e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm";

export function useExtension() {
  const [estado, setEstado] = useState<"buscando" | "conectada" | "no">("buscando");
  const [version, setVersion] = useState<string | null>(null);
  const verificar = useCallback(() => {
    setEstado("buscando");
    const f = (e: MessageEvent) => {
      if (e.source === window && e.data?.origen === "icr-ext" && e.data.tipo === "pong") {
        setEstado("conectada");
        setVersion(String(e.data.version ?? ""));
        window.removeEventListener("message", f);
      }
    };
    window.addEventListener("message", f);
    window.postMessage({ origen: "icr-erp", tipo: "ping" }, window.location.origin);
    window.setTimeout(() => {
      window.removeEventListener("message", f);
      setEstado((s) => (s === "buscando" ? "no" : s));
    }, 1000);
  }, []);
  useEffect(verificar, [verificar]);
  return { estado, version, verificar };
}

/** Manda el comprobante a la extensión; ella abre SUNAT en otra pestaña. */
export function llenarEnSunat(c: Comprobante, empresa: Empresa | null): Promise<void> {
  return new Promise((ok, mal) => {
    const f = (e: MessageEvent) => {
      if (e.source !== window || e.data?.origen !== "icr-ext") return;
      if (e.data.tipo === "abierto") fin(() => ok());
      if (e.data.tipo === "error") fin(() => mal(new Error(e.data.mensaje ?? "La extensión no pudo abrir SUNAT.")));
    };
    const reloj = window.setTimeout(() => fin(() => mal(new Error("La extensión no respondió. Recarga la página e intenta de nuevo."))), 6000);
    const fin = (g: () => void) => {
      window.clearTimeout(reloj);
      window.removeEventListener("message", f);
      g();
    };
    window.addEventListener("message", f);
    window.postMessage({ origen: "icr-erp", tipo: "llenar", comprobante: { ...c, emisor: { ruc: empresa?.ruc ?? null, nombre: empresa?.razon_social ?? null } } }, window.location.origin);
  });
}
