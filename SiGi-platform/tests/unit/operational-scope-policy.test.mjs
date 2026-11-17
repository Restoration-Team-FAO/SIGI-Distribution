import test from 'node:test';
import assert from 'node:assert/strict';

const {
  GLOBAL_SCOPE_PERMISSION,
  deriveOperationalScopeCapabilities,
} = await import('../../apps/sigi-api/dist/modules/auth/operational-scope.policy.js');

test('global scope requires the explicit permission instead of a technical role', () => {
  assert.equal(GLOBAL_SCOPE_PERMISSION, 'scope.global.read');
  assert.deepEqual(
    deriveOperationalScopeCapabilities({
      roles: ['technical_integration'],
      permissions: ['egi.read'],
    }),
    { canManageAll: false, canManageInstitution: false },
  );
});

test('global and institution capabilities are independent', () => {
  assert.deepEqual(
    deriveOperationalScopeCapabilities({
      roles: ['institution_editor'],
      permissions: ['scope.global.read'],
    }),
    { canManageAll: true, canManageInstitution: true },
  );
  assert.deepEqual(
    deriveOperationalScopeCapabilities({
      roles: ['superadmin'],
      permissions: [],
    }),
    { canManageAll: false, canManageInstitution: false },
  );
});
