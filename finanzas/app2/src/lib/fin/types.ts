/**
 * Modelo de ICR Finanzas 2: un solo libro de movimientos sobre varias cuentas (bancos, Yapes, efectivo).
 * Es el mismo que el contrato de la API (docs/API-V2.md) y las tablas de db/migrations/002_fin.sql: los
 * nombres de campo coinciden a propósito para que lo que viaja por la red no necesite traducción.
 */

export const TIPOS_CUENTA = ["BANCO", "YAPE", "EFECTIVO"] as const;
export type TipoCuenta = (typeof TIPOS_CUENTA)[number];
export const TIPO_CUENTA_LABEL: Record<TipoCuenta, string> = { BANCO: "Banco", YAPE: "Yape", EFECTIVO: "Efectivo" };

/** Un banco, un Yape o una caja de efectivo. Los Yape de Diego y Milagros son los fondos de gastos menores. */
export type Cuenta = {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  /** Quién la maneja (p. ej. "Diego"). */
  titular: string;
  /** Últimos 4 dígitos de la cuenta del banco: así una captura del BCP ("Desde ****2000") se asigna sola. */
  referencia: string;
  saldo_inicial: number;
  /** Saldo (calculado por el servidor) con el que empieza la ventana de movimientos que tiene el dispositivo. */
  saldo_base: number;
  /** Si el saldo baja de este monto hay que pedir reposición. 0 = sin aviso. */
  umbral: number;
  /** Quién recibe la solicitud de reposición: número de WhatsApp (con código de país) y/o chat de Telegram. */
  aviso_whatsapp: string;
  aviso_telegram: string;
  activa: boolean;
  orden: number;
  updated_at: string;
};

export const TIPOS_PERSONA = ["OBRA", "PRACTICANTE", "PLANILLA", "PROVEEDOR", "OTRO"] as const;
export type TipoPersona = (typeof TIPOS_PERSONA)[number];
export const TIPO_PERSONA_LABEL: Record<TipoPersona, string> = { OBRA: "Personal de obra", PRACTICANTE: "Practicante", PLANILLA: "En planilla", PROVEEDOR: "Proveedor", OTRO: "Otro" };

/** Libreta: trabajadores, practicantes y proveedores. `alias` son los nombres tal como salen en las capturas. */
export type Persona = {
  id: string;
  nombre: string;
  tipo: TipoPersona;
  alias: string[];
  /** Monto del menú diario de esta persona (0 = no recibe menú). */
  menu_monto: number;
  activa: boolean;
  updated_at: string;
};

export const TIPOS_MOV = ["INGRESO", "EGRESO", "TRASPASO"] as const;
export type TipoMov = (typeof TIPOS_MOV)[number];
export const TIPO_MOV_LABEL: Record<TipoMov, string> = { INGRESO: "Ingreso", EGRESO: "Egreso", TRASPASO: "Traspaso" };
export const ORIGENES = ["MANUAL", "CAPTURA", "MENU"] as const;
export type Origen = (typeof ORIGENES)[number];

/** Foto de un comprobante. `localKey` apunta a la copia guardada en el dispositivo (IndexedDB en web). */
export type Adjunto = { id: string; mime: string; bytes: number; nombre?: string; localKey?: string; synced: boolean };

/** Reparto del gasto: para quién fue (un menú de S/ 20 para dos personas = S/ 10 y S/ 10). */
export type Para = { persona_id: string; monto: number };

export type Mov = {
  id: string;
  tipo: TipoMov;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM
  /** De dónde sale (egreso, traspaso) o a dónde entra (ingreso). */
  cuenta_id: string;
  /** Solo en traspasos: a dónde llega. */
  destino_id: string;
  monto: number;
  categoria: string;
  subcategoria: string;
  concepto: string;
  /** A quién se le pagó: texto tal como se leyó/escribió, y la persona de la libreta si se reconoció. */
  pagado_a: string;
  pagado_a_id: string;
  para: Para[];
  /** Número de operación del banco/Yape: sirve para no registrar dos veces la misma captura. */
  nro_operacion: string;
  origen: Origen;
  adjuntos: Adjunto[];
  creado_por: string;
  /** ISO de cuando se creó: desempata el orden de movimientos de un mismo minuto. */
  creado: string;
  updated_at: string;
  /** true cuando el servidor ya lo tiene (solo local, no viaja). */
  servidor?: boolean;
};

/** Conteo del saldo real contra el calculado (cuadre). */
export type Cuadre = { id: string; cuenta_id: string; fecha: string; saldo_real: number; saldo_sistema: number; diferencia: number; nota: string; creado_por: string; creado: string };

export const clavePar = (m: Pick<Mov, "fecha" | "hora" | "creado">) => `${m.fecha} ${m.hora || "00:00"} ${m.creado}`;
