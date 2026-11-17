#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

"${SCRIPT_DIR}/validate.sh"

compose up -d --build --remove-orphans
"${SCRIPT_DIR}/wait-healthy.sh"
compose ps

echo "Despliegue completado. Comprueba el portal y la administración por HTTPS."
