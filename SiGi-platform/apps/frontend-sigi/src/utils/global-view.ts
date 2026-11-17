export type GlobalViewUser = {
  roles?: string[] | null;
  canUseGlobalView?: boolean | null;
};

const GLOBAL_VIEW_ROLES = new Set(['superadmin', 'national_admin']);

export function canUseGlobalView(user: GlobalViewUser | null | undefined) {
  if (user?.canUseGlobalView) {
    return true;
  }

  return (user?.roles ?? []).some((role) => GLOBAL_VIEW_ROLES.has(String(role).trim()));
}
