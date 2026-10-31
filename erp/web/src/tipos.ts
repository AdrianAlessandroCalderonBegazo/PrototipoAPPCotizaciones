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
  origen: "cuenta_principal" | "caja_icr" | "caja_chica" | "caja_diaria"; id: string; fecha: string; concepto: string; categoria: string | null; monto: string;
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
  proyecto_codigo: string | null; proyecto_nombre: string | null; documento: string | null; contraparte: string | null; source: "erp" | "envio_caja_chica" | "envio_caja_icr" | "deposito_caja_icr";
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
// ---- Fase 11: Caja ICR (una sola caja, dos saldos) ----
export type MedioCaja = "EFECTIVO" | "DIGITAL";
export type MovCajaIcr = {
  id: string; fecha: string; tipo: "INGRESO" | "EGRESO"; medio: MedioCaja; origen: "VENTA" | "FONDO" | "GASTO" | "CAPTURA" | "DEPOSITO" | "AJUSTE";
  categoria: string | null; subcategoria: string | null; descripcion: string; persona: string | null; destinatario: string | null; operacion: string | null;
  comprobante: string | null; monto: string; proyecto_id: number | null; proyecto: string | null; cuenta_movimiento_id: number | null;
  anulado: boolean; anulado_motivo: string | null; creado_por: string | null; creado_en: string; adjuntos: number[];
};
export type SaldosCajaIcr = { efectivo: string; digital: string; total: string };
export type ResumenCajaIcr = {
  fecha: string; saldos: SaldosCajaIcr; hoy: { ingresos: string; egresos: string; movimientos: number; sin_foto: number }; recientes: MovCajaIcr[];
};

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
  permisos: Record<"proyectos" | "contabilidad" | "cotizacion" | "logistica" | "caja_chica" | "configuracion" | "facturacion" | "proyectosCompleto" | "cotizacionCompleto" | "contabilidadCompleto" | "facturacionCompleto", boolean>;
  facturacion?: { emitidos_mes: number; monto_mes: string; borradores: number; enviados: number };
  finanzas?: { cuenta: Cuenta | null; cuentas: Cuenta[]; kpis: ResumenConta["kpis"]; caja: ResumenCajaIcr };
  proyectos?: { activos: Proyecto[]; pausados: (Proyecto & { pausado_desde: string | null })[]; total_activos: number; con_alerta: number; aviso_pct: number; limite_pct: number };
  cotizaciones?: { ultimas: { id: number; numero: string; cliente: string; sistema: string | null; estado: EstadoCot | null; origen: string; fecha: string; total: string | null }[]; del_mes: number; monto_mes: string; aceptadas_mes: number };
  logistica?: { por_aprobar: number; por_entregar: number; urgentes: number; herramientas_fuera: number; salidas_por_confirmar: number };
  alertas: Alerta[];
};
export type GrupoBusqueda = { grupo: string; items: { titulo: string; detalle: string; icono: string; ruta: string }[] };

// ---- Fase 5 ----
export type TipoCpe = "factura" | "boleta";
export type EstadoCpe = "borrador" | "enviado" | "emitido" | "anulado";
export type UnidadCpe = "NIU" | "ZZ" | "MTR";
export type ItemCpe = { descripcion: string; unidad: UnidadCpe; cantidad: string; valor_unitario: string; valor_venta?: string; igv?: string; importe?: string };
export type CuotaCpe = { fecha: string; monto: string };
export type TotalesCpe = { op_gravada: string; igv: string; total: string };
export type Regla = { ok: boolean; texto: string };
export type Comprobante = {
  id: number; tipo: TipoCpe; estado: EstadoCpe; serie: string | null; correlativo: number | null; numero: string | null; fecha_emision: string | null;
  moneda: "PEN" | "USD"; cliente_tipo_doc: "RUC" | "DNI" | null; cliente_doc: string | null; cliente_nombre: string | null; cliente_direccion: string | null;
  cliente_fuente: "sunat" | "reniec" | "historial" | null; forma_pago: "contado" | "credito"; cuotas: CuotaCpe[]; items: ItemCpe[]; observacion: string | null;
  totales: TotalesCpe; cotizacion_id: number | null; cotizacion_numero: string | null; proyecto_id: number | null; proyecto_nombre: string | null;
  tiene_pdf: boolean; tiene_xml: boolean; motivo_anulacion: string | null; enviado_en: string | null; emitido_en: string | null; anulado_en: string | null;
  creado_por: string | null; actualizado_por: string | null; version: number; creado_en: string; actualizado_en: string; validaciones?: Regla[];
};
export type ComprobanteFila = Omit<Comprobante, "items" | "cuotas"> & { n_items: number };
export type ListaCpe = { comprobantes: ComprobanteFila[]; resumen: { mes: string; emitido_mes: string; emitidos_mes: number; por_estado: Record<EstadoCpe, number> } };
export type Padron = { encontrado: boolean; configurado: boolean; fuente: "sunat" | "reniec" | "historial" | null; nombre: string | null; direccion: string | null; estado: string | null; condicion: string | null; aviso?: string | null; consultado_en?: string | null };
export type PropuestaCpe = {
  cotizacion: { id: number; numero: string; total: string; estado: string | null }; tipo: TipoCpe; cliente_doc: string | null; cliente_nombre: string | null;
  cliente_direccion: string | null; proyecto_id: number | null; items: ItemCpe[]; totales: TotalesCpe; objetivo: string; diferencia: string;
};

// ---- Fase 6 ----
export type ModuloIa = "cotizador" | "asistente";
export type EstadoIa = {
  disponible: boolean; motivo: "no_instalada" | "sin_conexion" | "falta_modelo" | null; detalle: string; latencia_ms?: number; modelo: string; modelo_embeddings: string;
  num_ctx: number; modelos?: string[]; embeddings_presente?: boolean; indice: { total: number; indexados: number; actualizado_en: string | null; modelo: string };
};
export type ConvIa = { id: number; modulo: ModuloIa; titulo: string; autor_id: number | null; autor_nombre: string | null; creado_en: string; actualizado_en: string; n_mensajes: number };
export type LineaTarjeta = { producto_id: number | null; codigo: string | null; descripcion: string; unidad: string | null; cantidad: string; precio_unitario: string | null; importe: string | null; origen: string; nota?: string; moneda_original?: string };
export type TarjetaIa = { titulo: string; items: LineaTarjeta[]; totales: { total: string; valor_venta: string; igv: string } | null; faltan_precios: number; tipo_cambio: string | null; fecha_precios: string; notas: string[] };
export type BloqueIa =
  | { tipo: "kpis"; items: { l: string; v: string; c?: "primario" | "peligro" }[] }
  | { tipo: "tabla"; titulo: string; columnas: { l: string; a: "left" | "right" }[]; filas: string[][]; destacar: number | null }
  | { tipo: "grafico"; titulo: string; barras: { l: string; v: number; texto: string }[] };
export type MensajeIa = {
  id: number; rol: "usuario" | "ia" | "error"; texto: string; datos: { tarjeta?: TarjetaIa | null; bloques?: BloqueIa[]; fuentes?: string[]; herramientas?: string[]; rapida?: boolean; guiada?: boolean } | null;
  por_voz: boolean; autor_nombre: string | null; modelo: string | null; duracion_ms: number | null; creado_en: string;
};
export type ContextoIa = { reglas: string | null; notas: string | null; usar_catalogo: boolean; usar_precios: boolean; usar_reglas: boolean; usar_notas: boolean; catalogo: { total: number; indexados: number; actualizado_en: string | null }; tipo_cambio: { valor: string | null; fecha: string | null }; igv_pct: number;
  guiada?: { paneles: number[]; inversores: number[]; baterias: number[] } };
export type ProductoGuiada = { id: number; codigo: string | null; nombre: string; precio: string | null; moneda: "PEN" | "USD"; valor: number; unidad: string; uso?: "red" | "hibrido" | "aislado" };
export type OpcionesGuiada = { hsp: number; preferidos: { paneles: number[]; inversores: number[]; baterias: number[] }; paneles: ProductoGuiada[]; inversores: ProductoGuiada[]; baterias: ProductoGuiada[] };

// ---- Fase 8 ----
export type FuenteProv = { id: number; tipo: "archivo" | "web"; url: string | null; adaptador: string; frecuencia_dias: number; activa: boolean; config: { moneda?: "PEN" | "USD"; incluye_igv?: boolean } | null; ultima_ejecucion: string | null; ultimo_estado: "ok" | "error" | "parcial" | null; ultimo_mensaje: string | null; ultimos_leidos: number | null };
export type Proveedor = {
  id: number; nombre: string; ruc: string | null; contacto: string | null; telefono: string | null; correo: string | null; web: string | null; moneda: "PEN" | "USD" | null;
  costo_envio: string | null; notas: string | null; activo: boolean; productos: number; ultima_carga: string | null; ultima_fecha_lista: string | null; fuentes: FuenteProv[];
};
export type ResultadoProv = {
  id: number; proveedor_id: number; proveedor: string; codigo: string | null; descripcion: string; marca: string | null; modelo: string | null; categoria: string | null; unidad: string | null;
  caracteristicas: string | null; disponibilidad: string | null; url: string | null; precio: string; moneda: "PEN" | "USD"; incluye_igv: boolean; origen: "archivo" | "web"; origen_detalle: string | null;
  fecha_lista: string; obtenido_en: string; tc_usado: string | null; costo_envio: string | null; coincidencia: "exacta" | "alternativa" | "distinta"; decidida: boolean; vigente: boolean;
  con_igv: string; soles: string | null; total: string | null; extra_conocido?: boolean; puntaje: number;
};
export type BusquedaProv = { referencia: { id: number; descripcion: string; proveedor: string } | null; tipo_cambio: string | null; vigencia_dias: number; interpretado: string[]; mejor: { id: number; ahorro: string | null } | null; resultados: ResultadoProv[]; proveedores: number };
export type DetalleProv = { producto: ResultadoProv; mismos: ResultadoProv[]; historial: { producto_id: number; proveedor: string; precio: string; moneda: "PEN" | "USD"; incluye_igv: boolean; origen: string; origen_detalle: string | null; fecha_lista: string; obtenido_en: string; tc_usado: string | null }[]; serie: Record<string, Record<string, string>>; tipo_cambio: string | null };
export type FilaImport = { fila: number; codigo: string | null; descripcion: string | null; marca: string | null; modelo: string | null; categoria: string | null; precio?: string; moneda?: string; estado: "nuevo" | "cambio" | "igual" | "error" | "duplicado"; mensaje?: string; aviso?: string | null; precio_anterior?: string | null };
export type RespuestaImport = { confirmado: boolean; carga_id?: number; resumen: { filas: number; nuevos: number; cambiaron: number; sin_cambios: number; errores: number; duplicados: number; sin_dato: Record<string, number> }; filas: FilaImport[]; duplicados: { descripcion: string; filas: number[]; precios: string[] }[] };

// ---- Fase 9 ----
export type Articulo = {
  id: number; codigo: string | null; nombre: string; categoria: string | null; unidad: string; stock: string; stock_minimo: string | null; ubicacion: string | null;
  producto_id: number | null; activo: boolean; actualizado_en: string; bajo: boolean; ultimo_movimiento: string | null;
};
export type ListaArticulos = { articulos: Articulo[]; categorias: string[]; resumen: { articulos: number; bajos: number; sin_stock: number } };
export type TipoMovAlmacen = "entrada" | "salida" | "ajuste" | "anulacion";
export type MovAlmacen = {
  id: number; articulo_id: number; articulo: string; unidad: string; codigo: string | null; tipo: TipoMovAlmacen; cantidad: string; delta: string; stock_despues: string; fecha: string;
  proyecto_id: number | null; proyecto: string | null; requerimiento_id: number | null; requerimiento: string | null; obra: string | null; proveedor_id: number | null; proveedor: string | null;
  documento: string | null; costo_unitario: string | null; moneda: "PEN" | "USD" | null; nota: string | null; anula_id: number | null; creado_por: string | null; creado_en: string; anulado: boolean;
};
export type Kardex = { articulo: Articulo; movimientos: MovAlmacen[]; entradas: string; salidas: string };
export type OpcionesAlmacen = {
  productos: { id: number; codigo: string | null; nombre: string; categoria: string | null; unidad: string | null }[];
  proyectos: { id: number; nombre: string; estado: string }[];
  proveedores: { id: number; nombre: string }[];
  requerimientos: { id: number; numero: string; obra: string; estado: string; fecha: string; con_salida: boolean }[];
};
export type PropuestaSalida = {
  requerimiento: { id: number; numero: string; obra: string; estado: string };
  items: { texto: string; categoria: string | null; cantidad: string; unidad: string | null; articulo: { id: number; nombre: string; unidad: string; stock: string } | null }[];
  salida_registrada: string | null;
};
export type TipoEquipo = "inversor" | "bateria" | "panel" | "controlador" | "monitoreo" | "otro";
export type Equipo = { id: number; activo_id: number; tipo: TipoEquipo; marca: string | null; modelo: string | null; serie: string | null; cantidad: number; garantia_hasta: string | null; notas: string | null; garantia: "vigente" | "por_vencer" | "vencida" | null };
export type Sistema = {
  id: number; nombre: string; cliente: string | null; proyecto_id: number | null; proyecto: string | null; ubicacion: string | null; fecha_instalacion: string | null; vrm_url: string | null;
  notas: string | null; activo: boolean; actualizado_en: string; equipos: Equipo[]; por_vencer?: number; vencidas?: number;
};
export type ListaSistemas = { activos: Sistema[]; resumen: { sistemas: number; con_vrm: number; equipos: number; por_vencer: number }; dias_aviso: number; tipos: TipoEquipo[] };
