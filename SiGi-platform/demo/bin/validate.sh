#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command docker
require_command node
require_command npm
require_env_file

docker info >/dev/null
docker compose version >/dev/null

if grep -Eq '<[^>]+>|example\.org|change-me|dev-token|sigi-dev-' "${ENV_FILE}"; then
  echo "El archivo ${ENV_FILE} aún contiene dominios, secretos o tokens de ejemplo." >&2
  exit 1
fi

node "${REPO_DIR}/scripts/verify-env.mjs" --mode=production --file="${ENV_FILE}"
compose config --quiet

echo "Configuración del demo válida para el proyecto ${PROJECT_NAME}."
