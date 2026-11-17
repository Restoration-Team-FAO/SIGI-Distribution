import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), 'utf8');

test('the unique frontend workspace uses the SIGI package name and physical path', async () => {
  const rootPackage = JSON.parse(await read('package.json'));
  const frontendPackage = JSON.parse(await read('apps/frontend-sigi/package.json'));
  assert.ok(rootPackage.workspaces.includes('apps/frontend-sigi'));
  assert.ok(!rootPackage.workspaces.includes('apps/frontend-admin'));
  assert.equal(frontendPackage.name, 'frontend-sigi');
  await access(new URL('apps/frontend-sigi/Dockerfile', rootUrl));
  await assert.rejects(access(new URL('apps/frontend-admin/Dockerfile', rootUrl)));
});

test('Compose and Caddy address only the renamed frontend service', async () => {
  const files = await Promise.all([
    read('docker-compose.yml'),
    read('docker-compose.prod.yml'),
    read('docker-compose.validation.yml'),
    read('demo/docker-compose.demo.yml'),
    read('infra/caddy/Caddyfile'),
    read('infra/caddy/Caddyfile.internal'),
  ]);
  for (const content of files) assert.doesNotMatch(content, /frontend-admin/);
  assert.match(files[1], /^  frontend-sigi:/m);
  assert.match(files[4], /reverse_proxy frontend-sigi:80/);
});

test('new commands and environment variables are primary while legacy aliases remain compatible', async () => {
  const rootPackage = JSON.parse(await read('package.json'));
  const localCompose = await read('docker-compose.yml');
  const playwright = await read('playwright.config.js');
  const smoke = await read('scripts/post-deploy-smoke.mjs');
  assert.ok(rootPackage.scripts['dev:frontend']);
  assert.ok(rootPackage.scripts['typecheck:frontend']);
  assert.ok(rootPackage.scripts['build:frontend']);
  assert.equal(rootPackage.scripts['dev:admin'], 'npm run dev:frontend');
  assert.match(localCompose, /SIGI_FRONTEND_PORT:-\$\{FRONTEND_ADMIN_PORT:-5174\}/);
  assert.match(playwright, /SIGI_E2E_URL \?\? process\.env\.SIGI_E2E_ADMIN_URL/);
  assert.match(smoke, /SIGI_SMOKE_FRONTEND_URL[\s\S]*SIGI_SMOKE_ADMIN_URL/);
});

test('production validators and restore target the renamed service', async () => {
  const operations = await read('scripts/verify-production-operations.mjs');
  const foundation = await read('scripts/verify-reconciled-foundation.mjs');
  const restore = await read('scripts/ops/restore-platform.mjs');
  for (const content of [operations, foundation, restore]) {
    assert.match(content, /frontend-sigi/);
    assert.doesNotMatch(content, /frontend-admin/);
  }
});
