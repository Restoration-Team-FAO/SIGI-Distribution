import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const envFile =
  process.env.SIGI_ENV_FILE ||
  (fs.existsSync(path.join(cwd, '.env.production'))
    ? '.env.production'
    : '.env.production.example');
const composeFile = process.env.SIGI_COMPOSE_FILE || 'docker-compose.prod.yml';
const result = spawnSync(
  'docker',
  [
    'compose',
    '--env-file',
    envFile,
    '-f',
    composeFile,
    'config',
    '--format',
    'json',
  ],
  {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  },
);
if (result.status !== 0) {
  process.stderr.write(
    result.stderr || 'Unable to resolve production Compose.\n',
  );
  process.exit(result.status || 1);
}

const compose = JSON.parse(result.stdout);
const issues = [];
const services = compose.services || {};
const requiredServices = [
  'postgres',
  'database-roles-init',
  'sigi-api',
  'frontend-sigi',
  'integration-service',
  'gis-service',
  'geoserver',
  'geoserver-init',
  'caddy',
];
for (const service of requiredServices)
  if (!services[service])
    issues.push(`Servicio productivo ausente: ${service}`);

const longRunningServices = [
  'postgres',
  'sigi-api',
  'frontend-sigi',
  'integration-service',
  'gis-service',
  'geoserver',
  'caddy',
];
const healthcheckedServices = [
  'postgres',
  'sigi-api',
  'frontend-sigi',
  'integration-service',
  'gis-service',
  'geoserver',
  'caddy',
];
let totalMemoryLimit = 0;

for (const [name, service] of Object.entries(services)) {
  if (name !== 'caddy' && Array.isArray(service.ports) && service.ports.length)
    issues.push(`Puerto productivo expuesto fuera de Caddy: ${name}`);
  if (!service.logging || service.logging.driver !== 'json-file')
    issues.push(`Rotación json-file ausente: ${name}`);
  if (service.image?.endsWith(':latest'))
    issues.push(`Imagen latest no permitida: ${name}`);
  const memoryLimit = Number(service.mem_limit || 0);
  if (!Number.isFinite(memoryLimit) || memoryLimit <= 0)
    issues.push(`Límite de memoria ausente: ${name}`);
  else totalMemoryLimit += memoryLimit;
}

for (const service of longRunningServices) {
  if (services[service]?.restart !== 'unless-stopped')
    issues.push(`Política de reinicio inválida: ${service}`);
}
for (const service of ['database-roles-init', 'geoserver-init']) {
  if (services[service]?.restart !== 'no')
    issues.push(`El job ${service} debe mantener restart: no.`);
}
for (const service of healthcheckedServices) {
  if (!services[service]?.healthcheck?.test)
    issues.push(`Healthcheck ausente: ${service}`);
}
if (totalMemoryLimit > 14 * 1024 ** 3)
  issues.push(
    'Los límites de memoria superan 14 GiB y no dejan reserva suficiente al host de 16 GB.',
  );
const geoserverJavaOptions =
  services.geoserver?.environment?.EXTRA_JAVA_OPTS || '';
if (
  !geoserverJavaOptions.includes('-Xms1g') ||
  !geoserverJavaOptions.includes('-Xmx3g')
) {
  issues.push('GeoServer debe iniciar con Xms=1 GB y Xmx=3 GB.');
}

if (!services.caddy?.ports?.some((port) => Number(port.target) === 443))
  issues.push('Caddy no publica HTTPS.');
if (!compose.networks?.edge?.internal || !compose.networks?.backend?.internal)
  issues.push('Las redes edge y backend deben ser internas.');
for (const service of ['caddy', 'integration-service']) {
  if (!Object.hasOwn(services[service]?.networks || {}, 'egress'))
    issues.push(`${service} requiere red egress.`);
}
for (const service of ['postgres', 'gis-service', 'geoserver', 'sigi-api']) {
  if (Object.hasOwn(services[service]?.networks || {}, 'egress'))
    issues.push(`${service} no debe tener egress directo.`);
}
for (const volume of [
  'postgres_data',
  'sigi_files_data',
  'geoserver_data',
  'caddy_data',
  'caddy_config',
]) {
  if (!compose.volumes?.[volume])
    issues.push(`Volumen productivo ausente: ${volume}`);
}

const caddy = read('infra/caddy/Caddyfile');
const internalCaddy = read('infra/caddy/Caddyfile.internal');
for (const [name, content] of [
  ['Caddyfile', caddy],
  ['Caddyfile.internal', internalCaddy],
]) {
  if (!content.includes('/geoserver/wfs*'))
    issues.push(`${name} no publica WFS.`);
  if (!content.includes('handle /geoserver/*'))
    issues.push(`${name} no bloquea administración GeoServer.`);
  if (!content.includes('Strict-Transport-Security'))
    issues.push(`${name} no establece HSTS.`);
  if (content.includes('reverse_proxy frontend-country'))
    issues.push(`${name} todavía publica el frontend Country retirado.`);
  if (!content.includes('redir https://{$SIGI_ADMIN_DOMAIN}{uri} permanent'))
    issues.push(`${name} no redirige el dominio legado al frontend único.`);
}
if (!internalCaddy.includes('tls internal'))
  issues.push('Caddyfile.internal no usa TLS interno.');

const roleScript = read('infra/postgres/roles/configure-runtime-roles.sh');
if (
  !roleScript.includes('sigi_app') ||
  !roleScript.includes('geoserver_ro') ||
  !roleScript.includes('documents') ||
  !roleScript.includes('GRANT SELECT') ||
  !roleScript.includes('REVOKE ALL')
) {
  issues.push(
    'Los roles PostgreSQL de aplicación y GeoServer no están endurecidos.',
  );
}
for (const operation of [
  'scripts/ops/backup-platform.mjs',
  'scripts/ops/restore-platform.mjs',
  'deploy-demo.sh',
  'infra/systemd/sigi-demo-backup.service',
  'infra/systemd/sigi-demo-backup.timer',
]) {
  if (!fs.existsSync(path.join(cwd, operation)))
    issues.push(`Operación ausente: ${operation}`);
}
const backupScript = read('scripts/ops/backup-platform.mjs');
if (
  !backupScript.includes('configuration.tar.gz') ||
  !backupScript.includes('SIGI_BACKUP_MAX_COPIES')
) {
  issues.push(
    'El backup no incluye configuración no sensible y rotación máxima por copias.',
  );
}
for (const style of [
  'sigi_territories.sld',
  'sigi_project_polygons.sld',
  'sigi_project_centroids.sld',
]) {
  if (!fs.existsSync(path.join(cwd, 'infra/geoserver/styles', style)))
    issues.push(`Estilo GeoServer ausente: ${style}`);
}
const geoserverBootstrap = read('infra/geoserver/bootstrap.sh');
if (
  !geoserverBootstrap.includes('datastore_method="PUT"') ||
  !geoserverBootstrap.includes('publish_style')
) {
  issues.push(
    'Bootstrap GeoServer no actualiza datastore y estilos de forma idempotente.',
  );
}

console.log(
  JSON.stringify(
    {
      gate: 'sigi.production-operations',
      ok: issues.length === 0,
      topology: {
        publishedServices: Object.entries(services)
          .filter(([, service]) => service.ports?.length)
          .map(([name]) => name),
        internalNetworks: ['edge', 'backend'],
        totalMemoryLimitBytes: totalMemoryLimit,
      },
      issues,
    },
    null,
    2,
  ),
);
if (issues.length) process.exitCode = 1;

function read(file) {
  return fs.readFileSync(path.join(cwd, file), 'utf8');
}
