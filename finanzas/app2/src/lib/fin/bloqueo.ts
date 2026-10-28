/**
 * Candado para corregir días anteriores: con el código correcto se puede editar durante unos minutos y después
 * vuelve a cerrarse. Vive solo en memoria (al recargar la app queda cerrado). Puro, sin React Native.
 *
 * OJO: es un freno contra errores y curiosos, no seguridad real: el código viaja dentro de la app. Cuando el ERP
 * tenga permisos por rol, la misma regla debe aplicarse en el servidor (ver docs/API.md).
 */
export type Intento = { ok: true } | { ok: false; razon: "codigo"; intentosRestantes: number } | { ok: false; razon: "espera"; esperaMs: number };

export type BloqueoDeps = {
  codigo: string;
  ahora: () => number;
  /** Cuánto dura abierto el candado tras escribir bien el código (10 min). */
  duracionMs?: number;
  /** Fallos seguidos antes de hacer esperar (5). */
  maxIntentos?: number;
  /** Espera tras demasiados fallos (30 s). */
  esperaMs?: number;
};

export const esDiaPasado = (fecha: string, hoy: string) => fecha < hoy;

/** Días hacia atrás (además de hoy) en los que se puede registrar o corregir sin código: la gente carga capturas de ayer o antes de ayer. */
export const DIAS_LIBRES = 2;

/** ¿Es un día "cerrado" (más viejo que la ventana libre)? Para esos, registrar o corregir pide el código. Fechas ISO YYYY-MM-DD. */
export function diaCerrado(fecha: string, hoy: string, diasLibres = DIAS_LIBRES): boolean {
  const [y, m, d] = hoy.split("-").map(Number);
  const limite = new Date(Date.UTC(y, m - 1, d - diasLibres)).toISOString().slice(0, 10);
  return fecha < limite;
}

export function crearBloqueo({ codigo, ahora, duracionMs = 10 * 60_000, maxIntentos = 5, esperaMs = 30_000 }: BloqueoDeps) {
  let hasta = 0; // hasta cuándo está abierto
  let fallos = 0;
  let enEsperaHasta = 0;
  let version = 0;
  const oyentes = new Set<() => void>();
  const cambio = () => {
    version++;
    oyentes.forEach((f) => f());
  };

  return {
    subscribe(f: () => void) {
      oyentes.add(f);
      return () => void oyentes.delete(f);
    },
    /** Cambia cada vez que el candado se abre o se cierra a mano (para useSyncExternalStore). */
    version: () => version,
    abierto: () => ahora() < hasta,
    /** Milisegundos que le quedan abierto (0 si está cerrado). */
    restanteMs: () => Math.max(0, hasta - ahora()),
    desbloquear(escrito: string): Intento {
      const t = ahora();
      if (t < enEsperaHasta) return { ok: false, razon: "espera", esperaMs: enEsperaHasta - t };
      if (escrito.trim() === codigo) {
        fallos = 0;
        hasta = t + duracionMs;
        cambio();
        return { ok: true };
      }
      fallos++;
      if (fallos >= maxIntentos) {
        fallos = 0;
        enEsperaHasta = t + esperaMs;
        return { ok: false, razon: "espera", esperaMs };
      }
      return { ok: false, razon: "codigo", intentosRestantes: maxIntentos - fallos };
    },
    bloquear() {
      if (hasta === 0 && fallos === 0) return;
      hasta = 0;
      cambio();
    },
  };
}

export type Bloqueo = ReturnType<typeof crearBloqueo>;
