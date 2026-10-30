-- ERP · Fase 3: Cotización (catálogo ampliado, kits y cotizaciones del ERP).
-- Los precios del catálogo INCLUYEN IGV (igual que las cotizaciones de Logística): total = Σ ítems − descuentos;
-- valor de venta = total ÷ 1.18; IGV = total − valor de venta. Lo desconocido queda en NULL («Sin dato»).

-- ---------------------------------------------------------------------------------------------
-- Catálogo: marca, modelo, moneda, características y origen del dato.
-- El código del producto es codigo_erp (ya existía, único): se llena con la referencia interna solo donde no se repite.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE productos ADD COLUMN IF NOT EXISTS marca             VARCHAR(80);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS modelo            VARCHAR(120);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS moneda            CHAR(3) NOT NULL DEFAULT 'PEN';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS caracteristicas   TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS source            VARCHAR(20);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_actualizado_en TIMESTAMP;
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_moneda_check;
ALTER TABLE productos ADD CONSTRAINT productos_moneda_check CHECK (moneda IN ('PEN','USD'));

UPDATE productos p SET codigo_erp = p.referencia_interna
 WHERE p.codigo_erp IS NULL AND NULLIF(trim(p.referencia_interna), '') IS NOT NULL
   AND (SELECT count(*) FROM productos q WHERE q.referencia_interna = p.referencia_interna) = 1
   AND NOT EXISTS (SELECT 1 FROM productos q WHERE q.codigo_erp = p.referencia_interna);

-- ---------------------------------------------------------------------------------------------
-- Kits de venta: plantillas editables. Al cotizar se COPIAN (cambiar la cotización no toca la plantilla).
-- precio_unitario NULL = usar el precio del catálogo del momento.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kits (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(160) NOT NULL,
  descripcion    TEXT,
  variante_de    INTEGER REFERENCES kits(id) ON DELETE SET NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  source         VARCHAR(20) NOT NULL DEFAULT 'erp',
  version        INTEGER NOT NULL DEFAULT 1,
  creado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_en TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);

CREATE TABLE IF NOT EXISTS kit_items (
  id              SERIAL PRIMARY KEY,
  kit_id          INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  orden           INTEGER NOT NULL DEFAULT 0,
  producto_id     INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  descripcion     VARCHAR(255) NOT NULL,
  unidad          VARCHAR(40),
  cantidad        NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(14,2) CHECK (precio_unitario >= 0),
  descuento_pct   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100)
);
CREATE INDEX IF NOT EXISTS idx_kit_items ON kit_items (kit_id, orden);

-- ---------------------------------------------------------------------------------------------
-- Cotizaciones: las del ERP guardan estado, totales y condiciones. Las que vienen de Logística quedan como estaban
-- (origen 'logistica', estado NULL = «Sin estado» hasta que alguien lo marque).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS origen            VARCHAR(10) NOT NULL DEFAULT 'logistica';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS estado            VARCHAR(10);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS direccion         VARCHAR(255);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS atencion          VARCHAR(160);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS correo            VARCHAR(160);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS sistema           TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS subtotal          NUMERIC(14,2);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento_lineas  NUMERIC(14,2);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento         NUMERIC(14,2);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS valor_venta       NUMERIC(14,2);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS igv               NUMERIC(14,2);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS validez_dias      INTEGER;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS condiciones       TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS kit_id            INTEGER REFERENCES kits(id) ON DELETE SET NULL;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS proyecto_id       INTEGER REFERENCES proyectos(id) ON DELETE SET NULL;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS enviada_en        TIMESTAMP;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS respondida_en     TIMESTAMP;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS motivo_rechazo    TEXT;
ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_origen_check;
ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_origen_check CHECK (origen IN ('logistica','erp'));
ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_estado_check;
ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_estado_check CHECK (estado IS NULL OR estado IN ('borrador','enviada','aceptada','rechazada'));
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON cotizaciones (estado);

-- ---------------------------------------------------------------------------------------------
-- Datos de la empresa: los mismos que ya imprime el PDF de Logística. Solo si todavía no se configuraron.
-- ---------------------------------------------------------------------------------------------
INSERT INTO configuracion (clave, valor)
VALUES ('empresa', '{"razon_social":"INVERSIONES ICR S.R.L.","ruc":"20605309489","direccion":"Calle Pizarro 325 C","ciudad":"Arequipa","correo":"inversionesicr@hotmail.com"}')
ON CONFLICT (clave) DO NOTHING;
