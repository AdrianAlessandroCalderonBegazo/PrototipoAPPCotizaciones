#!/usr/bin/env bash
# Publica una versión nueva de la app web:  ./scripts/actualizar_web.sh ~/cotizador-web.zip
# (el zip sale del flujo "Build web" de GitHub Actions; ver DESPLIEGUE.md)
set -euo pipefail
cd "$(dirname "$0")/.."
ZIP="${1:?Indica el .zip de la app web}"
TMP="$(mktemp -d)"
unzip -q "$ZIP" -d "$TMP"
# El zip puede traer los archivos directo o dentro de una carpeta "web"
[ -f "$TMP/index.html" ] || TMP="$TMP/web"
[ -f "$TMP/index.html" ] || { echo "El zip no parece ser la app web (no tiene index.html)." >&2; exit 1; }
mkdir -p web
rm -rf web.nueva && mv "$TMP" web.nueva
rm -rf web.anterior; [ -d web ] && mv web web.anterior
mv web.nueva web
echo "App web actualizada. La versión anterior quedó en web.anterior por si hay que volver."
