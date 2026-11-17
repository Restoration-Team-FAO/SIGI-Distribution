import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { collectVersions, readVersion } from '../../scripts/release/bump-version.mjs';

test('VERSION is a SemVer string', () => {
  assert.match(readVersion(), /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});

test('every versioned manifest and lockfile matches VERSION', () => {
  const expected = readVersion();
  const mismatches = collectVersions().filter((item) => item.version !== expected);
  assert.deepEqual(mismatches, []);
});

test('CHANGELOG documents the current version', () => {
  const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(changelog, new RegExp(`^## \\[${readVersion().replace(/\./g, '\\.')}\\]`, 'm'));
});
