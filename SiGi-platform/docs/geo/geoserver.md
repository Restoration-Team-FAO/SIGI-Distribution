# GeoServer — publicación WMS/WFS

Estado: sin cambios en P0-1…P0-9 (este trabajo no tocó la integración
GeoServer). Documentado aquí porque `MAPA_SIGI_DIAGNOSTICO.md` §10 lo listaba
como pendiente y porque `architecture.md` §2 depende de esta referencia para
explicar por qué `/geo/*` y GeoServer son dos caminos de lectura separados.

## 1. Qué es, y qué no es, este documento

Esto **no** es la documentación del módulo `/geo/*` construido en P0-3…P0-9
— ese módulo no publica ni consume nada de GeoServer; lee `gis.territory_features`
directamente. Este documento cubre el flujo preexistente, ya funcional antes
de este trabajo: **importar/publicar una capa desde la consola admin hacia
GeoServer**, y **consumir esa publicación como overlay WMS** en el visor
clásico de ambos frontends.

## 2. Configuración real (`.env.example`)

| Variable | Valor de ejemplo | Uso |
|---|---|---|
| `GEOSERVER_WORKSPACE` | `sigi` | Workspace único usado por todo el módulo |
| `GEOSERVER_DATASTORE` | `sigi_postgis` | Datastore PostGIS que GeoServer usa para leer `gis.*` directamente |
| `GEOSERVER_DB_SCHEMA` | `gis` | Esquema Postgres detrás del datastore |
| `GEOSERVER_INTERNAL_URL` | `http://geoserver:8080/geoserver` | URL interna (red Docker) que `sigi-api` usa para llamar a la REST API de GeoServer |
| `GEOSERVER_PUBLISH_PUBLIC_TERRITORIES` / `..._PROJECT_POLYGONS` / `..._PROJECT_CENTROIDS` | `true` | Featuretypes públicos publicados automáticamente al iniciar (`v_public_*`) |
| `VITE_GEOSERVER_ENABLED` / `VITE_GEOSERVER_PUBLIC_LAYER` / `VITE_GEOSERVER_TERRITORIES_LAYER` / `VITE_GEOSERVER_PROJECT_LAYER` | — | Consumidas por `countryGeoServerConfig`/`adminGeoServerConfig` en cada frontend para armar la URL WMS del overlay |

`docker-compose.yml` vincula el puerto de GeoServer a
`${GEOSERVER_BIND_HOST:-127.0.0.1}` — no expuesto en `0.0.0.0`, mismo patrón
de seguridad que P0-1 aplicó a `gis-service` (ver `permissions.md`).

## 3. Flujo de publicación (consola admin, `/admin/geospatial-catalog`)

`apps/sigi-api/src/modules/geospatial-catalog/geospatial-catalog.controller.ts`
(prefijo `admin/geospatial-catalog`, sin relación con `/geo/*`):

| Ruta | Acción |
|---|---|
| `GET` | Catálogo completo: capas gestionadas + derivadas, resumen, snapshot de GeoServer |
| `POST publish` | Publica/republica una capa por `code` |
| `POST projects/publish` | Publica un proyecto (polígono) |
| `POST import`, `POST shapefile/preview`, `POST shapefile/import` | Ingesta de GeoJSON/Shapefile con vista previa y validación |
| `POST kobo/promote` | Promueve datos Kobo a capa geoespacial |
| `GET export/:code` | Exporta una capa completa a GeoJSON (**no confundir con `/geo/layers/:code/export` de P0-8** — ver §4) |
| `DELETE :code` | Elimina una capa gestionada |

`publicationEligible` (por capa) exige `visibility === 'public'` **y**
`status === 'published'` — una capa no pública nunca es candidata a
publicación WMS, coherente con la jerarquía de visibilidad de
`permissions.md`.

## 4. Dos exportaciones distintas — no las confundas

| | `GET /admin/geospatial-catalog/export/:code` | `GET /geo/layers/:code/export` (P0-8) |
|---|---|---|
| Autenticación | Requiere sesión admin | Público con auth opcional |
| Formato | Solo GeoJSON | CSV / Excel / GeoJSON |
| Filtros/orden | No — capa completa siempre | Sí — mismo filtro/orden que la tabla de atributos |
| Auditoría | `recordAudit` privado de `geospatial-catalog.service.ts` (deuda documentada, no replicada) | `AuditService` compartido (`geo.layer.export`) |
| Tope | Ninguno explícito documentado aquí | `MAX_EXPORT_FEATURES = 20000` |

Son rutas, controladores y audiencias distintas que coexisten a propósito —
P0-8 no reemplazó la exportación admin existente, la complementó para ambos
frontends. Ver `exports.md` para el detalle de la de P0-8.

## 5. No verificado en esta sesión

El estado operativo real de GeoServer (capas efectivamente publicadas hoy,
salud del contenedor `geoserver-init`) no se re-verificó como parte de
P0-1…P0-9 — este trabajo no tocó esa integración. Para el estado actual,
consultar `GET /admin/geospatial-catalog` contra el entorno en ejecución.
