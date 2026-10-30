-- ERP · Fase 8: Comparador de proveedores. Listas de precios (Excel, CSV o PDF) y páginas web de proveedores.
-- El historial de precios es «solo agregar»: un precio nunca se cambia ni se borra (lo impide un disparador).
CREATE TABLE IF NOT EXISTS proveedores (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(160) NOT NULL UNIQUE,
  ruc             VARCHAR(11),
  contacto        VARCHAR(200),
  telefono        VARCHAR(40),
  correo          VARCHAR(160),
  web             VARCHAR(300),
  moneda          VARCHAR(3) CHECK (moneda IN ('PEN', 'USD')),      -- moneda habitual de sus listas (NULL = se elige al cargar)
  costo_envio     NUMERIC(12,2),                                     -- costo adicional por pedido en S/ (NULL = Sin dato, 0 = incluido)
  notas           VARCHAR(1000),
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_en  TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);

-- Fuentes de precios de cada proveedor: archivo (se recuerda cómo se leyó) o página web (se lee sola cada cierto tiempo).
CREATE TABLE IF NOT EXISTS proveedor_fuentes (
  id               SERIAL PRIMARY KEY,
  proveedor_id     INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  tipo             VARCHAR(8) NOT NULL CHECK (tipo IN ('archivo', 'web')),
  url              VARCHAR(500),
  adaptador        VARCHAR(12) NOT NULL DEFAULT 'auto' CHECK (adaptador IN ('auto', 'woocommerce', 'shopify', 'jsonld')),
  frecuencia_dias  INTEGER NOT NULL DEFAULT 7 CHECK (frecuencia_dias BETWEEN 1 AND 90),
  activa           BOOLEAN NOT NULL DEFAULT TRUE,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,               -- archivo: mapeo de columnas, fila de títulos, IGV y moneda
  ultima_ejecucion TIMESTAMP,
  ultimo_estado    VARCHAR(10) CHECK (ultimo_estado IN ('ok', 'error', 'parcial')),
  ultimo_mensaje   VARCHAR(500),
  ultimos_leidos   INTEGER,
  creado_en        TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fuente_archivo ON proveedor_fuentes (proveedor_id) WHERE tipo = 'archivo';

-- Cada carga de una lista o lectura de una página.
CREATE TABLE IF NOT EXISTS proveedor_cargas (
  id            SERIAL PRIMARY KEY,
  proveedor_id  INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  fuente_id     INTEGER REFERENCES proveedor_fuentes(id) ON DELETE SET NULL,
  tipo          VARCHAR(8) NOT NULL CHECK (tipo IN ('archivo', 'web')),
  origen        VARCHAR(500),                   -- nombre del archivo o dirección web
  fecha_lista   DATE NOT NULL,
  filas         INTEGER NOT NULL DEFAULT 0,
  nuevos        INTEGER NOT NULL DEFAULT 0,
  cambiaron     INTEGER NOT NULL DEFAULT 0,
  sin_cambios   INTEGER NOT NULL DEFAULT 0,
  errores       INTEGER NOT NULL DEFAULT 0,
  detalle       JSONB,
  creado_por    VARCHAR(120),
  creado_en     TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);

-- Productos de cada proveedor (sin duplicados: proveedor + clave = código o, si no hay, modelo/descripción normalizados).
CREATE TABLE IF NOT EXISTS proveedor_productos (
  id               SERIAL PRIMARY KEY,
  proveedor_id     INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  clave            VARCHAR(300) NOT NULL,
  codigo           VARCHAR(80),
  descripcion      VARCHAR(500) NOT NULL,
  marca            VARCHAR(80),
  modelo           VARCHAR(160),
  categoria        VARCHAR(160),
  unidad           VARCHAR(40),
  caracteristicas  VARCHAR(1000),
  disponibilidad   VARCHAR(120),
  url              VARCHAR(500),
  firma            VARCHAR(400),                  -- tokens normalizados para reconocer el mismo producto en otro proveedor
  creado_en        TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_en   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  UNIQUE (proveedor_id, clave)
);
CREATE INDEX IF NOT EXISTS idx_pp_proveedor ON proveedor_productos (proveedor_id);

-- Historial de precios (solo agregar).
CREATE TABLE IF NOT EXISTS proveedor_precios (
  id            BIGSERIAL PRIMARY KEY,
  producto_id   INTEGER NOT NULL REFERENCES proveedor_productos(id) ON DELETE CASCADE,
  carga_id      INTEGER REFERENCES proveedor_cargas(id) ON DELETE SET NULL,
  precio        NUMERIC(14,2) NOT NULL CHECK (precio > 0),
  moneda        VARCHAR(3) NOT NULL CHECK (moneda IN ('PEN', 'USD')),
  incluye_igv   BOOLEAN NOT NULL,
  origen        VARCHAR(8) NOT NULL CHECK (origen IN ('archivo', 'web')),
  origen_detalle VARCHAR(500),                   -- «archivo.xlsx · fila 12» o la dirección de la página
  fecha_lista   DATE NOT NULL,                   -- fecha de la lista (o de la lectura web)
  tc_usado      NUMERIC(10,4),                   -- tipo de cambio de Configuración cuando se obtuvo (para pasar US$ a S/ en el historial)
  obtenido_en   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE INDEX IF NOT EXISTS idx_pprecios_producto ON proveedor_precios (producto_id, fecha_lista DESC, id DESC);

CREATE OR REPLACE FUNCTION proveedor_precios_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El historial de precios no se modifica ni se borra (solo se agregan precios nuevos).';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_proveedor_precios_inmutable ON proveedor_precios;
CREATE TRIGGER trg_proveedor_precios_inmutable BEFORE UPDATE OR DELETE ON proveedor_precios
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION proveedor_precios_inmutable();

-- Decisiones de personas sobre si dos productos (de proveedores distintos) son el mismo. Se guardan y se respetan.
CREATE TABLE IF NOT EXISTS proveedor_equivalencias (
  a_id          INTEGER NOT NULL REFERENCES proveedor_productos(id) ON DELETE CASCADE,
  b_id          INTEGER NOT NULL REFERENCES proveedor_productos(id) ON DELETE CASCADE,
  estado        VARCHAR(10) NOT NULL CHECK (estado IN ('confirmada', 'rechazada')),
  decidido_por  VARCHAR(120),
  decidido_en   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  PRIMARY KEY (a_id, b_id),
  CHECK (a_id < b_id)
);

-- Registro de cada lectura automática de una página web (la «cola» y sus errores).
CREATE TABLE IF NOT EXISTS proveedor_ejecuciones (
  id          SERIAL PRIMARY KEY,
  fuente_id   INTEGER NOT NULL REFERENCES proveedor_fuentes(id) ON DELETE CASCADE,
  inicio      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  fin         TIMESTAMP,
  estado      VARCHAR(10) NOT NULL DEFAULT 'corriendo' CHECK (estado IN ('corriendo', 'ok', 'error', 'parcial')),
  leidos      INTEGER NOT NULL DEFAULT 0,
  errores     INTEGER NOT NULL DEFAULT 0,
  mensaje     VARCHAR(1000)
);
