import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('projects expose a separate portfolio and semantic project workspace routes', async () => {
  const routes = await read('apps/frontend-sigi/src/app/route-catalog.ts');
  const workspace = await read('apps/frontend-sigi/src/features/projects/project-workspace.ts');
  assert.match(routes, /path: '\/projects'/);
  assert.match(routes, /path: '\/projects\/:projectId\/\*'/);
  assert.match(routes, /aliases: \['\/admin\/projects'\]/);
  assert.match(workspace, /`\/projects\/\$\{encodeURIComponent\(projectId\)\}`/);
});

test('project forms are action-driven drawers and preserve permission gates', async () => {
  const page = await read('apps/frontend-sigi/src/pages/ProjectsModulePage.tsx');
  const header = await read('apps/frontend-sigi/src/components/ProjectHeader.tsx');
  assert.match(page, /<Drawer open=\{projectFormOpen\}/);
  assert.match(page, /<Drawer open=\{actorFormOpen\}/);
  assert.match(page, /<Drawer open=\{milestoneFormOpen\}/);
  assert.match(page, /<Drawer open=\{polygonFormOpen\}/);
  assert.match(page, /canCreateProjects \?/);
  assert.match(header, /props\.canEdit \?/);
  assert.match(header, /Editar proyecto/);
});

test('portfolio search and project header keep the project as the visual subject', async () => {
  const page = await read('apps/frontend-sigi/src/pages/ProjectsModulePage.tsx');
  const header = await read('apps/frontend-sigi/src/components/ProjectHeader.tsx');
  assert.match(page, /Buscar proyecto/);
  assert.match(page, /<DataTable rows=\{visibleProjects\}/);
  assert.match(header, /className="project-header"/);
  assert.match(header, /Breadcrumb/);
});

test('project summary uses a responsive executive layout with balanced section access', async () => {
  const page = await read('apps/frontend-sigi/src/pages/ProjectsModulePage.tsx');
  const styles = await read('apps/frontend-sigi/src/styles.css');
  assert.match(page, /className="project-summary-layout"/);
  assert.match(page, /className="project-summary-facts"/);
  assert.match(page, /className="project-summary-objective"/);
  assert.match(page, /className="project-section-grid"/);
  assert.match(styles, /grid-template-columns:minmax\(0,7fr\) minmax\(360px,5fr\)/);
  assert.match(styles, /@media \(max-width:1100px\).*\.project-summary-layout \{ grid-template-columns:1fr; \}/);
  assert.match(styles, /@media \(max-width:600px\).*\.project-summary-facts,\.project-section-grid \{ grid-template-columns:1fr; \}/);
});
