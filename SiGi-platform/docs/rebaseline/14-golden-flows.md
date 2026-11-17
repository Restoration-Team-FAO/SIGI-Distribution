# Flujos dorados del baseline

Baseline: `ec40482c34a536db1dc9b53c980f9c848baf6fb5`. Las pruebas se ejecutaron
en el clon Docker de validación; no se usaron datos productivos.

| Flujo | Precondición y rol | Pasos / endpoints | Persistencia | Resultado esperado | Resultado observado | Estado / evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| GF-01 Login | usuario activo con credencial; cualquier rol admin | formulario → `POST /auth/login` → `GET /auth/me`; refresh/logout disponibles | `core.user_sessions`, auditoría | abrir consola con identidad y permisos | login y carga de Inicio pasan | **COMPLETO** — VERIFIED BY EXECUTION, R1-03 PASS; VERIFIED IN CODE, `auth.service.ts` |
| GF-02 Gestión de proyecto | editor/admin con EGI activo | cartera → crear/editar → subentidades mediante `/admin/projects*` | `core.projects`, actores, hitos, KPI, entregables, territorios | proyecto trazable en alcance activo | CRUD existe y R1-04/R1-05 pasan; no se ejecutó ciclo completo reversible | **PARCIAL** — VERIFIED IN CODE; VERIFIED BY EXECUTION |
| GF-03 Indicadores | actor con lectura/edición aplicable | country `/indicators`; API `/indicators*` | `core.indicators` y valores | consultar y mantener indicadores | lectura real conectada; edición integral no fue recorrida | **PARCIAL** — VERIFIED IN CODE; NOT VERIFIED end-to-end |
| GF-04 Excel/CSV | editor/integrador | upload admin → `/datasets/import/excel` o `/admin/imports*` → staging/validación | tablas `integration` y entidades promovidas | importar, validar y consultar | endpoints y persistencia reales; no se cerró un ciclo completo desde UI | **PARCIAL** — VERIFIED IN CODE; VERIFIED BY EXECUTION parcial |
| GF-05 Shapefile | editor/integrador con archivo válido | preview/transform/import → API → `gis-service` | PostGIS, imports y metadatos GIS | capa importada y utilizable | pipeline existe; smokes GIS no cerraron el recorrido | **INCONSISTENTE** — VERIFIED IN CODE; VERIFIED BY EXECUTION |
| GF-06 GIS / mapa / capas | usuario con lectura GIS y GeoServer healthy | `/admin/geobi` o country `/geo-bi` → `/geo/*` + WMS/WFS | PostGIS, saved views y GeoServer | mapa, capas, tabla, filtros y export | GeoServer/WMS y pantalla Geo/BI cargan; catálogo admin devuelve 500 con proyectos sin código | **INCONSISTENTE** — VERIFIED BY EXECUTION; VERIFIED IN CODE |
| GF-07 Archivos | usuario con `files.*` y EGI | explorar → crear carpeta/upload → metadata/versiones → download | `documents.files`, versiones, permisos, enlaces; volumen `sigi_files_data` | archivo persistido, recuperable y acotado | UAT creó carpetas y subió archivo con separación EGI | **COMPLETO** — VERIFIED BY EXECUTION; VERIFIED IN CODE |
| GF-08 Reportes | roles de contribución/revisión/publicación | template → instancia → generar/revisar/aprobar/publicar/exportar | tablas `core.report_*` y archivos/export | ciclo completo trazable | templates y exports funcionan; edición/historial Playwright no encontró su fixture | **PARCIAL** — VERIFIED BY EXECUTION; VERIFIED IN CODE |
| GF-09 Kobo | integrador con fuente y credenciales | config/test/preview/sync/promoción → `/admin/kobo-sources*` | sources, jobs, raw data y GIS | datos reales sincronizados y promovidos | UI/API existen y R1-09 pasa; no se usó servidor Kobo real | **PARCIAL** — VERIFIED IN CODE; NOT VERIFIED contra tercero |
| GF-10 Odoo | integrador con instancia y credenciales | config/test/preview/sync/import → `/admin/odoo-sources*` | configuración cifrada, jobs/imports | sincronización real | cliente real existe; modo mock es opcional y rechazado en producción; no hubo instancia externa | **PARCIAL** — VERIFIED IN CODE; NOT VERIFIED contra tercero |
| GF-11 Publicaciones | admin con `publications.publish` y EGI | listar → publicar mediante `/admin/publications*` | `core.publications`, auditoría | publicación visible en scope correcto | smoke de scope/publicación pasó | **COMPLETO** — VERIFIED BY EXECUTION; VERIFIED IN CODE |
| GF-12 Usuarios/roles | `superadmin` o `national_admin` | usuarios/roles → CRUD/grants `/admin/users*`, `/admin/roles*` | users, credentials, roles, grants | altas/cambios gobernados | API/UI y 16 usuarios cargaron; R1-10 pasa y smoke de roles fue 32/33, sin ciclo CRUD completo | **PARCIAL** — VERIFIED BY EXECUTION; VERIFIED IN CODE |
| GF-13 EGI | miembro activo o admin global | listar/seleccionar/crear/editar/resumen `/admin/egi*` | `egi_spaces`, memberships, preferencia activa | aislamiento y cambio de contexto | UAT obtuvo 20/22; fuentes/archivos aislaron correctamente, dos fallos incluyen un problema del harness al no desempaquetar `project` | **PARCIAL** — VERIFIED BY EXECUTION; VERIFIED IN CODE |

## Resultado

- Flujos completos: **3/13** (`GF-01`, `GF-07`, `GF-11`).
- Parciales: **8/13**.
- Inconsistentes: **2/13** (`GF-05`, `GF-06`).
- Inexistentes: **0/13**.

La etiqueta `PARCIAL` no implica que la capacidad sea simulada: indica que el
ciclo completo no quedó probado o depende de un sistema externo. La primera
corrida Playwright fue 6/10: las cuatro páginas sí renderizaron, pero las
aserciones no correspondían a sus encabezados públicos o usaban un selector
ambiguo. La suite se corrigió sin modificar el producto y su corrida final fue
**10/10 PASS**.
