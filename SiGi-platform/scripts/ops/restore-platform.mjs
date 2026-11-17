import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const platformDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const args = parseArgs(process.argv.slice(2));
const configuredBackupDir = args.backup || '';
const backupDir = path.resolve(configuredBackupDir);
if (!configuredBackupDir || !path.isAbsolute(configuredBackupDir))
  fail('Pass --backup=ABSOLUTE_BACKUP_DIRECTORY.');
if (args.confirm !== 'RESTORE-SIGI-PLATFORM')
  fail('Restore requires --confirm=RESTORE-SIGI-PLATFORM.');

const manifest = readJson('manifest.json');
const checksums = readJson('SHA256SUMS.json');
if (manifest.format !== 'sigi-platform-backup/v1')
  fail('Unsupported backup format.');
for (const [filename, expected] of Object.entries(checksums)) {
  const artifact = path.join(backupDir, filename);
  if (!fs.existsSync(artifact) || sha256(artifact) !== expected)
    fail(`Checksum verification failed: ${filename}`);
}

const stoppedServices = [
  'caddy',
  'frontend-sigi',
  'sigi-api',
  'integration-service',
  'gis-service',
  'geoserver',
  'geoserver-init',
];
run('docker', [...composeArgs(), 'stop', ...stoppedServices], {
  allowFailure: true,
});
run('docker', [...composeArgs(), 'up', '-d', 'postgres']);
waitForPermanentPostgres();

const dbName = containerEnv('postgres', 'POSTGRES_DB');
const dbUser = containerEnv('postgres', 'POSTGRES_USER');
if (!/^[A-Za-z0-9_]+$/.test(dbName) || !/^[A-Za-z0-9_]+$/.test(dbUser))
  fail('Unsafe database identity.');
psql(
  'postgres',
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}' AND pid <> pg_backend_pid();`,
);
run('docker', [
  ...composeArgs(),
  'exec',
  '-T',
  'postgres',
  'dropdb',
  '-U',
  dbUser,
  '--if-exists',
  dbName,
]);
run('docker', [
  ...composeArgs(),
  'exec',
  '-T',
  'postgres',
  'createdb',
  '-U',
  dbUser,
  '-O',
  dbUser,
  dbName,
]);
restoreDatabase(dbUser, dbName);

restoreVolume('sigi-api', '/var/sigi-files', 'sigi_files_data.tar.gz');
restoreVolume('geoserver', '/opt/geoserver_data', 'geoserver_data.tar.gz');
run('docker', [...composeArgs(), 'run', '--rm', 'database-roles-init']);

if (args.start === 'true') run('docker', [...composeArgs(), 'up', '-d']);
console.log(
  JSON.stringify(
    {
      restored: backupDir,
      sourceCommit: manifest.commit,
      started: args.start === 'true',
      ok: true,
    },
    null,
    2,
  ),
);

function restoreDatabase(user, database) {
  const descriptor = fs.openSync(path.join(backupDir, 'postgres.dump'), 'r');
  try {
    run(
      'docker',
      [
        ...composeArgs(),
        'exec',
        '-T',
        'postgres',
        'pg_restore',
        '-U',
        user,
        '-d',
        database,
        '--no-owner',
        '--no-privileges',
      ],
      {
        stdio: [descriptor, 'pipe', 'pipe'],
      },
    );
  } finally {
    fs.closeSync(descriptor);
  }
}

function restoreVolume(service, destination, archive) {
  const containerId = run('docker', [
    ...composeArgs(),
    'ps',
    '--all',
    '-q',
    service,
  ]).stdout.trim();
  if (!containerId) fail(`Container not found for volume restore: ${service}`);
  const volume = run('docker', [
    'inspect',
    containerId,
    '--format',
    `{{range .Mounts}}{{if eq .Destination "${destination}"}}{{.Name}}{{end}}{{end}}`,
  ]).stdout.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(volume))
    fail(`Unable to resolve safe volume for ${destination}.`);
  const descriptor = fs.openSync(path.join(backupDir, archive), 'r');
  try {
    run(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '-v',
        `${volume}:/restore`,
        'alpine:3.20',
        'sh',
        '-c',
        'find /restore -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -xzf - -C /restore',
      ],
      {
        stdio: [descriptor, 'pipe', 'pipe'],
      },
    );
  } finally {
    fs.closeSync(descriptor);
  }
}

function waitForPermanentPostgres() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = run(
      'docker',
      [
        ...composeArgs(),
        'exec',
        '-T',
        'postgres',
        'sh',
        '-c',
        'test "$(cat /proc/1/comm)" = postgres && pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
      ],
      { allowFailure: true },
    );
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  fail('PostgreSQL did not become ready for restore.');
}

function psql(database, sql) {
  run('docker', [
    ...composeArgs(),
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "$2"',
    '--',
    database,
    sql,
  ]);
}
function containerEnv(service, key) {
  return run('docker', [
    ...composeArgs(),
    'exec',
    '-T',
    service,
    'printenv',
    key,
  ]).stdout.trim();
}
function composeArgs() {
  const files = (process.env.SIGI_COMPOSE_FILE || 'docker-compose.prod.yml')
    .split(path.delimiter)
    .filter(Boolean)
    .map((file) => path.resolve(platformDir, file));
  return [
    'compose',
    '--project-name',
    process.env.SIGI_COMPOSE_PROJECT_NAME || 'sigi-platform',
    '--env-file',
    path.resolve(platformDir, process.env.SIGI_ENV_FILE || '.env.production'),
    ...files.flatMap((file) => ['-f', file]),
  ];
}
function readJson(filename) {
  const file = path.join(backupDir, filename);
  if (!fs.existsSync(file)) fail(`Backup metadata missing: ${filename}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function sha256(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}
function parseArgs(values) {
  return Object.fromEntries(
    values.map((value) => {
      const [key, ...rest] = value.replace(/^--/, '').split('=');
      return [key, rest.join('=') || 'true'];
    }),
  );
}
function fail(message) {
  throw new Error(message);
}
function run(command, commandArgs, options = {}) {
  const { allowFailure = false, ...spawnOptions } = options;
  const result = spawnSync(command, commandArgs, {
    cwd: platformDir,
    encoding: spawnOptions.stdio ? undefined : 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...spawnOptions,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0 && !allowFailure)
    fail(
      Buffer.isBuffer(result.stderr)
        ? result.stderr.toString()
        : result.stderr || `${command} failed.`,
    );
  return result;
}
