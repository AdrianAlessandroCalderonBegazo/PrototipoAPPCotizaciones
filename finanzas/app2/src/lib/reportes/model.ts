/**
 * Datos de un reporte y sus resúmenes. Puro (sin red ni React Native): lo usan el Excel y el CSV y se prueba con Node.
 */
import { efecto, gastoPorPersona, ordenMov, r2, saldoCuenta, type GastoPersona } from "../fin/calc";
import { catLabel } from "../fin/categorias";
import type { State } from "../fin/store";
import type { Snapshot } from "../fin/sync";
import type { Cuadre, Cuenta, Mov, Persona } from "../fin/types";
import { fdate, fdateLarga } from "../format";

export type ReporteOpciones = { desde: string; hasta: string; /** Vacío = todas las cuentas. */ cuentaIds: string[] };

export type CuentaResumen = { cuenta: Cuenta; inicial: number; ingresos: number; egresos: number; traspasosIn: number; traspasosOut: number; final: number; movimientos: number };
export type FilaCategoria = { tipo: "INGRESO" | "EGRESO"; categoria: string; subcategoria: string; total: number; movimientos: number };

export type Reporte = ReporteOpciones & {
  generado: string; // ISO
  usuario: string;
  cuentas: Cuenta[]; // las incluidas (ya filtradas), con `saldo_base` = saldo al empezar `desde`
  personas: Persona[];
  movs: Mov[]; // los que tocan alguna de esas cuentas, en orden
  resumen: CuentaResumen[];
  porCategoria: FilaCategoria[];
  porPersona: GastoPersona[];
  /** Todos los practicantes activos (incluso con gasto 0), para ver cuánto se gasta en cada uno. */
  practicantes: GastoPersona[];
  cuadres: Cuadre[];
  /** true si no hubo conexión y se armó con lo guardado en este dispositivo (puede faltar lo de otras personas o lo más antiguo). */
  desdeLocal: boolean;
};

export type FuenteDatos = { snapshot(desde: string, hasta: string): Promise<Snapshot> };

const sinRed = (e: unknown) => {
  const x = e as { status?: number; code?: string };
  return x?.status === 0 || x?.code === "NETWORK" || (typeof x?.status === "number" && x.status >= 500);
};

export function armarReporte(o: ReporteOpciones & { usuario: string; generado: string; desdeLocal?: boolean }, datos: Snapshot): Reporte {
  const sel = new Set(o.cuentaIds);
  const cuentas = datos.cuentas.filter((c) => (!sel.size || sel.has(c.id)) && (c.activa || datos.movs.some((m) => m.cuenta_id === c.id || m.destino_id === c.id)));
  const ids = new Set(cuentas.map((c) => c.id));
  const movs = datos.movs.filter((m) => m.fecha >= o.desde && m.fecha <= o.hasta && (ids.has(m.cuenta_id) || (m.destino_id && ids.has(m.destino_id)))).sort(ordenMov);

  const resumen: CuentaResumen[] = cuentas.map((c) => {
    const propios = movs.filter((m) => m.cuenta_id === c.id || m.destino_id === c.id);
    const suma = (f: (m: Mov) => boolean) => r2(propios.filter(f).reduce((a, m) => a + m.monto, 0));
    return {
      cuenta: c, inicial: c.saldo_base,
      ingresos: suma((m) => m.tipo === "INGRESO" && m.cuenta_id === c.id),
      egresos: suma((m) => m.tipo === "EGRESO" && m.cuenta_id === c.id),
      traspasosIn: suma((m) => m.tipo === "TRASPASO" && m.destino_id === c.id),
      traspasosOut: suma((m) => m.tipo === "TRASPASO" && m.cuenta_id === c.id),
      final: saldoCuenta(c, propios),
      movimientos: propios.length,
    };
  });

  const cat = new Map<string, FilaCategoria>();
  for (const m of movs) {
    if (m.tipo === "TRASPASO") continue;
    const k = `${m.tipo}|${m.categoria}|${m.subcategoria}`;
    const f = cat.get(k) ?? { tipo: m.tipo, categoria: m.categoria || "Sin categoría", subcategoria: m.subcategoria, total: 0, movimientos: 0 };
    f.total = r2(f.total + m.monto);
    f.movimientos++;
    cat.set(k, f);
  }
  const porCategoria = [...cat.values()].sort((a, b) => (a.tipo === b.tipo ? b.total - a.total : a.tipo === "EGRESO" ? -1 : 1));

  const porPersona = gastoPorPersona(movs, datos.personas, o.desde, o.hasta);
  const conGasto = new Map(porPersona.map((g) => [g.persona.id, g]));
  const practicantes = datos.personas
    .filter((p) => p.tipo === "PRACTICANTE" && p.activa)
    .map((p) => conGasto.get(p.id) ?? { persona: p, total: 0, movimientos: 0, porCategoria: {} })
    .sort((a, b) => b.total - a.total || a.persona.nombre.localeCompare(b.persona.nombre));

  return {
    desde: o.desde, hasta: o.hasta, cuentaIds: o.cuentaIds, generado: o.generado, usuario: o.usuario, cuentas, personas: datos.personas, movs, resumen, porCategoria, porPersona, practicantes,
    cuadres: datos.cuadres.filter((c) => c.fecha >= o.desde && c.fecha <= o.hasta && ids.has(c.cuenta_id)), desdeLocal: !!o.desdeLocal,
  };
}

/** Lo que el dispositivo tiene, con el saldo de cada cuenta llevado hasta el inicio del período pedido. */
export function datosLocales(local: State, desde: string): Snapshot {
  return {
    cuentas: local.cuentas.map((c) => ({ ...c, saldo_base: r2(local.movs.filter((m) => m.fecha < desde).reduce((a, m) => a + efecto(m, c.id), c.saldo_base)) })),
    personas: local.personas,
    movs: local.movs,
    cuadres: local.cuadres,
  };
}

/** Arma el reporte pidiéndole los datos al servidor; si no hay conexión, usa lo que hay en el dispositivo. */
export async function cargarReporte(o: ReporteOpciones & { usuario: string }, servidor: FuenteDatos, local: State, ahora = () => new Date().toISOString()): Promise<Reporte> {
  try {
    return armarReporte({ ...o, generado: ahora() }, await servidor.snapshot(o.desde, o.hasta));
  } catch (e) {
    if (!sinRed(e)) throw e;
    return armarReporte({ ...o, generado: ahora(), desdeLocal: true }, datosLocales(local, o.desde));
  }
}

// ---- textos -------------------------------------------------------------------------------------------------------

export const periodoTexto = (desde: string, hasta: string) => (desde === hasta ? fdateLarga(desde) : `${fdate(desde)} al ${fdate(hasta)}`);
export const nombreCuentas = (r: Pick<Reporte, "cuentas" | "cuentaIds">) => (r.cuentaIds.length ? r.cuentas.map((c) => c.nombre).join(", ") : "Todas las cuentas");
export const categoriaTexto = catLabel;

/** "finanzas_2026-10-01_a_2026-10-28" (sin extensión), para el nombre del archivo. */
export const nombreArchivo = (o: ReporteOpciones) => ["finanzas", o.desde === o.hasta ? o.desde : `${o.desde}_a_${o.hasta}`].join("_");

export const totalesReporte = (r: Reporte) => ({
  ingresos: r2(r.movs.filter((m) => m.tipo === "INGRESO").reduce((a, m) => a + m.monto, 0)),
  egresos: r2(r.movs.filter((m) => m.tipo === "EGRESO").reduce((a, m) => a + m.monto, 0)),
  traspasos: r2(r.movs.filter((m) => m.tipo === "TRASPASO").reduce((a, m) => a + m.monto, 0)),
  movimientos: r.movs.length,
});

/** Nombres de las personas a las que fue un movimiento ("Ana (S/ 10.00), Luis (S/ 10.00)"). */
export function paraTexto(m: Mov, personas: Persona[]): string {
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? "—";
  if (!m.para.length) return "";
  return m.para.length === 1 ? nombre(m.para[0].persona_id) : m.para.map((p) => `${nombre(p.persona_id)} (S/ ${p.monto.toFixed(2)})`).join(", ");
}

/** Importe con separador de miles y 2 decimales, sin "S/". */
export const num2 = (n: number) => {
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${d}`;
};
