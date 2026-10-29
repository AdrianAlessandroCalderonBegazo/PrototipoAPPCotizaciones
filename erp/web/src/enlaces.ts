// Direcciones de las otras apps, a partir de la del ERP (erp.icrenergy.tech → finanzas.icrenergy.tech).
export function enlaceApp(sub: "cotizador" | "finanzas" | "finanza" | "app", host = window.location.hostname): string | null {
  if (!host.startsWith("erp.")) return null;
  return `https://${sub}.${host.slice(4)}`;
}
