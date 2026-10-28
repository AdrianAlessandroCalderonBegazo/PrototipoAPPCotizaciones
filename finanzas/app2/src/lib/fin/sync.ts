/**
 * Motor de sincronización de ICR Finanzas 2: manda al servidor la cola de operaciones del almacén local (en el orden en
 * que ocurrieron) y luego trae lo nuevo (de otros dispositivos u otras personas).
 *
 * - Sin conexión o servidor caído → se detiene y reintenta más tarde; no se pierde nada.
 * - El servidor rechaza una operación (4xx) → queda marcada con su mensaje, visible en ese movimiento; las demás siguen.
 * - Sin dependencias de React Native (la API y las fotos se inyectan) para probarlo con Node contra la API real.
 */
import { isoDate, parseIso } from "../format";
import { fusionarMovs, fusionarPorId } from "./calc";
import { conError, type Op, type Store } from "./store";
import type { Cuadre, Cuenta, Mov, Persona } from "./types";

export type SyncApi = {
  json<T = any>(method: string, path: string, body?: unknown): Promise<T>;
  subirFoto(path: string, blob: Blob): Promise<void>;
  bajarFoto(path: string): Promise<Blob>;
};
export type SyncDeps = { store: Store; api: SyncApi; blobFoto: (key: string) => Promise<Blob | null>; hoy: () => string; ventanaDias?: number };

export type Fase = "inactivo" | "sincronizando" | "sin-conexion" | "sesion-vencida";
export type EstadoSync = { fase: Fase; ultimoOk?: string };

type ErrorApi = { status?: number; code?: string; message?: string };
const esSinRed = (e: unknown) => {
  const x = e as ErrorApi;
  return x?.status === 0 || x?.code === "NETWORK" || (typeof x?.status === "number" && x.status >= 500);
};

export type Snapshot = { cuentas: Cuenta[]; personas: Persona[]; movs: Mov[]; cuadres: Cuadre[] };

export function crearSync({ store, api, blobFoto, hoy, ventanaDias = 90 }: SyncDeps) {
  let estado: EstadoSync = { fase: "inactivo" };
  const oyentes = new Set<() => void>();
  const poner = (e: Partial<EstadoSync>) => {
    estado = { ...estado, ...e };
    oyentes.forEach((f) => f());
  };
  let corriendo: Promise<void> | null = null;
  let otraVez = false;

  const marcarServidor = (id: string) => store.mutar((s) => void (s.movs = s.movs.map((m) => (m.id === id ? { ...m, servidor: true } : m))));

  async function ejecutar(op: Op): Promise<void> {
    const s = store.get();
    switch (op.kind) {
      case "putCuenta": {
        const c = s.cuentas.find((x) => x.id === op.ref);
        if (!c) return;
        await api.json("PUT", `/v2/cuentas/${c.id}`, { nombre: c.nombre, tipo: c.tipo, titular: c.titular, referencia: c.referencia, saldo_inicial: c.saldo_inicial, umbral: c.umbral, aviso_whatsapp: c.aviso_whatsapp, aviso_telegram: c.aviso_telegram, activa: c.activa, orden: c.orden });
        return;
      }
      case "putPersona": {
        const p = s.personas.find((x) => x.id === op.ref);
        if (!p) return;
        await api.json("PUT", `/v2/personas/${p.id}`, { nombre: p.nombre, tipo: p.tipo, alias: p.alias, menu_monto: p.menu_monto, activa: p.activa });
        return;
      }
      case "putMov": {
        const m = s.movs.find((x) => x.id === op.ref);
        if (!m) return; // lo borraron antes de que saliera
        await api.json("PUT", `/v2/mov/${m.id}`, {
          tipo: m.tipo, fecha: m.fecha, hora: m.hora, cuenta_id: m.cuenta_id, destino_id: m.destino_id || null, monto: m.monto, categoria: m.categoria, subcategoria: m.subcategoria, concepto: m.concepto,
          pagado_a: m.pagado_a, pagado_a_id: m.pagado_a_id || null, para: m.para, nro_operacion: m.nro_operacion, origen: m.origen, creado: m.creado,
        });
        return marcarServidor(m.id);
      }
      case "delMov":
        return void (await api.json("DELETE", `/v2/mov/${op.ref}`));
      case "putAdjunto": {
        const adj = s.movs.flatMap((m) => m.adjuntos).find((a) => a.id === op.ref);
        if (!adj) return; // la quitaron antes de subirse
        const blob = adj.localKey ? await blobFoto(adj.localKey) : null;
        if (!blob) throw Object.assign(new Error("La foto ya no está en este dispositivo."), { status: 400, code: "FOTO_PERDIDA" });
        await api.subirFoto(`/v2/adjuntos/${adj.id}?mov_id=${op.data?.movId}`, blob);
        return store.mutar((st) => void (st.movs = st.movs.map((m) => ({ ...m, adjuntos: m.adjuntos.map((a) => (a.id === adj.id ? { ...a, synced: true } : a)) }))));
      }
      case "delAdjunto":
        return void (await api.json("DELETE", `/v2/adjuntos/${op.ref}`));
      case "putCuadre": {
        const c = s.cuadres.find((x) => x.id === op.ref);
        if (!c) return;
        await api.json("POST", "/v2/cuadres", { id: c.id, cuenta_id: c.cuenta_id, fecha: c.fecha, saldo_real: c.saldo_real, nota: c.nota });
        return;
      }
    }
  }

  /** Manda la cola. Devuelve false si se cortó por falta de conexión. */
  async function enviar(): Promise<boolean> {
    const bloqueados = new Set<string>(); // lo que falló: sus fotos esperan en vez de fallar también
    for (const op of [...store.get().outbox]) {
      if (op.error) {
        bloqueados.add(op.ref);
        continue;
      }
      if ((op.kind === "putAdjunto" || op.kind === "delAdjunto") && bloqueados.has(op.data?.movId)) continue;
      try {
        await ejecutar(op);
        store.quitarOp(op.id);
      } catch (e) {
        const err = e as ErrorApi;
        if (err.status === 401) {
          poner({ fase: "sesion-vencida" });
          return false;
        }
        if (esSinRed(e)) {
          poner({ fase: "sin-conexion" });
          return false;
        }
        // El servidor dice que ese movimiento ya fue eliminado allá: se quita también aquí y se sigue.
        if (err.code === "MOV_ELIMINADO") {
          if (op.kind === "putMov") store.mutar((s) => void (s.movs = s.movs.filter((m) => m.id !== op.ref)));
          store.quitarOp(op.id);
          continue;
        }
        // Un borrado rechazado no se puede dejar "oculto": se quita de la cola, el siguiente paso trae el movimiento
        // de vuelta del servidor y se le explica a la persona por qué.
        if (op.kind === "delMov" || op.kind === "delAdjunto") {
          store.quitarOp(op.id);
          store.avisar(err.message ?? "El servidor no permitió borrar eso.");
          continue;
        }
        store.marcarError(op.id, err.message ?? "El servidor rechazó el cambio.");
        bloqueados.add(op.ref);
      }
    }
    return true;
  }

  const restarDias = (fecha: string, n: number) => {
    const d = parseIso(fecha);
    d.setDate(d.getDate() - n);
    return isoDate(d);
  };

  /** Trae del servidor cuentas, personas y los movimientos recientes, y los une con lo local. */
  async function traer() {
    const hasta = hoy();
    const desde = restarDias(hasta, ventanaDias);
    const r = await api.json<Snapshot>("GET", `/v2/snapshot?desde=${desde}&hasta=${hasta}`);
    store.mutar((s) => {
      const refs = (k: Op["kind"]) => new Set(s.outbox.filter((o) => o.kind === k).map((o) => o.ref));
      // con un cambio local sin enviar gana lo local, pero el saldo base (lo calcula el servidor) siempre es el del servidor
      s.cuentas = fusionarPorId(s.cuentas, r.cuentas, refs("putCuenta"), (l, sv) => ({ ...l, saldo_base: sv.saldo_base }));
      s.personas = fusionarPorId(s.personas, r.personas, refs("putPersona"));
      s.movs = fusionarMovs(s.movs, r.movs, refs("putMov"), refs("delMov"));
      const ids = new Set(r.cuadres.map((c) => c.id));
      const pend = refs("putCuadre");
      s.cuadres = [...r.cuadres, ...s.cuadres.filter((c) => !ids.has(c.id) && pend.has(c.id))];
      s.ultimaSync = new Date().toISOString();
    });
  }

  async function ciclo() {
    poner({ fase: "sincronizando" });
    if (!(await enviar())) return;
    try {
      await traer();
    } catch (e) {
      if ((e as ErrorApi).status === 401) return void poner({ fase: "sesion-vencida" });
      if (esSinRed(e)) return void poner({ fase: "sin-conexion" });
      throw e;
    }
    poner({ fase: "inactivo", ultimoOk: new Date().toISOString() });
  }

  return {
    estado: () => estado,
    subscribe(fn: () => void) {
      oyentes.add(fn);
      return () => void oyentes.delete(fn);
    },
    /** Envía lo pendiente y trae lo nuevo. Si ya hay una en curso, pide otra al terminar (no se pisan). */
    sincronizar(): Promise<void> {
      if (corriendo) {
        otraVez = true;
        return corriendo;
      }
      corriendo = (async () => {
        try {
          do {
            otraVez = false;
            await ciclo();
          } while (otraVez);
        } catch (e) {
          poner({ fase: "inactivo" });
          console.error("Error de sincronización:", e);
        } finally {
          corriendo = null;
        }
      })();
      return corriendo;
    },
    /** Reintenta también lo que el servidor había rechazado (después de que la persona lo corrigió). */
    reintentarTodo() {
      store.reintentarErrores();
      return this.sincronizar();
    },
    errores: () => conError(store.get()),
    traerFotoRemota: (adjId: string) => api.bajarFoto(`/v2/adjuntos/${adjId}`),
  };
}

export type Sync = ReturnType<typeof crearSync>;
