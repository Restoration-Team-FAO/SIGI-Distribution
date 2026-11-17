#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command docker
require_env_file

output_path="${1:-${DEMO_DIR}/caddy-local-root.crt}"
caddy_id="$(compose ps -q caddy)"

if [[ -z "${caddy_id}" ]]; then
  echo "Caddy no está en ejecución. Despliega el demo antes de exportar su CA." >&2
  exit 1
fi

docker cp \
  "${caddy_id}:/data/caddy/pki/authorities/local/root.crt" \
  "${output_path}"
chmod 644 "${output_path}"

echo "Certificado raíz local exportado en ${output_path}."
echo "Instálalo únicamente en las computadoras autorizadas para acceder al demo."
