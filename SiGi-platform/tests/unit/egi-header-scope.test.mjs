import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// V2-05 — el encabezado X-SIGI-EGI-ID no otorga acceso: las escrituras de proyectos (planificación,
// finanzas, ciclo de vida), importaciones, datasets y archivos solo operan sobre EGI autorizados.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const admin = await import('../../apps/sigi-api/dist/modules/admin/admin.service.js');

function serviceWith({ canManageAll = false, spaces, preference = null }) {
  const service = Object.create(admin.AdminService.prototype);
  service.getEgiAccessContext = async () => ({ userId: 'u1', institutionId: 'inst-a', canManageAll, canManageInstitution: false });
  service.listAccessibleEgis = async () => spaces;
  service.getActiveEgiPreference = async () => preference;
  service.upsertActiveEgiPreference = async () => undefined;
  return service;
}

test('a header naming an EGI the actor does not belong to is rejected', async () => {
  const service = serviceWith({ spaces: [{ id: 'egi-a' }, { id: 'egi-b' }] });
  await assert.rejects(service.resolveAdminScopeEgiId('editor@sigi.local', 'egi-foreign'), (error) => error.getStatus?.() === 403);
  assert.equal(await service.resolveAdminScopeEgiId('editor@sigi.local', 'egi-b'), 'egi-b');
});

test('without header the actor active EGI is used, never an unscoped query', async () => {
  assert.equal(await serviceWith({ spaces: [{ id: 'egi-a' }, { id: 'egi-b' }], preference: 'egi-a' }).resolveAdminScopeEgiId('editor@sigi.local', null), 'egi-a');
  assert.equal(await serviceWith({ spaces: [{ id: 'egi-only' }] }).resolveAdminScopeEgiId('editor@sigi.local', null), 'egi-only');
  await assert.rejects(serviceWith({ spaces: [] }).resolveAdminScopeEgiId('editor@sigi.local', null), (error) => error.getStatus?.() === 403);
});

test('controllers never forward the raw header to project, import or dataset services', () => {
  const adminController = read('apps/sigi-api/src/modules/admin/admin.controller.ts');
  assert.doesNotMatch(
    adminController,
    /this\.(projectsService|importsService)\.\w+\([^;]{0,400}?getRequestedEgiId\(request\)/s,
  );
  const datasets = read('apps/sigi-api/src/modules/datasets/datasets.controller.ts');
  assert.doesNotMatch(datasets, /datasetsService\.\w+\([^;]{0,200}?getRequestedEgiId\(request\)/s);
  const files = read('apps/sigi-api/src/modules/files/files.service.ts');
  // solo getAuthorizedEgiId() lee el encabezado sin validar, y lo valida acto seguido
  assert.equal((files.match(/this\.getRequiredEgiId\(request\)/g) ?? []).length, 1);
  assert.match(files, /assertEgiAccess\(principal, egiId\)/);
});
