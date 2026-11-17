#!/usr/bin/env bash
# Instalación / actualización del SIGI (línea v2) en un servidor Ubuntu propio (22.04 / 24.04, x86_64).
#
# Script autocontenido: se copia al servidor y se ejecuta como root. Hace todo el ciclo:
#   1. Prepara el host: Docker Engine + Compose v2, Node.js 20, ufw, swap, usuario "sigi".
#   2. Conecta el servidor con GitHub (GitHub CLI por HTTPS con código de dispositivo, o deploy key).
#   3. Descarga (git clone/fetch) el TAG de versión indicado del repositorio privado.
#   4. Genera /etc/sigi/sigi.env con secretos aleatorios (solo la primera vez; nunca salen del servidor).
#   5. Ejecuta el procedimiento oficial deploy-demo.sh (build de imágenes, migraciones, healthchecks,
#      GeoServer, Caddy con TLS de Let's Encrypt y rollback automático de imágenes si algo falla).
#   6. Instala el respaldo diario (systemd timer, rotación de 7 copias en /var/backups/sigi).
#
# Uso (primera instalación):
#   sudo SIGI_DOMAIN=sigi.institucion.org SIGI_ACME_EMAIL=ops@institucion.org \
#        bash install-sigi-ubuntu.sh v2.1.3
#
# Uso (actualizar a otra versión; los secretos y datos se conservan, se hace backup previo):
#   sudo bash install-sigi-ubuntu.sh v2.1.4
#
# Variables opcionales:
#   SIGI_WWW_DOMAIN   alias que redirige al dominio principal (por defecto www.<SIGI_DOMAIN>)
#   SIGI_GIT_AUTH     "gh" (por defecto; inicio de sesión de GitHub CLI) o "deploykey" (llave SSH de solo lectura)
#   SIGI_REPO_URL     URL del repo (por defecto https://github.com/Restoration-Team-FAO/SIGI-Distribution.git)
#   SIGI_SSH_PORT443  solo deploykey: "true" para conectar por ssh.github.com:443 (redes que bloquean el 22)
#   SIGI_SKIP_UFW     "true" para no tocar el firewall local (si lo gestiona la institución)
#   SIGI_TLS_MODE     "letsencrypt" (por defecto; el dominio debe resolver a una IP pública con 80/443
#                     redirigidos a este servidor) o "internal" (solo red interna: Caddy emite su propio
#                     certificado; los navegadores mostrarán advertencia salvo que se instale su CA raíz).
#                     Solo se aplica en la primera instalación; luego se cambia SIGI_CADDYFILE en el env.
#   SIGI_MEMORY_PROFILE "16g" (por defecto, límites estándar) o "8g" (servidor de pruebas con 8 GB:
#                     reduce los límites de PostgreSQL, APIs y GeoServer; el heap de GeoServer se mantiene
#                     en -Xms1g -Xmx3g porque lo exige el validador oficial). Solo en la primera instalación.
set -Eeuo pipefail

TAG="${1:-}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Uso: sudo bash $0 vX.Y.Z   (p. ej. v2.1.3)" >&2; exit 2; }
[[ "${EUID}" -eq 0 ]] || { echo "Ejecutar como root (sudo)." >&2; exit 1; }

BASE=/opt/sigi                    # checkout git del repositorio completo
APP="${BASE}/SiGi-platform"       # raíz de la plataforma (deploy-demo.sh, compose, scripts)
ENV_FILE=/etc/sigi/sigi.env
ADMIN_FILE=/etc/sigi/sigi-admin.txt
BACKUP_ENV=/etc/sigi/backup.env
PROJECT=sigi
BACKUP_DIR=/var/backups/sigi
SIGI_HOME=/home/sigi
KEY="${SIGI_HOME}/.ssh/sigi_github_deploy"
export DEBIAN_FRONTEND=noninteractive

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mAVISO: %s\033[0m\n' "$*" >&2; }
as_sigi() { sudo -u sigi -H "$@"; }

# ---------------------------------------------------------------- 1. Host
log "1/6 Verificando y preparando el servidor"
[[ "$(uname -m)" == "x86_64" ]] || { echo "Se requiere x86_64 (amd64); este servidor es $(uname -m)." >&2; exit 1; }
. /etc/os-release
[[ "${ID}" == "ubuntu" ]] || warn "Probado en Ubuntu 22.04/24.04; este sistema es ${PRETTY_NAME}."
mem_gib=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 / 1024 ))
case "${SIGI_MEMORY_PROFILE:-16g}" in
  16g) min_ram=15 ;;
  8g)  min_ram=7 ;;
  *) echo "SIGI_MEMORY_PROFILE debe ser 16g u 8g" >&2; exit 2 ;;
esac
(( mem_gib >= min_ram )) || warn "RAM detectada: ${mem_gib} GiB; el perfil ${SIGI_MEMORY_PROFILE:-16g} necesita al menos $((min_ram + 1)) GiB."
disk_gib=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
(( disk_gib >= 40 )) || warn "Espacio libre en /: ${disk_gib} GiB. Se recomiendan al menos 40 GiB (imágenes + datos + respaldos)."

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1 || ! command -v node >/dev/null; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git openssl jq ufw
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nodejs
  if [[ ! -f /etc/docker/daemon.json ]]; then
    echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }' > /etc/docker/daemon.json
  fi
fi
# Servidores con restos de docker.io (paquetes en estado "rc") pueden dejar containerd/docker.socket
# detenidos; dockerd -H fd:// necesita ambos.
systemctl unmask containerd.service docker.socket docker.service >/dev/null 2>&1 || true
systemctl enable --now containerd.service docker.socket >/dev/null
systemctl enable docker.service >/dev/null
systemctl restart docker.service
docker info >/dev/null || { echo "Docker no arrancó: revise journalctl -xeu docker.service" >&2; exit 1; }
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= 20 )) || { echo "Se requiere Node.js >= 20 (instalado: $(node --version))." >&2; exit 1; }

if ! swapon --show | grep -q .; then
  log "Creando swap de 4 GiB (picos de build)"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [[ "${SIGI_SKIP_UFW:-false}" != "true" ]]; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw --force enable >/dev/null
fi

id sigi >/dev/null 2>&1 || useradd --system --create-home --home-dir "${SIGI_HOME}" --shell /bin/bash sigi
usermod -aG docker sigi
install -d -m 0750 -o root -g sigi /etc/sigi
install -d -m 0700 -o sigi -g sigi "${BACKUP_DIR}" /var/lib/sigi /var/lib/sigi/rollbacks

# ---------------------------------------------------------------- 2. GitHub
# Modo por defecto "gh": el usuario sigi inicia sesión UNA vez en GitHub CLI con código de dispositivo
# (se aprueba en el navegador de cualquier equipo con una cuenta que tenga lectura sobre el repo) y git
# usa esa credencial por HTTPS. Modo "deploykey": llave SSH de solo lectura (si la organización las permite).
if [[ "${SIGI_GIT_AUTH:-gh}" == "gh" ]]; then
  log "2/6 Conexión con GitHub (GitHub CLI, HTTPS)"
  REPO="${SIGI_REPO_URL:-https://github.com/Restoration-Team-FAO/SIGI-Distribution.git}"
  if ! command -v gh >/dev/null; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
    chmod a+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main"       > /etc/apt/sources.list.d/github-cli.list
    apt-get update -y && apt-get install -y gh
  fi
  if ! as_sigi gh auth status --hostname github.com >/dev/null 2>&1; then
    cat <<EOF

Inicie sesión en GitHub para el usuario de servicio "sigi" (solo la primera vez):
  - Se mostrará un código de 8 caracteres y la dirección https://github.com/login/device
  - Ábrala en el navegador de SU equipo, ingrese el código y autorice con su cuenta de GitHub.
EOF
    as_sigi gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key
  fi
  as_sigi gh auth setup-git --hostname github.com
else
  log "2/6 Conexión con GitHub (deploy key de solo lectura)"
  REPO="${SIGI_REPO_URL:-git@github.com:Restoration-Team-FAO/SIGI-Distribution.git}"
  install -d -m 0700 -o sigi -g sigi "${SIGI_HOME}/.ssh"
  [[ -f "${KEY}" ]] || as_sigi ssh-keygen -q -t ed25519 -N '' -C "sigi-deploy@$(hostname)" -f "${KEY}"
  gh_host=github.com; gh_port=22
  if [[ "${SIGI_SSH_PORT443:-false}" == "true" ]]; then gh_host=ssh.github.com; gh_port=443; fi
  printf 'Host github.com
  HostName %s
  Port %s
  User git
  IdentityFile %s
  IdentitiesOnly yes
'     "${gh_host}" "${gh_port}" "${KEY}" > "${SIGI_HOME}/.ssh/config"
  ssh-keyscan -p "${gh_port}" -t ed25519 "${gh_host}" 2>/dev/null > "${SIGI_HOME}/.ssh/known_hosts"
  chown sigi:sigi "${SIGI_HOME}/.ssh/config" "${SIGI_HOME}/.ssh/known_hosts"
  chmod 600 "${SIGI_HOME}/.ssh/config" "${SIGI_HOME}/.ssh/known_hosts"
  gh_fp="$(ssh-keygen -lf "${SIGI_HOME}/.ssh/known_hosts" 2>/dev/null | awk '{print $2}')"
  if [[ "${gh_fp}" != "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU" ]]; then
    echo "La huella SSH de ${gh_host}:${gh_port} ('${gh_fp:-ninguna}') no es la oficial de GitHub. Se detiene." >&2
    exit 1
  fi
  echo "Registre como deploy key de solo lectura en el repo esta llave pública:"
  cat "${KEY}.pub"
fi

if ! as_sigi git ls-remote "${REPO}" HEAD >/dev/null 2>&1; then
  echo "No se pudo leer ${REPO} con la credencial configurada (¿la cuenta tiene acceso al repo?)." >&2
  exit 1
fi
if ! as_sigi git ls-remote --exit-code "${REPO}" "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "El tag ${TAG} no existe en GitHub. Últimos tags:" >&2
  as_sigi git ls-remote --tags --refs "${REPO}" | awk -F/ '{print "  " $3}' | sort -V | tail -5 >&2
  exit 1
fi
echo "Conexión con GitHub OK; tag ${TAG} disponible."

# ---------------------------------------------------------------- 3. Código
log "3/6 Descargando ${TAG}"
first_install=false
if [[ ! -d "${BASE}/.git" ]]; then
  first_install=true
  [[ -z "$(ls -A "${BASE}" 2>/dev/null)" ]] || { echo "${BASE} existe y no es un checkout git; muévalo antes de continuar." >&2; exit 1; }
  install -d -m 0755 -o sigi -g sigi "${BASE}"
  as_sigi git clone --quiet --no-checkout "${REPO}" "${BASE}"
fi
as_sigi git -C "${BASE}" fetch --quiet --tags --force origin
previous="$(as_sigi git -C "${BASE}" describe --tags --exact-match 2>/dev/null || echo 'ninguna')"
[[ "${first_install}" == true || -z "$(as_sigi git -C "${BASE}" status --porcelain 2>/dev/null)" ]] || { echo "El checkout ${BASE} tiene cambios locales; no se despliega." >&2; exit 1; }
as_sigi git -C "${BASE}" -c advice.detachedHead=false checkout --quiet "refs/tags/${TAG}"
SHA="$(as_sigi git -C "${BASE}" rev-parse HEAD)"
VERSION="$(tr -d '\r\n' < "${APP}/VERSION")"
chmod 0750 "${APP}/deploy-demo.sh"
echo "Versión anterior: ${previous}  ->  nueva: ${TAG} (VERSION=${VERSION}, commit ${SHA})"

# ---------------------------------------------------------------- 4. Configuración y secretos
log "4/6 Configuración (${ENV_FILE})"
if [[ ! -f "${ENV_FILE}" ]]; then
  : "${SIGI_DOMAIN:?Primera instalación: defina SIGI_DOMAIN (p. ej. sigi.institucion.org)}"
  if [[ "${SIGI_TLS_MODE:-letsencrypt}" == "internal" ]]; then
    SIGI_ACME_EMAIL="${SIGI_ACME_EMAIL:-admin@${SIGI_DOMAIN}}"   # no se usa con tls internal
  fi
  : "${SIGI_ACME_EMAIL:?Primera instalación: defina SIGI_ACME_EMAIL (correo real para LetsEncrypt)}"
  [[ "${SIGI_DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "SIGI_DOMAIN inválido" >&2; exit 1; }
  WWW="${SIGI_WWW_DOMAIN:-www.${SIGI_DOMAIN}}"
  tmp="$(mktemp)"
  # Cada <change-me> recibe un secreto distinto (hex, sin caracteres que requieran URL-encoding).
  while IFS= read -r line || [[ -n "${line}" ]]; do
    while [[ "${line}" == *'<change-me>'* ]]; do line="${line/<change-me>/$(openssl rand -hex 24)}"; done
    printf '%s\n' "${line}"
  done < "${APP}/.env.production.example" > "${tmp}"
  app_pass="$(sed -n 's/^SIGI_APP_DB_PASSWORD=//p' "${tmp}")"
  sed -i \
    -e "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://sigi_app:${app_pass}@postgres:5432/sigi_db#" \
    -e "s#^SIGI_ACME_EMAIL=.*#SIGI_ACME_EMAIL=${SIGI_ACME_EMAIL}#" \
    -e "s#^SIGI_ADMIN_DOMAIN=.*#SIGI_ADMIN_DOMAIN=${SIGI_DOMAIN}#" \
    -e "s#^SIGI_PUBLIC_DOMAIN=.*#SIGI_PUBLIC_DOMAIN=${WWW}#" \
    -e "s#^SIGI_CORS_ALLOWED_ORIGINS=.*#SIGI_CORS_ALLOWED_ORIGINS=https://${SIGI_DOMAIN}#" \
    -e "s#^GEOSERVER_CORS_ALLOWED_ORIGINS=.*#GEOSERVER_CORS_ALLOWED_ORIGINS=https://${SIGI_DOMAIN}#" \
    -e "s#^SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=.*#SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=$(openssl rand -hex 16)Aa1#" \
    -e "s#^ODOO_MOCK_MODE=.*#ODOO_MOCK_MODE=false#" \
    "${tmp}"
  if [[ "${SIGI_MEMORY_PROFILE:-16g}" == "8g" ]]; then
    # Suma de límites ~7.4 GiB (son topes, no reservas); consumo real en una instancia vacía ~3-4 GiB.
    sed -i       -e "s#^POSTGRES_MEMORY_LIMIT=.*#POSTGRES_MEMORY_LIMIT=1536m#"       -e "s#^SIGI_API_MEMORY_LIMIT=.*#SIGI_API_MEMORY_LIMIT=768m#"       -e "s#^GIS_SERVICE_MEMORY_LIMIT=.*#GIS_SERVICE_MEMORY_LIMIT=768m#"       -e "s#^INTEGRATION_SERVICE_MEMORY_LIMIT=.*#INTEGRATION_SERVICE_MEMORY_LIMIT=384m#"       -e "s#^GEOSERVER_MEMORY_LIMIT=.*#GEOSERVER_MEMORY_LIMIT=3584m#"       -e "s#^SIGI_FRONTEND_MEMORY_LIMIT=.*#SIGI_FRONTEND_MEMORY_LIMIT=128m#"       -e "s#^CADDY_MEMORY_LIMIT=.*#CADDY_MEMORY_LIMIT=128m#"       -e "s#^DATABASE_ROLES_INIT_MEMORY_LIMIT=.*#DATABASE_ROLES_INIT_MEMORY_LIMIT=128m#"       -e "s#^GEOSERVER_INIT_MEMORY_LIMIT=.*#GEOSERVER_INIT_MEMORY_LIMIT=128m#"       "${tmp}"
    echo "Perfil de memoria 8g aplicado."
  fi
  case "${SIGI_TLS_MODE:-letsencrypt}" in
    letsencrypt) ;;
    internal) sed -i "s#^SIGI_CADDYFILE=.*#SIGI_CADDYFILE=./infra/caddy/Caddyfile.internal#" "${tmp}" ;;
    *) echo "SIGI_TLS_MODE debe ser letsencrypt o internal" >&2; exit 1 ;;
  esac
  install -m 0640 -o root -g sigi "${tmp}" "${ENV_FILE}"
  rm -f "${tmp}"
  echo "Generado ${ENV_FILE} (secretos aleatorios, permisos 0640 root:sigi)."
else
  echo "Se conserva ${ENV_FILE} existente (secretos y dominios)."
fi
grep -q '^SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=' "${ENV_FILE}" \
  || echo "SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=$(openssl rand -hex 16)Aa1" >> "${ENV_FILE}"
# Commit real del tag para /api/version y el pie de la interfaz.
if grep -q '^SIGI_GIT_SHA=' "${ENV_FILE}"; then sed -i "s#^SIGI_GIT_SHA=.*#SIGI_GIT_SHA=${SHA}#" "${ENV_FILE}"
else echo "SIGI_GIT_SHA=${SHA}" >> "${ENV_FILE}"; fi

DOMAIN="$(sed -n 's/^SIGI_ADMIN_DOMAIN=//p' "${ENV_FILE}" | tail -1)"
WWW="$(sed -n 's/^SIGI_PUBLIC_DOMAIN=//p' "${ENV_FILE}" | tail -1)"
internal_tls=false
grep -q '^SIGI_CADDYFILE=.*Caddyfile.internal' "${ENV_FILE}" && internal_tls=true
# Con TLS interno el certificado no es de confianza pública: las verificaciones HTTPS se hacen
# contra este mismo servidor (127.0.0.1) y aceptando el certificado de Caddy.
TLS_OPTS=()
if [[ "${internal_tls}" == true ]]; then
  TLS_OPTS=(-k --resolve "${DOMAIN}:443:127.0.0.1")
  export SIGI_SKIP_EXTERNAL_CHECK=true
  echo "Modo TLS interno (Caddyfile.internal): sin Let's Encrypt."
fi
public_ip="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"
[[ "${internal_tls}" == true ]] || for d in "${DOMAIN}" "${WWW}"; do
  resolved="$(getent ahostsv4 "${d}" | awk 'NR==1 {print $1}')"
  if [[ -z "${resolved}" ]]; then
    warn "${d} no resuelve en DNS. Cree el registro A hacia ${public_ip:-la IP pública del servidor} o Let's Encrypt fallará."
  elif [[ -n "${public_ip}" && "${resolved}" != "${public_ip}" ]]; then
    warn "${d} resuelve a ${resolved}, pero la IP pública de salida es ${public_ip} (normal si hay NAT/balanceador)."
  fi
done

# ---------------------------------------------------------------- 5. Despliegue oficial
args=(--no-source-pull)   # el código ya quedó en el tag exacto; no se hace git pull
docker volume inspect "${PROJECT}_postgres_data" >/dev/null 2>&1 || args+=(--no-backup)
log "5/6 Despliegue oficial deploy-demo.sh ${args[*]} (proyecto ${PROJECT}; puede tardar 15-30 min la primera vez)"
cd "${APP}"
as_sigi env SIGI_ENV_FILE="${ENV_FILE}" SIGI_COMPOSE_PROJECT_NAME="${PROJECT}" \
  SIGI_BACKUP_DIR="${BACKUP_DIR}" SIGI_GIT_SHA="${SHA}" \
  SIGI_SKIP_EXTERNAL_CHECK="${SIGI_SKIP_EXTERNAL_CHECK:-false}" ./deploy-demo.sh "${args[@]}"

if [[ ! -f "${ADMIN_FILE}" ]]; then
  admin_pass="$(sed -n 's/^SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=//p' "${ENV_FILE}" | tail -1)"
  ( umask 077; printf 'URL: https://%s\nUsuario: superadmin@sigi.local\nClave: %s\n' "${DOMAIN}" "${admin_pass}" > "${ADMIN_FILE}" )
fi

# ---------------------------------------------------------------- 6. Respaldos
log "6/6 Respaldo diario (systemd timer 02:15, 7 copias en ${BACKUP_DIR})"
cat > "${BACKUP_ENV}" <<EOF
SIGI_ENV_FILE=${ENV_FILE}
SIGI_COMPOSE_FILE=docker-compose.prod.yml
SIGI_COMPOSE_PROJECT_NAME=${PROJECT}
SIGI_BACKUP_DIR=${BACKUP_DIR}
SIGI_BACKUP_RETENTION_DAYS=7
SIGI_BACKUP_MAX_COPIES=7
EOF
chown root:sigi "${BACKUP_ENV}"; chmod 0640 "${BACKUP_ENV}"
sed "s#^WorkingDirectory=.*#WorkingDirectory=${APP}#; s#^ExecStart=.*#ExecStart=$(command -v node) ${APP}/scripts/ops/backup-platform.mjs#; s#^EnvironmentFile=.*#EnvironmentFile=${BACKUP_ENV}#" \
  "${APP}/infra/systemd/sigi-demo-backup.service" > /etc/systemd/system/sigi-backup.service
sed "s#^Unit=.*#Unit=sigi-backup.service#" "${APP}/infra/systemd/sigi-demo-backup.timer" > /etc/systemd/system/sigi-backup.timer
systemctl daemon-reload
systemctl enable --now sigi-backup.timer >/dev/null

log "Verificación final"
curl -fsS --max-time 20 "${TLS_OPTS[@]}" "https://${DOMAIN}/api/version" && echo
curl -fsS --max-time 20 "${TLS_OPTS[@]}" -o /dev/null "https://${DOMAIN}/api/health" && echo "api/health OK"
code="$(curl -sS --max-time 20 "${TLS_OPTS[@]}" -o /dev/null -w '%{http_code}' "https://${DOMAIN}/geoserver/rest/" || true)"
[[ "${code}" == "404" ]] && echo "geoserver/rest bloqueado (404) OK" || warn "/geoserver/rest respondió ${code} (se esperaba 404)"

cat <<EOF

SIGI ${TAG} desplegado (commit ${SHA}).
  URL:       https://${DOMAIN}
  Usuario:   superadmin@sigi.local
  Clave:     sudo cat ${ADMIN_FILE}   (cámbiela tras el primer ingreso)
  Estado:    cd ${APP} && sudo -u sigi docker compose -p ${PROJECT} --env-file ${ENV_FILE} -f docker-compose.prod.yml ps
  Actualizar: sudo bash $0 vX.Y.Z
EOF
