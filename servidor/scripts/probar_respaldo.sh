#!/usr/bin/env bash
# Prueba que un respaldo SÍ se puede restaurar, sin tocar los datos reales:
#   ./scripts/probar_respaldo.sh                                   (prueba el respaldo más reciente)
#   ./scripts/probar_respaldo.sh respaldos/cotizador_2026-10-22_0230.sql.gz
# Lo restaura en una base aparte («prueba_respaldo»), cuenta las filas de las tablas principales, revisa las fotos y borra la base de prueba.
# Recomendado: una vez al mes (o después de cambios grandes).
set -uo pipefail
cd "$(dirname "$0")/.."
ARCHIVO="${1:-$(ls -t respaldos/cotizador_*.sql.gz 2>/dev/null | head -1)}"
[ -n "$ARCHIVO" ] && [ -s "$ARCHIVO" ] || { echo "No hay respaldo para probar. Corre primero ./scripts/respaldo.sh" >&2; exit 1; }
echo "Probando $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))…"
gunzip -t "$ARCHIVO" || { echo "FALLA: el archivo está dañado." >&2; exit 1; }
psql() { docker compose exec -T db psql -U icr "$@"; }
psql -d postgres -q -c "SET client_min_messages TO warning" -c "DROP DATABASE IF EXISTS prueba_respaldo WITH (FORCE)" -c "CREATE DATABASE prueba_respaldo OWNER icr" || exit 1
if ! gunzip -c "$ARCHIVO" | psql -d prueba_respaldo -v ON_ERROR_STOP=1 -q -o /dev/null; then
  echo "FALLA: el respaldo no se pudo restaurar." >&2
  psql -d postgres -q -c "DROP DATABASE IF EXISTS prueba_respaldo WITH (FORCE)"
  exit 1
fi
echo "Restaurado en una base de prueba. Filas por tabla (respaldo → base actual):"
ERR=0
for t in usuarios proyectos cuenta_movimientos cotizaciones productos requerimientos comprobantes proveedores proveedor_precios almacen_articulos almacen_movimientos activos caja_hoja caja_chica_mov audit_log; do
  r=$(psql -d prueba_respaldo -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo "-")
  a=$(psql -d cotizador -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo "-")
  printf "  %-22s %8s → %s\n" "$t" "$r" "$a"
done
n=$(psql -d prueba_respaldo -tAc "SELECT count(*) FROM usuarios WHERE activo AND rol = 'admin'")
[ "${n:-0}" -ge 1 ] || { echo "FALLA: el respaldo no tiene ningún administrador activo." >&2; ERR=1; }
psql -d postgres -q -c "DROP DATABASE IF EXISTS prueba_respaldo WITH (FORCE)"
# Fotos del mismo respaldo
F="${ARCHIVO/cotizador_/fotos_}"; F="${F%.sql.gz}.tar.gz"
FF="${ARCHIVO/cotizador_/fotos_finanzas_}"; FF="${FF%.sql.gz}.tar.gz"
for f in "$F" "$FF"; do
  if [ -s "$f" ] && tar -tzf "$f" > /dev/null 2>&1; then echo "  Fotos OK: $f ($(tar -tzf "$f" | grep -vc '/$') archivos)"
  else echo "FALLA: falta o está dañado $f" >&2; ERR=1; fi
done
[ "$ERR" -eq 0 ] && echo "RESPALDO OK: se puede restaurar." || { echo "El respaldo tiene problemas (revisa arriba)." >&2; exit 1; }
