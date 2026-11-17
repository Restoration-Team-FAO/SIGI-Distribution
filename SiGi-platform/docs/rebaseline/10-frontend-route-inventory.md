# Inventario de rutas frontend

Baseline funcional: `ec40482c34a536db1dc9b53c980f9c848baf6fb5`.

Evidencia común: VERIFIED IN CODE en `apps/frontend-country/src/App.tsx:19-54,176-189`
y `apps/frontend-admin/src/App.tsx:112-359,977-1071`. VERIFIED BY EXECUTION:
se solicitaron las 38 rutas declaradas y todas devolvieron HTTP 200 desde los
contenedores (`5173`/`5174`). Una ruta inexistente por app también devolvió 200
por el fallback de Nginx, pero React no tiene catch-all y deja el área de
contenido vacía; por tanto HTTP 200 no equivale a ruta funcional.

## frontend-country — 13 rutas declaradas

| App | Ruta | Página | Menú | Rol esperado | Estado | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| country | `/` | DashboardPage | oculto/entrada | público | REAL | EXECUTION: carga portal |
| country | `/dashboard` | DashboardPage | Inicio | público | REAL | CODE + E2E R1-01 |
| country | `/territory` | TerritoryPage | Resumen regional | público | REAL | CODE; runtime HTTP 200 |
| country | `/restoration` | RestorationMonitoringPage | Monitoreo territorial | público | PARCIAL | CODE; combina API y fixtures |
| country | `/projects` | ProjectsPage | Proyectos | público | REAL | CODE; usa `/projects` |
| country | `/geo-bi` | GeoBiPage | Mapa SIGI | público | PARCIAL | CODE; carga R1 PASS, recorrido GIS profundo no cerrado |
| country | `/integrations` | IntegrationsPage | Captura KoboToolbox | público | PARCIAL | CODE; lectura real, carga deshabilitada |
| country | `/indicators` | IndicatorsPage | Monitoreo satelital | público | REAL | CODE; usa `/indicators` |
| country | `/incidents` | IncidentsPage | Alertas tempranas | público | REAL | CODE; usa `/incidents` |
| country | `/quality` | QualityPage | Calidad de datos | público | HARDCODED | CODE: consume fixtures de calidad |
| country | `/reports` | ReportsPage | Reportes | público | REAL | CODE; usa `/reports` |
| country | `/documents` | DocumentsPage | Documentos | público | REAL | CODE; listado/detalle/download público |
| country | `/administration` | AdministrationInfoPage | Administración | público | UI ONLY | CODE: página informativa |

No existen redirects explícitos. `/` duplica Dashboard. Los deep links funcionan
por `try_files` de Nginx. No existe vista 404 ni ruta `*`.

## frontend-admin — 25 patrones declarados

Todas las rutas se montan detrás del login de la aplicación. `PermissionRouteGate`
aplica visibilidad/entrada en cliente; el backend vuelve a comprobar guards y
permissions para las operaciones API.

| App | Ruta | Página | Menú | Rol/permiso esperado | Estado | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| admin | `/` | AdminHomePage | entrada | sesión | REAL | E2E R1-02/R1-03 |
| admin | `/admin` | AdminHomePage | Inicio | sesión | REAL | CODE |
| admin | `/admin/help` | HelpCenterPage | Ayuda | sesión | REAL | CODE |
| admin | `/admin/ayuda` | HelpCenterPage | deep-link alias | sesión | REAL | CODE |
| admin | `/admin/capacitacion` | HelpCenterPage | deep-link alias | sesión | REAL | CODE |
| admin | `/admin/egi` | EgiSpacesPage | EGI activo | sesión | REAL | CODE + API `/admin/egi` |
| admin | `/admin/modules` | ModulesPage | Módulos | cualquiera de 6 permisos + EGI | REAL | CODE |
| admin | `/admin/flow` | FlowPage | Flujo | cualquiera de 5 permisos + EGI | REAL | CODE |
| admin | `/admin/institutions` | InstitutionsPage | Instituciones | `institutions.read` | REAL | CODE |
| admin | `/admin/connectors` | ConnectorsModulePage | Conectores | `connectors.read` + EGI | REAL | CODE |
| admin | `/admin/projects` | ProjectsModulePage | Proyectos | `projects.read` + EGI | PARCIAL | E2E R1-04/R1-05; catálogo GIS puede fallar |
| admin | `/admin/geobi` | GeoBiModulePage | Geo/BI | cualquiera de 5 permisos + EGI | PARCIAL | E2E R1-06; flujo GIS completo no pasa |
| admin | `/admin/geospatial-catalog` | GeospatialCatalogPage | Catálogo GIS | `connectors.read` + EGI | ROTO | ejecución R1: HTTP 500 con project code null |
| admin | `/admin/bi-visualizer` | BiVisualizerPage | Visualizador BI | cualquiera de 5 permisos + EGI | REAL | CODE |
| admin | `/admin/sources` | SourcesPage | Fuentes | `sources.read` + EGI | REAL | CODE |
| admin | `/admin/sources/odoo` | OdooConnectorPage | Odoo | `sources.read` + EGI | PARCIAL | sistema externo no verificado |
| admin | `/admin/sources/kobo` | KoboConnectorPage | Kobo | `sources.read` + EGI | PARCIAL | E2E R1-09; sistema externo no verificado |
| admin | `/admin/validations` | ValidationsPage | Validaciones | `validations.read` + EGI | REAL | CODE |
| admin | `/admin/publications` | PublicationsPage | Publicaciones | `publications.read` + EGI | REAL | scope smoke PASS |
| admin | `/admin/api` | ApiOpsPage | API | `audit.read` + EGI | REAL | CODE |
| admin | `/admin/files` | FilesExplorerPage | Archivos | `files.read` + EGI | REAL | E2E R1-07 + UAT upload |
| admin | `/admin/users` | UsersPage(list) | Usuarios | `users.read` | PARCIAL | R1-10 PASS; CRUD integral no recorrido |
| admin | `/admin/users/new` | UsersPage(create) | deep link | `users.create` | REAL | CODE |
| admin | `/admin/audit` | AuditPage | Auditoría | `audit.read` + EGI | REAL | CODE; ruta admin protegida |
| admin | `/admin/reports/*` | ReportsModulePage | Reportes | `reports.read` + EGI | PARCIAL | E2E R1-08; edición/historial histórico fallaron |

## Deep links bajo `/admin/reports/*`

El wildcard resuelve en una sola pantalla y selecciona el workspace mediante
`location.pathname` (`ReportsModulePage.tsx:37-53,180`): `/admin/reports`,
`/new`, `/national`, `/regional`, `/btr`, `/ndc`, `/gbf-target-2`, `/ldn`,
`/custom`, `/templates`, `/schedules`, `/history`, `/config`. Son deep links
funcionales, no 13 `<Route>` adicionales.

## Navegación y errores

- Country usa `NavLink`; admin usa botones + `navigate()` y filtra elementos por
  permisos (`App.tsx:112-359,868-918`).
- `EgiRouteGate` y `PermissionRouteGate` muestran estados de selección/acceso;
  no redirigen silenciosamente a otro módulo.
- No existe navegación directa country→admin en `AdministrationInfoPage`; es una
  página explicativa (VERIFIED IN CODE).
- Ruta desconocida: HTTP 200 por SPA shell, contenido React vacío. Estado:
  **NO CONECTADO** para 404 amigable.
