import fs from 'node:fs';
import path from 'node:path';

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, value = 'true'] = entry.split('=');
    return [key, value];
  }),
);

const mode = args.get('--mode') ?? 'repo';
const fileArg = args.get('--file') ?? null;
const cwd = process.cwd();

const REQUIRED_PRODUCTION_KEYS = [
  'POSTGRES_PASSWORD',
  'SIGI_APP_DB_PASSWORD',
  'DATABASE_URL',
  'SIGI_SECRETS_KEY',
  'SIGI_INTERNAL_SERVICE_TOKEN',
  'SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN',
  'GEOSERVER_ADMIN_PASSWORD',
  'GEOSERVER_DB_PASSWORD',
  'GEOSERVER_CORS_ALLOWED_ORIGINS',
  'SIGI_CORS_ALLOWED_ORIGINS',
  'AUTH_ACCESS_TOKEN_TTL_SECONDS',
  'AUTH_REFRESH_TOKEN_TTL_SECONDS',
  'SIGI_TRUST_PROXY_HOPS',
  'SIGI_ACME_EMAIL',
  'SIGI_PUBLIC_DOMAIN',
  'SIGI_ADMIN_DOMAIN',
  'NODE_ENV',
  'APP_ENV',
  'VITE_SIGI_PORTAL_MODE',
];

const PLACEHOLDER_VALUES = new Set([
  '',
  'sigi_password',
  'superadmin-dev-token',
  'national-admin-dev-token',
  'editor-dev-token',
  'validator-dev-token',
  'reader-dev-token',
  'integration-dev-token',
  'sigi-dev-secret',
  'sigi-dev-internal-token',
  'reset-sigi-demo-2026',
  'geoserver',
  'change-me',
  '<change-me>',
  '<required>',
]);

function main() {
  if (mode === 'repo') {
    const files = ['.env.example', '.env.production.example'].filter((candidate) =>
      fs.existsSync(path.join(cwd, candidate)),
    );
    const results = files.map((file) =>
      validateFile(file, file.includes('production') ? 'production-template' : 'local'),
    );
    printSummary(results);
    if (results.some((result) => !result.ok)) {
      process.exitCode = 1;
    }
    return;
  }

  if (mode === 'production') {
    const result = fileArg
      ? validateFile(fileArg, 'production')
      : validateEnvObject(process.env, 'process.env', 'production');
    printSummary([result]);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const result = fileArg
    ? validateFile(fileArg, 'local')
    : validateEnvObject(process.env, 'process.env', 'local');
  printSummary([result]);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function validateFile(inputPath, profile) {
  const absolutePath = path.isAbsolute(inputPath) ? inputPath : path.join(cwd, inputPath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const entries = parseEnvContent(content);
  return validateEnvObject(entries, inputPath, profile);
}

function validateEnvObject(entries, source, profile) {
  const issues = [];

  if (profile === 'production' || profile === 'production-template') {
    for (const key of REQUIRED_PRODUCTION_KEYS) {
      if (!String(entries[key] ?? '').trim()) {
        issues.push(`Falta variable obligatoria de producción: ${key}`);
      }
    }

    const appEnv = String(entries.APP_ENV ?? '').trim().toLowerCase();
    const nodeEnv = String(entries.NODE_ENV ?? '').trim().toLowerCase();
    const portalMode = String(entries.VITE_SIGI_PORTAL_MODE ?? '').trim().toLowerCase();

    if (appEnv !== 'production') {
      issues.push(`APP_ENV debe ser production en perfil productivo. Valor actual: ${entries.APP_ENV ?? ''}`);
    }
    if (nodeEnv !== 'production') {
      issues.push(`NODE_ENV debe ser production en perfil productivo. Valor actual: ${entries.NODE_ENV ?? ''}`);
    }
    if (!['pilot', 'prod', 'production'].includes(portalMode)) {
      issues.push(
        `VITE_SIGI_PORTAL_MODE debe ser pilot o prod en perfil productivo. Valor actual: ${entries.VITE_SIGI_PORTAL_MODE ?? ''}`,
      );
    }
    const bootstrapAdminPassword = String(entries.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? '').trim();
    if (profile === 'production' && bootstrapAdminPassword && (bootstrapAdminPassword.length < 16 || !/[a-z]/i.test(bootstrapAdminPassword) || !/\d/.test(bootstrapAdminPassword))) {
      issues.push('SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN debe tener al menos 16 caracteres con letras y números.');
    }
    if (String(entries.SIGI_ENABLE_DB_RESET ?? '').trim().toLowerCase() === 'true') {
      issues.push('SIGI_ENABLE_DB_RESET=true no está permitido en perfil productivo.');
    }
    if (String(entries.ODOO_MOCK_MODE ?? '').trim().toLowerCase() === 'true') {
      issues.push('ODOO_MOCK_MODE=true no está permitido en perfil productivo.');
    }
    if (String(entries.SIGI_ALLOW_LEGACY_ADMIN_TOKENS ?? '').trim().toLowerCase() === 'true') {
      issues.push('SIGI_ALLOW_LEGACY_ADMIN_TOKENS=true no está permitido en perfil productivo.');
    }
    if (String(entries.ODOO_URL ?? '').toLowerCase().includes('odoo.demo.local')) {
      issues.push(`ODOO_URL no puede apuntar a odoo.demo.local en producción: ${entries.ODOO_URL}`);
    }
    if (String(entries.GEOSERVER_CORS_ALLOWED_ORIGINS ?? '').split(',').some((origin) => origin.trim() === '*')) {
      issues.push('GEOSERVER_CORS_ALLOWED_ORIGINS no puede contener * en producción.');
    }
    const apiOrigins = String(entries.SIGI_CORS_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
    if (apiOrigins.length === 0 || apiOrigins.includes('*')) {
      issues.push('SIGI_CORS_ALLOWED_ORIGINS debe ser una allowlist explícita sin wildcard.');
    }
    const accessTtl = Number(entries.AUTH_ACCESS_TOKEN_TTL_SECONDS);
    const refreshTtl = Number(entries.AUTH_REFRESH_TOKEN_TTL_SECONDS);
    if (!Number.isInteger(accessTtl) || accessTtl <= 0 || !Number.isInteger(refreshTtl) || refreshTtl <= accessTtl) {
      issues.push('AUTH_REFRESH_TOKEN_TTL_SECONDS debe ser mayor que AUTH_ACCESS_TOKEN_TTL_SECONDS y ambos deben ser enteros positivos.');
    }
    const trustProxyHops = Number(entries.SIGI_TRUST_PROXY_HOPS);
    if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
      issues.push('SIGI_TRUST_PROXY_HOPS debe ser un entero no negativo.');
    }
    if (String(entries.SIGI_PUBLIC_DOMAIN ?? '').trim() === String(entries.SIGI_ADMIN_DOMAIN ?? '').trim()) {
      issues.push('SIGI_PUBLIC_DOMAIN y SIGI_ADMIN_DOMAIN deben ser distintos.');
    }
    if (!String(entries.DATABASE_URL ?? '').startsWith('postgresql://sigi_app:')) {
      issues.push('DATABASE_URL productivo debe usar el rol de aplicación sigi_app.');
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      continue;
    }

    if (profile === 'production' && isPlaceholderValue(normalized)) {
      issues.push(`Valor inseguro o placeholder en producción: ${key}=${normalized}`);
    }
  }

  return {
    source,
    profile,
    ok: issues.length === 0,
    issues,
  };
}

function parseEnvContent(content) {
  const entries = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    entries[key] = value;
  }
  return entries;
}

function isPlaceholderValue(value) {
  return PLACEHOLDER_VALUES.has(value) || value.includes('<') || value.includes('example');
}

function printSummary(results) {
  console.log(
    JSON.stringify(
      {
        gate: 'sigi.env',
        ok: results.every((result) => result.ok),
        results,
      },
      null,
      2,
    ),
  );
}

main();
