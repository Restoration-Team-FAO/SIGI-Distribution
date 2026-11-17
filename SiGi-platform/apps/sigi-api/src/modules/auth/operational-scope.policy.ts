export const GLOBAL_SCOPE_PERMISSION = 'scope.global.read';

export function deriveOperationalScopeCapabilities(input: {
  roles: string[];
  permissions: string[];
}) {
  return {
    canManageAll: input.permissions.includes(GLOBAL_SCOPE_PERMISSION),
    canManageInstitution: input.roles.includes('institution_editor'),
  };
}
