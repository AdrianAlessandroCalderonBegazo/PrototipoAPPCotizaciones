-- ERP · Fase 9: inventario del almacén (artículos, movimientos solo-agregar) y activos (sistemas instalados y sus equipos).
-- El portal Victron VRM se muestra dentro del ERP (iframe) con la dirección de cada instalación; no se usa la API de VRM.

CREATE TABLE IF NOT EXISTS almacen_articulos (
  id             SERIAL PRIMARY KEY,
  codigo         VARCHAR(60) UNIQUE,
  nombre         VARCHAR(255) NOT NULL,
  categoria      VARCHAR(120),
  unidad         VARCHAR(40) NOT NULL DEFAULT 'und',
  stock          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock >= 0),   -- suma de los movimientos (se actualiza en la misma transacción)
  stock_minimo   NUMERIC(12,2) CHECK (stock_minimo >= 0),              -- NULL = sin alerta de stock bajo
  ubicacion      VARCHAR(120),
  producto_id    INTEGER REFERENCES productos(id) ON DELETE SET NULL,   -- si viene del catálogo de Cotización
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_en TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_articulo_nombre ON almacen_articulos (lower(nombre));

-- Kardex: cada entrada, salida, ajuste (conteo físico) o anulación. Nunca se cambia ni se borra (lo impide un disparador).
CREATE TABLE IF NOT EXISTS almacen_movimientos (
  id               BIGSERIAL PRIMARY KEY,
  articulo_id      INTEGER NOT NULL REFERENCES almacen_articulos(id),
  tipo             VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'anulacion')),
  cantidad         NUMERIC(12,2) NOT NULL CHECK (cantidad >= 0),     -- lo que se escribió (en un ajuste, el conteo físico)
  delta            NUMERIC(12,2) NOT NULL,                           -- cuánto cambió el stock (+ o −)
  stock_despues    NUMERIC(12,2) NOT NULL,
  fecha            DATE NOT NULL,
  proyecto_id      INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
  requerimiento_id INTEGER REFERENCES requerimientos(id) ON DELETE SET NULL,
  proveedor_id     INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  documento        VARCHAR(80),                                      -- guía, factura o número interno
  costo_unitario   NUMERIC(12,2) CHECK (costo_unitario > 0),
  moneda           VARCHAR(3) CHECK (moneda IN ('PEN', 'USD')),
  nota             VARCHAR(500),
  anula_id         BIGINT UNIQUE REFERENCES almacen_movimientos(id),
  creado_por       VARCHAR(120),
  creado_en        TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE INDEX IF NOT EXISTS idx_almov_articulo ON almacen_movimientos (articulo_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_almov_requerimiento ON almacen_movimientos (requerimiento_id) WHERE requerimiento_id IS NOT NULL;

CREATE OR REPLACE FUNCTION almacen_movimientos_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos del almacén no se modifican ni se borran (se anulan con un movimiento nuevo).';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_almacen_movimientos_inmutable ON almacen_movimientos;
CREATE TRIGGER trg_almacen_movimientos_inmutable BEFORE UPDATE OR DELETE ON almacen_movimientos
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION almacen_movimientos_inmutable();  -- ON DELETE SET NULL de las llaves sí pasa

-- Activos: sistemas instalados (un cliente / sitio) y sus equipos con número de serie y garantía.
CREATE TABLE IF NOT EXISTS activos (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(160) NOT NULL,
  cliente           VARCHAR(200),
  proyecto_id       INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
  ubicacion         VARCHAR(200),
  fecha_instalacion DATE,
  vrm_url           VARCHAR(500) CHECK (vrm_url ~ '^https://vrm\.victronenergy\.com/'),
  notas             VARCHAR(1000),
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_en    TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);

CREATE TABLE IF NOT EXISTS activo_equipos (
  id             SERIAL PRIMARY KEY,
  activo_id      INTEGER NOT NULL REFERENCES activos(id) ON DELETE CASCADE,
  tipo           VARCHAR(12) NOT NULL CHECK (tipo IN ('inversor', 'bateria', 'panel', 'controlador', 'monitoreo', 'otro')),
  marca          VARCHAR(80),
  modelo         VARCHAR(160),
  serie          VARCHAR(120),
  cantidad       INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  garantia_hasta DATE,
  notas          VARCHAR(500),
  creado_en      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE INDEX IF NOT EXISTS idx_equipos_activo ON activo_equipos (activo_id);

-- Los técnicos ya manejan el almacén en Logística: aquí también registran movimientos y equipos instalados
-- (solo si nadie cambió ese permiso; antes «completo» y «lectura» hacían lo mismo en estos módulos).
UPDATE rol_permisos SET nivel = 'completo' WHERE rol = 'tecnico' AND modulo IN ('almacen', 'activos') AND nivel = 'lectura';
