#!/usr/bin/env bash
# Restaura un respaldo de la base:
#   ./scripts/restaurar.sh respaldos/cotizador_2026-10-22_0230.sql.gz    (base principal: ERP, Logística y Finanzas 1)
#   ./scripts/restaurar.sh respaldos/finanzas2_2026-10-22_0230.sql.gz    (base de Finanzas 2)
# CUIDADO: reemplaza todo lo que haya en esa base. Antes de restaurar se guarda un respaldo de lo actual (por si acaso).
# Para probar un respaldo SIN tocar nada, usa ./scripts/probar_respaldo.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ARCHIVO="${1:?Indica el archivo de respaldo (.sql.gz)}"
[ -s "$ARCHIVO" ] || { echo "No existe o está vacío: $ARCHIVO" >&2; exit 1; }
case "$(basename "$ARCHIVO")" in
  finanzas2_*) BASE=finanzas2; SERVICIOS="finanzas2-api" ;;
  *)           BASE=cotizador; SERVICIOS="api finanzas-api finanzas2-api" ;;
esac
gunzip -t "$ARCHIVO" || { echo "El archivo está dañado (no se puede descomprimir)." >&2; exit 1; }
read -r -p "Esto BORRA los datos actuales de la base «$BASE» y los reemplaza por $ARCHIVO. ¿Seguro? (escribe SI) " r
[ "$r" = "SI" ] || { echo "Cancelado."; exit 1; }
mkdir -p respaldos
ANTES="respaldos/antes_de_restaurar_${BASE}_$(date +%F_%H%M).sql.gz"
docker compose exec -T db pg_dump -U icr -d "$BASE" --no-owner | gzip > "$ANTES" && echo "Copia de lo actual guardada en $ANTES"
# Se detienen las APIs que usan esa base para que nadie escriba durante la restauración.
docker compose stop $SERVICIOS
docker compose exec -T db psql -U icr -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $BASE WITH (FORCE)" -c "CREATE DATABASE $BASE OWNER icr"
if ! gunzip -c "$ARCHIVO" | docker compose exec -T db psql -U icr -d "$BASE" -v ON_ERROR_STOP=1 -q -o /dev/null; then
  echo "ERROR al restaurar. Lo de antes está en $ANTES (restáuralo con este mismo script)." >&2
  docker compose start $SERVICIOS
  exit 1
fi
docker compose start $SERVICIOS
echo "Restaurado: $BASE ← $ARCHIVO"
