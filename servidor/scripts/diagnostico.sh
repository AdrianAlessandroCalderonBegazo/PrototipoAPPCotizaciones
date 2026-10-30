#!/usr/bin/env bash
# Diagnóstico rápido cuando una dirección no abre (por ejemplo «ERR_SSL_PROTOCOL_ERROR» o «la conexión no es segura»):
#   ./scripts/diagnostico.sh            (revisa erp, cotizador, finanzas, finanza, app y api)
# Revisa: a qué IP apunta cada subdominio (IPv4 e IPv6), si Caddy está encendido, si ya tiene certificado y sus últimos errores.
# No cambia nada.
set -uo pipefail
cd "$(dirname "$0")/.."
DOMINIO="$(grep -E '^DOMINIO=' .env 2>/dev/null | cut -d= -f2- | tr -d '"[:space:]')"
[ -n "$DOMINIO" ] || { echo "Falta DOMINIO en .env (debe ser, por ejemplo, icrenergy.tech, sin https:// ni www)." >&2; exit 1; }
IP="$(curl -s4 -m 8 https://ifconfig.me || true)"
echo "Dominio en .env: $DOMINIO · IP pública de este VPS: ${IP:-no se pudo saber}"
echo
echo "== Caddy =="
docker compose ps caddy
echo
echo "== Subdominios =="
for h in erp cotizador finanzas finanza app api; do
  n="$h.$DOMINIO"
  a="$(getent ahostsv4 "$n" | awk 'NR==1{print $1}')"
  aaaa="$(command -v dig >/dev/null && dig +short AAAA "$n" | tail -1)"
  local_tls="$(curl -sk -o /dev/null -m 8 -w '%{http_code}' --resolve "$n:443:127.0.0.1" "https://$n/" 2>/dev/null || true)"
  cert="$(echo | timeout 8 openssl s_client -connect 127.0.0.1:443 -servername "$n" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null | tr '\n' ' ')"
  estado="OK"
  if [ -z "$a" ]; then estado="FALTA el registro A «$h» en el DNS"
  elif [ -n "$IP" ] && [ "$a" != "$IP" ]; then estado="el registro A apunta a $a y NO a este VPS ($IP)"
  elif [ -z "$cert" ]; then estado="Caddy todavía NO tiene certificado (mira los errores de abajo)"
  fi
  [ -n "$aaaa" ] && estado="$estado · OJO: tiene registro AAAA (IPv6) $aaaa: bórralo en el DNS si no es de este VPS"
  printf "%-28s A=%-16s local=%-4s %s\n" "$n" "${a:--}" "${local_tls:--}" "$estado"
  [ -n "$cert" ] && printf "%-28s certificado: %s\n" "" "$cert"
done
echo
echo "== Últimos errores de Caddy (1 hora) =="
docker compose logs caddy --since 1h 2>&1 | grep -E '"level":"(error|warn)"' | grep -v 'creating new account' | tail -15 || true
echo
echo "Si un subdominio dice «NO apunta a este VPS» o «FALTA»: corrige el registro A en Hostinger (DNS) con la IP de este VPS, espera unos minutos"
echo "y corre: docker compose restart caddy. Caddy pide el certificado solo (puede tardar 1–2 minutos)."
