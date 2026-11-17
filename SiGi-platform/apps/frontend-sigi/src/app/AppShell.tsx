import { Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEgi } from '../contexts/EgiContext';
import { useGlobalFilters } from '../contexts/GlobalFilterContext';
import { getAdminSessionUser } from '../services/api';
import { GlobalSearch } from '../components/GlobalSearch';
import { AppRouter } from './AppRouter';
import { canAccessCapability } from './capabilities';
import {
  getAdminNavigationSections,
  getRouteCapability,
  IconKey,
  RouteCapability,
} from './route-catalog';
import { isMobileSidebar, readSidebarPreference, writeSidebarPreference } from './sidebar-preference';

type MenuItem = RouteCapability & { label: string; hint: string; icon: IconKey };

const uxMenuSections = getAdminNavigationSections();

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesMenuItem(item: MenuItem, pathname: string) {
  if (item.activeRoutes?.includes(pathname)) {
    return true;
  }
  if (item.exact) {
    return pathname === item.path;
  }
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

function canAccessMenuItem(
  item: MenuItem,
  currentUser: { permissions: string[]; roles?: string[] } | null,
) {
  return canAccessCapability(item, currentUser);
}

export function renderIcon(icon: IconKey) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (icon) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...props}>
          <path d="M4 19h16" />
          <path d="M7 15v-4" />
          <path d="M12 19V9" />
          <path d="M17 19v-7" />
        </svg>
      );
    case 'map':
      return (
        <svg {...props}>
          <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
          <path d="M9 4v14" />
          <path d="M15 6v14" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...props}>
          <path d="M12 3v5" />
          <path d="M12 16v5" />
          <path d="M3 12h5" />
          <path d="M16 12h5" />
          <path d="m6 6 3 3" />
          <path d="m15 15 3 3" />
          <path d="m6 18 3-3" />
          <path d="m15 9 3-3" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...props}>
          <path d="M12 3 5.5 5.5v6.2c0 4.1 2.6 7.8 6.5 9.3 3.9-1.5 6.5-5.2 6.5-9.3V5.5z" />
          <path d="m9.5 12 1.7 1.7L15 10" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...props}>
          <rect x="4" y="4" width="6" height="6" rx="1.2" />
          <rect x="14" y="4" width="6" height="6" rx="1.2" />
          <rect x="4" y="14" width="6" height="6" rx="1.2" />
          <rect x="14" y="14" width="6" height="6" rx="1.2" />
        </svg>
      );
    case 'flow':
      return (
        <svg {...props}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="M8 6h8" />
          <path d="m7.5 7.5 3.2 7" />
          <path d="m16.5 7.5-3.2 7" />
        </svg>
      );
    case 'building':
      return (
        <svg {...props}>
          <path d="M5 20V6l7-3 7 3v14" />
          <path d="M9 20v-4h6v4" />
          <path d="M9 9h.01" />
          <path d="M15 9h.01" />
          <path d="M9 12h.01" />
          <path d="M15 12h.01" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...props}>
          <path d="M3.5 7.5h5l2 2h10v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
          <path d="M3.5 7.5v-1a2 2 0 0 1 2-2h4l2 2" />
        </svg>
      );
    case 'check':
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="m8.5 12 2.2 2.2 4.8-4.8" />
        </svg>
      );
    case 'publish':
      return (
        <svg {...props}>
          <path d="M12 16V6" />
          <path d="m8 10 4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.8 12h16.4" />
          <path d="M12 3.8a13.5 13.5 0 0 1 0 16.4" />
          <path d="M12 3.8a13.5 13.5 0 0 0 0 16.4" />
        </svg>
      );
    case 'plug':
      return (
        <svg {...props}>
          <path d="M8 8V4" />
          <path d="M16 8V4" />
          <path d="M7 10h10v2a5 5 0 0 1-5 5 5 5 0 0 1-5-5z" />
          <path d="M12 17v4" />
        </svg>
      );
    case 'database':
      return (
        <svg {...props}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      );
    case 'code':
      return (
        <svg {...props}>
          <path d="m8.5 8-4 4 4 4" />
          <path d="m15.5 8 4 4-4 4" />
          <path d="m13.5 5-3 14" />
        </svg>
      );
    case 'users':
      return (
        <svg {...props}>
          <path d="M16.5 19v-1.2a3.3 3.3 0 0 0-3.3-3.3H8.8a3.3 3.3 0 0 0-3.3 3.3V19" />
          <circle cx="11" cy="8" r="3" />
          <path d="M19.5 19v-1a2.8 2.8 0 0 0-2.2-2.7" />
          <path d="M16.6 5.5a2.8 2.8 0 0 1 0 5.4" />
        </svg>
      );
    case 'log':
      return (
        <svg {...props}>
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M15 4v4h4" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...props}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...props}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...props}>
          <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
          <path d="M14 8l4 4-4 4" />
          <path d="M18 12H9" />
        </svg>
      );
    default:
      return null;
  }
}

export function AppShell(props: {
  sessionUser: ReturnType<typeof getAdminSessionUser>;
  onLogout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeEgi, activeEgiId, currentUser, globalViewScope, isLoading: egiLoading } = useEgi();
  const globalFilters = useGlobalFilters();
  const [collapsed, setCollapsed] = useState(readSidebarPreference);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const activeMeta = useMemo(() => {
    const route = getRouteCapability(location.pathname);
    return route
      ? { title: route.title, subtitle: route.subtitle, domain: route.domain }
      : { title: 'Página no encontrada', subtitle: 'La ruta solicitada no está registrada en SIGI', domain: 'Inicio' };
  }, [location.pathname]);
  const lastUpdated = new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
  const filteredSections = useMemo(() => {
    const query = normalizeText(search.trim());
    if (!query) {
      return uxMenuSections;
    }

    return uxMenuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const haystack = normalizeText(`${item.label} ${item.hint} ${section.title}`);
          return haystack.includes(query);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [search]);
  const visibleSections = useMemo(
    () =>
      filteredSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => canAccessMenuItem(item, currentUser)),
        }))
        .filter((section) => section.items.length > 0),
    [filteredSections, currentUser],
  );
  const sessionLabel = props.sessionUser?.displayName ?? props.sessionUser?.email ?? 'Sesion activa';

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    writeSidebarPreference(collapsed);
  }, [collapsed]);

  function handleNavigate(path: string) {
    navigate(globalFilters.contextualPath(path));
    setMobileMenuOpen(false);
  }

  function handleSidebarToggle() {
    if (isMobileSidebar()) {
      setMobileMenuOpen(false);
      return;
    }
    setCollapsed((current) => !current);
  }

  return (
    <div className={`sigi-shell sigi-shell--app${collapsed ? ' sigi-shell--collapsed' : ''}`}>
      <div
        className={`sigi-sidebar-backdrop${mobileMenuOpen ? ' sigi-sidebar-backdrop--open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden={!mobileMenuOpen}
      />

      <aside className={`sigi-sidebar${mobileMenuOpen ? ' sigi-sidebar--mobile-open' : ''}`} aria-label="Menú principal del SIGI">
        <div className="sigi-brand">
          <div className="sigi-brand__topline">
            <img className="sigi-brand__symbol" src="/brand/sigi-symbol-transparent.png" alt="SIGI" width={32} height={32} />
            <button type="button" className="sigi-sidebar__collapse" onClick={handleSidebarToggle} aria-label={mobileMenuOpen ? 'Cerrar menú lateral' : collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'} title={mobileMenuOpen ? 'Cerrar menú' : collapsed ? 'Expandir menú' : 'Colapsar menú'}>
              <span className="sigi-sidebar__collapse-icon">{renderIcon('chevron')}</span>
              <span className="sigi-sidebar__collapse-label">{mobileMenuOpen ? 'Cerrar' : collapsed ? 'Expandir' : 'Colapsar'}</span>
            </button>
          </div>
          <div className="sigi-brand__copy">
            <img
              className="sigi-brand__wordmark"
              src="/brand/sigi-wordmark-white.png"
              alt="SIGI — Sistema Integrado de Gestión de la Información"
            />
            {!collapsed ? <p>Información, mapas y gestión institucional.</p> : null}
          </div>
        </div>

        <div className="sigi-sidebar__search">
          <label className="sigi-search" aria-label="Buscar módulo">
            <span className="sigi-search__icon">{renderIcon('search')}</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar módulo..." aria-label="Buscar módulo" />
          </label>
        </div>

        <nav className="sigi-nav" aria-label="Módulos del SIGI">
          {visibleSections.map((group) => (
            <div key={group.title} className={`sigi-nav__section${['Ayuda', 'Administración'].includes(group.title) ? ' sigi-nav__section--separated' : ''}`}>
              {group.items.map((item) => {
                const isActive = matchesMenuItem(item, location.pathname);
                return (
                  <button key={item.id} type="button" title={collapsed ? item.label : undefined} data-tooltip={collapsed ? item.label : undefined} className={`sigi-nav__link${isActive ? ' sigi-nav__link--active' : ''}`} onClick={() => handleNavigate(item.path)} aria-current={isActive ? 'page' : undefined} aria-label={item.label}>
                    <span className="sigi-nav__icon" aria-hidden="true">{renderIcon(item.icon)}</span>
                    <span className="sigi-nav__content">
                      <span className="sigi-nav__link-label">{item.label}</span>
                    </span>
                    <span className="sigi-nav__indicator" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ))}
          {visibleSections.length === 0 ? <div className="sigi-nav__empty">No hay módulos disponibles para tu búsqueda o permisos actuales.</div> : null}
        </nav>

        <footer className="sigi-sidebar__footer">
          {!collapsed ? (
            <div className="sigi-sidebar__session">
              <span className="sigi-sidebar__session-label">Sesión activa</span>
              <strong>{sessionLabel}</strong>
              <span>{activeEgi ? `EGI: ${activeEgi.code}` : 'Sin EGI activo'}</span>
              <span>{globalViewScope === 'global' ? 'Alcance: vista global' : 'Alcance: EGI activo'}</span>
            </div>
          ) : null}
          <button className="sigi-auth__logout sigi-auth__logout--sidebar" type="button" onClick={props.onLogout}>
            <span className="sigi-auth__logout-icon">{renderIcon('logout')}</span>
            {!collapsed ? <span>Cerrar sesión</span> : null}
          </button>
          <span
            className="sigi-sidebar__version"
            title={__SIGI_GIT_SHA__ ? `SIGI v${__SIGI_VERSION__} (${__SIGI_GIT_SHA__.slice(0, 8)})` : `SIGI v${__SIGI_VERSION__}`}
          >
            {collapsed ? `v${__SIGI_VERSION__}` : `SIGI v${__SIGI_VERSION__}`}
          </span>
        </footer>
      </aside>

      <main className="sigi-main">
        <header className="sigi-topbar">
          <div className="sigi-topbar__copy">
            <div className="sigi-topbar__heading-row">
              <button type="button" className="sigi-topbar__menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menú lateral">
                {renderIcon('menu')}
              </button>
              <nav className="sigi-topbar__breadcrumb" aria-label="Migas de pan">
                <button type="button" onClick={() => handleNavigate('/admin')}>Inicio</button>
                {activeMeta.domain !== 'Inicio' ? (
                  <>
                    <span aria-hidden="true">/</span>
                    <span>{activeMeta.domain}</span>
                  </>
                ) : null}
                {activeMeta.title !== 'Inicio' ? (
                  <>
                    <span aria-hidden="true">/</span>
                    <strong aria-current="page">{activeMeta.title}</strong>
                  </>
                ) : null}
              </nav>
            </div>
          </div>
          <div className="sigi-topbar__meta">
            <GlobalSearch onNavigate={handleNavigate} />
            <div className="sigi-topbar__actions">
              <button type="button" aria-label="EGI activo" title={`${activeEgi?.name ?? 'Sin espacio seleccionado'} · Cambiar espacio de gestión`} className="sigi-topbar__context" onClick={() => handleNavigate('/admin/egi')}>
                <span>{globalViewScope === 'global' ? 'Vista global' : 'EGI activo'}</span>
                <strong>{egiLoading ? 'Cargando…' : activeEgi?.code ?? 'Seleccionar EGI'}</strong>
              </button>
              <button type="button" className="sigi-topbar__action" onClick={() => handleNavigate('/admin/help')}>Ayuda</button>
              <details className="sigi-user-menu">
                <summary>{sessionLabel}</summary>
                <div className="sigi-user-menu__panel">
                  <span>{props.sessionUser?.email}</span>
                  <span>Actualizado {lastUpdated}</span>
                  <button type="button" onClick={() => window.location.reload()}>Actualizar datos</button>
                  <button type="button" onClick={props.onLogout}>Cerrar sesión</button>
                </div>
              </details>
            </div>
          </div>
        </header>

        {globalFilters.isSupportedRoute ? (
          <section className="sigi-global-filters" aria-label="Filtros globales">
            <div className="sigi-global-filters__copy">
              <strong>Contexto de trabajo</strong>
              <span>La selección se conserva al cambiar entre módulos compatibles.</span>
            </div>
            <label className="sigi-global-filters__field">
              <span>Proyecto activo</span>
              <select
                value={globalFilters.projectId ?? ''}
                disabled={globalFilters.isLoading || globalFilters.projects.length === 0}
                onChange={(event) => globalFilters.setProjectId(event.target.value || null)}
              >
                <option value="">Todos los proyectos</option>
                {globalFilters.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code ? `${project.code} · ` : ''}{project.title}
                  </option>
                ))}
              </select>
            </label>
            {globalFilters.projectId ? (
              <button type="button" className="sigi-global-filters__clear" onClick={() => globalFilters.setProjectId(null)}>
                Limpiar filtro
              </button>
            ) : null}
            {globalFilters.error ? <span className="sigi-global-filters__error">No fue posible cargar proyectos.</span> : null}
          </section>
        ) : null}

        <Suspense fallback={<RouteLoading />}>
          <AppRouter />
        </Suspense>
      </main>
    </div>
  );
}

function RouteLoading() {
  return <div style={{ padding: 24 }}>Cargando módulo...</div>;
}
