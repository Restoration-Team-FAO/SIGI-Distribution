#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [[ $# -ne 3 ]]; then
  echo "Uso: $0 DOMINIO_PORTAL DOMINIO_ADMIN CORREO_ACME" >&2
  echo "Ejemplo: $0 demo.sigi.org admin.demo.sigi.org infra@sigi.org" >&2
  exit 1
fi

require_command awk
require_command openssl

portal_domain="$1"
admin_domain="$2"
acme_email="$3"
template="${DEMO_DIR}/.env.demo.example"

if [[ ! "${portal_domain}" =~ ^[A-Za-z0-9.-]+$ || ! "${admin_domain}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Los dominios deben proporcionarse sin http://, https://, rutas ni puertos." >&2
  exit 1
fi
if [[ "${portal_domain}" == "${admin_domain}" ]]; then
  echo "El portal y la administración deben usar dominios distintos." >&2
  exit 1
fi
if [[ ! "${acme_email}" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]; then
  echo "El correo ACME no tiene un formato válido." >&2
  exit 1
fi
if [[ -e "${ENV_FILE}" ]]; then
  echo "${ENV_FILE} ya existe; no se sobrescribirá." >&2
  exit 1
fi

db_password="$(openssl rand -hex 32)"
geoserver_password="$(openssl rand -hex 32)"
integration_token="$(openssl rand -hex 32)"
secrets_key="$(openssl rand -hex 32)"
internal_token="$(openssl rand -hex 32)"
reset_passphrase="$(openssl rand -hex 32)"

umask 077
awk \
  -v portal_domain="${portal_domain}" \
  -v admin_domain="${admin_domain}" \
  -v acme_email="${acme_email}" \
  -v db_password="${db_password}" \
  -v geoserver_password="${geoserver_password}" \
  -v integration_token="${integration_token}" \
  -v secrets_key="${secrets_key}" \
  -v internal_token="${internal_token}" \
  -v reset_passphrase="${reset_passphrase}" \
  'BEGIN { FS=OFS="=" }
   $1 == "DEMO_PORTAL_DOMAIN" { $2=portal_domain }
   $1 == "DEMO_ADMIN_DOMAIN" { $2=admin_domain }
   $1 == "DEMO_ACME_EMAIL" { $2=acme_email }
   $1 == "POSTGRES_PASSWORD" { $2=db_password }
   $1 == "DATABASE_URL" { $2="postgresql://sigi_user:" db_password "@postgres:5432/sigi_db" }
   $1 == "GEOSERVER_ADMIN_PASSWORD" { $2=geoserver_password }
   $1 == "SIGI_INTEGRATION_TOKEN" { $2=integration_token }
   $1 == "SIGI_IMPORT_ADMIN_TOKEN" { $2=integration_token }
   $1 == "SIGI_SECRETS_KEY" { $2=secrets_key }
   $1 == "SIGI_INTERNAL_SERVICE_TOKEN" { $2=internal_token }
   $1 == "SIGI_DB_RESET_PASSPHRASE" { $2=reset_passphrase }
   { print }' "${template}" > "${ENV_FILE}"

chmod 600 "${ENV_FILE}"
echo "Configuración creada en ${ENV_FILE}. Revísala antes de desplegar."
