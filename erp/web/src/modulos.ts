// Menú del ERP (ERP_ICR.zip › ICR ERP: grupos, íconos y fase en la que se construye cada módulo).
// Cada entrada se muestra solo si el rol tiene al menos «lectura» en ese módulo de la matriz de permisos.
import type { ClaveModulo, Nivel, Usuario } from "./tipos";

export type EntradaMenu = { clave: ClaveModulo; ruta: string; nombre: string; icono: string; fase: number; ia?: boolean };

/** Fase en la que se construye cada módulo (plan en erp/ESPECIFICACION.md). Las ya construidas no muestran la etiqueta. */
export const FASE_ACTUAL = 5;

export const MENU: { grupo: string; items: EntradaMenu[] }[] = [
  { grupo: "General", items: [{ clave: "inicio", ruta: "/", nombre: "Inicio", icono: "space_dashboard", fase: 1 }] },
  {
    grupo: "Operación",
    items: [
      { clave: "proyectos", ruta: "/proyectos", nombre: "Proyectos", icono: "solar_power", fase: 2 },
      { clave: "almacen", ruta: "/almacen", nombre: "Almacén", icono: "warehouse", fase: 1 },
      { clave: "activos", ruta: "/activos", nombre: "Activos y control", icono: "monitoring", fase: 9 },
    ],
  },
  {
    grupo: "Comercial",
    items: [
      { clave: "cotizacion", ruta: "/cotizacion", nombre: "Cotización", icono: "request_quote", fase: 3 },
      { clave: "cotizador_ia", ruta: "/cotizador-ia", nombre: "Cotizador IA", icono: "auto_awesome", fase: 6, ia: true },
      { clave: "comparador", ruta: "/comparador", nombre: "Comparador de proveedores", icono: "compare_arrows", fase: 8 },
    ],
  },
  {
    grupo: "Finanzas",
    items: [
      { clave: "contabilidad", ruta: "/contabilidad", nombre: "Contabilidad", icono: "account_balance", fase: 2 },
      { clave: "facturacion", ruta: "/facturacion", nombre: "Facturación SUNAT", icono: "receipt_long", fase: 5 },
    ],
  },
  { grupo: "Inteligencia", items: [{ clave: "asistente_ia", ruta: "/asistente", nombre: "Asistente IA", icono: "psychology", fase: 6, ia: true }] },
];

export const CONFIGURACION: EntradaMenu = { clave: "configuracion", ruta: "/configuracion", nombre: "Configuración", icono: "settings", fase: 1 };

export const TODAS = [...MENU.flatMap((g) => g.items), CONFIGURACION];

const ORDEN: Record<Nivel, number> = { ninguno: 0, lectura: 1, completo: 2 };

/** Nivel del usuario en un módulo (el administrador siempre tiene acceso completo). */
export function nivelDe(u: Pick<Usuario, "rol" | "niveles"> | null, modulo: ClaveModulo): Nivel {
  if (!u) return "ninguno";
  if (u.rol === "admin") return "completo";
  return u.niveles?.[modulo] ?? "ninguno";
}

export const puede = (u: Pick<Usuario, "rol" | "niveles"> | null, modulo: ClaveModulo, minimo: Nivel = "lectura") => ORDEN[nivelDe(u, modulo)] >= ORDEN[minimo];

/** El menú que ve este usuario: solo grupos con al menos un módulo visible. */
export function menuDe(u: Pick<Usuario, "rol" | "niveles"> | null) {
  return MENU.map((g) => ({ ...g, items: g.items.filter((i) => puede(u, i.clave)) })).filter((g) => g.items.length > 0);
}
