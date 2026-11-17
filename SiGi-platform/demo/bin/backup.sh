#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command docker
require_command sha256sum
require_env_file

backup_root="${SIGI_DEMO_BACKUP_DIR:-${DEMO_DIR}/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/${timestamp}"
mkdir -p "${backup_dir}"
backup_dir="$(cd "${backup_dir}" && pwd)"

postgres_id="$(compose ps -q postgres)"
if [[ -z "${postgres_id}" ]]; then
  echo "PostgreSQL no está en ejecución; no se puede crear un respaldo consistente." >&2
  exit 1
fi

compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "${backup_dir}/postgres.dump"

for volume in sigi_files_data geoserver_data; do
  full_volume="$(volume_name "${volume}")"
  docker volume inspect "${full_volume}" >/dev/null
  docker run --rm \
    --volume "${full_volume}:/source:ro" \
    --volume "${backup_dir}:/backup" \
    alpine:3.20 \
    tar -czf "/backup/${volume}.tar.gz" -C /source .
done

cp "${ENV_FILE}" "${backup_dir}/env.demo"
chmod 600 "${backup_dir}/env.demo"
git -C "${REPO_DIR}" rev-parse HEAD > "${backup_dir}/git-commit.txt"
compose config --images > "${backup_dir}/images.txt"

(
  cd "${backup_dir}"
  sha256sum postgres.dump sigi_files_data.tar.gz geoserver_data.tar.gz env.demo git-commit.txt images.txt > SHA256SUMS
)

echo "Respaldo creado en ${backup_dir}"
