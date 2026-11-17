# Matriz Pantalla -> Endpoint -> Modulo SIGI -> Origen de Datos

Esta matriz convierte los demos de frontend en una guia de integracion real.

Usa como insumo:

- [docs/alineamiento-sigi-matriz.md](docs/alineamiento-sigi-matriz.md)
- [SIGI_CostaRica_Dashboard_demo.html](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:1>)
- [SIGI_CostaRica_Backend (1).html](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:1>)

La regla arquitectonica recomendada es:

- el frontend **solo** consume `sigi-api`
- `sigi-api` orquesta hacia `integration-service` y `gis-service`
- los servicios internos no se exponen directamente al navegador

## Principio de Integracion

### Frontend publico

Debe consumir solamente vistas publicas, agregadas y estables:

- dashboards
- datasets publicados
- capas y analitica geoespacial
- indicadores
- reportes publicados

### Frontend admin

Debe consumir solamente vistas operativas y de gobierno:

- instituciones
- conectores
- sync jobs
- datasets en revision
- validaciones
- publicaciones
- auditoria
- usuarios y roles

## Matriz 1. Dashboard Publico

| Pantalla / bloque | Referencia en demo | Endpoint recomendado en `sigi-api` | Modulo SIGI responsable | Origen de datos | Estado actual |
| --- | --- | --- | --- | --- | --- |
| Resumen ejecutivo | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:214>) | `GET /api/public/dashboard/summary?country=CR&period=2025` | `SIGI-Core facade` + `Geo/BI` | `core` agregados + `gis` agregados publicados | No existe |
| Chips de estado: corte, fuentes, proyectos, calidad | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:241>) | `GET /api/public/dashboard/status` | `SIGI-Core facade` | `core.datasets`, `core.publications`, `core.validation_runs` | No existe |
| KPIs nacionales | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:258>) | `GET /api/public/indicators/summary` | `SIGI-Core` | datasets validados y publicados | No existe |
| Semaforo operativo | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:272>) | `GET /api/public/dashboard/readiness` | `SIGI-Core` | validaciones, completitud, freshness | No existe |
| Territorio / mapa pais | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:326>) | `GET /api/public/geo/layers/restoration` o `GET /api/public/geo/features?...` | `SIGI Geo/BI` via `gis-service` | `gis` read models + PostGIS | No existe; hoy usa Google Maps embed |
| Resumen territorial por region | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:347>) | `GET /api/public/territories/summary?level=region&period=2025` | `SIGI Geo/BI` | agregados espaciales en `gis` | No existe |
| Indicadores por pestaña | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:523>) | `GET /api/public/indicators` y `GET /api/public/indicators/{indicatorId}` | `SIGI-Core` | datasets canonicos publicados | No existe |
| Proyectos visibles | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:373>) | `GET /api/public/projects?status=published&period=2025&page=1` | `SIGI-Core facade` | `core.projects` o `core.records` publicados | No existe |
| Calidad y trazabilidad publica | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:404>) | `GET /api/public/quality/summary` | `SIGI-Core` | `validation_runs`, `audit`, reglas | No existe |
| Integraciones visibles | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:436>) | `GET /api/public/institutions/participation` | `SIGI-Core facade` | `core.institutions`, publicaciones, datasets por fuente | Parcial; hoy existe `GET /api/institutions` pero no publico ni agregado |
| Incidentes / alertas publicas | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:467>) | `GET /api/public/incidents` | `SIGI-Core` | tabla de eventos/incidentes publicados | No existe |
| Informes configurables | [Dashboard demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:561>) | `GET /api/public/reports`, `POST /api/admin/reports/{id}/exports`, `GET /api/public/reports/{id}` | `SIGI-Bridge` + `SIGI-Core` | datasets publicados, exportaciones, plantillas | No existe; hoy son `alert(...)` |

## Matriz 2. Admin / Consola Operativa

| Pantalla / bloque | Referencia en demo | Endpoint recomendado en `sigi-api` | Modulo SIGI responsable | Origen de datos | Estado actual |
| --- | --- | --- | --- | --- | --- |
| Inicio operativo | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:289>) | `GET /api/admin/operations/summary` | `SIGI-Core facade` | jobs, validaciones, publicaciones, incidentes | No existe |
| Resumen del dia | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:319>) | `GET /api/admin/operations/today` | `SIGI-Core facade` | `core.sync_jobs`, validaciones, publicaciones | No existe |
| Modulos SIGI | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:374>) | `GET /api/admin/modules/status` | `SIGI-Core facade` | healthchecks, metrics y config de modulos | No existe |
| Consola por modulo | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:408>) | `GET /api/admin/modules/{moduleId}` | `SIGI-Core facade` | resumen operacional por dominio | No existe |
| Flujo de integracion | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:413>) | `GET /api/admin/pipeline/overview` | `SIGI-Connectors` + `SIGI-Core` + `Bridge` | jobs, checkpoints, publicaciones | No existe |
| Cola de jobs / etapas | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:483>) | `GET /api/admin/sync-jobs?status=queued,running,failed` | `integration-service` via `sigi-api` | `core.sync_jobs`, `integration.sync_jobs` | Parcial; hoy existe `GET /api/sync-jobs/{jobId}` pero no listado |
| Instituciones | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:497>) | `GET /api/admin/institutions`, `GET /api/admin/institutions/{id}` | `SIGI-Core` | `core.institutions` | Parcial; hoy existe `GET /api/institutions` pero es in-memory y sin detalle |
| Fuentes de datos | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:528>) | `GET /api/admin/connectors`, `GET /api/admin/connectors/{id}`, `POST /api/admin/institutions/{institutionId}/connectors/{connectorId}/sync` | `SIGI-Connectors` | `core.connectors`, `core.sync_jobs` | Parcial |
| Calidad y validacion | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:545>) | `GET /api/admin/validation/runs`, `GET /api/admin/validation/issues`, `POST /api/admin/validation/recheck` | `SIGI-Core` | futuras tablas `validation_runs`, `validation_issues` | No existe |
| Publicacion | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:581>) | `GET /api/admin/publications`, `POST /api/admin/publications/{id}/publish` | `SIGI-Bridge` + `Geo/BI` | datasets listos, salidas publicas, capas | No existe |
| API e interoperabilidad | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:612>) | `GET /api/admin/apis/status`, `GET /api/admin/exports`, `POST /api/admin/exports/{target}/run` | `SIGI-Bridge` + observabilidad | healthchecks, metricas, export jobs | No existe |
| Usuarios y roles | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:643>) | `GET /api/admin/users`, `POST /api/admin/users`, `PATCH /api/admin/users/{id}` | `SIGI-Core admin` | futuro modulo auth/iam | No existe |
| Bitacora | [Backend demo](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend%20(1).html:681>) | `GET /api/admin/audit`, `GET /api/admin/audit/{eventId}` | `SIGI-Core` | futura tabla `audit_events` | No existe |

## Mapa de Modulos SIGI a Endpoints

### 1. `SIGI-Core`

Debe servir o consolidar:

- `GET /api/public/dashboard/*`
- `GET /api/public/indicators*`
- `GET /api/admin/validation/*`
- `GET /api/admin/audit*`
- `GET /api/admin/institutions*`
- recursos canonicos futuros:
  - `GET /api/datasets`
  - `GET /api/datasets/{id}/validation`
  - `GET /api/schemas`
  - `GET /api/catalogs`
  - `GET /api/audit`

### 2. `SIGI-Connectors`

Debe servir internamente:

- recepcion de sync requests
- estado de integracion
- checkpoints
- fallas de transformacion

Y exponerse al frontend solo a traves de `sigi-api`:

- `POST /api/admin/institutions/{institutionId}/connectors/{connectorId}/sync`
- `GET /api/admin/sync-jobs`
- `GET /api/admin/sync-jobs/{jobId}`

### 3. `SIGI-Bridge`

Debe cubrir:

- exportaciones nacionales e internacionales
- generacion de reportes
- entrega de paquetes a FERM u otros destinos

Endpoints recomendados:

- `GET /api/admin/exports`
- `POST /api/admin/exports/{target}/run`
- `GET /api/public/reports`
- `GET /api/public/reports/{id}`

### 4. `SIGI Geo/BI`

Debe cubrir:

- capas publicas
- features filtrables
- agregados territoriales
- widgets y mapas

Endpoints recomendados:

- `GET /api/public/geo/layers`
- `GET /api/public/geo/features`
- `GET /api/public/territories/summary`

## Origen de Datos Recomendado

| Tipo de dato | Schema / modulo sugerido | Comentario |
| --- | --- | --- |
| Instituciones | `core.institutions` | Ya existe, pero `sigi-api` aun no lee desde DB |
| Conectores | `core.connectors` | Ya existe |
| Sync jobs plataforma | `core.sync_jobs` | Ya existe |
| Sync jobs integracion | `integration.sync_jobs` | Ya existe |
| Payloads crudos | `integration.raw_payloads` | Ya existe |
| Checkpoints | `integration.sync_checkpoints` | Ya existe |
| Fallas de transformacion | `integration.transform_failures` | Ya existe |
| Datasets canonicos | `core.datasets` | Falta |
| Registros canonicos | `core.records` o tablas de dominio | Falta |
| Validaciones | `core.validation_runs`, `core.validation_issues` | Falta |
| Publicaciones | `core.publications` | Falta |
| Auditoria | `core.audit_events` | Falta |
| Capas y read models GIS | `gis.*` | Falta implementacion real |

## Priorizacion de Integracion

### Fase 1. Hacer operable el admin minimo

Implementar primero:

1. `GET /api/admin/institutions`
2. `GET /api/admin/connectors`
3. `POST /api/admin/institutions/{institutionId}/connectors/{connectorId}/sync`
4. `GET /api/admin/sync-jobs`
5. `GET /api/admin/sync-jobs/{jobId}`

Con esto el admin deja de ser mock para:

- instituciones
- fuentes
- flujo de integracion
- estado operacional basico

### Fase 2. Hacer visible la calidad y la trazabilidad

Implementar:

1. `GET /api/admin/validation/issues`
2. `GET /api/admin/audit`
3. `GET /api/admin/operations/summary`

Con esto el admin ya refleja el discurso central del documento:

- gobernanza
- validacion
- continuidad
- trazabilidad

### Fase 3. Hacer real el dashboard pais

Implementar:

1. `GET /api/public/dashboard/summary`
2. `GET /api/public/indicators`
3. `GET /api/public/projects`
4. `GET /api/public/territories/summary`
5. `GET /api/public/geo/features`

Esta fase debe esperar a que exista:

- dataset canonico
- publicacion
- GIS real

## Opinion Tecnica

No conviene intentar conectar el dashboard primero.

El orden correcto es:

1. admin operativo
2. validacion y auditoria
3. publicacion
4. dashboard publico

Razon:

- el dashboard consume datos ya gobernados
- si no existe primero el flujo de gobierno y publicacion, el dashboard solo maquillaria mocks

## Decision de Arquitectura Recomendada

### Lo que el frontend SI debe hacer

- consumir un `apiClient` central con `API_BASE_URL`
- hablar solo con `sigi-api`
- manejar estados `loading`, `empty`, `error`, `queued`, `running`, `completed`, `failed`
- usar polling para sync jobs y publicaciones

### Lo que el frontend NO debe hacer

- llamar directo a `integration-service`
- llamar directo a `gis-service`
- usar iframes externos como sustituto de GIS
- construir contratos sobre nombres mock como `/projects` o `/samples` sin validar contra backend

## Siguiente paso recomendado

Con esta matriz ya se puede hacer el siguiente entregable util:

- una **especificacion de endpoints frontend-ready**

Eso significa definir para cada endpoint:

- request
- response DTO
- estados
- errores
- permisos

Ese seria el paso correcto antes de construir el frontend real.
