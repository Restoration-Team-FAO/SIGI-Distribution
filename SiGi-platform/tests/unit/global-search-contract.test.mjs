import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('global search is authenticated and resolves the requested EGI scope', async () => {
  const controller = await read('apps/sigi-api/src/modules/search/search.controller.ts');
  const service = await read('apps/sigi-api/src/modules/search/search.service.ts');
  assert.match(controller, /@UseGuards\(BearerAuthGuard\)/);
  assert.match(controller, /@Controller\('admin\/search'\)/);
  assert.match(service, /resolveAdminScopeEgiId/);
  assert.match(service, /input\.principal\.subject/);
});

test('each result family is gated by its backend read permission', async () => {
  const service = await read('apps/sigi-api/src/modules/search/search.service.ts');
  for (const permission of ['projects.read', 'indicators.read', 'reports.read', 'files.read']) {
    assert.ok(service.includes(`permissions.has('${permission}')`));
  }
  assert.match(service, /input\.scope === 'active' && egiId/);
  assert.match(service, /omittedTypes\.push\('report'\)/);
  assert.match(service, /omittedTypes\.push\('file'\)/);
});

test('search queries are parameterized and results only target authenticated routes', async () => {
  const service = await read('apps/sigi-api/src/modules/search/search.service.ts');
  assert.match(service, /ILIKE '%' \|\| \$2::text \|\| '%'/);
  assert.match(service, /\/admin\/projects\?view=summary/);
  assert.match(service, /\/admin\/indicators\?view=detail/);
  assert.match(service, /\/admin\/reports\/detail/);
  assert.match(service, /\/admin\/files\?q=/);
  assert.doesNotMatch(service, /[`'"]\/(?:dashboard|projects)(?:\?|[`'"])/);
});

test('the AppShell exposes debounced search and documents consume reloadable deep links', async () => {
  const shell = await read('apps/frontend-sigi/src/app/AppShell.tsx');
  const search = await read('apps/frontend-sigi/src/components/GlobalSearch.tsx');
  const files = await read('apps/frontend-sigi/src/pages/FilesExplorerPage.tsx');
  assert.match(shell, /<GlobalSearch onNavigate=\{handleNavigate\}/);
  assert.match(search, /window\.setTimeout/);
  assert.match(search, /globalViewScope/);
  assert.match(search, /canAccessCapability/);
  assert.match(files, /searchParams\.get\('fileId'\)/);
  assert.match(files, /searchParams\.get\('q'\)/);
});
