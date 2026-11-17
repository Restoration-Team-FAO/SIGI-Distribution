#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_file
compose ps

echo
echo "Health API:"
compose exec -T sigi-api wget -qO- http://127.0.0.1:3000/api/health
echo
