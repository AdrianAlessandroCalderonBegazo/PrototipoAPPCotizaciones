/** Caja ICR (Fase 11): una sola caja con dos saldos, efectivo y digital. Lo guarda la API principal (/api/caja-icr). */
export type Medio = "EFECTIVO" | "DIGITAL";
export type Origen = "VENTA" | "FONDO" | "GASTO" | "CAPTURA" | "DEPOSITO" | "AJUSTE";
export type Comprobante = "BOLETA" | "FACTURA" | "RECIBO" | "NINGUNO";

export type Mov = {
  id: string; fecha: string; tipo: "INGRESO" | "EGRESO"; medio: Medio; origen: Origen;
  categoria: string | null; subcategoria: string | null; descripcion: string; persona: string | null; destinatario: string | null; operacion: string | null;
  comprobante: Comprobante | null; monto: string; proyecto_id: number | null; proyecto: string | null; cuenta_movimiento_id: number | null;
  anulado: boolean; anulado_motivo: string | null; anulado_por: string | null; anulado_en: string | null;
  creado_por: string | null; creado_en: string; actualizado_por: string | null; actualizado_en: string; adjuntos: number[];
};
export type Saldos = { efectivo: string; digital: string; total: string };
export type Resumen = {
  fecha: string; saldos: Saldos; hoy: { ingresos: string; egresos: string; movimientos: number; sin_foto: number }; recientes: Mov[];
  categorias: { EGRESO: string[]; INGRESO: string[] }; subcategorias: Record<string, string[]>; categoria_deposito: string;
};
export type Grupo = { clave: string; monto: string };
export type PorMedio = { saldo_inicial: string; ingresos: string; egresos: string; saldo_final: string };
export type Reporte = {
  desde: string; hasta: string; efectivo: PorMedio; digital: PorMedio; ingresos: string; egresos: string; ventas: string; fondos: string; gastos: string; depositos: string;
  gastos_fisicos: string; gastos_digitales: string; sin_foto: number; por_categoria: Grupo[]; por_persona: Grupo[]; por_proyecto: Grupo[];
  por_dia: { fecha: string; ingresos: string; egresos: string }[]; movimientos: Mov[];
};
/** Lo que se manda al registrar (el id lo pone la app: un reintento no duplica). */
export type NuevoMov = {
  id: string; origen: "VENTA" | "GASTO" | "CAPTURA" | "AJUSTE"; tipo?: "INGRESO" | "EGRESO"; medio?: Medio; fecha: string; monto: string; descripcion: string; categoria: string; subcategoria?: string | null;
  persona?: string | null; destinatario?: string | null; operacion?: string | null; comprobante?: Comprobante | null; proyecto_id?: number | null;
};

export const ORIGEN_LABEL: Record<Origen, string> = { VENTA: "Venta", FONDO: "Fondos del ERP", GASTO: "Gasto físico", CAPTURA: "Gasto digital", DEPOSITO: "Depósito a cuenta principal", AJUSTE: "Ajuste" };
export const MEDIO_LABEL: Record<Medio, string> = { EFECTIVO: "Efectivo", DIGITAL: "Digital" };
export const COMPROBANTES: Comprobante[] = ["BOLETA", "FACTURA", "RECIBO", "NINGUNO"];
export const COMPROBANTE_LABEL: Record<Comprobante, string> = { BOLETA: "Boleta", FACTURA: "Factura", RECIBO: "Recibo", NINGUNO: "Ninguno" };
export const catTexto = (m: Pick<Mov, "categoria" | "subcategoria">) => (m.subcategoria ? `${m.categoria} · ${m.subcategoria}` : m.categoria ?? "Sin dato");
