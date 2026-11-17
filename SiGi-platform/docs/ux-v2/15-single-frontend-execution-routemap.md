# Routemap de ejecución — Frontend único SIGI

## 1. Objetivo

Convertir `frontend-admin` en el anfitrión único de las vistas públicas y autenticadas, preservando rutas, contratos, seguridad, EGI y capacidad de rollback hasta retirar `frontend-country` de manera controlada.

Este routemap traduce la decisión arquitectónica y el plan de migración en unidades ejecutables. No autoriza eliminar el frontend Country antes del gate final.

## 2. Estado inicial

| Elemento | Estado |
| --- | --- |
| Baseline estable | `integration/sigi-v1-reconciled` · `5d18aace` · intocable |
| Rama de implementación | `feature/ux-ui-v2` |
| Docker UX Admin | `http://127.0.0.1:5374` |
| Docker UX Country | `http://127.0.0.1:5373` |
| API UX | `http://127.0.0.1:3200/api` |
| Regresión UI vigente | 21 pruebas Playwright aprobadas |
| Regresión de roles/API | 36 verificaciones aprobadas |
| Decisión arquitectónica | Preparada en ADR-UX-001 |

## 3. Resultado objetivo

```text
                           ┌─────────────────────────┐
                           │      Frontend SIGI      │
                           │       único build       │
                           └────────────┬────────────┘
                                        │
                  ┌─────────────────────┴─────────────────────┐
                  │                                           │
          usuario anónimo                              usuario autenticado
                  │                                           │
          PublicShell                                  WorkspaceShell
                  │                                           │
          publicApi                                   workspaceApi + EGI
                  │                                           │
          datos publicados                         permisos y scope backend
```

## 4. Dependencias de ejecución

```text
SF-0 Documentación [COMPLETO]
  └── SF-1 Catálogo de rutas/capacidades [COMPLETO]
       ├── SF-2 Shell público + auth opcional [COMPLETO]
       │    └── SF-3 Dashboard + Territorio [COMPLETO]
       └── SF-4 Infraestructura de API pública/privada [COMPLETO]
            ├── SF-5 Proyectos [COMPLETO]
            ├── SF-6 GIS [COMPLETO]
            ├── SF-7 Monitoreo [COMPLETO]
            ├── SF-8 Reportes y Documentos [COMPLETO]
            └── SF-9 Integraciones públicas [COMPLETO]
                  └── SF-10 Docker/CI y validación paralela [COMPLETO]
                       └── SF-11 Cutover [PENDIENTE APROBACIÓN]
                            └── SF-12 Retiro de Country [PENDIENTE AUTORIZACIÓN DESTRUCTIVA]
```

SF-5 a SF-9 se ejecutan secuencialmente en la rama para facilitar revisión y rollback, aunque comparten la infraestructura creada en SF-4.

## 5. Mapa de rutas públicas

Las rutas no cambian durante la primera consolidación; cambia la aplicación que las resuelve.

| Ruta actual | Página actual Country | Destino en frontend único | Ola | Prueba mínima |
| --- | --- | --- | --- | --- |
| `/` | `DashboardPage` en Country | acceso Admin (`/administration`) en el candidato | SF-2/SF-10 | anónimo debe autenticarse; sesión válida abre workspace |
| `/dashboard` | `DashboardPage` | `PublicDashboardRoute` | SF-3 | entrada explícita al portal público; KPIs, filtros, mapa y gráficos |
| `/territory` | `TerritoryPage` | `PublicTerritoryRoute` | SF-3 | filtros, mapa y selección |
| `/restoration` | `RestorationMonitoringPage` | `PublicRestorationRoute` | SF-7 | proyectos e indicadores publicados |
| `/projects` | `ProjectsPage` | `PublicProjectsRoute` | SF-5 | lista, `projectId`, mapa y ficha |
| `/geo-bi` | `GeoBiPage` | `PublicGisRoute` | SF-6 | catálogo, búsqueda, ficha y export |
| `/integrations` | `IntegrationsPage` | `PublicIntegrationsRoute` | SF-9 | información publicada sin credenciales |
| `/indicators` | `IndicatorsPage` | `PublicIndicatorsRoute` | SF-7 | listado y valores publicados |
| `/incidents` | `IncidentsPage` | `PublicIncidentsRoute` | SF-7 | alertas públicas únicamente |
| `/quality` | `QualityPage` | `PublicQualityRoute` | SF-7 | señal pública sin reglas internas |
| `/reports` | `ReportsPage` | `PublicReportsRoute` | SF-8 | informes publicados y detalle |
| `/documents` | `DocumentsPage` | `PublicDocumentsRoute` | SF-8 | búsqueda, detalle y descarga pública |
| `/administration` | `AdministrationInfoPage` | `PublicAdministrationRoute` | SF-2 | explicación + login seguro |

## 6. Mapa de rutas autenticadas

Estas rutas permanecen en el anfitrión y se registran en el catálogo único.

| Dominio | Rutas | Tratamiento |
| --- | --- | --- |
| Inicio | `/admin`, `/admin/help`, aliases de ayuda | Mantener |
| EGI | `/admin/egi` | Mantener sesión y membresías |
| Proyectos | `/admin/projects`, `/admin/projects/config` | Integrar con feature compartida en SF-5 |
| GIS | `/admin/geobi`, `/admin/geobi/config`, `/admin/geospatial-catalog` | Integrar en SF-6 |
| Monitoreo | `/admin/validations`, `/admin/monitoring/config`, `/admin/bi-visualizer` | Integrar en SF-7 |
| Datos | `/admin/sources*`, `/admin/data/config`, `/admin/connectors` | Registrar en SF-1; conservar operación |
| Reportes | `/admin/reports/*` | Integrar en SF-8 |
| Archivos | `/admin/files` | Integrar en SF-8 |
| Publicación | `/admin/publications` | Enlazar vistas previas públicas |
| Administración | `/admin/institutions`, `/admin/users*`, `/admin/audit`, `/admin/api` | Mantener protegidas |
| Diagnóstico técnico | `/admin/modules`, `/admin/flow` | Renombrar correctamente, sin “Resumen regional” |

## 7. Backlog ejecutable

### SF-1 — Catálogo único de rutas y capacidades

**Estado:** COMPLETO el 2026-09-18. Evidencia en `16-sf1-route-catalog-validation.md`.

**Objetivo:** eliminar reglas de navegación duplicadas antes de añadir rutas públicas.

| Ticket | Trabajo | Archivos principales | Riesgo |
| --- | --- | --- | --- |
| UFE-001 | Crear `route-catalog.ts` con ruta, audiencia, dominio, permisos, roles, EGI y configuración | `apps/frontend-admin/src/app/route-catalog.ts` | Medio |
| UFE-002 | Derivar sidebar, búsqueda, metadata y breadcrumbs del catálogo | `App.tsx`, componentes de shell | Alto |
| UFE-003 | Introducir `AppRouter` y una ruta 404 explícita | `app/AppRouter.tsx` | Medio |
| UFE-004 | Eliminar alias incorrecto “Resumen regional” → módulos | catálogo y pruebas | Bajo |
| UFE-005 | Pruebas de visibilidad y deep links por perfil | `tests/e2e` | Medio |

Aceptación:

- todas las rutas Admin actuales siguen abriendo;
- “Estado de módulos” describe `/admin/modules`;
- una ruta desconocida muestra 404;
- sidebar, breadcrumbs y búsqueda usan una fuente única;
- 21 E2E y smoke de roles continúan verdes.

Commits previstos:

```text
refactor(frontend): introduce capability route catalog
test(frontend): cover permission-driven route navigation
```

### SF-2 — Shell público y sesión opcional

**Estado:** COMPLETO el 2026-09-18. Evidencia en `17-sf2-public-shell-validation.md`.

**Objetivo:** permitir rutas públicas dentro del anfitrión sin convertirlas en rutas Admin.

| Ticket | Trabajo | Archivos principales | Riesgo |
| --- | --- | --- | --- |
| UFE-006 | Crear `PublicShell` y mantener `WorkspaceShell` | `app/PublicShell.tsx`, `app/WorkspaceShell.tsx` | Alto |
| UFE-007 | Resolver sesión opcional sin bloquear navegación pública | contexto de sesión/auth | Alto |
| UFE-008 | Montar `/administration` y acceso a login | router y public page | Medio |
| UFE-009 | Definir comportamiento de `/`, login, logout y retorno a deep link | router/auth | Alto |
| UFE-010 | Asegurar lazy loading por shell | configuración Vite/imports | Medio |

Aceptación:

- anónimo abre rutas públicas sin token;
- rutas Admin siguen solicitando login;
- logout limpia datos privados y vuelve a una ruta pública;
- un deep link Admin autorizado se recupera tras login;
- el chunk público inicial no incluye secretos ni pantallas administrativas completas.

Commits previstos:

```text
feat(frontend): add public shell to unified host
test(auth): protect optional-session route transitions
```

### SF-3 — Dashboard y Territorio

**Estado:** COMPLETO el 2026-09-18.

**Objetivo:** primera paridad pública dentro del frontend único.

| Ticket | Trabajo | Fuente | Destino |
| --- | --- | --- | --- |
| UFE-011 | Migrar contenedor del Dashboard público | `frontend-country/pages/DashboardPage.tsx` | `features/dashboard/PublicDashboardRoute.tsx` |
| UFE-012 | Extraer visualizaciones compartidas | `visualizer-kit`, mapas | `libs/ui` o `features/*/components` |
| UFE-013 | Migrar Territorio público | `TerritoryPage.tsx` | `features/territory/PublicTerritoryRoute.tsx` |
| UFE-014 | Añadir entrada “Ver vista pública” desde Admin | dashboard/publicaciones | navegación contextual |
| UFE-015 | Comparación visual y de requests | Playwright | evidencias UX |

Aceptación:

- `/dashboard` y `/territory` funcionan en 5374 sin sesión;
- datos y requests coinciden con 5373;
- no se llama ningún endpoint `/admin/*` de forma anónima;
- filtros persistidos y mapas mantienen comportamiento;
- Country continúa disponible para rollback.

### SF-4 — Fachadas de API y componentes compartidos

**Estado:** COMPLETO el 2026-09-18. Frontera documentada en `18-public-private-api-boundary.md`.

**Objetivo:** impedir mezclas accidentales de superficies públicas y privadas.

| Ticket | Trabajo | Resultado |
| --- | --- | --- |
| UFE-016 | Crear/exportar `publicApi` explícita | cliente sin bearer ni EGI |
| UFE-017 | Renombrar o encapsular `adminApi` como `workspaceApi` | cliente con sesión, refresh y EGI |
| UFE-018 | Extraer tipos de capacidades de UI | acciones por permisos, no booleanos dispersos |
| UFE-019 | Añadir prueba que falla si una ruta pública llama `/admin/*` | frontera automatizada |
| UFE-020 | Documentar allowlist de variables públicas Vite | build público seguro |

No se fusionan endpoints ni contratos en esta ola.

### SF-5 — Proyectos

**Estado:** COMPLETO el 2026-09-18.

**Objetivo:** una feature con contenedores público y operativo.

| Ticket | Trabajo |
| --- | --- |
| UFE-021 | Extraer lista, ficha, KPI y mapa presentacionales |
| UFE-022 | Mantener `PublicProjectsRoute` con payload público |
| UFE-023 | Adaptar `ProjectsModulePage` al workspace compartido |
| UFE-024 | Preservar tabs y `projectId` en URLs |
| UFE-025 | Añadir `Vista pública` para proyectos publicados |
| UFE-026 | Probar create/edit/actors/hitos/territorio/documentos/audit |

Gate: paridad pública, operaciones Admin y aislamiento EGI verdes.

### SF-6 — GIS

**Estado:** COMPLETO el 2026-09-18.

**Objetivo:** compartir mapa, catálogo visual, ficha y tabla sin exponer configuración.

| Ticket | Trabajo |
| --- | --- |
| UFE-027 | Consolidar `MultiLayerMap`, catálogo, tabla y ficha |
| UFE-028 | Mantener contenedor público limitado a capas publicables |
| UFE-029 | Mantener importación/publicación/configuración en workspace |
| UFE-030 | Añadir preview público de capa publicada |
| UFE-031 | Probar búsqueda, filtros, selección, metadata y export en ambos modos |
| UFE-032 | Verificar GeoServer, fallback GeoJSON y CORS en host único |

Gate: ningún atributo/capa interna aparece anónimamente.

### SF-7 — Indicadores, calidad, incidentes y restauración

**Estado:** COMPLETO el 2026-09-18.

| Ticket | Trabajo |
| --- | --- |
| UFE-033 | Migrar indicadores públicos |
| UFE-034 | Reemplazar fixtures restantes de calidad o marcarlos explícitamente |
| UFE-035 | Migrar alertas/incidentes públicos con campos permitidos |
| UFE-036 | Migrar monitoreo territorial/restauración |
| UFE-037 | Conservar Validations/BI como operación autenticada |

Gate: las vistas públicas no presentan reglas internas, responsables ni evidencia restringida.

### SF-8 — Reportes y Documentos

**Estado:** COMPLETO el 2026-09-18.

| Ticket | Trabajo |
| --- | --- |
| UFE-038 | Migrar catálogo y detalle de reportes publicados |
| UFE-039 | Conectar preview desde workflow Admin |
| UFE-040 | Migrar búsqueda/detalle/descarga de documentos públicos |
| UFE-041 | Reutilizar presentacionales del explorador sin exponer metadatos internos |
| UFE-042 | Probar workflow de reportes y versionado de archivos |

Gate: permisos de crear/revisar/aprobar/publicar/exportar siguen separados.

### SF-9 — Integraciones y landing institucional

**Estado:** COMPLETO el 2026-09-18.

| Ticket | Trabajo |
| --- | --- |
| UFE-043 | Migrar información pública de integraciones sin controles técnicos |
| UFE-044 | Mantener Kobo/Odoo/Connectores solo autenticados |
| UFE-045 | Migrar landing de administración/login |
| UFE-046 | Revisar textos que aún hablen de “dos portales” |

### SF-10 — Docker, CI y validación paralela

**Estado:** COMPLETO el 2026-09-18. Evidencia en `20-sf3-sf10-final-candidate.md`; operación en `19-unified-frontend-cutover-runbook.md`.

| Ticket | Trabajo |
| --- | --- |
| UFE-047 | Construir imagen candidata del frontend único |
| UFE-048 | Mantener Country y candidata simultáneamente |
| UFE-049 | Ejecutar diff visual y de red por ruta pública |
| UFE-050 | Ejecutar build, typecheck, unit, E2E, smokes de roles y GIS |
| UFE-051 | Validar headers, CSP, CORS, cache y fallback SPA |
| UFE-052 | Preparar runbook de cutover y rollback |

Topología de validación:

```text
5373  frontend-country actual       referencia/rollback
5374  frontend único candidato      público + autenticado
3200  API compartida de validación
8281  GeoServer de validación
```

### SF-11 — Cutover

Prerequisitos obligatorios:

- [ ] paridad firmada por dominio;
- [ ] suites completas verdes;
- [ ] auditoría de payloads públicos;
- [ ] smoke de roles y EGI verde;
- [ ] backup y etiquetas de imágenes;
- [ ] rollback ensayado;
- [ ] aprobación explícita.

Secuencia:

1. desplegar imagen única sin retirar Country;
2. ejecutar smoke post-deploy;
3. cambiar proxy/host público al artefacto único;
4. observar métricas y logs;
5. revertir proxy si se incumple un umbral;
6. mantener imagen Country durante el periodo acordado.

### SF-12 — Retiro de Country

Ticket separado y destructivo; requiere autorización explícita.

- retirar servicio de Compose;
- retirar build/job específico de CI;
- eliminar código duplicado ya sin consumidores;
- mantener tag, imagen y commits recuperables;
- actualizar diagramas, runbooks y documentación de operación.

## 8. Gates globales

Cada ola debe cumplir:

```text
typecheck
build
tests del dominio
Playwright afectado
smoke API/roles aplicable
comparación contra Country si toca rutas públicas
git diff contra baseline
working tree limpio
commit aislado
```

Ninguna ola puede compensar una regresión ocultando controles, debilitando permisos o reemplazando datos reales por fixtures.

## 9. Política de commits

```text
refactor(frontend): introduce capability route catalog
feat(frontend): add public shell to unified host
feat(frontend): migrate public dashboard and territory
refactor(frontend): separate public and workspace api clients
feat(frontend): unify project experiences
feat(frontend): unify gis experiences
feat(frontend): migrate public monitoring views
feat(frontend): migrate public reports and documents
ops(frontend): build unified frontend candidate
test(frontend): verify unified role and route matrix
ops(frontend): cut over public traffic to unified app
chore(frontend): retire legacy country frontend
```

No mezclar el retiro de Country con la migración funcional de un dominio.

## 10. Evidencia por ola

Cada ola debe actualizar un registro con:

| Campo | Contenido |
| --- | --- |
| Commit | SHA exacto |
| Rutas afectadas | públicas y/o Admin |
| Componentes movidos | origen → destino |
| APIs consumidas | públicas y/o workspace |
| Permisos verificados | lista concreta |
| Pruebas | comando y resultado |
| Comparación | screenshots/requests relevantes |
| Regresiones | detectadas, resueltas o bloqueantes |
| Rollback | commit/imagen/configuración |

## 11. Definition of Done del programa

1. Un solo artefacto frontend resuelve rutas públicas y autenticadas.
2. La navegación se deriva de sesión, permisos y EGI.
3. Todas las URLs existentes siguen operativas o tienen redirects probados.
4. No hay llamadas Admin desde rutas anónimas.
5. No hay datos internos en payloads públicos.
6. Proyectos, GIS, monitoreo, reportes y documentos alcanzan paridad.
7. Build, E2E, roles, GIS y aislamiento EGI están verdes.
8. Docker y CI usan el artefacto único.
9. Rollback fue probado.
10. El retiro de Country fue aprobado y ejecutado en un commit independiente.

## 12. Próxima acción

La candidata de revisión final cubre SF-1 a SF-10. La próxima acción es ejecutar la revisión funcional en `http://127.0.0.1:5374` y registrar la aprobación por dominio. SF-11 no se ejecuta sin esa aprobación; SF-12 requiere además autorización destructiva independiente.
