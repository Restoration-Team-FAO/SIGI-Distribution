import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const platformDir = process.cwd();
const repoRootResult = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: platformDir,
  encoding: 'utf8',
});
if (repoRootResult.status !== 0) {
  throw new Error(repoRootResult.stderr || 'Unable to resolve Git repository root.');
}

const repoRoot = repoRootResult.stdout.trim();
const platformPrefix = `${path.relative(repoRoot, platformDir).replaceAll('\\', '/')}/`;
const issues = [];

verifyTrackedArtifacts();
verifyMigrationManifest();
verifyReproducibleDependencies();
verifyRepositoryFiles();

const result = {
  gate: 'sigi.reconciled-foundation',
  ok: issues.length === 0,
  checks: {
    trackedArtifacts: 'checked',
    migrationManifest: 'checked',
    reproducibleDependencies: 'checked',
    repositoryFiles: 'checked',
  },
  issues,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function verifyTrackedArtifacts() {
  const trackedResult = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (trackedResult.status !== 0) {
    issues.push('No se pudo inspeccionar el índice Git.');
    return;
  }

  const forbidden = [
    /(^|\/)node_modules\//,
    /(^|\/)dist\//,
    /(^|\/)__pycache__\//,
    /(^|\/)playwright-report\//,
    /(^|\/)test-results\//,
    /(^|\/)\.run\//,
    /(^|\/)\.env\.production$/,
  ];
  const tracked = trackedResult.stdout.split('\0').filter(Boolean);
  for (const file of tracked.filter((entry) => entry.startsWith(platformPrefix))) {
    const relative = file.slice(platformPrefix.length);
    if (forbidden.some((pattern) => pattern.test(relative))) {
      issues.push(`Artefacto local versionado: ${relative}`);
    }
  }
}

function verifyMigrationManifest() {
  const manifestPath = path.join(platformDir, 'infra/postgres/migrations/manifest.txt');
  if (!fs.existsSync(manifestPath)) {
    issues.push('Falta infra/postgres/migrations/manifest.txt.');
    return;
  }

  const entries = fs.readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (entries.length === 0) issues.push('El manifest de migraciones está vacío.');
  if (new Set(entries).size !== entries.length) issues.push('El manifest contiene entradas duplicadas.');

  for (const entry of entries) {
    if (!/^infra\/postgres\/migrations\/[A-Za-z0-9._/-]+\.sql$/.test(entry) || entry.includes('..')) {
      issues.push(`Entrada insegura en manifest: ${entry}`);
      continue;
    }
    if (/seed|demo/i.test(entry)) issues.push(`Seed/demo incluido en manifest productivo: ${entry}`);
    const absolute = path.join(platformDir, ...entry.split('/'));
    if (!fs.existsSync(absolute)) {
      issues.push(`Migración inexistente: ${entry}`);
      continue;
    }
    const sql = fs.readFileSync(absolute, 'utf8');
    if (/\\i[r]?\s+\//i.test(sql)) issues.push(`Migración con include absoluto: ${entry}`);
  }

  const spatial = path.join(platformDir, 'infra/postgres/migrations/20260917_spatial_indexes.sql');
  const spatialSql = fs.existsSync(spatial) ? fs.readFileSync(spatial, 'utf8') : '';
  if (!/USING\s+GIST\s*\(geometry\)/i.test(spatialSql)) {
    issues.push('La migración espacial no garantiza el índice GiST de geometry.');
  }
}

function verifyReproducibleDependencies() {
  for (const dockerfile of [
    'apps/frontend-sigi/Dockerfile',
    'apps/sigi-api/Dockerfile',
  ]) {
    const content = fs.readFileSync(path.join(platformDir, dockerfile), 'utf8');
    if (!/\bRUN\s+npm\s+ci\b/.test(content)) issues.push(`${dockerfile} debe usar npm ci.`);
  }

  for (const requirements of [
    'services/integration-service/requirements.txt',
    'services/gis-service/requirements.txt',
  ]) {
    const lines = fs.readFileSync(path.join(platformDir, requirements), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    if (lines.some((line) => !/^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?==[^=\s]+$/.test(line))) {
      issues.push(`${requirements} contiene dependencias sin versión exacta.`);
    }
  }
}

function verifyRepositoryFiles() {
  const required = [
    path.join(repoRoot, '.gitignore'),
    path.join(repoRoot, '.github/workflows/sigi-reconciled-foundation.yml'),
    path.join(platformDir, 'package-lock.json'),
    path.join(platformDir, 'apps/sigi-api/package-lock.json'),
    path.join(platformDir, '.env.production.example'),
    path.join(platformDir, 'scripts/ops/migrate-postgres.mjs'),
  ];
  for (const file of required) {
    if (!fs.existsSync(file)) issues.push(`Archivo fundacional ausente: ${path.relative(repoRoot, file)}`);
  }
}
