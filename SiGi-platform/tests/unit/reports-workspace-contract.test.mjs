import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routeCatalog = await readFile(new URL('../../apps/frontend-sigi/src/app/route-catalog.ts', import.meta.url), 'utf8');
const header = await readFile(new URL('../../apps/frontend-sigi/src/components/ReportsWorkspaceHeader.tsx', import.meta.url), 'utf8');
const reportsPage = await readFile(new URL('../../apps/frontend-sigi/src/pages/ReportsModulePage.tsx', import.meta.url), 'utf8');
const projectsPage = await readFile(new URL('../../apps/frontend-sigi/src/pages/ProjectsModulePage.tsx', import.meta.url), 'utf8');
const filesPage = await readFile(new URL('../../apps/frontend-sigi/src/pages/FilesExplorerPage.tsx', import.meta.url), 'utf8');
const controller = await readFile(new URL('../../apps/sigi-api/src/modules/reports/reports.controller.ts', import.meta.url), 'utf8');

test('reports exposes one module entry with permission-driven operational tabs', () => {
  assert.match(routeCatalog, /path: '\/admin\/reports'[\s\S]*?label: 'Informes'[\s\S]*?permissions: \['reports\.read'\]/);
  for (const label of ['Catálogo', 'Generar', 'Compromisos', 'Historial']) {
    assert.match(header, new RegExp(`label: '${label}'`));
  }
  assert.match(routeCatalog, /path: '\/admin\/reports\/commitments'[\s\S]*?permissions: \['reports\.read'\]/);
  assert.match(routeCatalog, /path: '\/admin\/reports\/detail'[\s\S]*?permissions: \['reports\.read'\]/);
});

test('report detail and filters are reloadable URL state', () => {
  assert.match(reportsPage, /searchParams\.get\('reportId'\)/);
  assert.match(reportsPage, /\/admin\/reports\/detail\?reportId=/);
  assert.match(reportsPage, /Versiones reproducibles/);
  for (const key of ['calendarView', 'commitmentStatus', 'commitmentUrgency', 'framework']) {
    assert.match(reportsPage, new RegExp(`'${key}'`));
  }
});

test('projects and documents navigate contextually into real reports', () => {
  assert.match(projectsPage, /\/admin\/reports\/detail\?reportId=/);
  assert.match(projectsPage, /\/admin\/reports\/history\?projectId=/);
  assert.match(filesPage, /\/admin\/reports\/history\?documentId=/);
});

test('backend remains the authority for report read, workflow and configuration actions', () => {
  assert.match(controller, /@Get\(':id'\)[\s\S]*?@Permissions\('reports\.read'\)/);
  assert.match(controller, /@Post\(':id\/generate'\)[\s\S]*?@Permissions\('reports\.generate'\)/);
  assert.match(controller, /@Post\('templates'\)[\s\S]*?@Permissions\('reports\.templates\.manage'\)/);
  assert.match(controller, /@Post\('mappings'\)[\s\S]*?@Permissions\('reports\.mappings\.manage'\)/);
});
