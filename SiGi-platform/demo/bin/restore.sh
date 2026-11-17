#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [[ $# -ne 2 || "$2" != "RESTAURAR-SIGI-DEMO" ]]; then
  echo "Uso: $0 RUTA_RESPALDO RESTAURAR-SIGI-DEMO" >&2
  echo "Esta operación reemplaza la base de datos, archivos y configuración GeoServer actuales." >&2
  exit 1
fi

require_command docker
require_command sha256sum
require_env_file

backup_dir="$(realpath "$1")"
for file in postgres.dump sigi_files_data.tar.gz geoserver_data.tar.gz SHA256SUMS; do
  if [[ ! -f "${backup_dir}/${file}" ]]; then
    echo "Falta ${backup_dir}/${file}" >&2
    exit 1
  fi
done

(cd "${backup_dir}" && sha256sum --check SHA256SUMS)

compose stop
compose up -d postgres

deadline=$((SECONDS + 120))
until [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(compose ps -q postgres)")" == "healthy" ]]; do
  if (( SECONDS >= deadline )); then
    echo "PostgreSQL no quedó saludable a tiempo." >&2
    exit 1
  fi
  sleep 3
done

db_name="$(compose exec -T postgres printenv POSTGRES_DB | tr -d '\r')"
db_user="$(compose exec -T postgres printenv POSTGRES_USER | tr -d '\r')"
if [[ ! "${db_name}" =~ ^[A-Za-z0-9_]+$ || ! "${db_user}" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Nombre de base o usuario no seguro para restauración." >&2
  exit 1
fi

compose exec -T postgres psql -U "${db_user}" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db_name}' AND pid <> pg_backend_pid();"
compose exec -T postgres dropdb -U "${db_user}" --if-exists "${db_name}"
compose exec -T postgres createdb -U "${db_user}" -O "${db_user}" "${db_name}"
compose exec -T postgres pg_restore -U "${db_user}" -d "${db_name}" --no-owner --no-privileges \
  < "${backup_dir}/postgres.dump"

for volume in sigi_files_data geoserver_data; do
  full_volume="$(volume_name "${volume}")"
  docker volume inspect "${full_volume}" >/dev/null
  docker run --rm \
    --volume "${full_volume}:/target" \
    --volume "${backup_dir}:/backup:ro" \
    alpine:3.20 \
    sh -c "find /target -mindepth 1 -delete && tar -xzf /backup/${volume}.tar.gz -C /target"
done

compose up -d
"${SCRIPT_DIR}/wait-healthy.sh"
echo "Restauración completada desde ${backup_dir}."
