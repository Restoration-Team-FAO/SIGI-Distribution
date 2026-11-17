import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Ask SIGI requires authentication and its dedicated backend permission', async () => {
  const controller = await read('apps/sigi-api/src/modules/assistant/assistant.controller.ts');
  const routeCatalog = await read('apps/frontend-sigi/src/app/route-catalog.ts');
  assert.match(controller, /@UseGuards\(BearerAuthGuard\)/);
  assert.match(controller, /@Controller\('admin\/assistant'\)/);
  assert.match(controller, /@Permissions\('assistant\.use'\)/);
  assert.match(routeCatalog, /path: '\/admin\/ask'[\s\S]*?permissions: \['assistant\.use'\]/);
});

test('Ask SIGI resolves the authorized EGI and only reuses permission-scoped search', async () => {
  const service = await read('apps/sigi-api/src/modules/assistant/assistant.service.ts');
  assert.match(service, /resolveAdminScopeEgiId/);
  assert.match(service, /input\.principal\.subject/);
  assert.match(service, /this\.searchService\.search/);
  assert.match(service, /requestedEgiId: resolvedEgiId/);
  assert.match(service, /mode: 'evidence_retrieval'/);
});

test('audit records a question hash and metadata, never the raw question', async () => {
  const service = await read('apps/sigi-api/src/modules/assistant/assistant.service.ts');
  const auditBlocks = [...service.matchAll(/details:\s*\{([\s\S]*?)\n\s*\},/g)].map((match) => match[1]);
  assert.ok(auditBlocks.length >= 2);
  for (const block of auditBlocks) {
    assert.match(block, /questionHash/);
    assert.match(block, /questionLength/);
    assert.doesNotMatch(block, /(?:^|\s)question[,\s]/);
  }
  assert.match(service, /createHash\('sha256'\)/);
});

test('responses expose navigable citations and explicit retrieval limitations', async () => {
  const service = await read('apps/sigi-api/src/modules/assistant/assistant.service.ts');
  const page = await read('apps/frontend-sigi/src/pages/AskSigiPage.tsx');
  assert.match(service, /citations/);
  assert.match(service, /no utiliza un modelo generativo externo/);
  assert.match(service, /no es un total exhaustivo/);
  assert.match(page, /<Link to=\{citation\.path\}>/);
  assert.match(page, /Límites de esta respuesta/);
  assert.match(page, /Consulta auditada/);
});

test('clean installs and upgrades create the permission with equivalent role grants', async () => {
  const init = await read('infra/postgres/init/017_assistant_permission.sql');
  const migration = await read('infra/postgres/migrations/20260923_assistant_permission.sql');
  const manifest = await read('infra/postgres/migrations/manifest.txt');
  for (const sql of [init, migration]) {
    assert.match(sql, /'assistant\.use'/);
    assert.match(sql, /'superadmin'/);
    assert.match(sql, /'read_consumer'/);
    assert.match(sql, /ON CONFLICT DO NOTHING/);
  }
  assert.match(manifest, /20260923_assistant_permission\.sql/);
});
