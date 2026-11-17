#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command node
require_command npm
require_env_file

"${SCRIPT_DIR}/wait-healthy.sh"

mkdir -p "${DEMO_DIR}/artifacts"
artifact="${DEMO_DIR}/artifacts/release-gate-$(date -u +%Y%m%dT%H%M%SZ).json"
api_address="$(compose port sigi-api 3000)"
api_port="${api_address##*:}"

cd "${REPO_DIR}"
SIGI_SMOKE_API_URL="http://127.0.0.1:${api_port}/api" npm run release:gate | tee "${artifact}"

echo "Evidencia guardada en ${artifact}"
