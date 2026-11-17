# Trazabilidad UI → API → DB

Cada traza fue reconstruida desde los handlers actuales del baseline; no se
copió la auditoría previa.

| Flujo | Pantalla → acción → request | Endpoint → service | SQL/servicio → persistencia | Resultado/feedback | Estado/evidencia |
| --- | --- | --- | --- | --- | --- |
| Login | Login → Abrir consola → POST | `/auth/login` → `AuthService.login` | users/credentials → user_sessions/audit | sesión y home o error | COMPLETO; EXECUTION |
| Seleccionar EGI | topbar/EGI → seleccionar → POST | `/admin/egi/active` → `selectActiveEgi` | user_preferences + audit | contexto activo refrescado | COMPLETO; UAT |
| Crear EGI | EgiSpacesPage → guardar → POST | `/admin/egi` → `AdminService.createEgi` | egi_spaces/memberships/audit | nuevo espacio | COMPLETO; CODE/UAT |
| Listar proyectos country | ProjectsPage → carga → GET | `/projects` → `ProjectsService.list` | core.projects/institutions/portfolios | tarjetas/ficha pública | COMPLETO; CODE |
| Crear proyecto | ProjectsModule → Nuevo/guardar → POST | `/admin/projects` → `ProjectsService.create` | core.projects + audit | ficha recargada | COMPLETO; CODE |
| Editar proyecto | ficha → editar/guardar → PATCH | `/admin/projects/:id` → update | core.projects + audit | ficha actualizada | COMPLETO; CODE |
| Subentidades proyecto | ficha → actor/hito/KPI/etc. | `/admin/projects/:id/*` → ProjectsService | project_actors/milestones/indicators/territories/deliverables | panel actualizado | COMPLETO; CODE |
| Auditoría proyecto pública | project detail → GET | `/projects/:id/audit` → controller | no SQL de audit; retorna `[]` | lista siempre vacía | INCONSISTENTE; CODE |
| Import Excel | Sources/GeoBI → archivo → multipart | `/datasets/import/excel` → Datasets/Imports | XLSX parser → staging, batches, core | resumen/errores/import stats | PARCIAL; CODE/smoke |
| Import CSV por lote | scripts/admin → upload/validate/commit | `/admin/imports/*` → ImportsService | staging + rules + core upsert | batch/errores/commit | PARCIAL; smoke con dependencias |
| Shapefile preview | Sources/Geo catalog → ZIP | Odoo/geospatial endpoint → gis-service | pyshp/zip → preview en memoria | mapa/validaciones | PARCIAL; CODE |
| Shapefile import | confirmar import → POST | API → gis-service transform → API | territories/geo_layers/features | capa/ficha | INCONSISTENTE; smoke 500 aguas arriba |
| Catálogo Geo | GeoBI → activar catálogo → GET | `/geo/layers` → GeoService | geo_layers + visibility | capas visibles | COMPLETO; unit/API parcial |
| Features Geo | mapa/tabla/filtro → GET | `/geo/layers/:code/features` → GeoService | SQL PostGIS parametrizado, bbox/page/filter/sort | GeoJSON + tabla | COMPLETO; CODE/unit |
| Export Geo | Exportar → GET descarga | `/geo/layers/:code/export` | misma query visible → encoder | CSV/XLSX/GeoJSON | COMPLETO; CODE |
| Publicación por proyecto | catálogo → publicación derivada | `/admin/geospatial-catalog*` | projects/GIS → view + GeoServer REST | capa publicada o error | INCONSISTENTE; HTTP 500 observado |
| Upload archivo | Files → subir → multipart | `/admin/files/upload` → FilesService | binario en volumen + documents.* | archivo en árbol | COMPLETO; UAT |
| Versionar archivo | detalle → nueva versión | `/admin/files/:id/versions` | volumen + file_versions/audit | historial actualizado | COMPLETO; CODE |
| Asociar archivo | detalle → asociación | `/admin/files/:id/links` | file_entity_links | relación con proyecto/reporte | COMPLETO; CODE |
| Descargar documento público | Documents → descargar | `/documents/:id/download` | metadata + storage | attachment | COMPLETO; CODE |
| Crear reporte | Reports → wizard → POST | `/admin/reports` → ReportsService | reports/selection/scope/audit | instancia draft | PARCIAL; CODE |
| Generar/validar reporte | instancia → generar/validar | `/admin/reports/:id/generate|validate` | requirements, datasets, files, indicators → versions/findings | cobertura/versión | PARCIAL; E2E no completo |
| Aprobar/publicar reporte | revisión → acción | review/approve/publish endpoints | report status/version/audit | estado y descarga | PARCIAL; CODE |
| Publicar dataset | PublicationsPage → publicar | `/admin/publications*` → AdminService | core.publications + audit | publicación EGI | COMPLETO; scope smoke |
| Kobo preview/sync | Kobo page → test/preview/run | `/admin/kobo-sources*` → integration-service | Kobo HTTP → jobs/raw/imports | modo/live, preview/job | PARCIAL; tercero no verificado |
| Kobo a GIS | promover/build analysis | geospatial catalog Kobo endpoints | raw_payloads → layers/features | capa analítica | PARCIAL; CODE |
| Odoo preview/sync | Odoo page → test/preview/run | `/admin/odoo-sources*` → integration-service | XML-RPC → mapping/import jobs | resumen/job/errores | PARCIAL; tercero no verificado |
| Usuarios | UsersPage → crear/editar/borrar | `/admin/users*` → AdminService | users/credentials/user_roles/audit | tabla y feedback | PARCIAL; E2E histórico falló |
| Roles/permisos | UsersPage/Roles → guardar | `/admin/roles*` | roles/role_permissions/audit | permisos efectivos | PARCIAL; role smoke 32/33 |
| Auditoría admin | AuditPage → carga | `/admin/audit` → listAudit | audit_events/users | tabla | COMPLETO; auth negativo 401 |
| Auditoría pública | llamada directa | `/audit` → AuditService.list | audit_events/users | datos sin auth | INCONSISTENTE; anónimo 200 |

## Límites de la evidencia

- VERIFIED BY EXECUTION: resultados HTTP/smoke/E2E citados en
  `02-production-gates-results.md` y el nuevo Playwright R1.
- VERIFIED IN CODE: cadena controller→service→SQL/servicio indicada arriba.
- NOT VERIFIED: respuestas de instalaciones Kobo/Odoo reales, FileGDB,
  generación de todos los formatos oficiales y restore de storage.
