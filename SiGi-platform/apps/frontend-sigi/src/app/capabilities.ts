export type PermissionCode = string;
export type RoleCode = string;

export type UiCapability = {
  permissions?: PermissionCode[];
  permissionMatch?: 'all' | 'any';
  roles?: RoleCode[];
  requireEgi?: boolean;
  configuration?: boolean;
};

export type CapabilityUser = {
  permissions: PermissionCode[];
  roles?: RoleCode[];
} | null;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isSuperadmin(user: CapabilityUser) {
  return (user?.roles ?? []).some((role) => normalize(role) === 'superadmin');
}

export function canAccessCapability(capability: UiCapability, user: CapabilityUser) {
  const permissions = capability.permissions ?? [];
  const roles = capability.roles ?? [];
  const hasRules = permissions.length > 0 || roles.length > 0;

  if (!hasRules || isSuperadmin(user)) {
    return true;
  }

  const granted = new Set((user?.permissions ?? []).map(normalize));
  const permissionAllowed = permissions.length > 0
    && (capability.permissionMatch === 'any'
      ? permissions.some((permission) => granted.has(normalize(permission)))
      : permissions.every((permission) => granted.has(normalize(permission))));
  const assignedRoles = new Set((user?.roles ?? []).map(normalize));
  const roleAllowed = roles.some((role) => assignedRoles.has(normalize(role)));

  return permissionAllowed || roleAllowed;
}
