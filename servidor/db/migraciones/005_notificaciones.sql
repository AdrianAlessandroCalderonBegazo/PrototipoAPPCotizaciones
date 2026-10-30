-- ERP · Fase 4: notificaciones internas. Las alertas se calculan al momento (presupuesto, caja chica, cotizaciones por
-- vencer, requerimientos urgentes…); aquí solo se guarda cuáles ya leyó cada persona.
CREATE TABLE IF NOT EXISTS notificaciones_leidas (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  clave      VARCHAR(160) NOT NULL,
  leida_en   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  PRIMARY KEY (usuario_id, clave)
);
