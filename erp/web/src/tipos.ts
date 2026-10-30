export type Rol = "admin" | "ventas" | "contabilidad" | "tecnico";
export type Nivel = "ninguno" | "lectura" | "completo";
export type ClaveModulo =
  | "inicio" | "proyectos" | "almacen" | "activos" | "cotizacion" | "cotizador_ia" | "comparador"
  | "contabilidad" | "facturacion" | "asistente_ia" | "configuracion" | "logistica" | "caja_chica";

export type Usuario = {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  rol_etiqueta: string;
  activo: boolean;
  niveles: Partial<Record<ClaveModulo, Nivel>>;
};

export type UsuarioLista = { id: number; usuario: string; nombre: string; rol: Rol; activo: boolean; creado_en: string | null; ultimo_acceso: string | null };

export type ModuloCatalogo = { clave: ClaveModulo; nombre: string; grupo: string; lectura: string; completo: string };
export type Catalogo = { roles: { clave: Rol; nombre: string }[]; niveles: Nivel[]; modulos: ModuloCatalogo[] };
export type Matriz = Record<Rol, Record<ClaveModulo, Nivel>>;

export type Empresa = {
  razon_social: string | null; nombre_comercial: string | null; ruc: string | null; direccion: string | null; ciudad: string | null;
  telefono: string | null; correo: string | null; web: string | null; logo: string | null; cuentas_bancarias: string | null; pie_pdf: string | null;
};

export type Parametros = {
  presupuesto_aviso_pct: number;
  presupuesto_limite_pct: number;
  vigencia_precios_dias: number;
  tipo_cambio: { valor: string | null; fecha: string | null; fuente: string | null };
};

export type Numeracion = { prefijo: string; digitos: number; ultimo: number; siguiente: number; ejemplo: string };

export type EstadoIntegracion = "conectado" | "error" | "no_configurado" | "en_navegador";
export type Integracion = { clave: string; nombre: string; descripcion: string; estado: EstadoIntegracion; detalle: string; probado_en: string };

export type RegistroAuditoria = {
  id: number; fecha: string; usuario_id: number | null; usuario: string | null; rol: string | null; accion: string; entidad: string;
  entidad_id: string | null; antes: unknown; despues: unknown; detalle: string | null;
};

// ---- Fase 2 ----
export type EstadoProyecto = "activo" | "pausado" | "finalizado";
export type Proyecto = {
  id: number; codigo: string; nombre: string; presupuesto: string; moneda: "PEN" | "USD"; estado: EstadoProyecto; causa_pausa: string | null;
  cliente: string | null; ruc_dni: string | null; tipo_sistema: string | null; marca: string | null; ubicacion: string | null; responsable: string | null; notas: string | null;
  version: number; creado_en: string; actualizado_en: string;
  gastado: string; saldo: string; porcentaje: number | null; n_gastos: number; ultimo_gasto: string | null;
};
export type GastoProyecto = {
  origen: "cuenta_principal" | "caja_chica" | "caja_diaria"; id: string; fecha: string; concepto: string; categoria: string | null; monto: string;
  por: string | null; comprobante: string | null; adjuntos: string[]; ciudad: string | null; registrado_en: string;
};
export type DetalleProyecto = {
  proyecto: Proyecto; gastos: GastoProyecto[]; categorias: { categoria: string; monto: string; porcentaje: number }[];
  estados: { id: number; estado: EstadoProyecto; causa: string | null; usuario: string | null; fecha: string }[];
  fotos: { id: number; ruta: string; descripcion: string | null; subido_por: string | null; subido_en: string }[];
  caja_disponible: boolean; causas_pausa: string[];
};

export type Cuenta = {
  id: number; nombre: string; banco: string | null; numero: string | null; cci: string | null; moneda: "PEN" | "USD"; saldo_inicial: string | null;
  saldo_inicial_fecha: string | null; principal: boolean; activa: boolean; saldo: string | null; ultimo_movimiento: string | null;
};
export type MovimientoCuenta = {
  id: number; cuenta_id: number; fecha: string; tipo: "ingreso" | "egreso"; monto: string; concepto: string; categoria: string | null; proyecto_id: number | null;
  proyecto_codigo: string | null; proyecto_nombre: string | null; documento: string | null; contraparte: string | null; source: "erp" | "envio_caja_chica";
  anulado: boolean; anulado_motivo: string | null; anulado_por: string | null; anulado_en: string | null; registrado_por: string | null; creado_en: string; saldo: string | null;
};
export type ResumenConta = {
  mes: string; cuentas: Cuenta[]; cuenta: Cuenta | null;
  kpis: { ingresos_mes: string; egresos_mes: string; ingresos_mes_anterior: string; egresos_mes_anterior: string; movimientos_mes: number };
  flujo: { mes: string; ingresos: string; egresos: string }[];
  egresos_por_categoria: { categoria: string; monto: string; porcentaje: number }[];
  egresos_por_proyecto: { id: number; codigo: string; nombre: string; estado: EstadoProyecto; total: string }[];
  categorias: { ingreso: string[]; egreso: string[] };
};
export type MovChicaErp = {
  id: string; ciudad: string; fecha: string; tipo: "EGRESO" | "TRANSFERENCIA" | "FONDO"; descripcion: string; persona: string; categoria: string | null; monto: string;
  origen: string; proyecto_id: number | null; proyecto_nombre: string | null; registrado_por: string | null; adjuntos: string[];
};
export type CajaChicaErp =
  | { disponible: false }
  | { disponible: true; mes: string; saldos: { ciudad: string; nombre: string; saldo: string }[]; saldo_total: string; ingresos_mes: string; egresos_mes: string; gastos_mes: number; sin_comprobante_mes: number; movimientos: MovChicaErp[] };

// ---- Fase 3 ----
export type Producto = {
  id: number; codigo: string | null; nombre: string; marca: string | null; modelo: string | null; categoria: string; unidad: string | null;
  precio: string | null; costo?: string | null; moneda: "PEN" | "USD"; caracteristicas: string | null; referencia_interna: string | null;
  origen: string; source: string | null; actualizado_en: string; precio_actualizado_en: string | null; imagen: string | null;
};
export type KitItem = {
  id?: number; producto_id: number | null; descripcion: string; unidad: string | null; cantidad: string; precio_unitario: string | null;
  descuento_pct: string; codigo?: string | null; producto_nombre?: string | null; precio_catalogo?: string | null; precio_efectivo?: string | null; sin_producto?: boolean;
};
export type TotalesCot = { subtotal: string | null; descuento_lineas: string | null; descuento: string | null; total: string | null; valor_venta: string | null; igv: string | null };
export type Kit = {
  id: number; nombre: string; descripcion: string | null; variante_de: number | null; source: string; version: number; creado_en: string; actualizado_en: string;
  n_items?: number; sin_precio?: number; items?: KitItem[]; totales: TotalesCot | null;
};
export type EstadoCot = "borrador" | "enviada" | "aceptada" | "rechazada";
export type LineaCot = {
  producto_id: number | null; codigo: string | null; descripcion: string; detalle: string | null; unidad: string | null; cantidad: string; precio_unitario: string;
  descuento_pct: string; importe_bruto?: string; descuento?: string; importe?: string;
};
export type CotizacionResumen = {
  id: number; numero: string; origen: "logistica" | "erp"; estado: EstadoCot | null; cliente: string; ruc_dni: string | null; vendedor: string | null;
  fecha: string; total: string | null; validez_dias: number | null; valida_hasta: string | null; kit_id: number | null; proyecto_id: number | null; n_items: number;
};
export type Cotizacion = CotizacionResumen & {
  telefono: string | null; direccion: string | null; atencion: string | null; correo: string | null; sistema: string | null; banco: string | null; moneda: string | null;
  nro_cuenta: string | null; cci: string | null; condiciones: string | null; version: number; actualizado_por: string | null; actualizado_en: string;
  enviada_en: string | null; respondida_en: string | null; motivo_rechazo: string | null; creado_por: string | null; items: LineaCot[]; totales: TotalesCot;
};

// ---- Fase 4 ----
export type Alerta = { clave: string; nivel: "alta" | "media" | "info"; icono: string; titulo: string; origen: string; ruta: string | null; cta: string; leida?: boolean };
export type InicioDatos = {
  fecha: string;
  permisos: Record<"proyectos" | "contabilidad" | "cotizacion" | "logistica" | "caja_chica" | "configuracion" | "proyectosCompleto" | "cotizacionCompleto" | "contabilidadCompleto", boolean>;
  finanzas?: { cuenta: Cuenta | null; cuentas: Cuenta[]; kpis: ResumenConta["kpis"]; caja: CajaChicaErp };
  proyectos?: { activos: Proyecto[]; pausados: (Proyecto & { pausado_desde: string | null })[]; total_activos: number; con_alerta: number; aviso_pct: number; limite_pct: number };
  cotizaciones?: { ultimas: { id: number; numero: string; cliente: string; sistema: string | null; estado: EstadoCot | null; origen: string; fecha: string; total: string | null }[]; del_mes: number; monto_mes: string; aceptadas_mes: number };
  logistica?: { por_aprobar: number; por_entregar: number; urgentes: number; herramientas_fuera: number; salidas_por_confirmar: number };
  alertas: Alerta[];
};
export type GrupoBusqueda = { grupo: string; items: { titulo: string; detalle: string; icono: string; ruta: string }[] };
