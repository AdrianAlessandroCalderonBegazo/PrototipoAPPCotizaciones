-- Fase 11: «Caja ICR», la única caja de Finanzas (reemplaza a la caja diaria y la caja chica, que quedan como historial).
-- Dos saldos: EFECTIVO y DIGITAL (Yape, transferencias). Sin ciudades ni cierre del día.
-- Ingresos: ventas registradas en la app y fondos enviados desde el ERP. Egresos: gastos físicos, gastos digitales (capturas)
-- y «Depósito a cuenta principal», que crea el ingreso en la cuenta principal del ERP (y se anulan juntos).
CREATE TABLE IF NOT EXISTS caja_icr_mov (
  id                   UUID PRIMARY KEY,                     -- lo genera la app: un reintento no duplica el movimiento
  fecha                DATE NOT NULL,
  tipo                 VARCHAR(8) NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
  medio                VARCHAR(8) NOT NULL CHECK (medio IN ('EFECTIVO', 'DIGITAL')),
  origen               VARCHAR(8) NOT NULL CHECK (origen IN ('VENTA', 'FONDO', 'GASTO', 'CAPTURA', 'DEPOSITO', 'AJUSTE')),
  categoria            VARCHAR(80),
  subcategoria         VARCHAR(80),
  descripcion          VARCHAR(300) NOT NULL,
  persona              VARCHAR(120),                         -- quién gastó / quién cobró
  destinatario         VARCHAR(160),                         -- a quién se pagó (lo lee la captura)
  operacion            VARCHAR(40),                          -- n.º de operación de Yape/BCP: evita registrar dos veces la misma captura
  comprobante          VARCHAR(20) CHECK (comprobante IN ('BOLETA', 'FACTURA', 'RECIBO', 'NINGUNO')),
  monto                NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  proyecto_id          INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
  cuenta_movimiento_id INTEGER REFERENCES cuenta_movimientos(id),  -- fondo desde el ERP o depósito a la cuenta principal
  anulado              BOOLEAN NOT NULL DEFAULT FALSE,
  anulado_motivo       VARCHAR(500),
  anulado_por          VARCHAR(120),
  anulado_en           TIMESTAMP,
  creado_por_id        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por           VARCHAR(120),
  creado_en            TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_por      VARCHAR(120),
  actualizado_en       TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  CONSTRAINT caja_icr_anulado_con_motivo CHECK (NOT anulado OR anulado_motivo IS NOT NULL),
  CONSTRAINT caja_icr_origen_tipo CHECK (
    (origen IN ('VENTA', 'FONDO') AND tipo = 'INGRESO') OR (origen IN ('GASTO', 'CAPTURA', 'DEPOSITO') AND tipo = 'EGRESO') OR origen = 'AJUSTE')
);
CREATE INDEX IF NOT EXISTS idx_caja_icr_fecha ON caja_icr_mov (fecha DESC, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_caja_icr_proyecto ON caja_icr_mov (proyecto_id) WHERE proyecto_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_icr_operacion ON caja_icr_mov (operacion) WHERE operacion IS NOT NULL AND NOT anulado;

-- Fotos del recibo o capturas de pantalla (carpeta privada: se ven solo con sesión y permiso).
CREATE TABLE IF NOT EXISTS caja_icr_adjunto (
  id         SERIAL PRIMARY KEY,
  mov_id     UUID NOT NULL REFERENCES caja_icr_mov(id) ON DELETE CASCADE,
  archivo    VARCHAR(60) NOT NULL,
  mime       VARCHAR(40) NOT NULL,
  bytes      INTEGER NOT NULL,
  creado_en  TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE INDEX IF NOT EXISTS idx_caja_icr_adjunto ON caja_icr_adjunto (mov_id);

-- Los movimientos de la cuenta principal que nacen de la Caja ICR.
ALTER TABLE cuenta_movimientos DROP CONSTRAINT IF EXISTS cuenta_movimientos_source_check;
ALTER TABLE cuenta_movimientos ADD CONSTRAINT cuenta_movimientos_source_check CHECK (source IN ('erp', 'envio_caja_chica', 'envio_caja_icr', 'deposito_caja_icr'));

