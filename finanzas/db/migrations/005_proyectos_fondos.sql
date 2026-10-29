-- ICR Finanzas · Migración 005 (ERP fase 2): gastos de proyecto y fondos enviados desde la cuenta principal del ERP.
--   · caja_chica_mov.tipo 'FONDO' = dinero que llega desde la cuenta principal (lo crea el ERP, origen 'ERP').
--     Regla del saldo: EGRESO resta y todo lo demás suma.
--   · proyecto_id + proyecto_nombre en los gastos de caja chica y en las filas de caja diaria (categoría «Gasto de proyecto»).
--     Sin llave foránea: la tabla proyectos es de la API principal. proyecto_nombre es el nombre del momento (como un recibo).
-- Solo ADITIVA. Reversa: 005_proyectos_fondos_down.sql.

BEGIN;

ALTER TABLE caja_chica_mov DROP CONSTRAINT IF EXISTS caja_chica_mov_tipo_check;
ALTER TABLE caja_chica_mov ADD CONSTRAINT caja_chica_mov_tipo_check CHECK (tipo IN ('EGRESO', 'TRANSFERENCIA', 'FONDO'));
ALTER TABLE caja_chica_mov DROP CONSTRAINT IF EXISTS caja_chica_mov_origen_check;
ALTER TABLE caja_chica_mov ADD CONSTRAINT caja_chica_mov_origen_check CHECK (origen IN ('MANUAL', 'CAPTURA', 'TRANSFERENCIA', 'ERP'));

ALTER TABLE caja_chica_mov ADD COLUMN IF NOT EXISTS proyecto_id     integer;
ALTER TABLE caja_chica_mov ADD COLUMN IF NOT EXISTS proyecto_nombre text;
ALTER TABLE caja_fila      ADD COLUMN IF NOT EXISTS proyecto_id     integer;
ALTER TABLE caja_fila      ADD COLUMN IF NOT EXISTS proyecto_nombre text;
CREATE INDEX IF NOT EXISTS caja_chica_proyecto_idx ON caja_chica_mov (proyecto_id) WHERE proyecto_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS caja_fila_proyecto_idx  ON caja_fila (proyecto_id) WHERE proyecto_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE VIEW v_caja_chica_saldo AS
SELECT
  c.ciudad,
  (c.saldo_inicial_caja_chica
    + COALESCE(SUM(CASE m.tipo WHEN 'EGRESO' THEN -m.monto ELSE m.monto END), 0))::numeric(14,2) AS saldo
FROM caja_config c
LEFT JOIN caja_chica_mov m ON m.ciudad = c.ciudad AND m.deleted_at IS NULL
GROUP BY c.ciudad, c.saldo_inicial_caja_chica;

COMMIT;
