-- Deshace 002_fin.sql. BORRA todos los datos de ICR Finanzas 2 (cuentas, personas, movimientos, cuadres).
-- No toca las tablas caja_* de ICR Finanzas 1. Haz un respaldo antes. Las fotos (archivos) hay que borrarlas aparte.
BEGIN;
DROP VIEW  IF EXISTS v_fin_saldo;
DROP TABLE IF EXISTS fin_cuadre;
DROP TABLE IF EXISTS fin_adjunto;
DROP TABLE IF EXISTS fin_mov_para;
DROP TABLE IF EXISTS fin_mov;
DROP TABLE IF EXISTS fin_persona;
DROP TABLE IF EXISTS fin_cuenta;
COMMIT;
