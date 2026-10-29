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
