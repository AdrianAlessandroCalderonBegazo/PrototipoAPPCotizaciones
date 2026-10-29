-- ERP · Fase 2: proyectos y contabilidad (cuenta principal y envío de fondos a caja chica).
-- Los montos son NUMERIC (nunca coma flotante) y llevan su moneda. Lo desconocido queda en NULL («Sin dato»).
-- Las columnas proyecto_id de la caja (Finanzas) las agrega la migración 005 de finanzas/db/migrations.

-- ---------------------------------------------------------------------------------------------
-- Proyectos. Para crear uno basta nombre y presupuesto; lo demás se completa después.
-- estado: activo → pausado (con causa) → activo … → finalizado (solo lectura, no recibe gastos nuevos).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proyectos (
  id             SERIAL PRIMARY KEY,
  codigo         VARCHAR(20) NOT NULL UNIQUE,                 -- PRY-001
  nombre         VARCHAR(200) NOT NULL,
  presupuesto    NUMERIC(14,2) NOT NULL CHECK (presupuesto > 0),
  moneda         CHAR(3) NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN','USD')),
  estado         VARCHAR(12) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','pausado','finalizado')),
  causa_pausa    TEXT,
  cliente        VARCHAR(255),
  ruc_dni        VARCHAR(20),
  tipo_sistema   VARCHAR(120),
  marca          VARCHAR(120),
  ubicacion      VARCHAR(255),
  responsable    VARCHAR(120),
  notas          TEXT,
  version        INTEGER NOT NULL DEFAULT 1,
  creado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_en TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  CONSTRAINT proyectos_causa_si_pausado CHECK ((estado = 'pausado') = (causa_pausa IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_proyectos_estado ON proyectos (estado);

-- Historial de estados (quién y cuándo). La primera fila es la creación.
CREATE TABLE IF NOT EXISTS proyecto_estados (
  id          SERIAL PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  estado      VARCHAR(12) NOT NULL,
  causa       TEXT,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario     VARCHAR(120),
  fecha       TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE INDEX IF NOT EXISTS idx_proyecto_estados ON proyecto_estados (proyecto_id, id);

-- Galería de fotos de obra (los archivos están en /uploads).
CREATE TABLE IF NOT EXISTS proyecto_fotos (
  id           SERIAL PRIMARY KEY,
  proyecto_id  INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  ruta         VARCHAR(300) NOT NULL,
  descripcion  VARCHAR(255),
  subido_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  subido_por   VARCHAR(120),
  subido_en    TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  eliminado    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_proyecto_fotos ON proyecto_fotos (proyecto_id) WHERE NOT eliminado;

-- ---------------------------------------------------------------------------------------------
-- Cuentas de la empresa (cuenta principal en soles y, si la hay, en dólares).
-- saldo_inicial NULL = no se sabe todavía: el saldo se muestra «Sin dato» hasta que Contabilidad lo registre.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuentas (
  id                  SERIAL PRIMARY KEY,
  nombre              VARCHAR(120) NOT NULL,
  banco               VARCHAR(80),
  numero              VARCHAR(60),
  cci                 VARCHAR(60),
  moneda              CHAR(3) NOT NULL CHECK (moneda IN ('PEN','USD')),
  saldo_inicial       NUMERIC(14,2),
  saldo_inicial_fecha DATE,
  principal           BOOLEAN NOT NULL DEFAULT FALSE,
  activa              BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en           TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  CONSTRAINT cuentas_saldo_con_fecha CHECK ((saldo_inicial IS NULL) = (saldo_inicial_fecha IS NULL))
);
-- Solo una cuenta principal por moneda.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cuentas_principal ON cuentas (moneda) WHERE principal;

-- Movimientos de las cuentas. Nunca se borran: un error se ANULA (con motivo) y queda en la auditoría.
-- source: 'erp' (registrado en el ERP) | 'envio_caja_chica' (egreso automático al enviar fondos).
CREATE TABLE IF NOT EXISTS cuenta_movimientos (
  id                SERIAL PRIMARY KEY,
  cuenta_id         INTEGER NOT NULL REFERENCES cuentas(id),
  fecha             DATE NOT NULL,
  tipo              VARCHAR(8) NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  monto             NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  concepto          VARCHAR(255) NOT NULL,
  categoria         VARCHAR(80),
  proyecto_id       INTEGER REFERENCES proyectos(id),
  documento         VARCHAR(80),
  contraparte       VARCHAR(255),
  source            VARCHAR(20) NOT NULL DEFAULT 'erp' CHECK (source IN ('erp','envio_caja_chica')),
  anulado           BOOLEAN NOT NULL DEFAULT FALSE,
  anulado_motivo    TEXT,
  anulado_por       VARCHAR(120),
  anulado_en        TIMESTAMP,
  registrado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  registrado_por    VARCHAR(120),
  creado_en         TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  CONSTRAINT cuenta_mov_anulado_con_motivo CHECK (NOT anulado OR anulado_motivo IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_cuenta_mov_fecha ON cuenta_movimientos (cuenta_id, fecha, id);
CREATE INDEX IF NOT EXISTS idx_cuenta_mov_proyecto ON cuenta_movimientos (proyecto_id) WHERE proyecto_id IS NOT NULL;

-- Envíos de fondos a caja chica: une el egreso de la cuenta con el ingreso de la caja chica (caja_chica_mov, tipo FONDO).
CREATE TABLE IF NOT EXISTS envios_caja_chica (
  id                        SERIAL PRIMARY KEY,
  cuenta_id                 INTEGER NOT NULL REFERENCES cuentas(id),
  movimiento_id             INTEGER NOT NULL UNIQUE REFERENCES cuenta_movimientos(id),
  caja_chica_mov_id         UUID NOT NULL,
  ciudad                    VARCHAR(3) NOT NULL,
  fecha                     DATE NOT NULL,
  monto                     NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  concepto                  VARCHAR(255) NOT NULL,
  saldo_negativo_autorizado BOOLEAN NOT NULL DEFAULT FALSE,
  usuario_id                INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario                   VARCHAR(120),
  creado_en                 TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
