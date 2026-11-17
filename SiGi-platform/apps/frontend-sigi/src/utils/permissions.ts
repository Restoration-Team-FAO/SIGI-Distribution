export type PermissionAwareUser = {
  roles?: string[] | null;
  permissions?: string[] | null;
} | null | undefined;

function isSuperadmin(user: PermissionAwareUser) {
  return (user?.roles ?? []).some(
    (candidate) => String(candidate).trim().toLowerCase() === 'superadmin',
  );
}

export function hasPermission(user: PermissionAwareUser, permission: string) {
  if (isSuperadmin(user)) {
    return true;
  }
  const normalized = permission.trim().toLowerCase();
  return (user?.permissions ?? []).some(
    (candidate) => String(candidate).trim().toLowerCase() === normalized,
  );
}

export function hasEveryPermission(user: PermissionAwareUser, permissions: string[]) {
  return permissions.every((permission) => hasPermission(user, permission));
}

export function hasSomePermission(user: PermissionAwareUser, permissions: string[]) {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasRole(user: PermissionAwareUser, role: string) {
  if (role.trim().toLowerCase() === 'superadmin' && isSuperadmin(user)) {
    return true;
  }
  const normalized = role.trim().toLowerCase();
  return (user?.roles ?? []).some(
    (candidate) => String(candidate).trim().toLowerCase() === normalized,
  );
}

export function canConfigureModule(
  user: PermissionAwareUser,
  equivalentPermissions: string[] = [],
) {
  const administrativeRoles = ['superadmin', 'admin', 'national_admin', 'egi_admin'];
  return (
    administrativeRoles.some((role) => hasRole(user, role)) ||
    hasSomePermission(user, equivalentPermissions)
  );
}
