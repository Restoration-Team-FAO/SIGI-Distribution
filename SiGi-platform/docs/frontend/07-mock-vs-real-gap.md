# 07 — Matriz MOCK vs REAL y gaps

> Diagnóstico histórico. Los fixtures del portal legado fueron retirados junto con ese frontend; ver [18-public-frontend-retirement-result.md](18-public-frontend-retirement-result.md).

## Criterio

- **REAL:** la vista consume endpoint y persistencia reales.
- **MIXTO:** combina datos reales con cálculo, narrativa, fallback o fixture local.
- **ESTÁTICO:** documentación/estado de interfaz, no pretende ser dato operativo.
- **GAP:** capacidad solicitada sin implementación verificable.

Que una pantalla sea REAL no significa que todo el backend esté listo para producción; significa que no depende de un mock frontend para su operación principal.

## Aplicación autenticada

| Pantalla | Ruta | Backend/datos | CRUD | Permisos | Estado | Gap principal |
| --- | --- | --- | --- | --- | --- | --- |
| Inicio | `/admin` | resumen Admin real | no | sesión + scope | REAL | no es aún Home 360/Mi trabajo |
| Mis espacios | `/admin/egi` | workspace EGI real | sí | membresías/roles | REAL | mejorar separación de selección y gobierno |
| Proyectos | `/admin/projects` | proyectos y subrecursos reales | sí | `projects.*`, archivos | REAL | workspace muy grande; relaciones/deep links incompletos |
| Mapa SIGI | `/admin/geobi` | API Geo, GeoServer y exports | sí/parcial | permisos de datos/GIS | MIXTO | conserva capas/copy de demostración heredada |
| Catálogo geográfico | `/admin/geospatial-catalog` | catálogo/PostGIS/GeoServer real | sí | `connectors.read`, `imports.upload`, `publications.publish` | REAL | lenguaje técnico expuesto |
| Visualizador BI | `/admin/bi-visualizer` | agrega APIs reales | config local/parcial | varios read | MIXTO | builder monolítico; algunas preferencias locales |
| Calidad/validaciones | `/admin/validations` | validaciones e incidentes reales | asignación | `validations.*` | REAL | separar operación de reglas/configuración |
| Fuentes/importaciones | `/admin/sources` | fuentes, batches, errores, mappings reales | sí | `sources.*`, `imports.*`, `connectors.run` | REAL | flujo demasiado técnico y extenso |
| Odoo/Kobo | `/admin/sources/*` | conectores y jobs reales | sí | sources/connectors/imports | REAL | mover herramientas avanzadas a Administración |
| Publicaciones | `/admin/publications` | publicaciones reales | publicar según endpoint | `publications.*` | REAL | navegación contextual hacia salida pública |
| Archivos | `/admin/files` | carpetas, archivos, versiones y auditoría | sí | `files.*` | REAL | vínculos de entidad más consistentes |
| Informes | `/admin/reports/*` | plantillas, instancias, compromisos y workflow reales | sí | `reports.*` | REAL | dividir página; navegación proyecto/evidencia |
| Instituciones | `/admin/institutions` | API real | sí | `institutions.*` | REAL | normalizar UX |
| Usuarios | `/admin/users*` | usuarios/roles/permisos reales | sí | `users.*`, `roles.*` | REAL | ruta dedicada de roles/permisos no separada |
| Auditoría | `/admin/audit` | eventos reales | lectura | `audit.read` | REAL | filtros/contexto |
| Estado de módulos | `/admin/modules` | combinación de salud/resumen | no | read varios | MIXTO | contenido técnico, no dominio operativo |
| Flujos | `/admin/flow` | narrativa de proceso con señales reales | no | read varios | MIXTO | no es motor de workflow |
| Operaciones API | `/admin/api` | salud/operación real | acciones sensibles | `audit.read` y permisos específicos | REAL | restringir a administración técnica |

## Portal público

| Pantalla | Ruta | Backend real | Mock/fallback | Estado | Gap |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `/dashboard` | proyectos, indicadores, territorios, geo, incidentes | KPIs estimados cuando faltan fuentes; modo demo | MIXTO | declarar procedencia por widget |
| Territorio | `/territory` | territorios y capas públicas | fallback de presentación | REAL/MIXTO | filtros globales |
| Proyectos | `/projects` | cartera pública | no crítico | REAL | enlaces canónicos al workspace autenticado |
| Geo/BI | `/geo-bi` | catálogo/features/exports públicos | WMS externo configurable | REAL | componentes físicamente duplicados |
| Indicadores | `/indicators` | indicadores públicos | no crítico | REAL | falta experiencia autenticada |
| Incidentes | `/incidents` | incidentes públicos | no crítico | REAL | política de campos publicables |
| Calidad | `/quality` | señales públicas disponibles | cálculos/ausencias explicadas | MIXTO | endpoint público de calidad más explícito |
| Restauración | `/restoration` | proyectos/indicadores públicos | omite métricas FERM no disponibles | MIXTO honesto | backend FERM específico |
| Reportes | `/reports` | informes publicados | filtro/destino local para demo | MIXTO | destinos persistentes reales |
| Documentos | `/documents` | archivos públicos | no crítico | REAL | metadata y descarga gobernada |
| Integraciones | `/integrations` | principalmente descripción del flujo | narrativa demo/piloto | ESTÁTICO/MIXTO | no presentarlo como operación en vivo |

## Capacidades inexistentes o insuficientes

| Requisito frontend | Backend gap | Propuesta futura | Permiso sugerido |
| --- | --- | --- | --- |
| Mi trabajo | no hay agregador transversal de pendientes | `GET /me/work-items` con origen y deep link | derivado de permisos de cada tarea |
| Búsqueda global | no hay búsqueda multi-entidad | `GET /search?q=&types=&scope=` | permisos read por tipo |
| Ask SIGI | no hay servicio gobernado | contrato con citas, scope, auditoría y límites | `assistant.use` por definir |
| Indicadores autenticados | datos existen, workspace dedicado no | endpoints de detalle/relaciones si faltan | `indicators.read/update/validate` por formalizar |
| Filtros globales | APIs aceptan filtros heterogéneos | contrato común gradual | sin permiso nuevo |
| Navegación entidad-relación | IDs existen de forma parcial | enlaces/endpoint de relaciones cuando falten | permisos de destino |

## Fixtures identificados

`apps/frontend-country/src/mocks/dashboard-fixtures.ts` sigue existiendo en el portal legado. No debe migrarse a la experiencia autenticada. Los nombres legacy `kobo_dnea_demo_*` en GIS se mantienen por compatibilidad de datos y deben migrarse con una operación de catálogo, no ocultarse mediante renombrado UI.
