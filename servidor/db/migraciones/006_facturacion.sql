-- ERP · Fase 5: Facturación SUNAT. El ERP prepara el comprobante (boleta o factura), la extensión de Chrome rellena el portal SOL
-- y la persona emite en SUNAT. El número lo asigna SUNAT: se registra al «marcar emitido» (no hay correlativo propio).
-- Estados: borrador → enviado (se abrió SUNAT con los datos) → emitido (con serie-número) → anulado (con motivo).
CREATE TABLE IF NOT EXISTS comprobantes (
  id                 SERIAL PRIMARY KEY,
  tipo               VARCHAR(10) NOT NULL CHECK (tipo IN ('factura', 'boleta')),
  estado             VARCHAR(10) NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviado', 'emitido', 'anulado')),
  serie              VARCHAR(4),
  correlativo        INTEGER,
  fecha_emision      DATE,
  moneda             VARCHAR(3) NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN', 'USD')),
  cliente_tipo_doc   VARCHAR(3) CHECK (cliente_tipo_doc IN ('RUC', 'DNI')),
  cliente_doc        VARCHAR(11),
  cliente_nombre     VARCHAR(255),
  cliente_direccion  VARCHAR(255),
  cliente_fuente     VARCHAR(12),              -- de dónde salió el nombre: sunat | reniec | historial | NULL (escrito a mano)
  forma_pago         VARCHAR(8) NOT NULL DEFAULT 'contado' CHECK (forma_pago IN ('contado', 'credito')),
  cuotas             JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ fecha: 'AAAA-MM-DD', monto: '123.45' }]
  items              JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ descripcion, unidad, cantidad, valor_unitario, valor_venta, igv, importe }]
  observacion        VARCHAR(500),
  op_gravada         NUMERIC(14,2) NOT NULL DEFAULT 0,
  igv                NUMERIC(14,2) NOT NULL DEFAULT 0,
  total              NUMERIC(14,2) NOT NULL DEFAULT 0,
  cotizacion_id      INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL,
  proyecto_id        INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
  pdf_archivo        VARCHAR(120),
  xml_archivo        VARCHAR(120),
  motivo_anulacion   VARCHAR(500),
  enviado_en         TIMESTAMP,
  emitido_en         TIMESTAMP,
  anulado_en         TIMESTAMP,
  creado_por         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_por    VARCHAR(120),
  version            INTEGER NOT NULL DEFAULT 1,
  creado_en          TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_en     TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobantes_numero ON comprobantes (tipo, serie, correlativo) WHERE serie IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comprobantes_estado ON comprobantes (estado);
CREATE INDEX IF NOT EXISTS idx_comprobantes_doc ON comprobantes (cliente_doc);

-- Consultas al padrón (RUC en SUNAT, DNI en RENIEC) por un proveedor externo opcional: se guardan para no repetirlas.
CREATE TABLE IF NOT EXISTS padron_consultas (
  doc            VARCHAR(11) PRIMARY KEY,
  datos          JSONB NOT NULL,
  consultado_en  TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
