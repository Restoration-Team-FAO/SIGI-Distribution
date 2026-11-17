#!/usr/bin/env node
// Control de versiones SIGI (SemVer). Fuente única: SiGi-platform/VERSION.
//   node scripts/release/bump-version.mjs 2.0.2      → escribe la versión en todos los manifiestos
//   node scripts/release/bump-version.mjs --check    → falla si algún manifiesto no coincide con VERSION
// Ver docs/VERSIONING.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platformDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

// Paquetes versionados con el producto (los conectores/libs internos conservan su propia versión).
export const VERSIONED_PACKAGES = ['package.json', 'apps/frontend-sigi/package.json', 'apps/sigi-api/package.json'];
const LOCKFILES = [
  { file: 'package-lock.json', entries: ['', 'apps/frontend-sigi', 'apps/sigi-api'] },
  { file: 'apps/sigi-api/package-lock.json', entries: [''] },
];

const read = (file) => fs.readFileSync(path.join(platformDir, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));
const writeJson = (file, data) => fs.writeFileSync(path.join(platformDir, file), `${JSON.stringify(data, null, 2)}\n`);

export function readVersion() {
  return read('VERSION').trim();
}

export function collectVersions() {
  const found = [];
  for (const file of VERSIONED_PACKAGES) found.push({ where: file, version: readJson(file).version });
  for (const { file, entries } of LOCKFILES) {
    const lock = readJson(file);
    found.push({ where: `${file}#version`, version: lock.version });
    for (const entry of entries) found.push({ where: `${file}#packages["${entry}"]`, version: lock.packages?.[entry]?.version });
  }
  return found;
}

function setVersion(version) {
  fs.writeFileSync(path.join(platformDir, 'VERSION'), `${version}\n`);
  for (const file of VERSIONED_PACKAGES) {
    const pkg = readJson(file);
    pkg.version = version;
    writeJson(file, pkg);
  }
  for (const { file, entries } of LOCKFILES) {
    const lock = readJson(file);
    lock.version = version;
    for (const entry of entries) if (lock.packages?.[entry]) lock.packages[entry].version = version;
    writeJson(file, lock);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === '--check') {
    const expected = readVersion();
    const mismatches = collectVersions().filter((item) => item.version !== expected);
    console.log(JSON.stringify({ gate: 'sigi.version', version: expected, ok: mismatches.length === 0, mismatches }, null, 2));
    if (!SEMVER.test(expected) || mismatches.length > 0) process.exitCode = 1;
  } else if (arg && SEMVER.test(arg)) {
    setVersion(arg);
    console.log(`SIGI version set to ${arg}. Update CHANGELOG.md and tag v${arg} after commit.`);
  } else {
    console.error('Uso: bump-version.mjs <MAJOR.MINOR.PATCH> | --check');
    process.exitCode = 2;
  }
}
