const SIDEBAR_STORAGE_KEY = 'sigi.sidebar.collapsed.v2';

export function readSidebarPreference() {
  if (typeof window === 'undefined') return false;

  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
  }

  return window.matchMedia('(min-width: 721px) and (max-width: 1180px)').matches;
}

export function writeSidebarPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  } catch {
    // The sidebar remains usable for the current session without persistence.
  }
}

export function isMobileSidebar() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
}
