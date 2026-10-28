#!/usr/bin/env bash
# Publica una versión nueva de la app de Finanzas 2:  ./scripts/actualizar_finanzas2.sh /root/finanzas2_web.zip
set -euo pipefail
cd "$(dirname "$0")/.."
exec ./scripts/actualizar_web.sh "${1:?Indica el .zip de la app de finanzas 2}" finanzas2-web
