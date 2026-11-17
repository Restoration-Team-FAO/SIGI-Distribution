# Inventario funcional por pantalla

Clasificación realizada desde cero contra `ec40482c`. Evidencia de ejecución:
Docker healthy, smokes R1, UAT 20/22, Playwright histórico 2/7 y suite de
protección Sprint 1R 10/10. Evidencia de código: páginas,
`services/api.ts`, controllers/services y SQL del baseline.

| Pantalla | Función | UI | API | Persistencia | E2E | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| Country Dashboard | resumen público | KPIs/mapa/gráficos | `/public/dashboard/summary` | `core.projects`, instituciones, calidad | R1 country | REAL |
| Country Dashboard | gráficos/filtros auxiliares heredados | visible | mixta | parte proviene de fixture | no específico | HARDCODED |
| Territorio | listado/cobertura territorial | visible | `/territories*` | `core.territories`, `gis.territory_features` | no específico | PARCIAL |
| Restauración | métricas FERM/ecosistemas | visible | mezcla endpoints públicos | mezcla real/fixture | no específico | PARCIAL |
| Proyectos country | cartera y ficha pública | visible | `/projects`, `/:id` | tablas `core.projects` y subentidades | no específico | REAL |
| Indicadores country | listado de indicadores | visible | `/indicators` | `core.indicators` | no específico | REAL |
| Calidad country | tarjetas, problemas y revisión | visible | resumen parcial | filas/series de `dashboard-fixtures.ts` | no | MOCK |
| Integraciones country | estado y conectores públicos | visible | `/connectors`; `getSources` rechazado | connectors | smoke portal | PARCIAL |
| Integraciones country | upload Excel | control/recorrido | rechazo deliberado en cliente | ninguna desde country | no | NO CONECTADO |
| Incidentes country | alertas públicas | visible | `/incidents` | `core.incidents` | no específico | REAL |
| Reportes country | lista de reportes | visible | `/reports` | templates/runs | no específico | REAL |
| Documentos country | buscar, detalle, descargar | visible | `/documents*` | `documents.files` + volumen | smoke portal | REAL |
| Administración country | orientación de acceso | visible | ninguna | ninguna | smoke portal | UI ONLY |
| Mapa SIGI country | catálogo, mapa, tabla, filtros/export | visible | `/geo/*`, territories, GeoServer | GIS/core | carga R1 PASS; E2E profundo falló | PARCIAL |
| Login admin | credenciales individuales | formulario | `/auth/login` | credentials/sessions/audit | ejecutado | REAL |
| Sesión admin | refresh, me, logout | transparente | `/auth/refresh`, `/me`, `/logout` | `core.user_sessions` | login ejecutado | REAL |
| Inicio admin | resumen EGI | visible | `/admin/egi/:id/summary` | múltiples tablas por EGI | R1 admin | REAL |
| EGI | listar, crear, editar, seleccionar | visible | `/admin/egi*` | spaces, memberships, preferences | UAT | REAL |
| Instituciones | CRUD | visible | `/admin/institutions*` | `core.institutions` | smoke roles | REAL |
| Usuarios | CRUD y filtros | visible | `/admin/users*` | users, credentials, roles | carga R1 PASS; CRUD no integral | PARCIAL |
| Roles/permisos | CRUD y grants | visible | `/admin/roles`, permissions | roles/role_permissions | role smoke 32/33 | PARCIAL |
| Fuentes | CRUD y scope EGI | visible | `/admin/sources*` | `core.data_sources` | UAT separación PASS | REAL |
| Conectores | CRUD/ejecución | visible | `/admin/connectors*` | `core.connectors` | role smoke | REAL |
| Kobo | test, preview, sync y promoción GIS | visible | `/admin/kobo-sources*` + servicios | sources/jobs/raw/GIS | navegación R1 | PARCIAL |
| Odoo | config, test, preview, sync/import | visible | `/admin/odoo-sources*` | configs cifrados, jobs/imports | no externo real | PARCIAL |
| Importaciones | Excel/CSV, staging, validación | visible en fuentes/GeoBI | `/datasets/import/excel`, `/admin/imports*` | integration + core | smoke operativo parcial | REAL |
| Shapefile | preview/transform/import | visible | API→gis-service | GIS/core | smoke GIS falló | PARCIAL |
| Proyectos admin | CRUD/filtros/portafolio | visible | `/admin/projects*` | `core.projects` | R1 navegación | REAL |
| Proyecto admin | actores/hitos/KPI/territorio/entregables | ficha maestra | endpoints por subentidad | tablas `core.project_*` | no integral | REAL |
| Proyecto público | auditoría del proyecto | endpoint sin UI destacada | `/projects/:id/audit` | no consulta datos | no | NO CONECTADO |
| Catálogo geoespacial | capas/import/publicación | visible | `/admin/geospatial-catalog*` | GIS/core/GeoServer | smoke 500 | ROTO |
| Geo/BI admin | mapas, tablas, BI, saved views | visible | `/admin/geo-bi`, `/geo/*` | GIS + saved views | carga R1 PASS; E2E profundo falló | PARCIAL |
| Geo API | bbox, página, schema, stats, nearby, export | widgets country/admin | `/geo/*` | GIS | unit tests PASS | REAL |
| GeoServer | WMS/WFS/capabilities | mapas | GeoServer | datastore PostGIS | HTTP/WMS 200 | REAL |
| Archivos | árbol/carpetas/búsqueda | visible | `/admin/files*` | documents + volumen | UAT | REAL |
| Archivos | upload/download | visible | multipart/download | metadata + binario persistente | UAT upload PASS | REAL |
| Archivos | metadata/versiones/auditoría/asociaciones | visible | endpoints file detail | files/versions/audit/links | navegación R1 | REAL |
| Reportes | frameworks/templates/calendario | visible | `/admin/reports/*` | tablas report_* | template E2E PASS | REAL |
| Reportes | compromisos/contribuciones | visible | commitments endpoints | report commitments/contributions | smoke parcial | REAL |
| Reportes | generar/validar/revisar/publicar/exportar | visible | actions por report | instances/versions/audit | E2E edición falló | PARCIAL |
| Publicaciones | listar/publicar por EGI | visible | `/admin/publications*` | `core.publications` | scope smoke PASS | REAL |
| Validaciones | listar/asignar resultados | visible | `/admin/validations*` | validation_results | role smoke | REAL |
| Auditoría admin | consultar bitácora | visible | `/admin/audit` | `core.audit_events` | auth negativo 401 | REAL |
| Auditoría pública | consultar bitácora sin auth | no menú | `/audit` | audit_events | anónimo 200 | ROTO |
| BI visualizer | panel consolidado | visible | varias APIs reales | múltiples tablas | ruta HTTP | REAL |
| API Ops | métricas/operación/reset controlado | visible | admin/metrics/reset | audit + DB | metrics 10/10 | REAL |
| Ayuda/capacitación | artículos y guías | visible | contenido local | archivo TS | ruta HTTP | REAL |
| Catálogos/schemas | catálogos técnicos | consumidor indirecto | `/catalogs`, `/schemas` | catálogo parcial | no | HARDCODED |
| Sync sample | ejecución sample interna | sin pantalla propia | integration-service | jobs/raw | no | BACKEND ONLY |
| Presets Geo/BI | vistas guiadas/narrativa | visible | datos reales debajo | configuración en TS | no específico | HARDCODED |
| Sistemas Kobo/Odoo reales | conectividad de terceros | visible | clientes HTTP/XML-RPC | config/jobs | no ejecutado | NO VERIFICADO |

## Conteo de funciones

| Estado | Cantidad |
| --- | ---: |
| REAL | 29 |
| PARCIAL | 11 |
| MOCK/HARDCODED | 4 |
| ROTO/NO CONECTADO | 4 |
| UI ONLY | 1 |
| BACKEND ONLY | 1 |
| NO VERIFICADO | 1 |
| **Total** | **51** |

## Archivos y almacenamiento

VERIFIED IN CODE: `FilesExplorerPage.tsx`, `files.controller.ts`, services y
repositories implementan carpetas, upload/download, metadata, permisos,
versiones, auditoría y enlaces con entidades. El binario usa
`FILE_STORAGE_ROOT=/var/sigi-files`, montado en `sigi_files_data` por Compose.
VERIFIED BY EXECUTION: UAT creó carpetas y subió un archivo por EGI; los checks
de separación de archivos pasaron.

## Reportes

VERIFIED IN CODE: frameworks, templates versionadas, report builder de 8 pasos,
instancias, coverage, validación, review/approve/publish, JSON export,
compromisos, contribuciones, recordatorios, calendario XLSX/ICS y auditoría.
VERIFIED BY EXECUTION: scope de exports/publications y un E2E de templates
pasaron. Dos E2E que esperaban un informe llamado `Prueba` fallaron por ausencia
del fixture; por ello el flujo completo permanece PARCIAL, no MOCK.

## GIS multicapas

VERIFIED IN CODE: catálogo, activación múltiple, filtros dinámicos desde schema,
tabla, identificación, perfiles, estadísticas, nearby, búsqueda cruzada,
saved views admin, CSV/XLSX/GeoJSON, imports Kobo/shapefile y GeoServer WMS/WFS.
VERIFIED BY EXECUTION: PostGIS/GeoServer/health pasan; los recorridos GIS fallan
por un error 500 del catálogo con proyectos cuyo código es NULL y por desajustes
de interacción en Playwright. Estado transversal: PARCIAL/ROTO según pantalla.
