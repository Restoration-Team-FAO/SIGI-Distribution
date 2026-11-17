# 01 — Estado actual del frontend SIGI

> Documento histórico del diagnóstico previo al cutover. El estado vigente está documentado en [18-public-frontend-retirement-result.md](18-public-frontend-retirement-result.md).

## Alcance auditado

| Elemento | Estado observado |
| --- | --- |
| Rama | `feature/ux-ui-v2` |
| Aplicación autenticada candidata | `apps/frontend-admin` |
| Portal público de referencia | `apps/frontend-country` |
| Design system compartido | `libs/ui` |
| Backend | `apps/sigi-api` + servicios GIS/integración |
| Baseline protegido | `integration/sigi-v1-reconciled` · `5d18aace` |

La auditoría se hizo sobre fuentes, rutas, servicios, pruebas y controladores backend. Los `dist/` generados no se consideran fuente de verdad.

## Aplicaciones existentes

### `frontend-country`

Portal anónimo con Dashboard, Territorio, Restauración, Proyectos, Geo/BI, Indicadores, Incidentes, Calidad, Reportes, Documentos, Integraciones y página informativa de administración. Consume endpoints públicos. Contiene `mocks/dashboard-fixtures.ts` y textos explícitos de modo `demo/pilot/prod`.

### `frontend-admin`

Contiene actualmente:

- acceso institucional y sesión;
- contexto EGI y alcance activo/global;
- home autenticado;
- proyectos y subrecursos;
- GIS, catálogo geográfico y BI;
- fuentes, imports, Odoo, Kobo y conectores;
- validaciones, publicaciones, archivos y reportes;
- instituciones, usuarios, roles/permisos, auditoría y operaciones API;
- todas las rutas públicas migradas bajo `features/public`.

Por tanto, ya es el candidato técnico para la aplicación única. El nombre `frontend-admin` es deuda de empaquetado, no una razón para mantener dos experiencias autenticadas.

## Enrutamiento y layouts

| Superficie | Implementación | Observación |
| --- | --- | --- |
| Acceso | `AdministrationShell` + `/administration` | layout especial válido; no carga workspace |
| Autenticada | `WorkspaceApp` + `WorkspaceShell` + `AppRouter` | funcional, pero conserva semántica “Admin” |
| Pública | `PublicShell` + `PublicRouter` | necesidad separada y anónima |
| Catálogo | `app/route-catalog.ts` | fuente declarativa de metadata, permisos y menú |
| Carga | `React.lazy` por página | route splitting existente |

`/` exige sesión: anónimo redirige a `/administration`; autenticado abre el home. `/dashboard` es la entrada explícita al portal público.

## Autenticación, permisos y scope

- El token y usuario de sesión se gestionan en `services/api.ts`.
- `EgiContext` obtiene del backend usuario efectivo, permisos, espacios y capacidad de vista global.
- `workspaceApi` adjunta bearer y EGI; `publicApi` no adjunta credenciales.
- `AppRouter` bloquea rutas por permiso/rol y exige EGI cuando corresponde.
- `WorkspaceShell` filtra el menú con la misma metadata del catálogo.
- Las páginas vuelven a comprobar permisos para acciones específicas.
- El backend aplica guards y decoradores; ocultar UI no concede acceso.

Riesgo actual: la evaluación de capacidades está duplicada entre router y shell. Además, algunas rutas de configuración usan permisos UI aún no presentes en backend (`projects.configure`, `gis.configure`, `data.configure`, `monitoring.configure`, `reports.config.manage`) y dependen de roles administrativos o permisos equivalentes existentes.

## Funcionalidad duplicada

Los siguientes componentes existen en Country y también bajo `frontend-admin/features/public`:

- `FeatureIdentificationPanel`;
- `GeoBiLayerMap`;
- `GeoLayerAttributeTable`;
- `GeoLayerCatalogPanel`;
- `GeoLayerFilterControls`;
- `MultiLayerMap`;
- `ProjectCoverageMap`;
- `section-kit`;
- páginas públicas completas y utilidades de portal.

También existen versiones autenticadas de varios componentes GIS en `frontend-admin/src/components`. Parte de la duplicación es temporal y deliberada para rollback; debe eliminarse solo después de demostrar equivalencia y estabilizar interfaces presentacionales.

## Componentes compartidos disponibles

`libs/ui` ya ofrece Button, campos, Badge/StatusBadge, Card/KPI, Breadcrumb, PageHeader, Toolbar, FilterBar, Tabs, estados loading/empty/error/no-permission/dependency, Modal, Drawer, Toast, FormSection, DetailPanel y Search. Su adopción es parcial: páginas grandes aún contienen estilos y patrones locales.

## Deuda técnica principal

1. `WorkspaceShell` se presenta como “SIGI Admin”, aunque sirve a todo usuario autenticado.
2. Los dominios de menú son técnicos y numerosos; no corresponden aún a Inicio/Proyectos/Territorio/Indicadores/Datos/Informes/Administración.
3. La lógica `canAccess` está duplicada.
4. El breadcrumb superior no es navegable y solo muestra dos niveles.
5. Páginas como `SourcesPage`, `GeoBiModulePage`, `ProjectsModulePage` y `ReportsModulePage` son monolitos grandes.
6. No existe store de filtros globales; EGI/global scope sí persisten.
7. No existe búsqueda transversal de entidades; la búsqueda actual solo filtra módulos.
8. No existe agregador backend/UI para “Mi trabajo”.
9. Ask SIGI no tiene capacidad real identificada.
10. El portal público migrado todavía mantiene copias físicas respecto de Country.

## Inconsistencias UX/UI

- vocabulario “Admin/consola” para usuarios operativos;
- rutas `/admin/*` visibles como detalle técnico, aunque pueden conservarse como URLs compatibles;
- breadcrumbs sin relaciones de entidad;
- patrones de acciones y estados parcialmente normalizados;
- lenguaje ETL/mapping/staging visible en superficies técnicas extensas;
- distintos componentes GIS equivalentes;
- navegación módulo-a-módulo, con relaciones contextuales limitadas.

## Conclusión

No se recomienda una reescritura. La evolución segura consiste en consolidar `frontend-admin` como AppShell autenticado único, reutilizar catálogo/EGI/API/guards existentes, mantener el portal público como layout especial y retirar duplicación únicamente después de gates funcionales.
