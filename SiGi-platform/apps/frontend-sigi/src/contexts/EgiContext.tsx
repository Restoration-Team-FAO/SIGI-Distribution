import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { EgiSpace } from '@sigi/domain';
import {
  workspaceApi,
  setActiveAdminEgiId,
} from '../services/api';

const ACTIVE_EGI_STORAGE_KEY = 'sigi.admin.active-egi';
const GLOBAL_VIEW_SCOPE_STORAGE_KEY = 'sigi.admin.global-view-scope';

type EgiContextValue = {
  spaces: EgiSpace[];
  activeEgi: EgiSpace | null;
  activeEgiId: string | null;
  currentUser: {
    email: string | null;
    roles: string[];
    permissions: string[];
    canUseGlobalView: boolean;
  } | null;
  globalViewScope: 'active' | 'global';
  isLoading: boolean;
  error: string | null;
  requiresCreation: boolean;
  refresh: () => Promise<void>;
  selectEgi: (egiId: string) => Promise<void>;
  setGlobalViewScope: (scope: 'active' | 'global') => void;
  createEgi: (input: {
    institutionId?: string | null;
    code: string;
    name: string;
    description?: string | null;
    responsible?: string | null;
    territorialScope?: string | null;
    thematicScope?: string | null;
    visibility?: 'public' | 'institutional' | 'internal';
    status?: 'draft' | 'active' | 'inactive';
  }) => Promise<void>;
};

const EgiContext = createContext<EgiContextValue | null>(null);

export function EgiProvider(props: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [spaces, setSpaces] = useState<EgiSpace[]>([]);
  const [activeEgiId, setActiveEgiId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    email: string | null;
    roles: string[];
    permissions: string[];
    canUseGlobalView: boolean;
  } | null>(null);
  const [globalViewScope, setGlobalViewScopeState] = useState<'active' | 'global'>(() => {
    if (typeof window === 'undefined') {
      return 'active';
    }
    const stored = window.sessionStorage.getItem(GLOBAL_VIEW_SCOPE_STORAGE_KEY);
    return stored === 'global' ? 'global' : 'active';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresCreation, setRequiresCreation] = useState(false);

  async function refresh() {
    if (!props.enabled) {
      setSpaces([]);
      setActiveEgiId(null);
      setCurrentUser(null);
      setGlobalViewScopeState('active');
      setActiveAdminEgiId(null);
      setRequiresCreation(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await workspaceApi.getEgiWorkspace();
      const nextActiveId =
        response.data.activeEgiId ??
        window.localStorage.getItem(ACTIVE_EGI_STORAGE_KEY) ??
        null;
      setSpaces(response.data.spaces);
      setRequiresCreation(response.data.requiresCreation);
      setCurrentUser(response.data.currentUser);
      if (!response.data.currentUser?.canUseGlobalView && globalViewScope === 'global') {
        setGlobalViewScopeState('active');
        window.sessionStorage.setItem(GLOBAL_VIEW_SCOPE_STORAGE_KEY, 'active');
      }
      setActiveEgiId(nextActiveId);
      setActiveAdminEgiId(nextActiveId);
      if (nextActiveId) {
        window.localStorage.setItem(ACTIVE_EGI_STORAGE_KEY, nextActiveId);
      } else {
        window.localStorage.removeItem(ACTIVE_EGI_STORAGE_KEY);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.enabled]);

  async function selectEgi(egiId: string) {
    await workspaceApi.selectActiveEgi(egiId);
    setActiveEgiId(egiId);
    setActiveAdminEgiId(egiId);
    window.localStorage.setItem(ACTIVE_EGI_STORAGE_KEY, egiId);
    await refresh();
  }

  async function createEgi(input: {
    institutionId?: string | null;
    code: string;
    name: string;
    description?: string | null;
    responsible?: string | null;
    territorialScope?: string | null;
    thematicScope?: string | null;
    visibility?: 'public' | 'institutional' | 'internal';
    status?: 'draft' | 'active' | 'inactive';
  }) {
    const response = await workspaceApi.createEgi(input);
    const createdId = response.data.egi.id;
    setActiveEgiId(createdId);
    setActiveAdminEgiId(createdId);
    window.localStorage.setItem(ACTIVE_EGI_STORAGE_KEY, createdId);
    await refresh();
  }

  function setGlobalViewScope(scope: 'active' | 'global') {
    const nextScope =
      scope === 'global' && currentUser?.canUseGlobalView
        ? 'global'
        : 'active';
    setGlobalViewScopeState(nextScope);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(GLOBAL_VIEW_SCOPE_STORAGE_KEY, nextScope);
    }
  }

  const activeEgi = useMemo(
    () => spaces.find((space) => space.id === activeEgiId) ?? null,
    [activeEgiId, spaces],
  );

  const value = useMemo<EgiContextValue>(
    () => ({
      spaces,
      activeEgi,
      activeEgiId,
      currentUser,
      globalViewScope,
      isLoading,
      error,
      requiresCreation,
      refresh,
      selectEgi,
      setGlobalViewScope,
      createEgi,
    }),
    [spaces, activeEgi, activeEgiId, currentUser, globalViewScope, isLoading, error, requiresCreation],
  );

  return <EgiContext.Provider value={value}>{props.children}</EgiContext.Provider>;
}

export function useEgi() {
  const value = useContext(EgiContext);
  if (!value) {
    throw new Error('useEgi must be used within EgiProvider');
  }
  return value;
}
