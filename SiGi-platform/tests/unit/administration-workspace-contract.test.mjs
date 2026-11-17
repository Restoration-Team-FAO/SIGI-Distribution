import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routeCatalog = await readFile(new URL('../../apps/frontend-sigi/src/app/route-catalog.ts', import.meta.url), 'utf8');
const header = await readFile(new URL('../../apps/frontend-sigi/src/components/AdministrationWorkspaceHeader.tsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../../apps/frontend-sigi/src/pages/AdministrationHomePage.tsx', import.meta.url), 'utf8');
const usersPage = await readFile(new URL('../../apps/frontend-sigi/src/pages/UsersPage.tsx', import.meta.url), 'utf8');
const controller = await readFile(new URL('../../apps/sigi-api/src/modules/admin/admin.controller.ts', import.meta.url), 'utf8');

test('administration is exposed as one permission-driven module entry', () => {
  assert.match(routeCatalog, /path: '\/admin\/administration'[\s\S]*?label: 'Administración'[\s\S]*?permissionMatch: 'any'/);
  for (const legacyLabel of ['Mis espacios', 'Instituciones', 'Usuarios', 'Bitácora', 'API']) {
    assert.doesNotMatch(routeCatalog, new RegExp(`label: '${legacyLabel}'`));
  }
  assert.match(routeCatalog, /activeRoutes: \['\/admin\/egi'[\s\S]*?'\/admin\/api'\]/);
});

test('institutional and technical administration remain separated and contextual', () => {
  assert.match(home, /Administración institucional/);
  assert.match(home, /Administración técnica/);
  for (const label of ['Espacios', 'Instituciones', 'Usuarios y roles', 'Conectores', 'Publicaciones', 'Auditoría', 'API']) {
    assert.match(header, new RegExp(`label: '${label}'`));
  }
  assert.match(header, /permissionMatch: 'any'/);
});

test('roles and governance preserve reloadable URL state', () => {
  assert.match(usersPage, /searchParams\.get\('view'\)/);
  assert.match(usersPage, /navigate\('\/admin\/users\?view=roles'\)/);
  assert.match(usersPage, /navigate\('\/admin\/users\?view=governance'\)/);
});

test('backend remains authoritative for administrative resources', () => {
  for (const [route, permission] of [
    ['institutions', 'institutions.read'],
    ['connectors', 'connectors.read'],
    ['publications', 'publications.read'],
    ['users', 'users.read'],
    ['roles', 'roles.read'],
    ['permissions', 'permissions.read'],
    ['audit', 'audit.read'],
  ]) {
    assert.match(controller, new RegExp(`@Get\\('${route}'\\)[\\s\\S]*?@Permissions\\('${permission}'\\)`));
  }
});
