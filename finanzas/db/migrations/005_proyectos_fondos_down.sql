-- Reversa de 005_proyectos_fondos.sql (solo si no hay movimientos FONDO/ERP; si los hay, primero hay que borrarlos).
BEGIN;
CREATE OR REPLACE VIEW v_caja_chica_saldo AS
SELECT
  c.ciudad,
  (c.saldo_inicial_caja_chica
    + COALESCE(SUM(CASE m.tipo WHEN 'TRANSFERENCIA' THEN m.monto ELSE -m.monto END), 0))::numeric(14,2) AS saldo
FROM caja_config c
LEFT JOIN caja_chica_mov m ON m.ciudad = c.ciudad AND m.deleted_at IS NULL
GROUP BY c.ciudad, c.saldo_inicial_caja_chica;
DROP INDEX IF EXISTS caja_chica_proyecto_idx;
DROP INDEX IF EXISTS caja_fila_proyecto_idx;
ALTER TABLE caja_chica_mov DROP COLUMN IF EXISTS proyecto_id;
ALTER TABLE caja_chica_mov DROP COLUMN IF EXISTS proyecto_nombre;
ALTER TABLE caja_fila DROP COLUMN IF EXISTS proyecto_id;
ALTER TABLE caja_fila DROP COLUMN IF EXISTS proyecto_nombre;
ALTER TABLE caja_chica_mov DROP CONSTRAINT IF EXISTS caja_chica_mov_tipo_check;
ALTER TABLE caja_chica_mov ADD CONSTRAINT caja_chica_mov_tipo_check CHECK (tipo IN ('EGRESO', 'TRANSFERENCIA'));
ALTER TABLE caja_chica_mov DROP CONSTRAINT IF EXISTS caja_chica_mov_origen_check;
ALTER TABLE caja_chica_mov ADD CONSTRAINT caja_chica_mov_origen_check CHECK (origen IN ('MANUAL', 'CAPTURA', 'TRANSFERENCIA'));
COMMIT;
