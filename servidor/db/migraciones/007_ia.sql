-- ERP · Fase 6: Inteligencia artificial (Ollama en el VPS). La IA solo LEE datos: lo que propone (por ejemplo una cotización)
-- lo revisa y guarda una persona. Aquí se guardan las conversaciones, los mensajes y el índice de búsqueda por significado.

-- Conversaciones: las del Cotizador IA son compartidas (las ve todo el que tiene permiso); las del Asistente son de quien pregunta.
CREATE TABLE IF NOT EXISTS ia_conversaciones (
  id             SERIAL PRIMARY KEY,
  modulo         VARCHAR(10) NOT NULL CHECK (modulo IN ('cotizador', 'asistente')),
  titulo         VARCHAR(160) NOT NULL,
  autor_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  autor_nombre   VARCHAR(120),
  creado_en      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  actualizado_en TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  eliminado_en   TIMESTAMP,                 -- borrado lógico (queda en la auditoría)
  eliminado_por  VARCHAR(120)
);
CREATE INDEX IF NOT EXISTS idx_ia_conv ON ia_conversaciones (modulo, actualizado_en DESC) WHERE eliminado_en IS NULL;

CREATE TABLE IF NOT EXISTS ia_mensajes (
  id              SERIAL PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES ia_conversaciones(id) ON DELETE CASCADE,
  rol             VARCHAR(8) NOT NULL CHECK (rol IN ('usuario', 'ia', 'error')),
  texto           TEXT NOT NULL DEFAULT '',
  datos           JSONB,                    -- tarjeta de cotización, tablas, gráficos y fuentes (los arma el servidor, no el modelo)
  por_voz         BOOLEAN NOT NULL DEFAULT FALSE,
  autor_nombre    VARCHAR(120),
  modelo          VARCHAR(80),
  duracion_ms     INTEGER,
  creado_en       TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')
);
CREATE INDEX IF NOT EXISTS idx_ia_mensajes ON ia_mensajes (conversacion_id, id);

-- Índice semántico (embeddings) de productos y kits. «huella» detecta si el texto cambió y hay que recalcular.
CREATE TABLE IF NOT EXISTS ia_embeddings (
  tipo           VARCHAR(10) NOT NULL,
  ref_id         INTEGER NOT NULL,
  modelo         VARCHAR(80) NOT NULL,
  huella         VARCHAR(64) NOT NULL,
  vector         REAL[] NOT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  PRIMARY KEY (tipo, ref_id, modelo)
);
