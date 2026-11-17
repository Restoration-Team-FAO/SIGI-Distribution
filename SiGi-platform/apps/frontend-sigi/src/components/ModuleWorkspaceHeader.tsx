import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { PageHeader } from '@sigi/ui';
import { useEgi } from '../contexts/EgiContext';
import { canAccessCapability } from '../app/capabilities';
import { canConfigureModule } from '../utils/permissions';

type WorkspaceTab = {
  label: string;
  to: string;
  end?: boolean;
  requiredPermissions?: string[];
  permissionMatch?: 'all' | 'any';
  requiredRoles?: string[];
};

export function ModuleWorkspaceHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  configurationPath?: string;
  configurationPermissions?: string[];
  tabs?: WorkspaceTab[];
}) {
  const { currentUser } = useEgi();
  const location = useLocation();
  const showConfiguration = Boolean(
    props.configurationPath &&
    canConfigureModule(currentUser, props.configurationPermissions),
  );
  const visibleTabs = (props.tabs ?? []).filter(
    (tab) => canAccessCapability({
      permissions: tab.requiredPermissions,
      permissionMatch: tab.permissionMatch,
      roles: tab.requiredRoles,
    }, currentUser),
  );

  return (
    <div className="sigi-module-header">
      <PageHeader
        eyebrow={props.eyebrow}
        title={props.title}
        description={props.description}
        actions={
          <div className="sigi-module-header__actions">
            {props.primaryAction}
            {showConfiguration ? (
              <Link className="sigi-module-header__configuration" to={props.configurationPath!}>
                <span aria-hidden="true">⚙</span> Configuración
              </Link>
            ) : null}
          </div>
        }
      />
      {visibleTabs.length > 0 ? (
        <nav aria-label={`Secciones de ${props.title}`} className="sigi-module-tabs">
          {visibleTabs.map((tab) => {
            const tabUrl = new URL(tab.to, window.location.origin);
            const currentParams = new URLSearchParams(location.search);
            // Activa si coinciden la ruta y los parámetros propios de la pestaña; los parámetros
            // adicionales del estado de la vista (p. ej. ?at= del mapa) no la desactivan.
            const isActive =
              location.pathname === tabUrl.pathname &&
              [...tabUrl.searchParams.entries()].every(([key, value]) => currentParams.get(key) === value);
            return (
            <Link
              key={tab.to}
              to={tab.to}
              role="tab"
              aria-selected={isActive}
              className={`sigi-module-tab${isActive ? ' sigi-module-tab--active' : ''}`}
            >
              {tab.label}
            </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
