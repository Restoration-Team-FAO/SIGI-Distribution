import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routeCatalog = await readFile(new URL('../../apps/frontend-sigi/src/app/route-catalog.ts', import.meta.url), 'utf8');
const header = await readFile(new URL('../../apps/frontend-sigi/src/components/DataWorkspaceHeader.tsx', import.meta.url), 'utf8');
const sourcesPage = await readFile(new URL('../../apps/frontend-sigi/src/pages/SourcesPage.tsx', import.meta.url), 'utf8');
const controller = await readFile(new URL('../../apps/sigi-api/src/modules/admin/admin.controller.ts', import.meta.url), 'utf8');

test('data workspace exposes one permission-driven operational entry', () => {
  assert.match(routeCatalog, /path: '\/admin\/data'[\s\S]*?permissions: \['sources\.read', 'imports\.read', 'imports\.upload', 'validations\.read', 'files\.read'\][\s\S]*?permissionMatch: 'any'/);
  for (const label of ['Fuentes', 'Importar', 'Calidad', 'Pendientes', 'Documentos', 'Historial']) {
    assert.match(header, new RegExp(`label: '${label}'`));
  }
});

test('data views preserve deep links and keep connector administration out of the operational source view', () => {
  assert.match(sourcesPage, /type DataView = 'sources' \| 'imports' \| 'pending' \| 'history'/);
  assert.match(sourcesPage, /searchParams\.get\('view'\)/);
  assert.doesNotMatch(sourcesPage, /dataView === 'sources'[\s\S]{0,300}Registro de conectores/);
  assert.match(routeCatalog, /path: '\/admin\/connectors'[\s\S]*?configuration: true/);
});

test('mapping configuration has frontend and backend authorization boundaries', () => {
  assert.match(routeCatalog, /path: '\/admin\/data\/mappings'[\s\S]*?roles: ADMIN_ROLES[\s\S]*?configuration: true/);
  assert.match(controller, /@Post\('imports\/mapping-profiles'\)[\s\S]*?@Roles\([\s\S]*?\)[\s\S]*?@Permissions\('imports\.upload'\)/);
  assert.match(controller, /@Patch\('imports\/mapping-profiles\/:id'\)[\s\S]*?@Roles\([\s\S]*?\)[\s\S]*?@Permissions\('imports\.upload'\)/);
});
