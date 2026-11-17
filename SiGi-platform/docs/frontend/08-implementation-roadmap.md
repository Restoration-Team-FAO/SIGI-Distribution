# 08 — Roadmap incremental de implementación

## Reglas de ejecución

- rama exclusiva `feature/ux-ui-v2`;
- baseline y release candidate no se modifican;
- backend/DB/contratos permanecen estables salvo gap aprobado;
- cada fase termina con typecheck, build, unit, E2E y smokes aplicables;
- no se eliminan copias hasta verificar equivalencia;
- no se crean mocks para completar el recorrido.

## Fase 1 — Fundación

Estado: **COMPLETADA** el 2026-09-21. Evidencia en [09-phase-1-foundation-result.md](09-phase-1-foundation-result.md).

Objetivo: una experiencia autenticada única y explícitamente permission-driven.

Entregables:

- renombrar conceptualmente `WorkspaceShell` a `AppShell`;
- branding “SIGI”, no “SIGI Admin”;
- agrupación funcional única de menú;
- evaluación única `canAccessCapability`;
- `PermissionGate` reutilizable;
- route guards con estados loading/EGI/forbidden;
- breadcrumbs navegables derivados del catálogo;
- conservar sesión, EGI, scope y lazy routes;
- pruebas de raíz/login, menú, URL prohibida y permisos.

No incluye búsqueda global, Mi trabajo ni nuevas rutas sin backend.

## Fase 2 — Home 360 y Mi trabajo

Estado: **COMPLETADA** el 2026-09-21. Evidencia y contrato futuro en [10-phase-2-home-360-result.md](10-phase-2-home-360-result.md).

1. mapear widgets a endpoints reales;
2. hacer KPIs navegables con filtros serializados;
3. diseñar endpoint agregador de pendientes;
4. añadir actividad, alertas, fuentes desactualizadas e informes próximos según permiso;
5. mostrar procedencia y estado parcial por widget.

Gate: cada tarjeta tiene fuente, permiso, estado y destino verificable.

## Fase 3 — Proyectos

Estado: **COMPLETADA** el 2026-09-22. Evidencia en [11-phase-3-projects-result.md](11-phase-3-projects-result.md).

- dividir cartera y workspace;
- tabs con deep links;
- relaciones a indicadores, territorio, documentos, evidencias e informes;
- progressive disclosure;
- preservar CRUD, actores, hitos, territorio y auditoría reales.

## Fase 4 — Territorio

Estado: **COMPLETADA** el 2026-09-22. Evidencia en [12-phase-4-territory-result.md](12-phase-4-territory-result.md).

- renombrar experiencia funcional;
- separar catálogo/visor/análisis/configuración;
- panel lateral contextual;
- enlaces bidireccionales con proyecto/indicador/documento;
- extraer componentes GIS duplicados tras pruebas.

## Fase 5 — Indicadores

Estado: **COMPLETADA** el 2026-09-22. Evidencia en [13-phase-5-indicators-result.md](13-phase-5-indicators-result.md).

- confirmar permisos y endpoints faltantes;
- catálogo/detalle/metas/resultados/territorio;
- validación y trazabilidad según capacidad;
- no implementar hasta cerrar el gap de permisos autenticados.

## Fase 6 — Datos

Estado: **COMPLETADA** el 2026-09-22. Evidencia en [14-phase-6-data-result.md](14-phase-6-data-result.md).

- navegación operativa Fuentes/Importar/Calidad/Pendientes/Documentos/Historial;
- wizard de importación;
- mover conectores, jobs, mappings y logs a Administración técnica;
- filtros/contexto persistente.

## Fase 7 — Informes

Estado: **COMPLETADA** el 2026-09-22. Evidencia en [15-phase-7-reports-result.md](15-phase-7-reports-result.md).

- dividir catálogo, asistente, detalle, compromisos e historial;
- navegación desde proyecto/evidencia;
- mantener workflow y permisos `reports.*`;
- normalizar estados y acciones.

## Fase 8 — Administración

Estado: **COMPLETADA** el 2026-09-22. Evidencia en [16-phase-8-administration-result.md](16-phase-8-administration-result.md).

- integrar EGI, instituciones, usuarios, roles, permisos, conectores, publicaciones, auditoría y configuración dentro del mismo AppShell;
- visibilidad estricta por capacidades;
- separar administración institucional de operación técnica.

## Fases posteriores

| Fase | Condición |
| --- | --- |
| filtros globales | **PRIMER CONTRATO COMPLETADO** para Proyecto; evidencia en [19-global-filters-result.md](19-global-filters-result.md). Territorio, periodo, institución y estado esperan contrato homogéneo |
| búsqueda global | **COMPLETADA**; endpoint multi-entidad, permisos y reglas de scope en [20-global-search-result.md](20-global-search-result.md) |
| Ask SIGI | **COMPLETADA** como recuperación gobernada de evidencia; permiso, scope, fuentes y auditoría en [21-ask-sigi-result.md](21-ask-sigi-result.md) |
| retiro Country | **COMPLETADO**; evidencia en [18-public-frontend-retirement-result.md](18-public-frontend-retirement-result.md) |
| rename del paquete | **COMPLETADA**; paquete, Compose, proxy, validadores y compatibilidad en [22-frontend-package-rename-result.md](22-frontend-package-rename-result.md) |

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| confundir visibilidad UI con seguridad | backend sigue siendo autoridad; smokes 403 |
| permisos UI inventados | mapear a backend/roles equivalentes y registrar gap |
| páginas monolíticas | extracción por feature al intervenir, no big bang |
| pérdida de deep links | aliases y E2E por ruta |
| scope incorrecto | EGI explícito + pruebas multi-EGI |
| regresión GIS | flujo mapa/tabla/ficha/export en ambos modos |
| ocultar faltantes con demo | estados parciales y matriz REAL/MIXTO/GAP |
| duplicación perpetua | gate y ticket separado de retirada |

## Definition of Done del programa

1. Un solo AppShell autenticado sirve a todos los perfiles.
2. Menú, rutas y acciones usan capacidades backend.
3. La administración es una sección del mismo producto.
4. Navegación contextual conecta entidades principales.
5. Home conduce a trabajo real.
6. Mi trabajo y búsqueda respetan scope.
7. No hay mocks presentados como operación real.
8. Suites de seguridad, EGI, GIS y navegador permanecen verdes.
9. No existe un portal web anónimo; las rutas históricas pasan por autenticación.
10. El paquete Country fue retirado después del cutover autorizado y validado.
