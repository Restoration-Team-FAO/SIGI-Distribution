import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('global project context is URL based and independent from EGI selection', async () => {
  const context = await read('apps/frontend-sigi/src/contexts/GlobalFilterContext.tsx');
  const workspace = await read('apps/frontend-sigi/src/app/WorkspaceApp.tsx');
  assert.match(context, /const PROJECT_QUERY_KEY = 'projectId'/);
  assert.match(context, /new URLSearchParams\(location\.search\)/);
  assert.doesNotMatch(context, /localStorage|sessionStorage/);
  assert.match(workspace, /<EgiProvider enabled>[\s\S]*<GlobalFilterProvider>/);
});

test('project filter only appears where projectId has implemented semantics', async () => {
  const context = await read('apps/frontend-sigi/src/contexts/GlobalFilterContext.tsx');
  assert.match(context, /pathname === '\/admin\/projects'/);
  assert.match(context, /pathname === '\/admin\/geobi'/);
  assert.match(context, /pathname === '\/admin\/reports\/history'/);
  assert.doesNotMatch(context, /pathname === '\/admin\/indicators'/);
  assert.doesNotMatch(context, /pathname === '\/admin\/data'/);
});

test('global project options use scoped API data and preserve destination query parameters', async () => {
  const context = await read('apps/frontend-sigi/src/contexts/GlobalFilterContext.tsx');
  assert.match(context, /workspaceApi\.getProjects\(\{ scope: globalViewScope \}\)/);
  assert.match(context, /canAccessCapability\(\{ permissions: \['projects\.read'\] \}/);
  assert.match(context, /if \(!params\.has\(PROJECT_QUERY_KEY\)\)/);
  assert.match(context, /navigate\(`\$\{location\.pathname\}/);
});
