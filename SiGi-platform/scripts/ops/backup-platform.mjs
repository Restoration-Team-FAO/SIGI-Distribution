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
const configuredBackupRoot = args.output || process.env.SIGI_BACKUP_DIR || '';
const backupRoot = path.resolve(configuredBackupRoot);
const retentionDays = Number(
  args['retention-days'] || process.env.SIGI_BACKUP_RETENTION_DAYS || 7,
);
const maxCopies = Number(
  args['max-copies'] || process.env.SIGI_BACKUP_MAX_COPIES || 7,
);

if (!args.output && !process.env.SIGI_BACKUP_DIR)
  fail('Set SIGI_BACKUP_DIR or pass --output=ABSOLUTE_PATH.');
if (!path.isAbsolute(configuredBackupRoot))
  fail('Backup output must be an absolute path.');
if (isInside(platformDir, backupRoot))
  fail('Backup output must be outside the source checkout.');
if (!Number.isInteger(retentionDays) || retentionDays < 1)
  fail('Retention days must be a positive integer.');
if (!Number.isInteger(maxCopies) || maxCopies < 1)
  fail('Maximum backup copies must be a positive integer.');

fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
pruneStalePartials(backupRoot);
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z');
const finalDir = path.join(backupRoot, `sigi-backup-${timestamp}`);
const partialDir = `${finalDir}.partial`;
if (fs.existsSync(finalDir) || fs.existsSync(partialDir))
  fail(`Backup target already exists: ${finalDir}`);
fs.mkdirSync(partialDir, { mode: 0o700 });

try {
  exportFromService(
    'postgres',
    [
      'sh',
      '-c',
      'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner',
    ],
    'postgres.dump',
  );
  exportFromService(
    'sigi-api',
    ['tar', '-C', '/var/sigi-files', '-czf', '-', '.'],
    'sigi_files_data.tar.gz',
  );
  exportFromService(
    'geoserver',
    ['tar', '-C', '/opt/geoserver_data', '-czf', '-', '.'],
    'geoserver_data.tar.gz',
  );
  createConfigurationArchive();

  const files = [
    'postgres.dump',
    'sigi_files_data.tar.gz',
    'geoserver_data.tar.gz',
    'configuration.tar.gz',
  ];
  const checksums = Object.fromEntries(
    files.map((file) => [file, sha256(path.join(partialDir, file))]),
  );
  const commit = run('git', ['rev-parse', 'HEAD'], {
    cwd: platformDir,
  }).stdout.trim();
  const imageOutput = run('docker', [
    ...composeArgs(),
    'images',
    '--format',
    'json',
  ]).stdout.trim();
  const images = imageOutput ? JSON.parse(imageOutput) : [];
  const manifest = {
    format: 'sigi-platform-backup/v1',
    createdAt: new Date().toISOString(),
    commit,
    composeProject: projectName(),
    artifacts: checksums,
    images,
  };
  fs.writeFileSync(
    path.join(partialDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(partialDir, 'SHA256SUMS.json'),
    `${JSON.stringify(checksums, null, 2)}\n`,
    { mode: 0o600 },
  );
  for (const file of files) fs.chmodSync(path.join(partialDir, file), 0o600);
  fs.renameSync(partialDir, finalDir);
  pruneBackups(backupRoot, retentionDays, maxCopies, finalDir);
  console.log(
    JSON.stringify(
      { backup: finalDir, artifacts: checksums, ok: true },
      null,
      2,
    ),
  );
} catch (error) {
  fs.rmSync(partialDir, { recursive: true, force: true });
  throw error;
}

function createConfigurationArchive() {
  const target = path.join(partialDir, 'configuration.tar.gz');
  const allowlist = [
    'docker-compose.prod.yml',
    '.env.production.example',
    'package.json',
    'package-lock.json',
    'deploy-demo.sh',
    'infra/caddy',
    'infra/geoserver',
    'infra/postgres',
    'infra/systemd',
    'scripts/ops',
  ];
  run('tar', ['-czf', target, ...allowlist], { cwd: platformDir });
  fs.chmodSync(target, 0o600);
}

function exportFromService(service, command, filename) {
  const target = path.join(partialDir, filename);
  const descriptor = fs.openSync(target, 'wx', 0o600);
  try {
    run('docker', [...composeArgs(), 'exec', '-T', service, ...command], {
      cwd: platformDir,
      stdio: ['ignore', descriptor, 'pipe'],
    });
  } finally {
    fs.closeSync(descriptor);
  }
  if (fs.statSync(target).size === 0)
    fail(`Backup artifact is empty: ${filename}`);
}

function pruneBackups(root, days, copies, current) {
  const cutoff = Date.now() - days * 86400000;
  const candidates = fs
    .readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && /^sigi-backup-\d{8}T\d{6}Z$/.test(entry.name),
    )
    .map((entry) => path.join(root, entry.name))
    .filter((candidate) =>
      fs.existsSync(path.join(candidate, 'manifest.json')),
    );

  for (const candidate of candidates) {
    if (candidate !== current && fs.statSync(candidate).mtimeMs < cutoff) {
      fs.rmSync(candidate, { recursive: true });
    }
  }

  const retained = candidates
    .filter((candidate) => fs.existsSync(candidate))
    .sort(
      (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs,
    );
  for (const candidate of retained.slice(copies)) {
    if (candidate !== current) fs.rmSync(candidate, { recursive: true });
  }
}

function pruneStalePartials(root) {
  const cutoff = Date.now() - 86400000;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !/^sigi-backup-\d{8}T\d{6}Z\.partial$/.test(entry.name)
    ) {
      continue;
    }
    const candidate = path.join(root, entry.name);
    if (fs.statSync(candidate).mtimeMs < cutoff) {
      fs.rmSync(candidate, { recursive: true });
    }
  }
}

function composeArgs() {
  return [
    'compose',
    '--project-name',
    projectName(),
    '--env-file',
    envFile(),
    ...composeFiles().flatMap((file) => ['-f', file]),
  ];
}

function projectName() {
  return process.env.SIGI_COMPOSE_PROJECT_NAME || 'sigi-platform';
}
function envFile() {
  return path.resolve(
    platformDir,
    process.env.SIGI_ENV_FILE || '.env.production',
  );
}
function composeFiles() {
  return (process.env.SIGI_COMPOSE_FILE || 'docker-compose.prod.yml')
    .split(path.delimiter)
    .filter(Boolean)
    .map((file) => path.resolve(platformDir, file));
}
function sha256(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}
function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
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
  const result = spawnSync(command, commandArgs, {
    cwd: platformDir,
    encoding: options.stdio ? undefined : 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0)
    fail(
      Buffer.isBuffer(result.stderr)
        ? result.stderr.toString()
        : result.stderr || `${command} failed.`,
    );
  return result;
}
