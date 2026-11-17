# 06 — Plan de reutilización de componentes

> Plan histórico previo al cutover. La duplicación Country/public fue retirada; ver [18-public-frontend-retirement-result.md](18-public-frontend-retirement-result.md).

## Reutilizar sin reescritura

| Activo | Uso |
| --- | --- |
| `route-catalog.ts` | fuente declarativa de rutas/capacidades |
| `EgiContext` | usuario efectivo, EGI y scope |
| `workspaceApi` / `publicApi` | frontera autenticada/anónima |
| `libs/ui/tokens.css` | identidad y tokens |
| componentes de `libs/ui` | acciones, forms, estados, headers, tabs y overlays |
| componentes GIS operativos | mapa, catálogo, filtros, tabla y ficha |
| `ModuleWorkspaceHeader` | patrón operación/configuración |
| pruebas Playwright y smokes | gates de no regresión |

## Refactorizar incrementalmente

| Activo | Acción |
| --- | --- |
| `WorkspaceShell` | convertir en `AppShell`, eliminar branding Admin |
| guard inline de `AppRouter` | extraer a `PermissionGate` y evaluador único |
| breadcrumbs del topbar | hacer navegables y derivados del catálogo |
| dominios del catálogo | agrupar por trabajo del usuario |
| `ProjectsModulePage` | extraer workspace/tabs y presentacionales por subrecurso |
| `GeoBiModulePage` | separar visor, catálogo, panel y herramientas técnicas |
| `SourcesPage` | separar import wizard, fuentes, calidad y configuración |
| `ReportsModulePage` | separar home, wizard, workflow, calendario y detalle |

## Duplicación a retirar después de equivalencia

| Duplicación | Destino |
| --- | --- |
| componentes GIS Country/public | interfaces presentacionales compartidas |
| `section-kit` y `visualizer-kit` copiados | `libs/ui` o feature compartida |
| páginas Country migradas | mantener solo contenedores del build único |
| estilos Country/Admin equivalentes | tokens y layouts compartidos |

No retirar todavía `frontend-country`: sigue siendo referencia y rollback hasta el gate de producción.

## Componentes nuevos de Fundación

- `AppShell` único autenticado;
- `PermissionGate`;
- evaluador `canAccessCapability`;
- breadcrumbs navegables derivados de ruta;
- estados consistentes para permiso y EGI.

## Componentes diferidos

- `GlobalSearch`: requiere endpoint agregador;
- `MyWorkInbox`: requiere modelo de tareas/pendientes;
- `GlobalFilterContext`: debe diseñarse con contratos y URL;
- `AskSigiPanel`: requiere servicio, permisos, auditoría y política de datos;
- `WorkflowStepper`: puede añadirse al abordar importaciones/reportes.

## Criterio para eliminar

Una copia solo se elimina cuando:

1. no tiene consumidores únicos;
2. pruebas pública y autenticada demuestran equivalencia;
3. no cambia payload ni seguridad;
4. existe commit recuperable y rollback documentado.
