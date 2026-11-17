import type { UiCapability } from './capabilities';

export type IconKey =
  | 'home'
  | 'chart'
  | 'map'
  | 'spark'
  | 'shield'
  | 'grid'
  | 'flow'
  | 'building'
  | 'folder'
  | 'check'
  | 'publish'
  | 'globe'
  | 'plug'
  | 'database'
  | 'code'
  | 'users'
  | 'log'
  | 'search'
  | 'menu'
  | 'chevron'
  | 'logout';

export type RouteAudience = 'authenticated';
export type PermissionMatch = 'all' | 'any';
export type RoutePage =
  | 'home'
  | 'assistant'
  | 'administration-home'
  | 'help'
  | 'egi'
  | 'modules'
  | 'flow'
  | 'institutions'
  | 'connectors'
  | 'projects'
  | 'data-home'
  | 'data-mappings'
  | 'module-configuration'
  | 'geobi'
  | 'geospatial-catalog'
  | 'bi-visualizer'
  | 'sources'
  | 'odoo'
  | 'kobo'
  | 'validations'
  | 'publications'
  | 'api'
  | 'files'
  | 'users'
  | 'audit'
  | 'reports'
  | 'indicators';

export type ModuleConfiguration = 'projects' | 'gis' | 'data' | 'monitoring';

export type RouteCapability = UiCapability & {
  id: string;
  path: string;
  aliases?: string[];
  page: RoutePage;
  title: string;
  subtitle: string;
  audience: RouteAudience;
  domain: string;
  label?: string;
  hint?: string;
  icon?: IconKey;
  navigationOrder?: number;
  exact?: boolean;
  activeRoutes?: string[];
  moduleConfiguration?: ModuleConfiguration;
};

const ADMIN_ROLES = ['superadmin', 'admin', 'national_admin', 'egi_admin'];

export const ADMIN_ROUTES: RouteCapability[] = [
  {
    id: 'root', path: '/', page: 'home', title: 'Inicio',
    subtitle: 'Resumen ejecutivo de tu espacio de trabajo SIGI', audience: 'authenticated', domain: 'Inicio',
  },
  {
    id: 'home', path: '/admin', page: 'home', title: 'Inicio',
    subtitle: 'Resumen ejecutivo de tu espacio de trabajo SIGI', audience: 'authenticated', domain: 'Inicio',
    label: 'Inicio', hint: 'Resumen ejecutivo y estado actual del SIGI.', icon: 'home', navigationOrder: 10, exact: true,
  },
  {
    id: 'assistant', path: '/admin/ask', page: 'assistant', title: 'Ask SIGI',
    subtitle: 'Consultas trazables basadas en evidencia autorizada', audience: 'authenticated', domain: 'Inicio',
    label: 'Ask SIGI', hint: 'Consulta proyectos, indicadores, informes y documentos con fuentes.', icon: 'spark', navigationOrder: 20,
    permissions: ['assistant.use'], requireEgi: true,
  },
  {
    id: 'help', path: '/admin/help', aliases: ['/admin/ayuda', '/admin/capacitacion'], page: 'help', title: 'Centro de Ayuda',
    subtitle: 'Manual, capacitación y preguntas frecuentes', audience: 'authenticated', domain: 'Ayuda',
    label: 'Centro de Ayuda', hint: 'Manual y capacitación.', icon: 'search', navigationOrder: 10,
  },
  {
    id: 'administration-home', path: '/admin/administration', page: 'administration-home', title: 'Administración',
    subtitle: 'Gobierno institucional y operación técnica', audience: 'authenticated', domain: 'Administración',
    label: 'Administración', hint: 'EGI, instituciones, accesos, integraciones y trazabilidad.', icon: 'shield', navigationOrder: 10,
    activeRoutes: ['/admin/egi', '/admin/institutions', '/admin/users', '/admin/connectors', '/admin/publications', '/admin/audit', '/admin/api'],
    permissions: ['egi.update', 'institutions.read', 'users.read', 'roles.read', 'permissions.read', 'connectors.read', 'connectors.update', 'connectors.run', 'publications.read', 'audit.read'],
    permissionMatch: 'any', roles: ADMIN_ROLES,
  },
  {
    id: 'egi', path: '/admin/egi', page: 'egi', title: 'Espacios de gestión',
    subtitle: 'Configuración, selección y gobierno del EGI activo', audience: 'authenticated', domain: 'Administración',
  },
  {
    id: 'projects', path: '/projects', aliases: ['/admin/projects'], page: 'projects', title: 'Proyectos',
    subtitle: 'Cartera transversal, resultados y cobertura', audience: 'authenticated', domain: 'Proyectos',
    label: 'Proyectos', hint: 'Cartera, resultados y cobertura transversal.', icon: 'folder', navigationOrder: 10,
    permissions: ['projects.read'], requireEgi: true,
  },
  {
    id: 'projects-config', path: '/projects/config', aliases: ['/admin/projects/config'], page: 'module-configuration', title: 'Configuración de proyectos',
    subtitle: 'Estados, tipos, prioridades, catálogos, permisos y reglas', audience: 'authenticated', domain: 'Proyectos',
    permissions: ['projects.configure'], permissionMatch: 'any', roles: ADMIN_ROLES, requireEgi: true,
    configuration: true, moduleConfiguration: 'projects',
  },
  {
    id: 'project-workspace', path: '/projects/:projectId/*', aliases: ['/admin/projects/:projectId/*'], page: 'projects', title: 'Proyecto',
    subtitle: 'Workspace operativo del proyecto', audience: 'authenticated', domain: 'Proyectos',
    permissions: ['projects.read'], requireEgi: true,
  },
  {
    id: 'map-sigi', path: '/admin/geobi', page: 'geobi', title: 'Mapa',
    subtitle: 'Visor, capas y análisis geoespacial', audience: 'authenticated', domain: 'Mapa',
    label: 'Mapa', hint: 'Explora capas, lugares y análisis geoespacial.', icon: 'map', navigationOrder: 20,
    permissions: ['validations.read', 'connectors.read', 'sources.read', 'imports.read', 'audit.read'], permissionMatch: 'any', requireEgi: true,
  },
  {
    id: 'gis-config', path: '/admin/geobi/config', page: 'module-configuration', title: 'Configuración GIS',
    subtitle: 'Workspaces, estilos, CRS, visibilidad, GeoServer y permisos', audience: 'authenticated', domain: 'Mapa',
    permissions: ['gis.configure', 'publications.publish'], permissionMatch: 'any', roles: ADMIN_ROLES, requireEgi: true,
    configuration: true, moduleConfiguration: 'gis',
  },
  {
    id: 'geo-catalog', path: '/admin/geospatial-catalog', page: 'geospatial-catalog', title: 'Catálogo geográfico',
    subtitle: 'Capas, GeoServer, PostGIS y publicación controlada', audience: 'authenticated', domain: 'Mapa',
    permissions: ['connectors.read'], requireEgi: true,
  },
  {
    id: 'bi-visualizer', path: '/admin/bi-visualizer', page: 'bi-visualizer', title: 'Visualizador BI',
    subtitle: 'Lienzo analítico configurable para lectura ejecutiva', audience: 'authenticated', domain: 'Mapa',
    label: 'Visualizador BI', hint: 'Tablero analítico configurable para gerencia.', icon: 'spark', navigationOrder: 30,
    permissions: ['projects.read', 'institutions.read', 'connectors.read', 'publications.read', 'incidents.read'], permissionMatch: 'any', requireEgi: true,
  },
  {
    id: 'indicators', path: '/admin/indicators', page: 'indicators', title: 'Indicadores',
    subtitle: 'Metas, resultados, territorio y trazabilidad del EGI', audience: 'authenticated', domain: 'Monitoreo',
    label: 'Indicadores', hint: 'Seguimiento de metas y resultados vinculados a proyectos.', icon: 'chart', navigationOrder: 10,
    permissions: ['indicators.read'], requireEgi: true,
  },
  {
    id: 'data-quality', path: '/admin/validations', page: 'validations', title: 'Calidad de datos',
    subtitle: 'Reglas, calidad y observaciones operativas', audience: 'authenticated', domain: 'Datos',
    permissions: ['validations.read'], requireEgi: true,
  },
  {
    id: 'monitoring-config', path: '/admin/monitoring/config', page: 'module-configuration', title: 'Configuración de monitoreo',
    subtitle: 'Reglas, umbrales, asignaciones y parámetros de seguimiento', audience: 'authenticated', domain: 'Datos',
    permissions: ['monitoring.configure', 'validations.assign'], permissionMatch: 'any', roles: ADMIN_ROLES, requireEgi: true,
    configuration: true, moduleConfiguration: 'monitoring',
  },
  {
    id: 'modules', path: '/admin/modules', page: 'modules', title: 'Estado de módulos',
    subtitle: 'Cobertura funcional y estado técnico del ecosistema SIGI', audience: 'authenticated', domain: 'Datos',
    permissions: ['sources.read', 'connectors.read', 'validations.read', 'publications.read', 'incidents.read', 'audit.read'], permissionMatch: 'any', requireEgi: true,
  },
  {
    id: 'flows', path: '/admin/flow', page: 'flow', title: 'Flujos',
    subtitle: 'Recorrido operativo entre fuentes, validación y publicación', audience: 'authenticated', domain: 'Datos',
    permissions: ['sources.read', 'validations.read', 'publications.read', 'incidents.read', 'audit.read'], permissionMatch: 'any', requireEgi: true,
  },
  {
    id: 'data', path: '/admin/data', page: 'data-home', title: 'Datos',
    subtitle: 'Fuentes, importaciones, calidad y trazabilidad', audience: 'authenticated', domain: 'Datos',
    label: 'Datos', hint: 'Fuentes, cargas, pendientes, documentos e historial.', icon: 'database', navigationOrder: 10, exact: true,
    activeRoutes: ['/admin/sources', '/admin/validations', '/admin/files'],
    permissions: ['sources.read', 'imports.read', 'imports.upload', 'validations.read', 'files.read'], permissionMatch: 'any', requireEgi: true,
  },
  {
    id: 'sources', path: '/admin/sources', page: 'sources', title: 'Fuentes de datos',
    subtitle: 'Fuentes, lotes e ingestión de datos trazables', audience: 'authenticated', domain: 'Datos',
    permissions: ['sources.read', 'imports.read', 'imports.upload'], permissionMatch: 'any', requireEgi: true,
  },
  {
    id: 'odoo', path: '/admin/sources/odoo', page: 'odoo', title: 'Conector Odoo',
    subtitle: 'Configuración e interoperabilidad con Odoo', audience: 'authenticated', domain: 'Datos',
    permissions: ['sources.update', 'connectors.update', 'connectors.run'], permissionMatch: 'any', requireEgi: true, configuration: true,
  },
  {
    id: 'kobo', path: '/admin/sources/kobo', page: 'kobo', title: 'Conector Kobo',
    subtitle: 'Configuración operativa y sincronización con KoboToolbox', audience: 'authenticated', domain: 'Datos',
    permissions: ['sources.update', 'connectors.update', 'connectors.run'], permissionMatch: 'any', requireEgi: true, configuration: true,
  },
  {
    id: 'data-config', path: '/admin/data/config', page: 'module-configuration', title: 'Configuración de datos',
    subtitle: 'Tipos de fuente, reglas de calidad, mapeos, conectores y parámetros', audience: 'authenticated', domain: 'Datos',
    permissions: ['data.configure', 'sources.update', 'connectors.update'], permissionMatch: 'any', roles: ADMIN_ROLES, requireEgi: true,
    configuration: true, moduleConfiguration: 'data',
  },
  {
    id: 'data-mappings', path: '/admin/data/mappings', page: 'data-mappings', title: 'Perfiles de mapeo',
    subtitle: 'Versiones y equivalencias reutilizables por fuente', audience: 'authenticated', domain: 'Datos',
    permissions: ['imports.upload'], roles: ADMIN_ROLES, requireEgi: true, configuration: true,
  },
  {
    id: 'publications', path: '/admin/publications', page: 'publications', title: 'Publicaciones',
    subtitle: 'Salidas, canales y puente institucional de difusión', audience: 'authenticated', domain: 'Administración',
    permissions: ['publications.read'], requireEgi: true,
  },
  {
    id: 'files', path: '/admin/files', page: 'files', title: 'Explorador documental',
    subtitle: 'Carpetas, archivos, metadatos y trazabilidad institucional', audience: 'authenticated', domain: 'Datos',
    permissions: ['files.read'], requireEgi: true,
  },
  {
    id: 'reports-home', path: '/admin/reports', page: 'reports', title: 'Informes',
    subtitle: 'Informes nacionales e internacionales trazables', audience: 'authenticated', domain: 'Informes',
    label: 'Informes', hint: 'Catálogo, generación, compromisos e historial.', icon: 'chart', navigationOrder: 10,
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-new', path: '/admin/reports/new', page: 'reports', title: 'Generar informe',
    subtitle: 'Asistente basado en plantillas versionadas', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.create'], requireEgi: true,
  },
  {
    id: 'reports-national', path: '/admin/reports/national', page: 'reports', title: 'Acápite Nacional',
    subtitle: 'Plantilla e informes del acápite nacional', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-regional', path: '/admin/reports/regional', page: 'reports', title: 'Informe Regional',
    subtitle: 'Consolidación regional de restauración', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-btr', path: '/admin/reports/btr', page: 'reports', title: 'BTR',
    subtitle: 'Informe Bienal de Transparencia', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-ndc', path: '/admin/reports/ndc', page: 'reports', title: 'NDC',
    subtitle: 'Contribuciones determinadas a nivel nacional', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-gbf', path: '/admin/reports/gbf-target-2', page: 'reports', title: 'Meta 2',
    subtitle: 'Marco Mundial de Biodiversidad', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-ldn', path: '/admin/reports/ldn', page: 'reports', title: 'LDN',
    subtitle: 'Neutralidad de la degradación de las tierras', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-custom', path: '/admin/reports/custom', page: 'reports', title: 'Informes personalizados',
    subtitle: 'Plantillas institucionales configurables', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-commitments', path: '/admin/reports/commitments', page: 'reports', title: 'Compromisos',
    subtitle: 'Calendario, aportes institucionales y consolidación', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-detail', path: '/admin/reports/detail', page: 'reports', title: 'Detalle de informe',
    subtitle: 'Cobertura, trazabilidad y workflow del informe', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-history', path: '/admin/reports/history', page: 'reports', title: 'Historial y versiones',
    subtitle: 'Instancias reproducibles de informes', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'reports-templates', path: '/admin/reports/templates', page: 'reports', title: 'Plantillas',
    subtitle: 'Configuración versionada de informes', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.templates.manage'], permissionMatch: 'any', roles: ADMIN_ROLES, requireEgi: true, configuration: true,
  },
  {
    id: 'reports-schedules', path: '/admin/reports/schedules', page: 'reports', title: 'Programaciones',
    subtitle: 'Calendario y compromisos de reporte', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.commitments.manage'], permissionMatch: 'any', roles: ADMIN_ROLES, requireEgi: true, configuration: true,
  },
  {
    id: 'reports-config', path: '/admin/reports/config', page: 'reports', title: 'Configuración de informes',
    subtitle: 'Mapeos y perfil metodológico', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.config.manage', 'reports.mappings.manage'], permissionMatch: 'any', roles: ADMIN_ROLES, requireEgi: true, configuration: true,
  },
  {
    id: 'reports-fallback', path: '/admin/reports/*', page: 'reports', title: 'Informes',
    subtitle: 'Informes nacionales e internacionales trazables', audience: 'authenticated', domain: 'Informes',
    permissions: ['reports.read'], requireEgi: true,
  },
  {
    id: 'institutions', path: '/admin/institutions', page: 'institutions', title: 'Instituciones',
    subtitle: 'Gobierno institucional, estados y coordinación operativa', audience: 'authenticated', domain: 'Administración',
    permissions: ['institutions.read'],
  },
  {
    id: 'users', path: '/admin/users', page: 'users', title: 'Usuarios',
    subtitle: 'Accesos, perfiles y permisos administrativos', audience: 'authenticated', domain: 'Administración',
    permissions: ['users.read', 'roles.read', 'permissions.read'], permissionMatch: 'any',
  },
  {
    id: 'users-new', path: '/admin/users/new', page: 'users', title: 'Alta de usuario',
    subtitle: 'Creación dedicada de accesos, alcance institucional y roles', audience: 'authenticated', domain: 'Administración',
    permissions: ['users.create'],
  },
  {
    id: 'audit', path: '/admin/audit', page: 'audit', title: 'Bitácora',
    subtitle: 'Eventos de trazabilidad y auditoría operativa', audience: 'authenticated', domain: 'Administración',
    permissions: ['audit.read'], requireEgi: true,
  },
  {
    id: 'api', path: '/admin/api', page: 'api', title: 'API',
    subtitle: 'Operación técnica y exposición segura de servicios', audience: 'authenticated', domain: 'Administración',
    permissions: ['audit.read'], requireEgi: true,
  },
  {
    id: 'connectors', path: '/admin/connectors', page: 'connectors', title: 'Conectores',
    subtitle: 'Conexiones técnicas, puentes y sincronización', audience: 'authenticated', domain: 'Administración',
    permissions: ['connectors.read', 'connectors.update', 'connectors.run'], permissionMatch: 'any', requireEgi: true,
    configuration: true,
  },
];

export type NavigationSection = {
  title: string;
  items: Array<RouteCapability & { label: string; hint: string; icon: IconKey }>;
};

const NAVIGATION_DOMAINS = [
  { domain: 'Inicio', title: 'Inicio' },
  { domain: 'Proyectos', title: 'Proyectos' },
  { domain: 'Mapa', title: 'Mapa' },
  { domain: 'Monitoreo', title: 'Indicadores' },
  { domain: 'Datos', title: 'Datos' },
  { domain: 'Informes', title: 'Informes' },
  { domain: 'Ayuda', title: 'Ayuda' },
  { domain: 'Administración', title: 'Administración' },
];

export function getAdminNavigationSections(): NavigationSection[] {
  return NAVIGATION_DOMAINS.map(({ domain, title }) => ({
    title,
    items: ADMIN_ROUTES
      .filter((route): route is RouteCapability & { label: string; hint: string; icon: IconKey } =>
        route.domain === domain && Boolean(route.label && route.hint && route.icon && route.navigationOrder),
      )
      .sort((left, right) => (left.navigationOrder ?? 0) - (right.navigationOrder ?? 0)),
  })).filter((section) => section.items.length > 0);
}

export function getRouteCapability(pathname: string): RouteCapability | undefined {
  const exactRoute = ADMIN_ROUTES.find(
    (route) => route.path === pathname || route.aliases?.includes(pathname),
  );
  if (exactRoute) {
    return exactRoute;
  }

  return ADMIN_ROUTES.find((route) =>
    [route.path, ...(route.aliases ?? [])].some((pattern) => routePatternMatches(pattern, pathname)),
  );
}

function routePatternMatches(pattern: string, pathname: string) {
  if (!pattern.includes(':') && !pattern.endsWith('/*')) return false;
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  for (let index = 0; index < patternParts.length; index += 1) {
    const part = patternParts[index];
    if (part === '*') return true;
    if (pathParts[index] === undefined) return false;
    if (!part.startsWith(':') && part !== pathParts[index]) return false;
  }
  return patternParts.length === pathParts.length;
}
