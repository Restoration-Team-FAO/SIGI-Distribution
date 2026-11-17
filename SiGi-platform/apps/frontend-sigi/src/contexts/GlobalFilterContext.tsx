import type { Project } from '@sigi/domain';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { canAccessCapability } from '../app/capabilities';
import { workspaceApi } from '../services/api';
import { useEgi } from './EgiContext';

const PROJECT_QUERY_KEY = 'projectId';

/**
 * Routes where projectId already has an implemented, user-visible meaning.
 * Keep this allowlist narrow: a URL parameter must never imply a filter that
 * the destination does not actually apply.
 */
export function supportsGlobalProjectFilter(pathname: string) {
  return pathname === '/projects'
    || pathname.startsWith('/projects/')
    || pathname === '/admin/projects'
    || pathname === '/admin/geobi'
    || pathname === '/admin/reports/history';
}

export function pathWithGlobalProjectFilter(path: string, projectId: string | null) {
  const [pathname, rawSearch = ''] = path.split('?');
  if (!supportsGlobalProjectFilter(pathname) || !projectId) {
    return path;
  }

  const params = new URLSearchParams(rawSearch);
  if (!params.has(PROJECT_QUERY_KEY)) {
    params.set(PROJECT_QUERY_KEY, projectId);
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

type GlobalFilterContextValue = {
  projectId: string | null;
  selectedProject: Project | null;
  projects: Project[];
  isSupportedRoute: boolean;
  isLoading: boolean;
  error: string | null;
  setProjectId: (projectId: string | null) => void;
  contextualPath: (path: string) => string;
};

const GlobalFilterContext = createContext<GlobalFilterContextValue | null>(null);

export function GlobalFilterProvider(props: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeEgiId, currentUser, globalViewScope } = useEgi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSupportedRoute = supportsGlobalProjectFilter(location.pathname);
  const canReadProjects = canAccessCapability({ permissions: ['projects.read'] }, currentUser);
  const routeProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;
  const projectId = isSupportedRoute
    ? routeProjectId ? decodeURIComponent(routeProjectId) : new URLSearchParams(location.search).get(PROJECT_QUERY_KEY)
    : null;

  const setProjectId = useCallback((nextProjectId: string | null) => {
    if (!supportsGlobalProjectFilter(location.pathname)) {
      return;
    }
    if (location.pathname.startsWith('/projects/')) {
      navigate(nextProjectId ? `/projects/${encodeURIComponent(nextProjectId)}` : '/projects', { replace: true });
      return;
    }
    const params = new URLSearchParams(location.search);
    if (nextProjectId) {
      params.set(PROJECT_QUERY_KEY, nextProjectId);
    } else {
      params.delete(PROJECT_QUERY_KEY);
    }
    const search = params.toString();
    navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    let cancelled = false;
    if (!activeEgiId || !canReadProjects) {
      setProjects([]);
      setError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError(null);
    void workspaceApi.getProjects({ scope: globalViewScope })
      .then((response) => {
        if (!cancelled) {
          setProjects(response.data.projects);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setProjects([]);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEgiId, canReadProjects, globalViewScope]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );
  const contextualPath = useCallback(
    (path: string) => pathWithGlobalProjectFilter(path, projectId),
    [projectId],
  );
  const value = useMemo<GlobalFilterContextValue>(() => ({
    projectId,
    selectedProject,
    projects,
    isSupportedRoute,
    isLoading,
    error,
    setProjectId,
    contextualPath,
  }), [contextualPath, error, isLoading, isSupportedRoute, projectId, projects, selectedProject, setProjectId]);

  return <GlobalFilterContext.Provider value={value}>{props.children}</GlobalFilterContext.Provider>;
}

export function useGlobalFilters() {
  const value = useContext(GlobalFilterContext);
  if (!value) {
    throw new Error('useGlobalFilters must be used within GlobalFilterProvider');
  }
  return value;
}
