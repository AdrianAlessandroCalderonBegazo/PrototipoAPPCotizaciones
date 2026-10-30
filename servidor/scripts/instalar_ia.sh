#!/usr/bin/env bash
# Instala la IA local (una sola vez, o para cambiar de modelo):  ./scripts/instalar_ia.sh
# Descarga el modelo de chat (qwen3:4b, ~2.5 GB) y el de búsqueda por significado (bge-m3, ~1.2 GB) dentro del contenedor «ollama».
# Para otro modelo:  ./scripts/instalar_ia.sh qwen3:8b   (y luego elígelo en ERP › Configuración › Inteligencia artificial)
set -euo pipefail
cd "$(dirname "$0")/.."
MODELO="${1:-qwen3:4b}"
EMBED="${2:-bge-m3}"
docker compose up -d ollama
echo "Descargando $MODELO (puede tardar varios minutos)…"
docker compose exec -T ollama ollama pull "$MODELO"
echo "Descargando $EMBED…"
docker compose exec -T ollama ollama pull "$EMBED"
docker compose exec -T ollama ollama list
echo "Listo. Reinicia la API para que indexe el catálogo:  docker compose restart api"
