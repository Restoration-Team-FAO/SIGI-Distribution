import { ReactNode, lazy, useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { LoadingState, StateMessage } from '@sigi/ui';
import { useEgi } from '../contexts/EgiContext';
import { ADMIN_ROUTES, RouteCapability } from './route-catalog';
import { PermissionGate } from './PermissionGate';

const AdminHomePage = lazy(() => import('../pages/AdminHomePage').then((module) => ({ default: module.AdminHomePage })));
const AskSigiPage = lazy(() => import('../pages/AskSigiPage').then((module) => ({ default: module.AskSigiPage })));
const AdministrationHomePage = lazy(() => import('../pages/AdministrationHomePage').then((module) => ({ default: module.AdministrationHomePage })));
const ModulesPage = lazy(() => import('../pages/ModulesPage').then((module) => ({ default: module.ModulesPage })));
const FlowPage = lazy(() => import('../pages/FlowPage').then((module) => ({ default: module.FlowPage })));
const InstitutionsPage = lazy(() => import('../pages/InstitutionsPage').then((module) => ({ default: module.InstitutionsPage })));
const SourcesPage = lazy(() => import('../pages/SourcesPage').then((module) => ({ default: module.SourcesPage })));
const DataHomePage = lazy(() => import('../pages/DataHomePage').then((module) => ({ default: module.DataHomePage })));
const DataMappingsPage = lazy(() => import('../pages/DataMappingsPage').then((module) => ({ default: module.DataMappingsPage })));
const OdooConnectorPage = lazy(() => import('../pages/OdooConnectorPage').then((module) => ({ default: module.OdooConnectorPage })));
const KoboConnectorPage = lazy(() => import('../pages/KoboConnectorPage').then((module) => ({ default: module.KoboConnectorPage })));
const ValidationsPage = lazy(() => import('../pages/ValidationsPage').then((module) => ({ default: module.ValidationsPage })));
const PublicationsPage = lazy(() => import('../pages/PublicationsPage').then((module) => ({ default: module.PublicationsPage })));
const ApiOpsPage = lazy(() => import('../pages/ApiOpsPage').then((module) => ({ default: module.ApiOpsPage })));
const UsersPage = lazy(() => import('../pages/UsersPage').then((module) => ({ default: module.UsersPage })));
const AuditPage = lazy(() => import('../pages/AuditPage').then((module) => ({ default: module.AuditPage })));
const ProjectsModulePage = lazy(() => import('../pages/ProjectsModulePage').then((module) => ({ default: module.ProjectsModulePage })));
const GeoBiModulePage = lazy(() => import('../pages/GeoBiModulePage').then((module) => ({ default: module.GeoBiModulePage })));
const ConnectorsModulePage = lazy(() => import('../pages/ConnectorsModulePage').then((module) => ({ default: module.ConnectorsModulePage })));
const GeospatialCatalogPage = lazy(() => import('../pages/GeospatialCatalogPage').then((module) => ({ default: module.GeospatialCatalogPage })));
const BiVisualizerPage = lazy(() => import('../pages/BiVisualizerPage').then((module) => ({ default: module.BiVisualizerPage })));
const FilesExplorerPage = lazy(() => import('../pages/FilesExplorerPage').then((module) => ({ default: module.FilesExplorerPage })));
const EgiSpacesPage = lazy(() => import('../pages/EgiSpacesPage').then((module) => ({ default: module.EgiSpacesPage })));
const HelpCenterPage = lazy(() => import('../pages/HelpCenterPage').then((module) => ({ default: module.HelpCenterPage })));
const ReportsModulePage = lazy(() => import('../pages/ReportsModulePage').then((module) => ({ default: module.ReportsModulePage })));
const IndicatorsModulePage = lazy(() => import('../pages/IndicatorsModulePage').then((module) => ({ default: module.IndicatorsModulePage })));
const ModuleConfigurationPage = lazy(() => import('../pages/ModuleConfigurationPage').then((module) => ({ default: module.ModuleConfigurationPage })));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));

function pageFor(route: RouteCapability) {
  switch (route.page) {
    case 'home': return <AdminHomePage />;
    case 'assistant': return <AskSigiPage />;
    case 'administration-home': return <AdministrationHomePage />;
    case 'help': return <HelpCenterPage />;
    case 'egi': return <EgiSpacesPage />;
    case 'modules': return <ModulesPage />;
    case 'flow': return <FlowPage />;
    case 'institutions': return <InstitutionsPage />;
    case 'connectors': return <ConnectorsModulePage />;
    case 'projects': return <ProjectsModulePage />;
    case 'data-home': return <DataHomePage />;
    case 'data-mappings': return <DataMappingsPage />;
    case 'module-configuration': return <ModuleConfigurationPage module={route.moduleConfiguration!} />;
    case 'geobi': return <GeoBiModulePage />;
    case 'geospatial-catalog': return <GeospatialCatalogPage />;
    case 'bi-visualizer': return <BiVisualizerPage />;
    case 'sources': return <SourcesPage mode="general" />;
    case 'odoo': return <OdooConnectorPage />;
    case 'kobo': return <KoboConnectorPage />;
    case 'validations': return <ValidationsPage />;
    case 'publications': return <PublicationsPage />;
    case 'api': return <ApiOpsPage />;
    case 'files': return <FilesExplorerPage />;
    case 'users': return <UsersPage mode={route.id === 'users-new' ? 'create' : 'list'} />;
    case 'audit': return <AuditPage />;
    case 'reports': return <ReportsModulePage />;
    case 'indicators': return <IndicatorsModulePage />;
  }
}

function CapabilityRouteGate(props: { route: RouteCapability; children: ReactNode }) {
  const navigate = useNavigate();
  const { activeEgiId, currentUser, requiresCreation, isLoading } = useEgi();

  useEffect(() => {
    if (props.route.requireEgi && !isLoading && !activeEgiId) {
      navigate('/admin/egi', { replace: true });
    }
  }, [activeEgiId, isLoading, navigate, props.route.requireEgi]);

  if (isLoading) {
    return <LoadingState message="Cargando permisos y contexto del módulo…" />;
  }

  if (props.route.requireEgi && !activeEgiId) {
    return (
      <StateMessage
        title="EGI requerido"
        description="Para utilizar esta funcionalidad primero debes crear o seleccionar un Espacio de Gestión de Información."
        action={<button type="button" className="sigi-ui-button sigi-ui-button--primary" onClick={() => navigate('/admin/egi')}>{requiresCreation ? 'Crear primer EGI' : 'Ir a mis espacios'}</button>}
      />
    );
  }

  return (
    <PermissionGate
      capability={props.route}
      user={currentUser}
      description="Tu sesión no tiene los permisos necesarios para utilizar esta función del SIGI."
    >
      {props.children}
    </PermissionGate>
  );
}

function routeElement(route: RouteCapability) {
  const page = pageFor(route);
  if (!route.requireEgi && !route.permissions?.length && !route.roles?.length) {
    return page;
  }
  return <CapabilityRouteGate route={route}>{page}</CapabilityRouteGate>;
}

export function AppRouter() {
  return (
    <Routes>
      {ADMIN_ROUTES.flatMap((route) => [route.path, ...(route.aliases ?? [])].map((path) => (
        <Route key={`${route.id}:${path}`} path={path} element={routeElement(route)} />
      )))}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
