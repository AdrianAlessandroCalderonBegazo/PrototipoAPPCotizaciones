BEGIN;
CREATE OR REPLACE VIEW v_caja_hoja_resumen AS
WITH base AS (
  SELECT
    h.id, h.ciudad, h.fecha,
    COALESCE(SUM(f.caja_ingreso_efectivo), 0)::numeric(14,2) AS ing_efectivo,
    COALESCE(SUM(f.caja_ingreso_transf),   0)::numeric(14,2) AS ing_transf,
    COALESCE(SUM(f.caja_salida_efectivo),  0)::numeric(14,2) AS sal_efectivo,
    COALESCE(SUM(f.caja_salida_transf),    0)::numeric(14,2) AS sal_transf,
    COALESCE(SUM(f.cta_cte_ingreso),       0)::numeric(14,2) AS cta_ingreso,
    COALESCE(SUM(f.cta_cte_salida),        0)::numeric(14,2) AS cta_salida
  FROM caja_hoja h
  LEFT JOIN caja_fila f ON f.hoja_id = h.id AND f.deleted_at IS NULL
  GROUP BY h.id, h.ciudad, h.fecha
),
neto AS (
  SELECT b.*,
    (b.ing_efectivo + b.ing_transf - b.sal_efectivo - b.sal_transf) AS neto_caja,
    (b.cta_ingreso - b.cta_salida) AS neto_cta
  FROM base b
)
SELECT
  n.id, n.ciudad, n.fecha,
  n.ing_efectivo, n.ing_transf, n.sal_efectivo, n.sal_transf, n.cta_ingreso, n.cta_salida,
  (c.saldo_inicial_caja + COALESCE(SUM(n.neto_caja) OVER w, 0))::numeric(14,2)    AS saldo_anterior_caja,
  (c.saldo_inicial_cta_cte + COALESCE(SUM(n.neto_cta) OVER w, 0))::numeric(14,2)  AS saldo_anterior_cta_cte,
  (c.saldo_inicial_caja + COALESCE(SUM(n.neto_caja) OVER w, 0) + n.neto_caja)::numeric(14,2)   AS saldo_final_caja,
  (c.saldo_inicial_cta_cte + COALESCE(SUM(n.neto_cta) OVER w, 0) + n.neto_cta)::numeric(14,2)  AS saldo_final_cta_cte
FROM neto n
JOIN caja_config c ON c.ciudad = n.ciudad
WINDOW w AS (PARTITION BY n.ciudad ORDER BY n.fecha ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING);
COMMIT;
