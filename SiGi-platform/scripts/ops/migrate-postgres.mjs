import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const platformDir = path.resolve(scriptDir, '../..');
const manifest = resolveInput(
  'SIGI_MIGRATION_MANIFEST',
  'infra/postgres/migrations/manifest.txt',
);
const envFile = resolveInput('SIGI_ENV_FILE', '.env.production');
const composeFiles = (
  process.env.SIGI_COMPOSE_FILE || 'docker-compose.prod.yml'
)
  .split(path.delimiter)
  .filter(Boolean)
  .map((file) => path.resolve(platformDir, file));
const projectName = process.env.SIGI_COMPOSE_PROJECT_NAME || 'sigi-platform';

for (const required of [manifest, envFile, ...composeFiles]) {
  if (!fs.existsSync(required))
    fail(`Required migration input not found: ${required}`);
}

const permanentServer = runDocker(
  [
    ...composeArgs(),
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'test "$(cat /proc/1/comm)" = postgres',
  ],
  { allowFailure: true },
);
if (permanentServer.status !== 0) {
  fail(
    'PostgreSQL is not fully initialized; wait for the permanent server before migrating.',
  );
}

const baselineReady = query(
  "SELECT to_regclass('core.projects') IS NOT NULL AND to_regclass('gis.territory_features') IS NOT NULL;",
);
if (baselineReady !== 't') {
  fail(
    'Accepted SIGI baseline schema is not installed; refusing incremental migration.',
  );
}

execute(`
  CREATE TABLE IF NOT EXISTS public.sigi_schema_migrations (
    migration TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

const entries = fs
  .readFileSync(manifest, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
let applied = 0;
let skipped = 0;

for (const entry of entries) {
  if (
    !/^infra\/postgres\/migrations\/[A-Za-z0-9._/-]+\.sql$/.test(entry) ||
    entry.includes('..')
  ) {
    fail(`Unsafe migration manifest entry: ${entry}`);
  }

  const migrationFile = path.join(platformDir, ...entry.split('/'));
  if (!fs.existsSync(migrationFile))
    fail(`Migration listed but not found: ${entry}`);

  const contents = fs.readFileSync(migrationFile, 'utf8');
  const checksum = crypto.createHash('sha256').update(contents).digest('hex');
  const recorded = query(
    `SELECT checksum FROM public.sigi_schema_migrations WHERE migration = ${sqlLiteral(entry)};`,
  );

  if (recorded) {
    if (recorded !== checksum)
      fail(`Checksum mismatch for applied migration: ${entry}`);
    console.log(`SKIP ${entry}`);
    skipped += 1;
    continue;
  }

  console.log(`APPLY ${entry}`);
  const migrationSql = contents
    .split(/\r?\n/)
    .filter((line) => !/^\s*\\set\s/i.test(line))
    .join('\n');
  execute(`BEGIN;
${migrationSql}
INSERT INTO public.sigi_schema_migrations (migration, checksum)
VALUES (${sqlLiteral(entry)}, ${sqlLiteral(checksum)});
COMMIT;`);
  applied += 1;
}

console.log(`Migration run complete: applied=${applied} skipped=${skipped}`);

function resolveInput(variable, fallback) {
  const configured = process.env[variable];
  return path.resolve(platformDir, configured || fallback);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function query(sql) {
  return runPsql(['-Atc', sql]).trim();
}

function execute(sql) {
  runPsql([], sql);
}

function runPsql(psqlArgs, input) {
  const args = [
    ...composeArgs(),
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"',
    '--',
    ...psqlArgs,
  ];
  const result = runDocker(args, { input });
  if (result.stderr) process.stderr.write(result.stderr);
  if (input && result.stdout) process.stdout.write(result.stdout);
  return result.stdout || '';
}

function composeArgs() {
  return [
    'compose',
    '--project-name',
    projectName,
    '--env-file',
    envFile,
    ...composeFiles.flatMap((file) => ['-f', file]),
  ];
}

function runDocker(args, { input, allowFailure = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: platformDir,
    encoding: 'utf8',
    input,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error)
    fail(`Unable to execute Docker Compose: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    process.stderr.write(
      result.stderr ||
        result.stdout ||
        'PostgreSQL migration command failed.\n',
    );
    process.exit(result.status || 1);
  }
  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
