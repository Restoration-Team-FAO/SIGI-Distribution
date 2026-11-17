#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${SIGI_ENV_FILE:-/etc/sigi/sigi-demo.env}"
COMPOSE_FILE="${SIGI_COMPOSE_FILE:-docker-compose.prod.yml}"
PROJECT_NAME="${SIGI_COMPOSE_PROJECT_NAME:-sigi-demo}"
BACKUP_DIR="${SIGI_BACKUP_DIR:-/var/backups/sigi}"
ROLLBACK_DIR="${SIGI_ROLLBACK_DIR:-/var/lib/sigi/rollbacks}"
HEALTH_TIMEOUT_SECONDS="${SIGI_DEPLOY_HEALTH_TIMEOUT_SECONDS:-600}"
PULL_SOURCE=true
CREATE_BACKUP=true
ROLLBACK_FILE=""

for argument in "$@"; do
  case "$argument" in
    --no-source-pull) PULL_SOURCE=false ;;
    --no-backup) CREATE_BACKUP=false ;;
    -h|--help)
      cat <<'EOF'
Usage: ./deploy-demo.sh [--no-source-pull] [--no-backup]

Environment:
  SIGI_ENV_FILE                         Secret environment file outside the repo
  SIGI_COMPOSE_PROJECT_NAME             Compose project name (default: sigi-demo)
  SIGI_BACKUP_DIR                       Backup destination (default: /var/backups/sigi)
  SIGI_ROLLBACK_DIR                     Image rollback metadata directory
  SIGI_DEPLOY_HEALTH_TIMEOUT_SECONDS    Health wait timeout (default: 600)
  SIGI_SKIP_EXTERNAL_CHECK=true         Skip the final public HTTPS request
EOF
      exit 0
      ;;
    *) echo "Unknown argument: $argument" >&2; exit 2 ;;
  esac
done

export SIGI_ENV_FILE="$ENV_FILE"
export SIGI_COMPOSE_FILE="$COMPOSE_FILE"
export SIGI_COMPOSE_PROJECT_NAME="$PROJECT_NAME"
export SIGI_BACKUP_DIR="$BACKUP_DIR"

COMPOSE=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

log() { printf '[sigi-deploy] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; return 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

container_is_running() {
  local container_id
  container_id="$("${COMPOSE[@]}" ps -q "$1" 2>/dev/null || true)"
  [[ -n "$container_id" ]] && [[ "$(docker inspect --format '{{.State.Running}}' "$container_id" 2>/dev/null)" == "true" ]]
}

wait_for_health() {
  local service="$1" deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS)) container_id status
  while (( SECONDS < deadline )); do
    container_id="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
      if [[ "$status" == "healthy" ]]; then
        log "$service is healthy"
        return 0
      fi
      if [[ "$status" == "unhealthy" || "$status" == "dead" || "$status" == "exited" ]]; then
        docker logs --tail 80 "$container_id" >&2 || true
        fail "$service entered state: $status"
        return 1
      fi
    fi
    sleep 3
  done
  fail "Timed out waiting for $service health"
}

snapshot_images() {
  local timestamp safe_project service container_id image_id rollback_image count=0
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  safe_project="$(printf '%s' "$PROJECT_NAME" | tr '[:upper:]_' '[:lower:]-' | tr -cd 'a-z0-9.-')"
  mkdir -p "$ROLLBACK_DIR"
  chmod 700 "$ROLLBACK_DIR"
  ROLLBACK_FILE="$ROLLBACK_DIR/compose-rollback-$timestamp.yml"
  printf 'services:\n' > "$ROLLBACK_FILE"

  for service in postgres database-roles-init sigi-api frontend-sigi integration-service gis-service geoserver geoserver-init caddy; do
    container_id="$("${COMPOSE[@]}" ps --all -q "$service" 2>/dev/null || true)"
    [[ -n "$container_id" ]] || continue
    image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
    rollback_image="sigi-rollback/${safe_project}-${service}:$timestamp"
    docker image tag "$image_id" "$rollback_image"
    printf '  %s:\n    image: %s\n' "$service" "$rollback_image" >> "$ROLLBACK_FILE"
    count=$((count + 1))
  done

  if (( count == 0 )); then
    rm -f "$ROLLBACK_FILE"
    ROLLBACK_FILE=""
    log "No previous application images found; this is an initial deployment"
  else
    chmod 600 "$ROLLBACK_FILE"
    git rev-parse HEAD > "$ROLLBACK_FILE.commit"
    chmod 600 "$ROLLBACK_FILE.commit"
    log "Rollback snapshot created: $ROLLBACK_FILE"
  fi
}

rollback_images() {
  local original_status="$1"
  trap - ERR
  set +e
  if [[ -n "$ROLLBACK_FILE" && -f "$ROLLBACK_FILE" ]]; then
    log "Deployment failed; restoring the previous application images"
    "${COMPOSE[@]}" -f "$ROLLBACK_FILE" up -d --no-build --remove-orphans
    log "Application rollback requested. Database migrations are not reversed automatically."
    log "Use the pre-deployment backup with scripts/ops/restore-platform.mjs if a database restore is required."
  else
    log "Deployment failed and no previous image snapshot was available"
  fi
  exit "$original_status"
}

resolve_public_domain() {
  "${COMPOSE[@]}" config --format json | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      const compose = JSON.parse(input);
      process.stdout.write(compose.services.caddy.environment.SIGI_ADMIN_DOMAIN || "");
    });
  '
}

for command in docker git node curl tar; do require_command "$command"; done
docker compose version >/dev/null
[[ -r "$ENV_FILE" ]] || fail "Environment file is not readable: $ENV_FILE"
[[ -f "$COMPOSE_FILE" ]] || fail "Compose file not found: $COMPOSE_FILE"
[[ -z "$(git status --porcelain)" ]] || fail "The deployment checkout has uncommitted changes"

trap 'rollback_images $?' ERR

if $CREATE_BACKUP && container_is_running postgres; then
  log "Creating pre-deployment backup"
  node scripts/ops/backup-platform.mjs
fi

snapshot_images

if $PULL_SOURCE; then
  log "Updating the current Git branch with a fast-forward pull"
  git pull --ff-only
fi

log "Validating production environment and Compose topology"
node scripts/verify-env.mjs --mode=production --file="$ENV_FILE"
"${COMPOSE[@]}" config --quiet
node scripts/verify-production-operations.mjs

log "Pulling pinned external images"
"${COMPOSE[@]}" pull --ignore-buildable

log "Building SIGI application images"
"${COMPOSE[@]}" build --pull

log "Starting PostgreSQL/PostGIS"
"${COMPOSE[@]}" up -d postgres
wait_for_health postgres

log "Applying database runtime roles"
"${COMPOSE[@]}" up --no-deps --force-recreate \
  --abort-on-container-exit --exit-code-from database-roles-init \
  database-roles-init

log "Executing idempotent database migrations"
node scripts/ops/migrate-postgres.mjs

log "Starting application and GIS services"
"${COMPOSE[@]}" up -d --remove-orphans sigi-api frontend-sigi integration-service gis-service geoserver
for service in sigi-api integration-service gis-service geoserver frontend-sigi; do
  wait_for_health "$service"
done

log "Applying idempotent GeoServer bootstrap"
"${COMPOSE[@]}" up --no-deps --force-recreate \
  --abort-on-container-exit --exit-code-from geoserver-init \
  geoserver-init

log "Starting the HTTPS reverse proxy"
"${COMPOSE[@]}" up -d --remove-orphans caddy
wait_for_health caddy

if [[ "${SIGI_SKIP_EXTERNAL_CHECK:-false}" != "true" ]]; then
  public_domain="$(resolve_public_domain)"
  [[ "$public_domain" =~ ^[A-Za-z0-9.-]+$ ]] || fail "Invalid SIGI_ADMIN_DOMAIN in the environment file"
  log "Verifying public HTTPS endpoints at https://$public_domain"
  curl --fail --silent --show-error --retry 5 --retry-all-errors --max-time 20 "https://$public_domain/" >/dev/null
  curl --fail --silent --show-error --retry 5 --retry-all-errors --max-time 20 "https://$public_domain/api/health" >/dev/null
fi

trap - ERR
log "Deployment completed successfully"
"${COMPOSE[@]}" ps
