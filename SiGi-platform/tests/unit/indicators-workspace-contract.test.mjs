import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const controller = await readFile(new URL('../../apps/sigi-api/src/modules/admin/admin.controller.ts', import.meta.url), 'utf8');
const service = await readFile(new URL('../../apps/sigi-api/src/modules/indicators/indicators.service.ts', import.meta.url), 'utf8');
const routeCatalog = await readFile(new URL('../../apps/frontend-sigi/src/app/route-catalog.ts', import.meta.url), 'utf8');

test('authenticated indicator endpoints require the dedicated permission', () => {
  assert.match(controller, /@Get\('indicators'\)[\s\S]*?@Permissions\('indicators\.read'\)/);
  assert.match(controller, /@Get\('indicators\/:code'\)[\s\S]*?@Permissions\('indicators\.read'\)/);
});

test('indicator values are scoped through the project EGI', () => {
  assert.match(service, /INNER JOIN core\.projects p ON p\.id = pi\.project_id/);
  assert.match(service, /p\.egi_id = \$2::uuid/);
});

test('frontend indicator workspace is permission and EGI gated', () => {
  assert.match(routeCatalog, /path: '\/admin\/indicators'/);
  assert.match(routeCatalog, /permissions: \['indicators\.read'\], requireEgi: true/);
});
