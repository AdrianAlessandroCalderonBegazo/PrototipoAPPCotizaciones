#!/usr/bin/env bash
# Respaldo diario de la base de datos y de las fotos subidas.
# Se programa con cron (ver DESPLIEGUE.md):   30 2 * * *  /opt/icr/scripts/respaldo.sh
# Guarda 14 días en /opt/icr/respaldos y, si hay rclone configurado, los copia a otro proveedor.
set -euo pipefail
cd "$(dirname "$0")/.."
DESTINO="${DESTINO:-$PWD/respaldos}"
DIAS="${DIAS:-14}"
mkdir -p "$DESTINO"
FECHA="$(date +%F_%H%M)"

docker compose exec -T db pg_dump -U icr -d cotizador --no-owner | gzip > "$DESTINO/cotizador_$FECHA.sql.gz"
docker compose exec -T api tar -czf - -C /app uploads > "$DESTINO/fotos_$FECHA.tar.gz" 2>/dev/null || true

# Que el archivo no esté vacío (si falló, pg_dump deja 20 bytes)
if [ "$(stat -c %s "$DESTINO/cotizador_$FECHA.sql.gz")" -lt 1000 ]; then
  echo "ERROR: el respaldo de la base salió vacío" >&2
  exit 1
fi

find "$DESTINO" -name 'cotizador_*.sql.gz' -mtime +"$DIAS" -delete
find "$DESTINO" -name 'fotos_*.tar.gz' -mtime +"$DIAS" -delete

# Copia fuera del servidor (recomendado): configura una vez "rclone config" y define RCLONE_DESTINO,
# por ejemplo RCLONE_DESTINO=backblaze:icr-respaldos
if [ -n "${RCLONE_DESTINO:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$DESTINO" "$RCLONE_DESTINO" --max-age "${DIAS}d"
fi
echo "Respaldo listo: $DESTINO/cotizador_$FECHA.sql.gz"
