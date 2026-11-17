import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('shared density primitives cover tables, compact lists, activity, status, actions and detail', async () => {
  const component = await read('apps/frontend-sigi/src/components/data-display.tsx');
  for (const name of ['DataTable', 'CompactList', 'ActivityList', 'StatusBadge', 'RowActions', 'DetailDrawer', 'EmptyState']) {
    assert.match(component, new RegExp(`export function ${name}`));
  }
  assert.match(component, /EVENT_LABELS/);
  assert.match(component, /'project\.actor\.created': 'Actor agregado'/);
  assert.match(component, /groupActivities/);
});

test('chronological routes use the centralized ActivityList', async () => {
  for (const path of [
    'apps/frontend-sigi/src/pages/AuditPage.tsx',
    'apps/frontend-sigi/src/pages/ProjectsModulePage.tsx',
    'apps/frontend-sigi/src/pages/IndicatorsModulePage.tsx',
    'apps/frontend-sigi/src/pages/FilesExplorerPage.tsx',
    'apps/frontend-sigi/src/pages/ConnectorsModulePage.tsx',
    'apps/frontend-sigi/src/pages/ReportsModulePage.tsx',
  ]) {
    assert.match(await read(path), /ActivityList/);
  }
});

test('master and workspace collections use dense comparison patterns', async () => {
  const projects = await read('apps/frontend-sigi/src/pages/ProjectsModulePage.tsx');
  const indicators = await read('apps/frontend-sigi/src/pages/IndicatorsModulePage.tsx');
  const users = await read('apps/frontend-sigi/src/pages/UsersPage.tsx');
  const sources = await read('apps/frontend-sigi/src/pages/SourcesPage.tsx');
  const validations = await read('apps/frontend-sigi/src/pages/ValidationsPage.tsx');
  assert.match(projects, /<DataTable rows=\{visibleProjects\}/);
  assert.match(projects, /<CompactList ariaLabel="Actores del proyecto"/);
  assert.match(indicators, /<DataTable rows=\{items\}/);
  assert.match(users, /<DataTable rows=\{visibleUsers\}/);
  assert.match(sources, /<DataTable rows=\{visibleSources\}/);
  assert.match(validations, /<DataTable rows=\{visibleValidations\}/);
});

test('audit and pattern documentation exists before rollout', async () => {
  const audit = await read('docs/frontend/13-ui-density-audit.md');
  const patterns = await read('docs/frontend/14-sigi-ui-patterns.md');
  assert.match(audit, /Auditoría transversal de densidad UI/);
  assert.match(patterns, /## ActivityList/);
  assert.match(patterns, /## DataTable/);
});
