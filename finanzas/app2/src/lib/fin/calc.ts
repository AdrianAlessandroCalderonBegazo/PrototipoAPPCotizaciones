/** Cálculos del libro: saldos, reposición, gasto por persona y validaciones. Puro (sin React Native). */
import { SUBCATEGORIAS, SUBCATEGORIA_OBLIGATORIA, CATEGORIAS_EGRESO, CATEGORIAS_INGRESO } from "./categorias";
import { clavePar, type Adjunto, type Cuenta, type Mov, type Para, type Persona } from "./types";

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const ordenMov = (a: Mov, b: Mov) => (clavePar(a) < clavePar(b) ? -1 : clavePar(a) > clavePar(b) ? 1 : a.id < b.id ? -1 : 1);

/** Entra dinero a esa cuenta (ingreso o traspaso que llega). */
export const esEntrada = (m: Mov, cuentaId: string) => (m.tipo === "INGRESO" && m.cuenta_id === cuentaId) || (m.tipo === "TRASPASO" && m.destino_id === cuentaId);
/** Sale dinero de esa cuenta (egreso o traspaso que se va). */
export const esSalida = (m: Mov, cuentaId: string) => (m.tipo === "EGRESO" || m.tipo === "TRASPASO") && m.cuenta_id === cuentaId;

/** Efecto de un movimiento sobre el saldo de una cuenta (0 si no la toca). */
export const efecto = (m: Mov, cuentaId: string) => (esEntrada(m, cuentaId) ? m.monto : 0) - (esSalida(m, cuentaId) ? m.monto : 0);

/** Saldo = lo que traía la cuenta al empezar la ventana + el efecto de los movimientos que hay. */
export const saldoCuenta = (c: Pick<Cuenta, "id" | "saldo_base">, movs: Mov[]) => r2(movs.reduce((a, m) => a + efecto(m, c.id), c.saldo_base));

export const saldoTotal = (cuentas: Cuenta[], movs: Mov[]) => r2(cuentas.filter((c) => c.activa).reduce((a, c) => a + saldoCuenta(c, movs), 0));

export type Reposicion = {
  saldo: number;
  /** Lo que salió de la cuenta desde la última vez que le entró dinero. */
  gastado: number;
  /** Fecha de esa última entrada ("" si nunca le entró dinero). */
  desde: string;
  movimientos: Mov[];
  /** Monto que se sugiere reponer: lo gastado desde la última entrada (el fondo no es fijo, quien autoriza puede cambiarlo). */
  sugerido: number;
  bajoUmbral: boolean;
  umbral: number;
};

export function reposicion(c: Cuenta, movs: Mov[]): Reposicion {
  const propios = movs.filter((m) => m.cuenta_id === c.id || m.destino_id === c.id).sort(ordenMov);
  let ult = -1;
  propios.forEach((m, i) => {
    if (esEntrada(m, c.id)) ult = i;
  });
  const salidas = propios.slice(ult + 1).filter((m) => esSalida(m, c.id));
  const gastado = r2(salidas.reduce((a, m) => a + m.monto, 0));
  const saldo = saldoCuenta(c, movs);
  return { saldo, gastado, desde: ult >= 0 ? propios[ult].fecha : "", movimientos: salidas, sugerido: gastado, bajoUmbral: c.umbral > 0 && saldo < c.umbral, umbral: c.umbral };
}

/** Reparte un monto en partes iguales sin perder centavos (el último se lleva la diferencia). */
export function repartir(monto: number, personaIds: string[]): Para[] {
  const n = personaIds.length;
  if (!n) return [];
  const parte = Math.floor((monto * 100) / n) / 100;
  let resto = r2(monto);
  return personaIds.map((persona_id, i) => {
    const m = i === n - 1 ? resto : parte;
    resto = r2(resto - m);
    return { persona_id, monto: m };
  });
}

/**
 * Para quién fue un egreso. Si se indicó `para`, eso; si no y se le pagó directo a una persona de la libreta
 * (que no sea proveedor), se entiende que es para ella (un pasaje yapeado al que viaja); si no, nadie.
 */
export function beneficiarios(m: Mov, porId: Map<string, Persona>): Para[] {
  if (m.para.length) return m.para;
  const p = m.pagado_a_id ? porId.get(m.pagado_a_id) : undefined;
  return p && p.tipo !== "PROVEEDOR" ? [{ persona_id: p.id, monto: m.monto }] : [];
}

export type GastoPersona = { persona: Persona; total: number; movimientos: number; porCategoria: Record<string, number> };

/** Cuánto se gastó en cada persona (menús, pasajes…) en un rango de fechas, de mayor a menor. */
export function gastoPorPersona(movs: Mov[], personas: Persona[], desde: string, hasta: string, tipos?: Persona["tipo"][]): GastoPersona[] {
  const porId = new Map(personas.map((p) => [p.id, p]));
  const acc = new Map<string, GastoPersona>();
  for (const m of movs) {
    if (m.tipo !== "EGRESO" || m.fecha < desde || m.fecha > hasta) continue;
    for (const b of beneficiarios(m, porId)) {
      const persona = porId.get(b.persona_id);
      if (!persona || (tipos && !tipos.includes(persona.tipo))) continue;
      const g = acc.get(persona.id) ?? { persona, total: 0, movimientos: 0, porCategoria: {} };
      const clave = m.subcategoria ? `${m.categoria} · ${m.subcategoria}` : m.categoria || "Sin categoría";
      g.total = r2(g.total + b.monto);
      g.movimientos++;
      g.porCategoria[clave] = r2((g.porCategoria[clave] ?? 0) + b.monto);
      acc.set(persona.id, g);
    }
  }
  return [...acc.values()].sort((a, b) => b.total - a.total || a.persona.nombre.localeCompare(b.persona.nombre));
}

/** ¿Ya hay un movimiento con ese número de operación? (distinto del que se está editando) */
export const buscarDuplicado = (movs: Mov[], nro: string, exceptoId = ""): Mov | undefined => {
  const n = nro.trim();
  return n ? movs.find((m) => m.nro_operacion.trim() === n && m.id !== exceptoId) : undefined;
};

export type ErroresMov = Partial<Record<"monto" | "cuenta" | "destino" | "categoria" | "subcategoria" | "para" | "fecha", string>>;

export function validarMov(m: Pick<Mov, "tipo" | "fecha" | "cuenta_id" | "destino_id" | "monto" | "categoria" | "subcategoria" | "para">, cuentas: Cuenta[]): ErroresMov {
  const e: ErroresMov = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) e.fecha = "Elige la fecha";
  if (!(m.monto > 0)) e.monto = "Ingresa un monto mayor a cero";
  if (!cuentas.some((c) => c.id === m.cuenta_id)) e.cuenta = m.tipo === "INGRESO" ? "Elige la cuenta donde entra" : "Elige la cuenta de donde sale";
  if (m.tipo === "TRASPASO") {
    if (!cuentas.some((c) => c.id === m.destino_id)) e.destino = "Elige la cuenta a la que llega";
    else if (m.destino_id === m.cuenta_id) e.destino = "Origen y destino deben ser distintos";
  } else {
    const lista: readonly string[] = m.tipo === "EGRESO" ? CATEGORIAS_EGRESO : CATEGORIAS_INGRESO;
    if (!lista.includes(m.categoria)) e.categoria = "Elige la categoría";
    else if (m.tipo === "EGRESO" && SUBCATEGORIA_OBLIGATORIA.has(m.categoria) && !(SUBCATEGORIAS[m.categoria] ?? []).includes(m.subcategoria)) e.subcategoria = "Elige el tipo";
    else if (m.subcategoria && !(SUBCATEGORIAS[m.categoria] ?? []).includes(m.subcategoria)) e.subcategoria = "Tipo no válido";
  }
  if (m.para.length) {
    const suma = r2(m.para.reduce((a, p) => a + p.monto, 0));
    if (m.para.some((p) => !(p.monto > 0))) e.para = "Cada persona debe tener un monto mayor a cero";
    else if (suma > r2(m.monto) + 0.001) e.para = "El reparto supera el monto";
  }
  return e;
}

/** Texto corto del movimiento para listas: "Menú · Aurea Val*". */
export const resumenMov = (m: Mov) => [m.concepto, m.pagado_a].filter(Boolean).join(" · ") || (m.tipo === "TRASPASO" ? "Traspaso" : m.categoria);

// ---- fusión con el servidor (igual idea que en ICR Finanzas 1) ------------------------------------------------------

/** Une las listas de movimientos: el servidor manda, salvo lo pendiente de enviar (gana lo local) y lo borrado aquí. */
export function fusionarMovs(local: Mov[], servidor: Mov[], pendientes: Set<string>, borrados: Set<string>): Mov[] {
  const porId = new Map(local.map((m) => [m.id, m]));
  const out: Mov[] = [];
  const vistos = new Set<string>();
  for (const sm of servidor) {
    vistos.add(sm.id);
    if (borrados.has(sm.id)) continue;
    const lm = porId.get(sm.id);
    if (lm && pendientes.has(sm.id)) {
      out.push(lm);
      continue;
    }
    // conserva la copia local de las fotos (localKey) y las que aún no subieron
    const locales = new Map((lm?.adjuntos ?? []).map((a) => [a.id, a]));
    const adjuntos: Adjunto[] = sm.adjuntos.map((a) => ({ ...a, synced: true, localKey: locales.get(a.id)?.localKey }));
    for (const a of lm?.adjuntos ?? []) if (!a.synced && !adjuntos.some((x) => x.id === a.id)) adjuntos.push(a);
    out.push({ ...sm, adjuntos, servidor: true });
  }
  for (const lm of local) if (!vistos.has(lm.id) && pendientes.has(lm.id)) out.push(lm);
  return out.sort(ordenMov);
}

/** Cuentas y personas: lo del servidor, salvo lo que tiene un cambio local sin enviar. */
export function fusionarPorId<T extends { id: string }>(local: T[], servidor: T[], pendientes: Set<string>, conservar: (l: T, s: T) => T = (l) => l): T[] {
  const lm = new Map(local.map((x) => [x.id, x]));
  const out: T[] = servidor.map((s) => (pendientes.has(s.id) && lm.has(s.id) ? conservar(lm.get(s.id)!, s) : s));
  const vistos = new Set(servidor.map((x) => x.id));
  for (const l of local) if (!vistos.has(l.id) && pendientes.has(l.id)) out.push(l);
  return out;
}
