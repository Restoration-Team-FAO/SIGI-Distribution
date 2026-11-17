#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_file

services=(postgres sigi-api frontend-country frontend-admin integration-service gis-service geoserver caddy)
deadline=$((SECONDS + 360))

while (( SECONDS < deadline )); do
  pending=()
  failed=()

  for service in "${services[@]}"; do
    container_id="$(compose ps --all -q "${service}")"
    if [[ -z "${container_id}" ]]; then
      pending+=("${service}:missing")
      continue
    fi

    state="$(docker inspect --format '{{.State.Status}}' "${container_id}")"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_id}")"

    if [[ "${state}" == "exited" || "${state}" == "dead" ]]; then
      failed+=("${service}:${state}")
    elif [[ "${health}" == "unhealthy" ]]; then
      failed+=("${service}:unhealthy")
    elif [[ "${state}" != "running" || ("${health}" != "healthy" && "${health}" != "none") ]]; then
      pending+=("${service}:${state}/${health}")
    fi
  done

  init_id="$(compose ps --all -q geoserver-init)"
  if [[ -z "${init_id}" ]]; then
    pending+=("geoserver-init:missing")
  else
    init_state="$(docker inspect --format '{{.State.Status}}' "${init_id}")"
    init_exit_code="$(docker inspect --format '{{.State.ExitCode}}' "${init_id}")"
    if [[ "${init_state}" == "exited" && "${init_exit_code}" == "0" ]]; then
      :
    elif [[ "${init_state}" == "exited" || "${init_state}" == "dead" ]]; then
      failed+=("geoserver-init:${init_state}/exit-${init_exit_code}")
    else
      pending+=("geoserver-init:${init_state}")
    fi
  fi

  if (( ${#failed[@]} > 0 )); then
    echo "Falló el arranque: ${failed[*]}" >&2
    compose ps >&2
    compose logs --tail=100 >&2
    exit 1
  fi

  if (( ${#pending[@]} == 0 )); then
    compose exec -T sigi-api wget -qO- http://127.0.0.1:3000/api/health >/dev/null
    echo "Todos los servicios requeridos están listos."
    exit 0
  fi

  echo "Esperando servicios: ${pending[*]}"
  sleep 5
done

echo "Tiempo agotado esperando que el stack esté saludable." >&2
compose ps >&2
compose logs --tail=100 >&2
exit 1
