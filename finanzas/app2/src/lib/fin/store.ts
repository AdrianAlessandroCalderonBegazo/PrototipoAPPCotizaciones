/**
 * Almacén local de ICR Finanzas 2 (cuentas, personas, movimientos y cuadres), con cola de envío ("outbox").
 *
 * Toda acción de la persona se aplica al instante en el dispositivo y deja una operación en la cola; sync.ts las manda
 * al servidor cuando hay conexión y en el orden en que ocurrieron. La pantalla nunca espera a la red.
 *
 * Fábrica sin dependencias de React Native (almacenamiento, hora e ids se inyectan) para probarla con Node.
 * La instancia real está en runtime.ts.
 */
import { r2, reposicion, saldoCuenta, type Reposicion } from "./calc";
import { nuevoId } from "./ids";
import type { Adjunto, Cuadre, Cuenta, Mov, Persona } from "./types";

export type OpKind = "putCuenta" | "putPersona" | "putMov" | "delMov" | "putAdjunto" | "delAdjunto" | "putCuadre";
/** `ref` es el id de lo que se cambia (cuenta, persona, movimiento, foto, cuadre). */
export type Op = { id: string; kind: OpKind; ref: string; data?: Record<string, any>; error?: string; ts: string };

export type State = {
  v: 1;
  /** Quién usa este dispositivo (sale en "creado por"). */
  usuario: string;
  /** La cuenta de esta persona (su Yape): las capturas de Yape se le asignan a ella. */
  miCuentaId: string;
  cuentas: Cuenta[];
  personas: Persona[];
  movs: Mov[];
  cuadres: Cuadre[];
  outbox: Op[];
  avisos: { id: string; texto: string }[];
  ultimaSync?: string;
};

export type FotoRef = { key: string; mime: string; bytes: number };
export type KV = { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void> };
export type StoreDeps = { kv: KV; ahora?: () => string; borrarFoto?: (key: string) => Promise<void> };

const KEY = "fin.v1";

const vacio = (): State => ({ v: 1, usuario: "", miCuentaId: "", cuentas: [], personas: [], movs: [], cuadres: [], outbox: [], avisos: [] });

export type NuevaCuenta = Omit<Cuenta, "updated_at" | "saldo_base" | "orden"> & { orden?: number };
export type NuevaPersona = Omit<Persona, "updated_at">;
export type NuevoMov = Omit<Mov, "updated_at" | "adjuntos" | "creado" | "creado_por" | "servidor"> & { adjuntos?: Adjunto[] };

export function crearStore({ kv, ahora = () => new Date().toISOString(), borrarFoto = async () => {} }: StoreDeps) {
  let state: State = vacio();
  const oyentes = new Set<() => void>();
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let guardando: Promise<void> = Promise.resolve();

  const guardar = () => {
    const snapshot = state;
    guardando = guardando.then(() => kv.set(KEY, snapshot)).catch(() => {});
    return guardando;
  };
  /** Aplica un cambio, avisa a la pantalla y guarda en el dispositivo (juntando cambios seguidos). */
  function commit(fn: (s: State) => void) {
    const copia: State = { ...state, cuentas: [...state.cuentas], personas: [...state.personas], movs: [...state.movs], cuadres: [...state.cuadres], outbox: [...state.outbox] };
    fn(copia);
    state = copia;
    oyentes.forEach((f) => f());
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => void guardar(), 150);
  }

  const encolar = (s: State, kind: OpKind, ref: string, data?: Op["data"], { reemplazar = false } = {}) => {
    if (reemplazar) {
      const i = s.outbox.findIndex((o) => o.kind === kind && o.ref === ref && !o.error);
      if (i >= 0) return void (s.outbox[i] = { ...s.outbox[i], data, ts: ahora() });
    }
    s.outbox.push({ id: nuevoId(), kind, ref, data, ts: ahora() });
  };
  const quitarOps = (s: State, pred: (o: Op) => boolean) => void (s.outbox = s.outbox.filter((o) => !pred(o)));
  const reemplazarPor = <T extends { id: string }>(lista: T[], x: T) => (lista.some((y) => y.id === x.id) ? lista.map((y) => (y.id === x.id ? x : y)) : [...lista, x]);

  const api = {
    // ---- lectura -----------------------------------------------------------------------------
    get: () => state,
    subscribe(fn: () => void) {
      oyentes.add(fn);
      return () => void oyentes.delete(fn);
    },

    // ---- ciclo de vida -----------------------------------------------------------------------
    async init() {
      const guardado = await kv.get<State>(KEY);
      if (guardado?.v === 1) state = { ...vacio(), ...guardado };
      oyentes.forEach((f) => f());
    },
    /** Espera a que lo último quede escrito en el dispositivo (pruebas y antes de cerrar). */
    async vaciar() {
      if (temporizador) {
        clearTimeout(temporizador);
        temporizador = null;
        await guardar();
      }
      await guardando;
    },
    /** Cierre de sesión: borra todo lo del dispositivo (lo pendiente de enviar se pierde; la pantalla avisa antes). */
    async reiniciar() {
      state = vacio();
      oyentes.forEach((f) => f());
      await kv.set(KEY, state);
    },

    setUsuario: (usuario: string) => commit((s) => void (s.usuario = usuario)),
    setMiCuenta: (id: string) => commit((s) => void (s.miCuentaId = id)),

    // ---- cuentas y personas ------------------------------------------------------------------
    guardarCuenta(c: NuevaCuenta) {
      commit((s) => {
        const previa = s.cuentas.find((x) => x.id === c.id);
        // el saldo base (lo que traía antes de los movimientos del dispositivo) sigue el cambio del saldo inicial
        const saldo_base = previa ? r2(previa.saldo_base + (c.saldo_inicial - previa.saldo_inicial)) : c.saldo_inicial;
        const orden = c.orden ?? previa?.orden ?? Math.max(0, ...s.cuentas.map((x) => x.orden)) + 1;
        s.cuentas = reemplazarPor(s.cuentas, { ...c, saldo_base, orden, updated_at: ahora() });
        quitarOps(s, (o) => o.kind === "putCuenta" && o.ref === c.id && !!o.error);
        encolar(s, "putCuenta", c.id, undefined, { reemplazar: true });
      });
    },
    guardarPersona(p: NuevaPersona) {
      commit((s) => {
        s.personas = reemplazarPor(s.personas, { ...p, updated_at: ahora() });
        quitarOps(s, (o) => o.kind === "putPersona" && o.ref === p.id && !!o.error);
        encolar(s, "putPersona", p.id, undefined, { reemplazar: true });
      });
    },

    // ---- movimientos -------------------------------------------------------------------------
    guardarMov(m: NuevoMov) {
      commit((s) => {
        const previo = s.movs.find((x) => x.id === m.id);
        const mov: Mov = { ...m, adjuntos: m.adjuntos ?? previo?.adjuntos ?? [], creado: previo?.creado ?? ahora(), creado_por: previo?.creado_por ?? s.usuario, updated_at: ahora(), servidor: previo?.servidor };
        s.movs = reemplazarPor(s.movs, mov);
        quitarOps(s, (o) => o.kind === "putMov" && o.ref === m.id && !!o.error); // al corregirlo, desaparece el error anterior
        encolar(s, "putMov", m.id, undefined, { reemplazar: true });
      });
    },
    borrarMov(id: string) {
      commit((s) => {
        const m = s.movs.find((x) => x.id === id);
        if (!m) return;
        s.movs = s.movs.filter((x) => x.id !== id);
        const nuncaLlego = !m.servidor && s.outbox.some((o) => o.kind === "putMov" && o.ref === id);
        const fotos = new Set(m.adjuntos.map((a) => a.id));
        quitarOps(s, (o) => (o.kind === "putMov" && o.ref === id) || ((o.kind === "putAdjunto" || o.kind === "delAdjunto") && fotos.has(o.ref)));
        if (!nuncaLlego) encolar(s, "delMov", id);
        for (const a of m.adjuntos) if (a.localKey) void borrarFoto(a.localKey);
      });
    },

    // ---- fotos de comprobantes ---------------------------------------------------------------
    agregarAdjunto(movId: string, foto: FotoRef, nombre?: string): string | null {
      let id: string | null = null;
      commit((s) => {
        const m = s.movs.find((x) => x.id === movId);
        if (!m) return;
        id = nuevoId();
        s.movs = s.movs.map((x) => (x.id === movId ? { ...x, adjuntos: [...x.adjuntos, { id: id!, mime: foto.mime, bytes: foto.bytes, nombre, localKey: foto.key, synced: false }] } : x));
        encolar(s, "putAdjunto", id, { movId });
      });
      return id;
    },
    quitarAdjunto(movId: string, adjId: string) {
      commit((s) => {
        const m = s.movs.find((x) => x.id === movId);
        const a = m?.adjuntos.find((x) => x.id === adjId);
        if (!m || !a) return;
        s.movs = s.movs.map((x) => (x.id === movId ? { ...x, adjuntos: x.adjuntos.filter((y) => y.id !== adjId) } : x));
        quitarOps(s, (o) => o.kind === "putAdjunto" && o.ref === adjId);
        if (a.synced) encolar(s, "delAdjunto", adjId, { movId });
        if (a.localKey) void borrarFoto(a.localKey);
      });
    },

    // ---- cuadre ------------------------------------------------------------------------------
    /** Compara el saldo real (el que muestra el Yape o el banco) con el de la app y deja el registro. */
    crearCuadre(p: { cuenta_id: string; fecha: string; saldo_real: number; nota: string }): Cuadre | null {
      let out: Cuadre | null = null;
      commit((s) => {
        const c = s.cuentas.find((x) => x.id === p.cuenta_id);
        if (!c) return;
        const sistema = saldoCuenta(c, s.movs);
        out = { id: nuevoId(), cuenta_id: p.cuenta_id, fecha: p.fecha, saldo_real: r2(p.saldo_real), saldo_sistema: sistema, diferencia: r2(p.saldo_real - sistema), nota: p.nota, creado_por: s.usuario, creado: ahora() };
        s.cuadres = [...s.cuadres, out];
        encolar(s, "putCuadre", out.id);
      });
      return out;
    },

    // ---- usados por sync.ts ------------------------------------------------------------------
    /** Aplica un cambio hecho por el motor de sincronización (no genera operaciones nuevas). */
    mutar: commit,
    /** Mensaje para la persona. Con `duracionMs` se quita solo (los de éxito); sin él se queda hasta que lo cierre (los de error). */
    avisar(texto: string, duracionMs?: number) {
      const id = nuevoId();
      commit((s) => void (s.avisos = [...s.avisos, { id, texto }].slice(-5)));
      if (duracionMs) setTimeout(() => api.quitarAviso(id), duracionMs);
    },
    quitarAviso: (id: string) => commit((s) => void (s.avisos = s.avisos.filter((a) => a.id !== id))),
    quitarOp: (opId: string) => commit((s) => void (s.outbox = s.outbox.filter((o) => o.id !== opId))),
    marcarError: (opId: string, error: string) => commit((s) => void (s.outbox = s.outbox.map((o) => (o.id === opId ? { ...o, error } : o)))),
    reintentarErrores: () => commit((s) => void (s.outbox = s.outbox.map((o) => (o.error ? { ...o, error: undefined } : o)))),
  };
  return api;
}

export type Store = ReturnType<typeof crearStore>;

// ---- consultas sobre el estado (puras) --------------------------------------------------------

export const pendientes = (s: State) => s.outbox.filter((o) => !o.error).length;
export const conError = (s: State) => s.outbox.filter((o) => !!o.error);
/** ¿Esto todavía no llegó al servidor? */
export const sinEnviar = (s: State, id: string) => s.outbox.some((o) => o.ref === id && !o.error);
export const errorDe = (s: State, id: string) => s.outbox.find((o) => o.ref === id && o.error)?.error;

export const cuentasActivas = (s: State) => s.cuentas.filter((c) => c.activa).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
export const saldoDe = (s: State, cuentaId: string) => {
  const c = s.cuentas.find((x) => x.id === cuentaId);
  return c ? saldoCuenta(c, s.movs) : 0;
};
export const reposicionDe = (s: State, cuentaId: string): Reposicion | undefined => {
  const c = s.cuentas.find((x) => x.id === cuentaId);
  return c ? reposicion(c, s.movs) : undefined;
};
/** Cuentas que están por debajo de su umbral (hay que pedir reposición). */
export const porReponer = (s: State) => cuentasActivas(s).filter((c) => c.umbral > 0 && saldoCuenta(c, s.movs) < c.umbral);

