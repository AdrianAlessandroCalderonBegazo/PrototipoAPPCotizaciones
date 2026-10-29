#!/usr/bin/env bash
# Publica una versión nueva del ERP (erp.TUDOMINIO):  ./scripts/actualizar_erp.sh /root/erp-web.zip
# (el zip sale del flujo "Build ERP" de GitHub Actions; ver DESPLIEGUE.md)
set -euo pipefail
cd "$(dirname "$0")/.."
exec ./scripts/actualizar_web.sh "${1:?Indica el .zip del ERP}" erp-web
