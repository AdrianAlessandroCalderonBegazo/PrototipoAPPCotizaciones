/** Solicitud de reposición: el texto y los enlaces para mandarla por WhatsApp o Telegram. Puro. */
import { fdate, money } from "../format";
import { resumenMov } from "./calc";
import type { Reposicion } from "./calc";
import type { Cuenta } from "./types";

export function textoReposicion(c: Cuenta, r: Reposicion, hoy: string): string {
  const lineas = [
    `Solicitud de reposición · ${c.nombre}`,
    `Saldo actual: ${money(r.saldo)}${c.umbral > 0 ? ` (aviso al bajar de ${money(c.umbral)})` : ""}`,
    `Gastado${r.desde ? ` desde el ${fdate(r.desde)}` : ""}: ${money(r.gastado)}`,
    `Monto sugerido a reponer: ${money(r.sugerido)}`,
  ];
  if (r.movimientos.length) {
    lineas.push("", "Detalle:");
    for (const m of r.movimientos.slice(0, 25)) lineas.push(`• ${fdate(m.fecha)} · ${resumenMov(m)} · ${money(m.monto)}`);
    if (r.movimientos.length > 25) lineas.push(`… y ${r.movimientos.length - 25} más`);
  }
  lineas.push("", `Generado ${fdate(hoy)} desde ICR Finanzas`);
  return lineas.join("\n");
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Abre WhatsApp con el mensaje listo (se envía con un toque). Sin número, deja elegir el contacto. */
export const enlaceWhatsApp = (numero: string, texto: string) => {
  const n = soloDigitos(numero);
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
};
/** Abre Telegram para compartir el mensaje (el envío automático lo hace el servidor con el bot). */
export const enlaceTelegram = (texto: string) => `https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(texto)}`;
