#!/usr/bin/env bash
set -Eeuo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "${DEMO_DIR}/.." && pwd)"
ENV_FILE="${SIGI_DEMO_ENV_FILE:-${DEMO_DIR}/.env.demo}"
PROJECT_NAME="${SIGI_DEMO_PROJECT:-sigi-demo}"
BASE_COMPOSE="${REPO_DIR}/docker-compose.prod.yml"
DEMO_COMPOSE="${DEMO_DIR}/docker-compose.demo.yml"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Falta el comando requerido: $1" >&2
    exit 1
  fi
}

require_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "No existe ${ENV_FILE}. Copia demo/.env.demo.example y completa sus valores." >&2
    exit 1
  fi
}

compose() {
  SIGI_ENV_FILE="${ENV_FILE}" docker compose \
    --env-file "${ENV_FILE}" \
    --project-name "${PROJECT_NAME}" \
    --project-directory "${REPO_DIR}" \
    -f "${BASE_COMPOSE}" \
    -f "${DEMO_COMPOSE}" \
    "$@"
}

volume_name() {
  printf '%s_%s' "${PROJECT_NAME}" "$1"
}
