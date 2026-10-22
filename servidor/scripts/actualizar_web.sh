#!/usr/bin/env bash
# Publica una versión nueva de la app web:  ./scripts/actualizar_web.sh /root/app_web_icr.zip
# (el zip sale del flujo "Build web" de GitHub Actions; ver DESPLIEGUE.md)
#
# Importante: la carpeta "web" está montada dentro del contenedor de Caddy, así que NO se
# reemplaza la carpeta: se cambia su contenido (si no, Caddy seguiría viendo la carpeta vieja).
set -euo pipefail
cd "$(dirname "$0")/.."
ZIP="${1:?Indica el .zip de la app web}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP"
ORIGEN="$TMP"
# El zip puede traer los archivos directo o dentro de una carpeta
if [ ! -f "$ORIGEN/index.html" ]; then
  ORIGEN="$(find "$TMP" -maxdepth 2 -name index.html -printf '%h\n' | head -n1)"
fi
[ -n "$ORIGEN" ] && [ -f "$ORIGEN/index.html" ] || { echo "El zip no parece ser la app web (no tiene index.html)." >&2; exit 1; }

mkdir -p web
# Copia de la versión anterior por si hay que volver atrás
if [ -n "$(ls -A web 2>/dev/null)" ]; then
  rm -rf web.anterior && mkdir web.anterior && cp -a web/. web.anterior/
fi
find web -mindepth 1 -delete
cp -a "$ORIGEN"/. web/
echo "App web actualizada ($(find web -type f | wc -l) archivos). La versión anterior quedó en web.anterior."
