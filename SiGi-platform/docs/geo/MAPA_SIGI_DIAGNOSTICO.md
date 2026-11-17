# Mapa SIGI — Diagnóstico técnico del módulo geoespacial

**Fecha:** 2026-09-03
**Alcance:** módulo `Mapa SIGI` / Geo-BI (portal país y consola administrativa), servicios GIS, integración GeoServer/PostGIS.
**Estado:** **Los diez bloques del roadmap P0 (P0-1…P0-10) y los seis bloques de P1 (P1-1…P1-6)
están completados y verificados.** P0-1 (seguridad), P0-2 (cimientos de datos), P0-3 (API `/geo/*`,
backend), P0-4 (catálogo de capas), P0-5 (ficha de identificación + metadatos), P0-6 (filtros
dinámicos), P0-7 (tabla de atributos), P0-8 (exportación CSV/Excel/GeoJSON con auditoría), P0-9
(barra de herramientas del catálogo + auditoría de estados de carga/error/vacío) y P0-10 (pruebas
unitarias, E2E del flujo mínimo, documentación `docs/geo/` completa) — ver §9.1-§9.10. **P1**
("inteligencia territorial", descompuesto en P1-1…P1-6 al comenzar, §9): **P1-1** (búsqueda
territorial, spec §18), **P1-2** (estadísticas dinámicas por capa, spec §11), **P1-3** (capas
externas WMS/GeoJSON, spec §16), **P1-4** (vistas guardadas, spec §19), **P1-5** (gráficos de
distribución, spec §12 "Mapa + BI") y **P1-6** (búsqueda de proximidad, spec §10 "consultas
espaciales") — completados y verificados en ambos frontends, portal país y consola admin
(§9.11-§9.16). Solo **P2** (línea temporal, alertas, IA geoespacial) queda pendiente del roadmap
original.
Ver también [docs/geo/architecture.md](architecture.md), [docs/geo/layer-catalog.md](layer-catalog.md),
[docs/geo/permissions.md](permissions.md), [docs/geo/postgis.md](postgis.md),
[docs/geo/geoserver.md](geoserver.md), [docs/geo/spatial-analysis.md](spatial-analysis.md) y
[docs/geo/exports.md](exports.md).

> Este documento describe **lo que existe hoy**, verificado leyendo el código. Cuando un dato no pudo
> confirmarse en el repositorio se indica explícitamente como *No verificado*. No se han inventado
> capacidades, endpoints ni metadatos.

---

## 1. Arquitectura encontrada

La arquitectura real coincide en lo esencial con la arquitectura objetivo descrita en la
especificación, salvo por un desvío importante (ver §1.2).

```text
React 18 + Vite (frontend-country, frontend-admin)
        │   Leaflet 1.9.4 cargado por CDN (window.L), NO como dependencia npm
        ▼
   sigi-api (NestJS)
        │
        ├──────────────► PostgreSQL + PostGIS   (esquemas core.*, gis.*)
        │
        ├──────────────► gis-service (FastAPI, Python)      puerto 8002
        │
        └──────────────► GeoServer (WMS/WFS)                puerto 8081
                                 ▲
        frontend ────────────────┘  (WMS directo desde el navegador)
```

Componentes confirmados:

| Componente | Ruta | Stack |
|---|---|---|
| Portal país | `apps/frontend-country` | React 18, Vite 5, react-router 6 |
| Consola admin | `apps/frontend-admin` | React 18, Vite 5, react-router 6 |
| API | `apps/sigi-api` | NestJS |
| Servicio GIS | `services/gis-service` | FastAPI + psycopg |
| Conector PostGIS | `services/connectors/postgis` | TypeScript |
| Base de datos | `infra/postgres` | PostgreSQL + PostGIS |
| GeoServer | `infra/geoserver/bootstrap.sh` | workspace `sigi`, datastore `sigi_postgis`, esquema `gis` |

### 1.1 Esquema de datos

`infra/postgres/init/002_core_schema.sql:827-847` define **únicamente dos tablas** en el esquema `gis`:

```sql
gis.geo_layers (
  id, code, name, layer_type, visibility, status, created_at, updated_at
)

gis.territory_features (
  id, territory_id, layer_id, area_ha,
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  properties_json JSONB, created_at, updated_at
)
```

Vistas para GeoServer en `infra/postgres/init/008_geoserver_public_views.sql`:
`gis.v_public_territories`, `gis.v_public_project_polygons`, `gis.v_public_project_centroids`.
Las tres filtran correctamente por `visibility = 'public' AND status = 'published'`.

### 1.2 Desvío respecto de la arquitectura objetivo

La especificación indica que *"el frontend no debe depender directamente de la base de datos"* y que
`sigi-api` debe ser la frontera del sistema. Esto se cumple para datos vectoriales, pero **no** para
GeoServer: el navegador consume WMS directamente contra GeoServer usando `VITE_GEOSERVER_*`
(`apps/frontend-country/src/services/api.ts:117-120`). Es una decisión razonable por rendimiento —
las teselas WMS no deberían atravesar la API — pero implica que **la seguridad de GeoServer no puede
delegarse en el RBAC de `sigi-api`**. Hoy solo se publican vistas `_public_`, por lo que el riesgo
está contenido, pero cualquier publicación futura de capas restringidas requerirá seguridad propia
en GeoServer o un proxy WMS en la API. Se documenta como decisión pendiente, no como defecto.

---

## 2. Componentes existentes

### Frontend — ~10.700 líneas ya escritas

| Archivo | Líneas | Rol |
|---|---|---|
| `apps/frontend-admin/src/pages/GeoBiModulePage.tsx` | 2.465 | Página Mapa SIGI (admin) |
| `apps/frontend-admin/src/pages/GeospatialCatalogPage.tsx` | 1.520 | Catálogo/publicación de capas |
| `apps/frontend-admin/src/components/GeoBiLayerMap.tsx` | 1.268 | Visor Leaflet (admin) |
| `apps/frontend-country/src/pages/GeoBiPage.tsx` | 940 | Página Mapa SIGI (país) |
| `apps/frontend-country/src/components/GeoBiLayerMap.tsx` | 810 | Visor Leaflet (país) |
| `apps/frontend-admin/src/components/OperationalLayerMap.tsx` | 713 | Visor operativo |
| `apps/frontend-country/src/components/ProjectCoverageMap.tsx` | 523 | Cobertura de proyectos |
| `apps/frontend-admin/src/components/ProjectCoverageMap.tsx` | — | Cobertura de proyectos (admin) |

**El módulo no parte de cero.** Existe una base sustancial que debe reutilizarse y refactorizarse,
no reescribirse. Nótese la duplicación: `GeoBiLayerMap` y `ProjectCoverageMap` existen en versiones
paralelas en ambos frontends, con divergencia entre ellas.

### Backend

- `apps/sigi-api/src/modules/geo-bi/` — agregador de KPIs del módulo (`geo-bi.service.ts`, 756 líneas).
- `apps/sigi-api/src/modules/geospatial-catalog/` — catálogo, publicación, importación (2.472 líneas).
  Incluye importación GeoJSON, importación Shapefile (con preview), promoción de datos Kobo,
  publicación en GeoServer vía REST, y auditoría.
- `apps/sigi-api/src/modules/territories/` — listado de territorios y proxy de features.
- `services/gis-service/app/api/routes/geometry.py` — GeoJSON desde PostGIS.
- `services/gis-service/app/api/routes/shapefile.py` — ingesta de shapefiles.

---

## 3. Endpoints actuales

| Método | Ruta | Autenticación | Notas |
|---|---|---|---|
| GET | `/geo-bi` | **Ninguna** | Módulo público (`includeInternal = false`) |
| GET | `/admin/geo-bi` | Bearer + roles + permisos | Módulo interno completo |
| GET | `/admin/geo-bi/capabilities` | Bearer + roles + permisos | GetCapabilities WMS |
| GET | `/territories` | **Ninguna** | Lista de territorios activos |
| GET | `/territories/features?layer=&level=` | **Ninguna** | ⚠️ Ver §5 — proxy a gis-service |
| GET | `/admin/geospatial-catalog` | Bearer + `connectors.read` | Catálogo completo |
| POST | `/admin/geospatial-catalog/publish` | Bearer + `publications.publish` | Publica en GeoServer |
| GET | `/admin/geospatial-catalog/export/:code` | Bearer + `connectors.read` | Exporta GeoJSON |
| POST | `/admin/geospatial-catalog/import` | Bearer + `imports.upload` | Importa GeoJSON |
| POST | `/admin/geospatial-catalog/shapefile/preview` | Bearer + `imports.upload` | Preview shapefile |
| POST | `/admin/geospatial-catalog/shapefile/import` | Bearer + `imports.upload` | Importa shapefile |
| POST | `/admin/geospatial-catalog/projects/publish` | Bearer + `publications.publish` | Publica proyecto |
| POST | `/admin/geospatial-catalog/kobo/promote` | Bearer + `connectors.run` | Promueve sync Kobo |
| POST | `/admin/geospatial-catalog/kobo/build-analysis` | Bearer + `connectors.run` | Análisis Kobo |
| POST | `/admin/geospatial-catalog/kobo/build-demo-analysis` | Bearer + `connectors.run` | Ruta legacy |
| DELETE | `/admin/geospatial-catalog/:code` | Bearer + `publications.publish` | Elimina capa |

Servicio GIS interno (`services/gis-service/app/main.py:13-24`):

| Ruta | Autenticación |
|---|---|
| `/health/*` | Ninguna |
| `/geometry/*` | **Ninguna** ⚠️ |
| `/metrics/*` | `require_internal_service_auth` |
| `/shapefile/*` | `require_internal_service_auth` |

**No existe hoy ningún endpoint** de: consulta espacial, buffer, intersección, estadísticas por
geometría, búsqueda territorial, vistas guardadas, ni exportación de resultados filtrados.

---

## 4. Funcionalidades existentes

### Ya implementadas y funcionales — conservar

1. Visor Leaflet con capas GeoJSON, selección de feature y sincronización con panel lateral.
2. Selector de mapa base (4 opciones: sin fondo, claro/CARTO, OSM, satélite/Esri) — sin claves API.
3. Superposición WMS de GeoServer con control de opacidad.
4. Catálogo administrativo de capas con estado de publicación en GeoServer.
5. Publicación de capas a GeoServer vía REST (workspace, datastore, feature type, capa).
6. Importación de GeoJSON y de Shapefile con vista previa.
7. Promoción de datos Kobo a capas geoespaciales.
8. Exportación de una capa completa a GeoJSON.
9. Auditoría de operaciones del catálogo (`recordAudit`, integrada con `core.audit_events`).
10. Degradación correcta cuando GeoServer no responde (`ServiceUnavailableException` acotada).
11. KPIs agregados del módulo calculados con SQL real sobre `core.*` y `gis.*`.

### Parcialmente implementadas

| Capacidad | Estado real |
|---|---|
| Catálogo de capas en UI | Lista plana. Sin categorías, grupos, orden, transparencia por capa ni zoom-a-capa |
| Filtros | Existen, pero **hardcodeados** para el dataset DNEA (§6) |
| Leyenda | Solo coloreado por categoría en el visor; sin leyenda WMS (`GetLegendGraphic`) |
| Identificación de objetos | Muestra atributos crudos; sin ficha contextual ni enlaces a proyecto/indicador/documento |
| Metadatos | **No existen columnas** para almacenarlos (§7) |
| Exportación | Solo capa completa a GeoJSON, solo admin. Sin CSV/Excel, sin resultados filtrados |
| Tabla de atributos | No existe como tal |

### No implementadas

Análisis espacial (buffer, intersección, distancia), estadísticas dinámicas por selección,
búsqueda territorial, análisis guardados, capas externas WMS/WFS del usuario, línea temporal,
alertas geográficas, IA geoespacial, herramientas de medición, exportación de mapa a PNG/PDF.

---

## 5. 🔴 Hallazgo de seguridad — exposición de capas no públicas

**Este es el hallazgo más importante del diagnóstico y debe corregirse antes que cualquier
funcionalidad nueva.**

Tres condiciones se combinan:

**(a) El guard global es opt-in.** `RolesGuard` está registrado como `APP_GUARD`
(`apps/sigi-api/src/modules/auth/auth.module.ts:15-18`), pero devuelve `true` cuando el handler no
declara roles ni permisos (`roles.guard.ts:38-44`). Un controlador sin decoradores queda **abierto**.

**(b) `TerritoriesController` no declara ningún decorador.**
`apps/sigi-api/src/modules/territories/territories.controller.ts:4` — sin `@UseGuards`, sin `@Roles`,
sin `@Permissions`. Ambos endpoints son anónimos.

**(c) La consulta subyacente no filtra por visibilidad.**
`services/gis-service/app/api/routes/geometry.py:14-32` filtra por `gl.code = %s` y opcionalmente por
`t.level`, pero **no** por `gl.visibility` ni por `gl.status`, y devuelve `properties_json` completo.

Resultado: una petición anónima

```http
GET /territories/features?layer=<código_de_capa_interna>
```

devuelve las geometrías y **todas las propiedades** de cualquier capa, incluidas las marcadas
`visibility = 'internal'`. Esto contradice directamente §15 de la especificación
(«la autorización debe verificarse también en backend») y afecta justamente los datos que la
especificación señala como sensibles: propietarios, personas, beneficiarios identificables y
ubicaciones.

**Agravante:** `gis-service` publica el puerto 8002 en el host
(`docker-compose.yml:144-145`) y `/geometry` es el **único** router montado sin
`require_internal_service_auth`. La misma consulta es alcanzable saltándose la API por completo.

### 5.1 Verificación en entorno real — el defecto era explotable

No se quedó en análisis: se reprodujo contra el entorno local en ejecución mediante
`scripts/geo-visibility-smoke.mjs`. Antes de la corrección, una petición **anónima** devolvió las
geometrías de una capa `internal` recién creada **junto con sus propiedades sensibles**.

El inventario real de la base de datos confirmó además una capa afectada con datos:

| Capa | Visibilidad | Features | Estado antes | Estado después |
|---|---|---|---|---|
| `odoo_project_territories` | `private` | 1.160 | Legible **anónimamente** | Requiere autorización |

`docker compose ps` confirmó también que `gis-service` estaba publicado en `0.0.0.0:8002`, es decir
accesible desde toda la red, no solo desde el host.

### 5.2 Corrección aplicada

Implementada y verificada como bloque **P0-1**:

1. `visibility` y `status` se filtran **en el origen** (`geometry.py`), nunca en el frontend.
2. `/geometry` pasa a exigir `require_internal_service_auth`, igual que `/metrics` y `/shapefile`.
3. `gis-service` se vincula a `127.0.0.1` siguiendo la convención ya existente de `GEOSERVER_BIND_HOST`.
4. `/territories/features` mantiene acceso anónimo —el portal país no envía token— pero resuelve la
   visibilidad a partir del principal: solo quien presenta un token válido con `connectors.read`
   recibe capas no públicas.
5. Prueba de regresión incorporada al *release gate*.

**Nota sobre los valores de visibilidad:** aunque `normalizeVisibility`
(`geospatial-catalog.service.ts:1727-1729`) solo produce `'public'` o `'internal'`, la base de datos
contiene también `'private'`. Por eso el filtro usa **lista blanca** (`visibility = 'public'`) y no
lista negra: cualquier valor nuevo queda restringido por omisión, que es el comportamiento seguro.

---

## 6. Mocks, datos demo y hardcodeos encontrados

No se encontraron *mocks* de red ni datos falsos inyectados en el frontend: **todos los KPIs se
calculan con SQL real**. Lo que sí existe es hardcodeo de configuración que la especificación prohíbe
(§34) y datos de demostración:

| Ubicación | Problema |
|---|---|
| `frontend-country/src/pages/GeoBiPage.tsx:16-26` | `dneaFilterDefinitions` — filtros (Provincia, Cantón, Distrito, Agencia, Actividad, Sexo…) hardcodeados para un único dataset |
| `frontend-country/src/pages/GeoBiPage.tsx:82-98` | Códigos de capa hardcodeados: `corredor_seco`, `project_polygons`, `territories` |
| `frontend-country/src/pages/GeoBiPage.tsx:41-47` | Niveles territoriales hardcodeados (`country`, `region`, `province`) |
| `frontend-admin/src/pages/GeoBiModulePage.tsx:60-64` | Capas legacy `kobo_dnea_demo_*` referenciadas por constante |
| `geospatial-catalog.controller.ts:243` | Ruta `kobo/build-demo-analysis` explícitamente marcada legacy |
| `002_core_schema.sql:849+`, `900_phase5_demo_seed.sql:838+` | Geometrías de demostración de El Salvador en el seed |
| `frontend-country/src/pages/GeoBiPage.tsx:28-39` | Paleta de 10 colores fija |

La especificación pide eliminar la dependencia de datos demo *donde exista una fuente real*. En este
repositorio las geometrías de El Salvador del seed **son** los únicos datos territoriales
disponibles; no hay fuente real alternativa en el código. Se mantienen como seed de desarrollo y se
documenta la dependencia, en lugar de borrarlos y dejar el módulo vacío.

---

## 7. Deuda técnica

**D1 — `gis.geo_layers` no tiene columnas de metadatos.** Solo `code`, `name`, `layer_type`,
`visibility`, `status`. La ficha de §13 pide 17 campos (institución, fuente, propietario, fecha del
dato, CRS, licencia, responsable…). **Ninguno existe.** Sin migración, §13 es inimplementable salvo
mostrando `No disponible` en todo.

**D2 — La columna de geometría admite solo `MultiPolygon`.** ✅ **Confirmado y documentado en P0-2**
(`docs/geo/postgis.md` §5) — no corregido, por diseño: migrar el tipo de columna implica recrear las
vistas de GeoServer y el importador. Verificado además que **ningún flujo de escritura activo de la
API** introduce nuevos casos Point→Buffer: tanto la importación GeoJSON como la de shapefile rechazan
explícitamente cualquier geometría que no sea `Polygon`/`MultiPolygon`; el rodeo solo existe en
`scripts/load_dnea_excel_to_geobi.py`, fuera del camino servido por la API. Diseño de migración futura
(columna `geometry_native geometry(Geometry,4326)`, backfill, corte) documentado, no ejecutado.

**D3 — No existe índice espacial GiST.** ✅ **Corregido en P0-2.** `territory_features_geometry_gix`
(GiST sobre `geometry`), más `territory_features_layer_id_idx` y `territory_features_territory_id_idx`.
Medido con `EXPLAIN ANALYZE` sobre datos reales: una consulta de intersección bbox pasó de *sequential
scan* (5.494 filas recorridas, 59,2 ms) a *index scan* (1,6 ms) — detalle completo en
`docs/geo/postgis.md` §1.

**D4 — Leaflet se carga desde CDN.** `index.html` de ambos frontends carga
`unpkg.com/leaflet@1.9.4` con SRI. La aplicación **no funciona sin internet**, y el código espera a
`window.L` haciendo *polling* cada 120 ms con timeout de 8 s
(`GeoBiLayerMap.tsx:58-84`). No hay tipos de TypeScript: el visor usa `any`.

**D5 — Duplicación entre frontends.** `GeoBiLayerMap` (810 vs 1.268 líneas) y `ProjectCoverageMap`
existen dos veces, ya divergentes — sin cambios, siguen sin tocarse (P0-4/P0-9 crearon componentes
*nuevos* en vez de retrofit, ver §9.2). **Parcialmente atendido para lo nuevo**: los 5 componentes de
P0-4/P0-5/P0-7 (`GeoLayerCatalogPanel`, `MultiLayerMap`, `FeatureIdentificationPanel`,
`GeoLayerAttributeTable`, y el envoltorio de `GeoLayerFilterControls`) sí existen dos veces
—divergencia visual deliberada, dos *design systems* reales— pero P0-6 extrajo la única pieza sin
JSX (`buildGeoFiltersFromForm`, la conversión de formulario de filtros a filtros de servidor) a
`libs/shared`, compartida de verdad entre ambos frontends. Precedente para futura extracción: mover
lógica pura, no intentar unificar JSX entre *design systems* que ya divergieron.

**D6 — Sin paginación ni acotación por bbox.** `/territories/features` devuelve la capa **completa**
en una sola respuesta. Contradice §23 («no descargar datasets completos automáticamente»).

> **Medición real.** La capa `territories` —la que el portal país carga por defecto al abrir el
> módulo— devuelve **59,1 MB** en una sola respuesta para apenas 19 features: son polígonos con
> altísima densidad de vértices, sin simplificar. Es, con diferencia, el mayor problema de
> rendimiento del módulo y afecta a todo visitante anónimo del portal. Debe atacarse en P0 con
> `ST_SimplifyPreserveTopology` por nivel de zoom y acotación por bbox.
>
> **Causa raíz confirmada en P0-2.** Una sola geometría de `territories` tiene **574.381 vértices**
> (≈9 MB) — un trazado de altísima resolución cargado sin simplificar, no un problema general de
> densidad de todas las capas (`pastos_ref`, 2.248 features, es normal). `ST_SimplifyPreserveTopology`
> reduce el payload 549× (59,1 MB → 107,6 KB) para `territories`, pero el propio cálculo de
> simplificación cuesta más que servir la geometría cruda para esta capa concreta (2,5 s vs 246 ms) —
> el volumen de vértices por recorrer supera el ahorro de hacerlo por request. Recomendación para
> P0-3: simplificar `territories` una vez al publicar/importar y cachear por nivel de zoom, no en cada
> request; para capas de densidad normal, simplificar por request es viable (21 ms medido sobre
> `pastos_ref`). Detalle completo, incluida la función `gis.features_geojson_in_bbox` preparada para
> P0-3, en `docs/geo/postgis.md` §4.

**D9 — El `dist/` del host es el artefacto de ejecución en desarrollo.** `docker-compose.yml:41`
monta `./apps/sigi-api:/usr/src/app`, por lo que el contenedor ejecuta el `dist/` compilado en el
host y **el `npm run build` del Dockerfile es irrelevante en desarrollo**. Además `apps/sigi-api`
carecía de `.dockerignore` (el de la raíz no aplica: el contexto de build es la subcarpeta), de modo
que `COPY . .` copiaba `node_modules` y un `dist/` obsoleto dentro de la imagen. Detectado al
verificar P0-1: el código corregido no surtía efecto hasta ejecutar `npm run build:api` en el host.
Se añadió `apps/sigi-api/.dockerignore`. **Quien modifique el backend debe recompilar en el host y
reiniciar el contenedor**; conviene documentarlo en el README de desarrollo.

**D7 — Cobertura de pruebas nula en geo.** Atendido para backend: `scripts/geo-visibility-smoke.mjs`
(P0-1) y `scripts/geo-api-smoke.mjs` (P0-3, 16 verificaciones), ambos en el *release gate*. Sigue sin
existir prueba E2E de UI (Playwright) para el módulo — pendiente hasta que exista frontend que probar
(P0-4+).

**D8 — Sin validación de DTO en el catálogo.** Sin cambios en `/admin/geospatial-catalog` (fuera de
alcance de P0-2/P0-3, retrofit no solicitado). El nuevo módulo `/geo/*` de P0-3 **sí nace con
validación desde el inicio** —`apps/sigi-api/src/modules/geo/dto/geo-feature-query.dto.ts`—, siguiendo
el patrón manual `normalize()`/`throw BadRequestException` ya establecido en
`geospatial-catalog.service.ts` en lugar de introducir `class-validator`, que no es dependencia del
proyecto.

**D10 — El valor `private` ya existente colisiona con el nuevo nivel `private` de la jerarquía.**
Hallazgo de P0-2. `gis.geo_layers.visibility = 'private'` ya existía en producción
(`odoo_project_territories`, 1.160 features, escrito directamente por
`odoo-sources.service.ts:1561`), y se comportaba exactamente igual que `'internal'` en el código
anterior a esta migración. La especificación pide que `private` sea el nivel *más estricto* de una
jerarquía de cuatro niveles. Reclasificar esa fila automáticamente habría sido una suposición no
verificable sobre la intención de quien la creó. **Decisión: no reclasificar.** La jerarquía y su
función de rango (`gis.geo_visibility_rank`) se agregaron como capa descriptiva; el *enforcement* de
acceso sigue siendo binario (público / no público), sin cambios de comportamiento. Detalle completo
y la revisión pendiente antes de habilitar un *enforcement* por nivel: `docs/geo/permissions.md` §2.

**D11 — Coordenadas erróneas en `dnea_activity_points` (2 features en longitud ≈ 0).** Hallazgo de
P0-2, detectado por el perfilado de extensión (`gis.geo_layer_profile`), no por `ST_IsValid` (las
geometrías son sintácticamente válidas, solo están en el lugar equivocado — el defecto clásico de
"null island"). Origen probable: `scripts/load_dnea_excel_to_geobi.py`, un valor de longitud ausente
tratado como `0`. No corregido en P0-2 (requiere decisión sobre el dato de origen, no una migración
de esquema). Detalle en `docs/geo/postgis.md` §2.

**Confirmado visualmente en P0-4** (§9.2): al activar `dnea_activity_points` junto a otras capas en el
nuevo catálogo, el ajuste automático de límites del mapa (`fitBounds` sobre la unión de capas activas)
se degrada a una vista mundial, porque el cuadro delimitador combinado se ve forzado a cubrir desde
Costa Rica hasta longitud 0. Eleva la prioridad práctica de corregir el dato de origen: ya no es solo
un hallazgo de perfilado, es un defecto visible para cualquier usuario que use el catálogo nuevo.

**Nota positiva verificada en P0-2:** el perfilado de las 11 capas existentes (5.496 features) no
encontró **ninguna** geometría nula ni inválida según `ST_IsValid` — ver `docs/geo/postgis.md` §2.

**D12 — Colisión de etiquetas humanizadas en el schema.** Hallazgo de P0-7, visible en la tabla de
atributos de `areas_protegidas_ref`: dos campos reales y distintos (`code`, el campo integrado que
SIGI asigna, y otro campo propio del dataset de origen) humanizan al mismo texto de UI "Código" vía
`humanizeFieldName` (`geo-schema.ts`). Ambos siguen leyendo su propio valor correctamente — es una
colisión de **presentación**, no de datos ni de seguridad. No corregido: resolverlo bien requeriría
o (a) desambiguar añadiendo el nombre real del campo entre paréntesis cuando hay colisión, o
(b) un mapa de alias curado por dataset — y (b) sería precisamente "inventar metadatos" que el
resto de P0-2/P0-3 evitó deliberadamente. Queda documentado para una decisión de UX en P1, no una
corrección de datos.

---

## 8. Brechas contra la especificación

| § | Requisito | Estado | Esfuerzo |
|---|---|---|---|
| 3 | Layout profesional 3 paneles + barra de estado | Parcial | Medio |
| 4 | Catálogo con categorías/grupos/orden/transparencia | **Ausente** | Medio |
| 5 | Selector de mapa base | ✅ Existe | — |
| 6 | Ficha contextual con enlaces SIGI | Parcial | Medio |
| 7 | Filtros dinámicos desde metadata | Hardcodeado | Alto |
| 8 | Tabla de atributos con paginación backend | **Ausente** | Alto |
| 9 | Barra de herramientas (medir, seleccionar…) | Parcial — barra de acciones de catálogo ✅ (P0-9); medir/seleccionar espacial deliberadamente fuera de alcance, ver `spatial-analysis.md` | Medio |
| 10 | Análisis espacial (buffer, intersección) | Parcial — **Completado (P1-6)** para búsqueda de proximidad (`ST_DWithin` sobre `::geography`, `POST /geo/layers/:code/nearby`), que resuelve buffer+intersección en una sola operación con UX conocida; primitivas crudas de buffer/intersección entre capas arbitrarias y medición de distancia en el mapa siguen fuera de alcance, ver `spatial-analysis.md` | Medio |
| 11 | Estadísticas dinámicas | Parcial (KPIs fijos) | Medio |
| 12 | Mapa + BI (gráficos) | ✅ **Completado (P1-5)** — distribución del resultado filtrado completo por campo, `GET /geo/layers/:code/stats`, barras CSS sin dependencia nueva | Medio |
| 13 | Metadatos y fuente | Esquema listo (`gis.geo_layer_metadata`), sin UI ni datos cargados | Medio |
| 14 | Trazabilidad | ✅ Base existe, falta extender | Bajo |
| 15 | Seguridad / RBAC | ✅ **Corregido y verificado (§5)** | — |
| 16 | Capas externas WMS/WFS/GeoJSON | ✅ **Completado (P1-3)** — WMS y GeoJSON agregables por el usuario, cliente-only (sin proxy); WFS cubierto como un caso de URL GeoJSON (`outputFormat=json`) | Medio |
| 17 | Exportaciones CSV/Excel/GeoJSON | Parcial (solo GeoJSON admin) | Medio |
| 18 | Búsqueda territorial | Parcial — por nombre/código ✅ (P1-1, `GET /geo/search`); por coordenada aún ausente, ver `spatial-analysis.md` | Medio |
| 19 | Análisis guardados | ✅ **Completado (P1-4)** — admin con persistencia real (`gis.geo_saved_views`); país con equivalente local (`localStorage`, sin cuentas); filtros/viewport no se restauran aún (documentado) | Medio |
| 20-22 | Línea temporal, alertas, IA | **Ausente** (P2) | Alto |
| 23 | Rendimiento (bbox, paginación, GiST) | GiST ✅; función bbox+simplify preparada, sin endpoint | Medio |
| 27 | Índices y validez de geometrías | ✅ **Completado (P0-2)** — GiST, perfilado, 0 inválidas | — |
| 29 | Pruebas | ✅ **Completado (P0-10)** — smoke de integración (visibilidad, API, roles), 65 pruebas unitarias, E2E del flujo mínimo en ambos frontends | Medio |
| 30 | Documentación `docs/geo/` | ✅ **Completado (P0-10)** — `MAPA_SIGI_DIAGNOSTICO.md`, `architecture.md`, `layer-catalog.md`, `permissions.md`, `postgis.md`, `geoserver.md`, `spatial-analysis.md`, `exports.md` | Bajo |

---

## 9. Propuesta de implementación

Orden deliberado: **la seguridad primero**, luego los cimientos de datos (sin los cuales §13 y §10
son imposibles), y solo después la interfaz. Cada bloque es verificable de forma independiente.

### P0 — módulo funcional profesional

| Bloque | Contenido | Depende de |
|---|---|---|
| ~~**P0-1**~~ | ✅ **Completado.** Cierre del defecto de §5: filtrado por visibilidad en origen, `/geometry` autenticado, `gis-service` en loopback, visibilidad resuelta por principal, prueba de regresión en el *release gate* | — |
| ~~**P0-2**~~ | ✅ **Completado.** Jerarquía de visibilidad formal + función SQL única compartida entre `sigi-api` y `gis-service`; tabla `gis.geo_layer_metadata` (1:1, institucional); columnas operacionales en `gis.geo_layers` (categoría, grupo, CRS, tipo de geometría, orden); índices GiST + btree; perfilado persistido (`gis.geo_layer_profile` / `refresh_geo_layer_profile`); función bbox+simplify preparada para P0-3 (`gis.features_geojson_in_bbox`, sin endpoint todavía); contratos TS en `libs/domain`/`libs/contracts`. Ver `docs/geo/permissions.md` y `docs/geo/postgis.md` para las mediciones y decisiones de diseño. | P0-1 |
| ~~**P0-3**~~ | ✅ **Completado (backend).** Módulo `apps/sigi-api/src/modules/geo/` nuevo: `GET /geo/layers`, `/geo/layers/:code`, `/:code/metadata`, `/:code/schema`, `/:code/features` (bbox + zoom→simplificación + paginación + filtros). Validación manual (sin `class-validator`, no es dependencia del proyecto — sigue el patrón `normalize()`/`throw BadRequestException` ya usado en `geospatial-catalog.service.ts`). Filtros traducidos a SQL parametrizado, nunca concatenado — ver `docs/geo/permissions.md` y el código de `geo-filter-sql.ts`. Detalle de verificación en §9.1. | P0-1, P0-2 |
| ~~**P0-4**~~ | ✅ **Completado — portal país y consola admin.** Panel `GeoLayerCatalogPanel` + mapa `MultiLayerMap`: categorías (agrupa por `category`, con `Sin categoría` cuando es `NULL`, que es el caso de las 11 capas hoy), activar/desactivar simultáneo real (no una sola capa a la vez como antes), transparencia por capa, zoom a capa, leyenda por capa. Implementado dos veces con estilos propios (paletas ya divergentes entre `frontend-country` y `frontend-admin` — ver §9.2), no una sola vez compartida. Verificación visual en §9.2 y §9.7. | P0-3 |
| ~~**P0-5**~~ | ✅ **Completado — portal país y consola admin.** Click-to-identify en `MultiLayerMap.tsx` (resalta la geometría, dispara `onFeatureClick`); `FeatureIdentificationPanel.tsx` — ficha del elemento (nombre, código, nivel, área, actualización **por feature**, no por capa) + panel de metadatos (spec §13, vía `/geo/layers/:code/metadata`) con `No disponible` explícito en cada campo ausente. Acción "Ver proyecto" real (no simulada) para `project_polygons`; `ProjectsPage.tsx`/`ProjectsModulePage.tsx` ganaron soporte a `?projectId=` en ambos frontends. Verificación visual en §9.3 y §9.7. | P0-3 |
| ~~**P0-6**~~ | ✅ **Completado — portal país y consola admin.** Filtros generados en runtime desde `/geo/layers/:code/schema` — texto (`contains`), rango numérico/fecha (`gte`+`lte`), booleano (`eq`), catálogo/multi-selección (`in`) — para **cualquier** capa activa, no solo DNEA. La conversión formulario→filtro (`buildGeoFiltersFromForm`) se movió a `@sigi/shared`, compartida de verdad entre ambos frontends — la única pieza de lógica de este trabajo que sí se comparte, ver §9.7. **No se borró** `dneaFilterDefinitions` de la "vista clásica" en ningún frontend; sigue siendo decisión de producto, fuera de alcance. Ver §9.4 y §9.7. | P0-3 |
| ~~**P0-7**~~ | ✅ **Completado — portal país y consola admin.** Paginación server-side (`page`/`pageSize`), ordenamiento server-side (`sort`/`order`, extensión aditiva de `/geo/layers/:code/features`), columnas derivadas del mismo schema que P0-6, sincronización real fila↔mapa. "Buscar" no se implementó como control aparte — los filtros de P0-6 ya cubren esa función. "Exportar registros seleccionados" queda explícitamente para P0-8. Ver §9.6 y §9.7. | P0-3 |
| ~~**P0-8**~~ | ✅ **Completado — backend, portal país y consola admin, implementados simultáneamente en ambos frontends (instrucción explícita del usuario).** `GET /geo/layers/:code/export` (format=csv\|xlsx\|geojson), mismos filtros/orden que `/features`, sin paginar (tope `MAX_EXPORT_FEATURES=20000`), geometría siempre a precisión completa (nunca simplificada). Cada exportación se audita vía el `AuditService` ya existente (`geo.layer.export`, éxito y fallo) — no se creó un segundo subsistema de auditoría. UI de exportación (selector de formato + botón "Exportar" + aviso de truncamiento) agregada a `GeoLayerAttributeTable.tsx` en ambos frontends. Ver §9.8. | P0-6 |
| ~~**P0-9**~~ | ✅ **Completado — portal país y consola admin.** Barra de herramientas del catálogo (búsqueda por nombre, actualizar catálogo, desactivar todas, zoom a todas las activas) sobre `GeoLayerCatalogPanel`. Auditoría explícita de estados de carga/error/vacío en los componentes de P0-4…P0-8: se confirmó que ya estaban cubiertos (ficha, metadatos, filtros, tabla, mapa) y se corrigió la única brecha real encontrada — el catálogo no distinguía "sin capas para tu perfil" de "sin resultados para la búsqueda". No se implementaron herramientas de medición/selección espacial (§8, requisito §9 del gap table): esas siguen fuera de alcance de P0, documentadas en "No implementadas" (§4) rumbo a P1/P2 — inventar ese alcance aquí habría contradicho la instrucción de no agregar funcionalidad no solicitada. Ver §9.9. | P0-4 |
| ~~**P0-10**~~ | ✅ **Completado.** 65 pruebas unitarias nuevas (`tests/unit/geo-*.test.mjs`, sobre el output compilado, sin servidor ni base de datos — permisos/visibilidad, filtros, ordenamiento, validación de query params, inferencia de schema, exportación) más las 2 preexistentes, 67/67; `tests/e2e/geo.spec.js` (flujo mínimo: catálogo → filtrar → ficha → exportar, en ambos frontends, verificado contra el stack real); `docs/geo/` completado con `architecture.md`, `layer-catalog.md`, `geoserver.md`, `spatial-analysis.md`, `exports.md` (además de los ya existentes `permissions.md`/`postgis.md`); `.env.example` revisado — sin variables nuevas que documentar (ninguna introducida por P0-2…P0-9). Ver §9.10. | todos |

### P1 — inteligencia territorial

A diferencia de P0, el roadmap original no descomponía P1 en bloques — solo enumeraba capacidades
(consultas espaciales, estadísticas dinámicas, gráficos BI, análisis guardados, capas externas,
búsqueda territorial). Descompuesto aquí en P1-1…P1-6, mismo criterio que P0: lo más barato y
reutilizable primero, lo que exige más decisiones de UX/alcance al final.

| Bloque | Contenido | Depende de |
|---|---|---|
| ~~**P1-1**~~ | ✅ **Completado — portal país y consola admin.** Búsqueda territorial (spec §18): `GET /geo/search?q=` busca por nombre/código de territorio en **todas** las capas visibles para el principal, no solo las activas; selecciona un resultado activa su capa (si no lo estaba) y abre la ficha de identificación (P0-5) sobre el elemento exacto. Ver §9.11. | P0-3, P0-5 |
| ~~**P1-2**~~ | ✅ **Completado — portal país y consola admin.** `GET /geo/layers/:code/profile` expone el perfil cacheado (`gis.geo_layer_profile`, P0-2): total de elementos, % con geometría válida, tipo de geometría, CRS, fecha de perfilado. Sin recompute inline — nunca calcula nada en el camino de la petición. `profile: null` explícito (no error) cuando una capa nunca fue perfilada. Renderizado en `GeoLayerCatalogPanel` al activar una capa, mismo patrón de fetch que el schema (P0-6). El refresco automático tras importar sigue sin resolver — deuda ya documentada en `postgis.md` §2, no ampliada aquí. Ver §9.12. | P0-2 |
| ~~**P1-3**~~ | ✅ **Completado — portal país y consola admin.** Formulario "Capas externas (WMS/GeoJSON)" en el catálogo: WMS se renderiza como overlay raster vía `L.tileLayer.wms` (mismo mecanismo que el overlay GeoServer ya existente en `GeoBiLayerMap.tsx`); GeoJSON se descarga **desde el navegador**, sin proxy de backend, y se integra al mismo pipeline vectorial que las capas internas (`MultiLayerMapEntry`). Sin backend nuevo — todo el bloque es frontend. Efímero por diseño: no persiste entre sesiones (eso es P1-4). WFS no tiene UI propia — una URL de `GetFeature` con `outputFormat=json` ya es, desde la perspectiva del navegador, una URL de GeoJSON más. Ver §9.13. | P0-4 |
| ~~**P1-4**~~ | ✅ **Completado — consola admin con persistencia real; portal país con equivalente local.** Nueva tabla `gis.geo_saved_views` (migración `012_geo_saved_views.sql`) + `GET`/`POST`/`DELETE /geo/saved-views`, las únicas rutas de este módulo que exigen sesión real (401 anónimo) porque una vista guardada es dato propiedad de un usuario, no un nivel de visibilidad. `frontend-country` no tiene ningún sistema de cuentas (verificado: sin código de login en toda la app) — recibe en su lugar una versión local vía `localStorage`, nunca sincronizada. Restaura capas activas + color + opacidad; **no restaura filtros ni viewport** (decisión de alcance explícita, documentada, no un olvido). Ver §9.14. | P0-6, P0-9 |
| ~~**P1-5**~~ | ✅ **Completado — portal país y consola admin.** `GET /geo/layers/:code/stats?field=&filters=` agrega el **resultado filtrado completo** (nunca la página de la tabla) por un campo — conteos agrupados para texto/booleano/enum, min/máx/promedio para numéricos, min/máx para fechas. Reutiliza `buildBaseQuery`/`resolveFieldExpression` (mismo predicado de visibilidad y filtros que `/features`), sin lógica de consulta nueva. Sección "Distribución" agregada a `GeoLayerAttributeTable.tsx` en ambos frontends — barras CSS, mismo patrón ya usado en `BiVisualizerPage.tsx`, sin librería de gráficos nueva. Ver §9.15. | P0-6 |
| ~~**P1-6**~~ | ✅ **Completado — portal país y consola admin**, con alcance deliberadamente acotado a **una** operación espacial: búsqueda de proximidad. `POST /geo/layers/:code/nearby` (`geometry` + `radiusMeters` → features dentro del radio, más cercano primero) vía `ST_DWithin` sobre un cast `::geography` — buffer + intersección en una sola llamada PostGIS, en vez de exponer primitivas de buffer/intersección sueltas sin que exista todavía una decisión de UX sobre qué haría un usuario con ellas. Sección "Elementos cercanos" en la ficha de identificación (P0-5): capa objetivo + radio (500 m…10 km) + resultados ordenados por distancia; seleccionar uno reutiliza literalmente el flujo de selección de P1-1. Buffer/intersección como primitivas independientes y medición en el mapa quedan fuera, documentado en `docs/geo/spatial-analysis.md`. Ver §9.16. | P1-2 |

### P2 — capacidades avanzadas

Línea temporal, comparación temporal, alertas territoriales, monitoreo satelital, análisis
multicriterio, IA geoespacial (traducción a consulta estructurada verificable; **nunca** SQL libre
generado por el modelo).

### P0-2 — resultados de verificación

Ejecutado en el entorno de desarrollo en ejecución (no simulado), 2026-09-01:

1. **Migraciones ejecutadas** — `011_geo_layer_intelligence.sql` aplicada con
   `psql -f /docker-entrypoint-initdb.d/011_geo_layer_intelligence.sql`, sin errores.
2. **Datos existentes verificados intactos** — `gis.territory_features`: 5.496 filas antes y después;
   `gis.geo_layers`: 11 filas antes y después; valores de `visibility` (`public`/`private`/`internal`)
   sin alterar.
3. **`EXPLAIN ANALYZE` antes/después del GiST** — bbox sobre `pastos_ref`: *Seq Scan* (5.494 filas
   recorridas, 59,2 ms) → *Index Scan* (1,6 ms). Detalle en `docs/geo/postgis.md` §1.
4. **`odoo_project_territories` (1.160 features) sigue accesible solo con autorización** —
   confirmado con y sin token: anónimo → `0` features; con `Authorization: Bearer <token superadmin>`
   → `1.160` features. El nuevo `gis.features_geojson_in_bbox` respeta la misma regla (verificado
   directamente por SQL: `0` filas con `include_internal=false`, `1.160` con `true`).
5. **Lint** — `npm run lint` (typecheck + verify:env + verify:compose + compileall Python) — sin errores.
6. **Typecheck** — `npm run typecheck` (country + admin + api) — sin errores tras agregar los
   contratos nuevos a `libs/domain` y `libs/contracts`.
7. **Tests** — `npm run test:unit` — 2/2. `node scripts/role-smoke.mjs` — 33/33, incluidos los 7
   checks que tocan `/admin/geo-bi` y `/admin/geospatial-catalog` (compatibilidad, §10).
8. **Smoke de visibilidad** — `node scripts/geo-visibility-smoke.mjs` — 4/4, sin regresión tras el
   refactor a `gis.geo_visibility_is_public`.
9. **Documentado** — este documento, `docs/geo/permissions.md`, `docs/geo/postgis.md`.

**Recordatorio operativo (D9):** cada cambio de TypeScript en `sigi-api` requirió
`npm run build:api` en el host y `docker compose restart sigi-api` — el contenedor ejecuta el `dist/`
del host vía bind mount, no reconstruye solo. `gis-service` requirió `docker compose build gis-service`
(cambio en Python, no montado en modo *watch*).

### P0-3 — diseño y resultados de verificación

**Decisiones de ruteo.** El endpoint `/geo/layers/:id` de la especificación original se implementó
como `/geo/layers/:code` — la especificación admite explícitamente que esos nombres son orientativos
(§26: *"revisar las rutas actuales para no duplicar endpoints"*), y `code` es la clave que ya usa el
resto del sistema (`/territories/features?layer=`, `/admin/geospatial-catalog/export/:code`,
`selectedLayerCode` en el frontend) — usar `:id` habría introducido una segunda convención de
identificador para el mismo recurso.

**Filtros seguros.** `geo-filter-sql.ts` traduce `GeoFeatureQueryFilter[]` a SQL parametrizado: la
estructura (qué columna o expresión `properties_json ->> $n`, qué operador, qué *cast*) la elige
código de servidor desde un conjunto fijo; **el nombre del campo también viaja como parámetro
enlazado**, nunca concatenado — `properties_json ->> $n` acepta la clave como *bind parameter* en
PostgreSQL, así que ni siquiera el nombre de campo toca el texto SQL. Un operador incompatible con el
tipo declarado en el schema (p. ej. `gt` sobre un campo de texto) se rechaza con `400` antes de tocar
la base de datos.

**Verificado en el entorno real, 2026-09-01** (no simulado):

1. **Visibilidad, catálogo y detalle** — `GET /geo/layers` anónimo devuelve 10 capas (excluye
   `odoo_project_territories`); autenticado, 11. `GET /geo/layers/odoo_project_territories` → `404`
   anónimo, `200` autenticado. `GET /geo/layers/does-not-exist` → `404` — el mismo código que una capa
   real pero no autorizada, por diseño (no debe poder distinguirse por sondeo).
2. **Metadata** — `GET /geo/layers/pastos_ref/metadata` devuelve `metadata: null` (no hay fila en
   `gis.geo_layer_metadata`) — nunca un valor inventado.
3. **Schema derivado, no hardcodeado** — `GET /geo/layers/dnea_activity_points/schema` reprodujo,
   **a partir de los datos reales**, exactamente los campos que `GeoBiPage.tsx` tiene hardcodeados en
   `dneaFilterDefinitions` (`province`, `canton`, `district`, `agency`, `activityGeneral`, `activity`,
   `isPrimary`, `pympaType`, `sex`) más los valores de enumeración reales observados (p. ej. las 12
   agencias de extensión agropecuaria, los 4 tipos PYMPA). Confirmado en P0-6: la UI de filtros
   genérica construida sobre este endpoint reproduce esa misma capacidad para cualquier capa, sin
   configuración por dataset — ver §9.4. `dneaFilterDefinitions` en sí no se eliminó (sigue
   alimentando la "vista clásica"); retirarla es una decisión de producto sobre esa vista puntual,
   no un requisito técnico pendiente.
4. **Paginación siempre acotada** — sin parámetros, `pageSize` por defecto 200, `page` 1;
   `pageSize=99999` se clampa a 1.000 (`MAX_PAGE_SIZE`), nunca se rechaza ni se ignora el límite.
5. **El hallazgo de 59,1 MB, verificado corregible end-to-end** — `GET
   /geo/layers/territories/features?pageSize=50` sin `zoom`: **59.110.764 bytes**, igual a la medición
   original. Con `zoom=5`: **69.172 bytes** — 854× más pequeño, ~2 s (coherente con el costo de
   `ST_SimplifyPreserveTopology` medido en `docs/geo/postgis.md` §4 para esta capa densa). Con
   `zoom=16` (por encima de `MAX_SIMPLIFY_ZOOM=15`): vuelve a servir la geometría cruda, por diseño —
   a esa escala la simplificación no ahorraría nada. **El endpoint por sí solo no obliga a pasar
   `zoom`** — sigue siendo responsabilidad de la integración de mapa en P0-4 pasarlo siempre en
   llamadas de render interactivo.
6. **Filtros** — `province eq 'Alajuela'` sobre `dnea_activity_points`: 298 de 379 registros, todos
   con `province: "Alajuela"`. `areaHa gt 5` sobre `pastos_ref`: 927 de 2.248, todos `> 5`.
   `activityGeneral contains 'café'` (insensible a mayúsculas): 168 registros, todos conteniendo
   "Café". Campo desconocido → `400`. Operador numérico sobre campo de texto → `400`.
7. **Resistencia a inyección** — un intento de inyección vía nombre de campo de filtro
   (`"x'); DROP TABLE gis.geo_layers; --"`) devolvió `400` con el mensaje de "campo desconocido"; la
   tabla `gis.geo_layers` se verificó intacta (11 filas) inmediatamente después.
8. **Sin regresión** — `node scripts/geo-visibility-smoke.mjs` (4/4) y `node scripts/role-smoke.mjs`
   (33/33) tras refactorizar `TerritoriesController` para reutilizar
   `apps/sigi-api/src/common/auth/optional-principal.ts` (nueva, extrae la resolución de principal
   opcional que antes estaba duplicada entre `TerritoriesController` y el nuevo `GeoController`).
9. **Prueba nueva y dedicada** — `scripts/geo-api-smoke.mjs` (16/16), registrada en el *release gate*
   como `smoke:geo-api`, cubriendo los 9 puntos anteriores automatizados.
10. **Lint, typecheck** — `npm run lint` y `npm run typecheck` (los tres workspaces) en verde.

### P0-4 — diseño y resultados de verificación

**Decisión de alcance: portal país, no consola admin, en este bloque.** `GeoBiModulePage.tsx`
(2.465 líneas) y su propio `GeoBiLayerMap.tsx` (1.268 líneas) son sustancialmente más grandes y
complejos que sus equivalentes de país (940 y 810 líneas), y **sus *design systems* ya divergieron**:
`section-kit.tsx` de admin (515 líneas, paleta con `accentStrong`, tipo `SectionIcon`) y el de país
(193 líneas) no son intercambiables — verificado con `diff` antes de escribir código. Intentar el
mismo patrón en ambos frontends en un solo bloque habría significado o (a) apresurar el trabajo en
admin sin poder verificarlo con el mismo rigor, o (b) invertir en reconciliar dos *design systems* ya
divergentes, que es un proyecto en sí mismo y no estaba pedido. Se completó país, verificado a fondo;
admin queda como pendiente explícito, no silencioso — ver la fila de la tabla P0-4 y §10.

**Decisión de arquitectura: componente de mapa nuevo, no modificar `GeoBiLayerMap.tsx`.**
`GeoBiLayerMap.tsx` gestiona **una sola** capa activa a la vez (`contextLayerRef`, un único
`L.geoJSON`) y ese diseño sostiene funcionalidad que ya funciona (filtros DNEA, coloreado por
atributo, estadísticas) — retroadaptarlo para *N* capas simultáneas habría arriesgado esa
funcionalidad para un cambio fuera del alcance de P0-4. Se creó `MultiLayerMap.tsx`, con un
`Map<código, grupo Leaflet>` en lugar de una única referencia, expuesto vía `useImperativeHandle`
(`zoomToLayer`, `zoomToAll`). `ensureLeafletReady`/`basemapOptions` se duplicaron deliberadamente
(no se exportaron desde el archivo existente) — ~60 líneas estables, menor riesgo que tocar un
archivo en producción. Es una extensión acotada y documentada de D5, no una negación de esa deuda.

**Nuevos archivos**: `apps/frontend-country/src/components/GeoLayerCatalogPanel.tsx` (catálogo:
categorías, activar/desactivar, transparencia, zoom a capa) y `MultiLayerMap.tsx` (mapa Leaflet
multi-capa). Integrados en `GeoBiPage.tsx` como un panel **nuevo** ("Catálogo de capas"), colocado
antes del panel existente, que se conservó intacto y se renombró "Visor de mapas (vista clásica)"
para distinguirlo — nada de lo que ya funcionaba (filtros DNEA, estadísticas, KPIs, publicaciones) se
tocó ni se eliminó.

**Verificado visualmente, no solo por tipos** — `npm run typecheck`/`lint` en verde no prueba que algo
*se vea* correctamente. Se lanzó `frontend-country` real vía Docker y se condujo con Playwright
(`chromium.launch`, ya presente como dependencia del repo para los E2E existentes) contra
`http://localhost:5173/geo-bi`, con capturas de pantalla reales, no solo cambios de comportamiento
programático:

1. **Carga inicial** — el panel "Catálogo de capas" renderiza con las 10 capas públicas agrupadas
   bajo "Sin categoría" (correcto: ninguna capa tiene `category` asignada todavía — P0-2 no inventó
   valores), badges de visibilidad, y el mapa muestra el mundo con el basemap OSM cargado. Sin errores
   de consola.
2. **Activar 3 capas** (incluyendo `dnea_activity_points`) — el contador pasa a "3 activas", las filas
   se resaltan, aparecen sliders de transparencia y botones "Zoom a esta capa". **El mapa se alejó a
   vista mundial** en lugar de enfocar Costa Rica.
3. **Hallazgo confirmado, no un defecto de P0-4**: se repitió la prueba activando únicamente
   `areas_protegidas_ref` y `territories` (sin `dnea_activity_points`) — el mapa enfocó Costa Rica
   correctamente, con los polígonos renderizados con nitidez. La causa es **D11**, documentado en
   P0-2: dos features de `dnea_activity_points` tienen longitud ≈ 0 ("null island"); al incluirse en
   el cálculo de límites combinados (`fitBounds` sobre la unión de capas activas), el cuadro
   delimitador se extendía forzosamente de Costa Rica (-84°) hasta 0°, produciendo el zoom mundial.
   El nuevo catálogo multi-capa **expuso visualmente** un defecto de datos ya conocido; no lo causó.
   Se registra como hallazgo adicional para D11: el ajuste automático de límites (`fitBounds`) es
   frágil ante outliers de coordenadas de una sola capa entre varias activas — mitigación futura
   (P1): excluir outliers del cálculo de límites, no solo del conteo de válidas/inválidas.
4. **Botón "Zoom a esta capa"** — alejado manualmente el mapa, el botón sobre `areas_protegidas_ref`
   volvió a centrar y enfocar correctamente sobre sus polígonos.
5. **Sin regresión en la vista clásica** — se hizo scroll hasta "Visor de mapas (vista clásica)": el
   selector de capa única, el selector de escala territorial, y el mapa ejecutivo con sus propios
   controles de basemap renderizan exactamente como antes.
6. **Consola del navegador limpia** en las tres corridas (`console --errors` equivalente vía
   Playwright): cero errores.
7. **Build de producción** — `npm run build:country` compila sin advertencias nuevas; imagen Docker
   reconstruida y verificada en el contenedor real, no solo en `vite dev`.

### P0-5 — diseño y resultados de verificación

**Backend, no solo frontend.** `GeoService.queryFeatures` (P0-3) no exponía `tf.updated_at` por
feature — la "Actualización" de la ficha del elemento habría tenido que mostrar el `updatedAt` de la
*capa*, no del elemento seleccionado, contradiciendo el mockup de la especificación (§6, que muestra
una fecha por elemento). Se agregó `tf.updated_at` a la consulta y a `properties`, un cambio aditivo
(clave nueva en el objeto de propiedades; nada que ya leyera propiedades específicas se ve afectado) —
verificado con `curl` contra el endpoint real antes de tocar el frontend.

**Sin acciones inventadas.** El mockup de la especificación lista "Ver proyecto / Ver indicador / Ver
documento" como acciones contextuales. Antes de renderizar cualquiera, se verificó en la base de datos
qué relación existe realmente: `gis.territory_features.properties_json` para la capa `project_polygons`
sí contiene `projectId`/`projectCode`/`projectTitle` (confirmado con `psql`, no asumido). Ninguna capa
contiene una referencia a indicador o documento. Resultado: **"Ver proyecto" se implementó como un
enlace real y funcional; "Ver indicador" y "Ver documento" no se renderizan en absoluto** — mostrar un
botón que no lleva a ningún lado sería peor que no mostrarlo. "Descargar datos" se difiere
explícitamente a P0-8 (exportación), no se agregó como marcador deshabilitado.

**Enlace real entre módulos, no solo un `href`.** `/projects` no tenía forma de seleccionar un proyecto
específico por URL — su estado de selección era enteramente interno (`useState`, sin leer
`useSearchParams`). Se agregó soporte a `?projectId=` en `ProjectsPage.tsx` (aditivo: sin el parámetro,
el comportamiento previo —proyecto destacado o primero— no cambia). Sin este cambio, "Ver proyecto"
solo podría haber navegado a la lista general, no al proyecto específico que el usuario clickeó en el
mapa.

**Verificado visualmente con Playwright**, mismo método que P0-4:

1. **Click abre la ficha** — sobre una geometría de `territories`: el mapa resalta la geometría
   clickeada (borde más grueso), y la columna derecha muestra "Ficha del elemento" con Nombre, Código,
   Nivel/tipo, Área (902.412,39 ha) y **Actualización con fecha real** (`4 may 2026, 8:17 p. m.` —
   confirmando que el campo backend nuevo llega correctamente hasta la UI).
2. **Metadatos ausentes, mostrados explícitamente** — los 9 campos de "Fuente y metadatos de la capa"
   (Institución, Fuente, Propietario, Responsable, Fecha del dato, Frecuencia de actualización,
   Licencia, Clasificación, Nivel de acceso, Servicio de origen, Calidad) se renderizaron como
   "No disponible", correcto: ninguna de las 11 capas tiene fila en `gis.geo_layer_metadata` todavía.
   Tipo de geometría (`MultiPolygon`) y CRS (`EPSG:4326`) sí se mostraron, tomados del registro real de
   la capa.
3. **"Ver todos los atributos"** — expandible mostró correctamente los 4 atributos adicionales del
   `properties_json` de la feature (los que no son `code`/`name`/`level`/`areaHa`/`updatedAt`).
4. **Cerrar funciona** — tras hacer clic en "Cerrar", la ficha desapareció y el catálogo volvió a la
   disposición de 2 columnas.
5. **"Ver proyecto" — flujo completo verificado, no solo el botón**: se activó `project_polygons`, se
   usó "Zoom a esta capa" para llegar a la única feature (`Control de Incendios Forestales Guanacaste`,
   `project-CR-PRJ-007-polygon`, 514,76 ha), se hizo clic sobre la geometría — la ficha mostró el botón
   "Ver proyecto: Control de Incendios Forestales Guanacaste" con el nombre real del proyecto, no un
   texto genérico. Al hacer clic, la URL cambió a
   `http://localhost:5173/projects?projectId=c6ad7e6e-a69d-41e3-ae97-3ebb2cef15c4` — el ID real
   observado en la base de datos — y la navegación de React Router funcionó (menú lateral resaltó
   "Proyectos").
6. **Consola limpia** en las tres corridas de Playwright: cero errores.
7. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres workspaces), `npm run test:unit`,
   `geo-visibility-smoke` (4/4), `geo-api-smoke` (16/16), `role-smoke` (33/33) — todos en verde después
   del cambio de backend.

**Nota de proceso:** la primera corrida de Playwright tras el cambio no logró abrir la ficha (el clic
sobre la geometría no producía ningún efecto visible). Se investigó en vez de descartarlo como
"probablemente ya funciona": se agregó un `console.log` temporal dentro del manejador de clic para
confirmar si se disparaba. Con esa reconstrucción, la ficha sí abrió — indicando que la corrida
anterior había servido una build de Docker obsoleta, no un defecto de lógica. Se retiró el `console.log`
y se repitió la verificación limpia (con `npm run build:country` + reconstrucción de imagen antes de
probar) para confirmar que el comportamiento correcto no dependía del log en sí.

### P0-6 — diseño y resultados de verificación

**Sin cambios de backend.** P0-3 ya exponía `/geo/layers/:code/schema` y `/geo/layers/:code/features?filters=`
con la traducción segura a SQL parametrizado (`geo-filter-sql.ts`). P0-6 fue enteramente trabajo de
frontend: consumir ambos endpoints para generar la UI de filtros en tiempo real. Esto valida
directamente la inversión de P0-2/P0-3 — construir el cimiento primero permitió que P0-6 no tocara el
backend en absoluto.

**Tipo de campo → control de UI**, todo derivado del `GeoLayerField.type` que ya calculaba
`geo-schema.ts` (P0-3), sin ninguna lista de campos por dataset:

| `field.type` | Control | Operador(es) emitido(s) |
|---|---|---|
| `string` | texto libre | `contains` |
| `number` | rango mín/máx | `gte` + `lte` |
| `date` | rango de fechas | `gte` + `lte` (cast `::date` en servidor) |
| `boolean` | selector Sí/No/Cualquiera | `eq` |
| `enum` | casillas de selección múltiple | `in` |

**Debounce, no una petición por tecla.** El formulario de filtros (`catalogFilterFormByCode`) se
convierte a filtros de servidor (`catalogFiltersByCode`, memoizado) y se retrasa 500 ms
(`debouncedCatalogFiltersByCode`) antes de disparar el *refetch* — escribir en el campo de texto no
genera una petición por carácter. Los checkboxes de enumeración y el selector booleano, al ser
acciones discretas (no tecleo continuo), también pasan por el mismo debounce por simplicidad, sin
efecto perceptible en la UX.

**Activación y cambio de filtro comparten una sola ruta de disparo.** La activación de una capa y la
edición de sus filtros ahora convergen en el mismo efecto (comparando contra
`lastFetchedFiltersKeyRef`, una `ref` que registra la última combinación de filtros ya solicitada por
capa) — evita una condición de carrera entre "capa recién activada" y "filtro recién cambiado" que
habrían competido si fueran dos efectos independientes dirigiendo el mismo estado de carga.

**Verificado en el entorno real, con Playwright y con `curl` directo al backend:**

1. **UI generada correctamente desde datos reales** — al activar `areas_protegidas_ref`, aparecieron
   automáticamente: un rango numérico "Área (ha)", una lista de checkboxes "Categoría" con 6 valores
   reales (`HH`, `OTRAS`, `PN`, `RB`, `RF`, `RNA` — categorías de áreas protegidas observadas en los
   datos, no inventadas), y un campo de texto "Código" — sin una sola línea de configuración por
   dataset.
2. **El filtro narrowea de verdad, no solo visualmente** — verificado con `curl` directo:
   `GET /geo/layers/areas_protegidas_ref/features` sin filtro → `totalFeatures: 423`; con
   `{"field":"CATEGORíA","operator":"in","value":["PN"]}` → `totalFeatures: 91`.
3. **"Limpiar" funciona** — tras escribir en el filtro de texto, el badge mostró "Filtros (1 activos)"
   y el botón "Limpiar" apareció; al hacer clic, el badge volvió a "Filtros (0 activos)", el campo se
   vació, y el mapa volvió a mostrar el conjunto completo de polígonos.
4. **Hallazgo honesto, no forzado a coincidir:** el primer intento de probar el filtro por API usó el
   nombre de campo `categoria` (minúscula, sin tilde) y fue rechazado con `400` ("Campo de filtro
   desconocido"). Se investigó el esquema real (`GET /geo/layers/areas_protegidas_ref/schema`) y se
   confirmó que el campo se llama literalmente `CATEGORíA` — la clave cruda tal como existe en el
   dataset de origen, sin normalizar. **Es el comportamiento correcto**: `geo-schema.ts` solo humaniza
   la *etiqueta* mostrada al usuario, nunca el nombre real de la clave con la que se filtra —
   normalizarlo habría requerido inventar un mapeo entre nombre "bonito" y clave real, exactamente lo
   que "no inventar metadatos" prohíbe. El rechazo del filtro con nombre incorrecto confirma además que
   la validación de nombres de campo (P0-3) sigue funcionando correctamente.
5. **Sin regresión** — `geo-visibility-smoke` (4/4), `geo-api-smoke` (16/16), `role-smoke` (33/33),
   `npm run lint`, `npm run typecheck` (los tres workspaces), `npm run test:unit` — todos en verde.
   Cero errores de consola en las corridas de Playwright.

### Verificación de regresión — consola admin (previa a P0-7)

Ningún archivo de `apps/frontend-admin` se modificó en P0-4/P0-5/P0-6, pero sí se modificaron piezas de
backend compartidas por ambos frontends (`gis.geo_visibility_is_public`, `TerritoriesController`,
el módulo `/geo/*` nuevo, la migración `011_geo_layer_intelligence.sql`). Antes de continuar con P0-7
se verificó explícitamente que la consola admin no sufrió regresión, con Playwright contra el
contenedor real (`http://localhost:5174`), flujo de login real (no inyección de sesión):

1. **Login** — formulario real (`#admin-email`/`#admin-password`/"Abrir consola") con
   `superadmin@sigi.local` — sesión abierta correctamente.
2. **`/admin/geobi` (Mapa SIGI admin)** — KPIs con datos reales (11 capas activas, 4.039 territorios,
   85% calidad geoespacial), el "Visor territorial integrado" cargó 11 features de
   `Capas públicas de El Salvador` con su lista de elementos (Franja Costero-Marina, Región Central…,
   áreas reales en ha), contenedor Leaflet presente en el DOM.
3. **`/admin/geospatial-catalog`** — 12 capas catalogadas, conectores PostGIS y GeoServer mostrando
   configuración real (workspace `sigi`, datastore `sigi_postgis`, endpoints WMS/WFS).
4. **Cero errores** de consola del navegador y **cero respuestas HTTP ≥ 400** de `/api/*` en las tres
   pantallas.

**Conclusión (en este punto del trabajo):** la consola admin seguía funcional tal como estaba antes
de P0-1, pero todavía sin el catálogo multi-capa, la ficha de identificación ni los filtros dinámicos
que el portal país ya tenía desde P0-4/P0-5/P0-6 — esa brecha, no la regresión, fue lo que motivó
llevar la paridad completa a admin inmediatamente después, documentado en §9.7.

### P0-7 — diseño y resultados de verificación

**Único bloque P0 hasta ahora que sí tocó el backend de forma no trivial tras P0-3.** El endpoint
`/geo/layers/:code/features` ordenaba siempre por `t.name ASC`; la tabla de atributos necesita
ordenar por *cualquier* columna visible, lo que exige la misma validación segura que ya protege los
filtros — reutilizar, no reinventar: `geo-filter-sql.ts` se refactorizó para exponer
`resolveFieldExpression` (antes una función interna acoplada a un `filter` completo, ahora tomando
solo el nombre de campo), y `geo-sort-sql.ts` (nuevo) la reutiliza para `ORDER BY` seguro —
parametrizado igual que los filtros, con un `switch` fijo de dos valores para la dirección
(`ASC`/`DESC`), nunca texto interpolado. Un campo marcado `sortable: false` en el schema (P0-3) se
rechaza con `400`, igual que un campo de filtro desconocido.

**Sin tabla de esquema nueva ni petición duplicada.** La tabla reutiliza el mismo
`GeoLayerField[]` que el panel de filtros de P0-6 ya tenía cargado para la capa activa — las columnas
visibles (`field.visible`) y ordenables (`field.sortable`) del backend son las mismas que ya
gobiernan los filtros, una sola fuente de verdad.

**Sincronización fila → mapa, reutilizando P0-5, no una implementación paralela.** `MultiLayerMap`
ganó un método imperativo `selectFeature(layerCode, featureCode)` que busca la geometría exacta
dentro del grupo de Leaflet de esa capa, aplica el mismo resaltado visual que ya usa el clic directo
sobre el mapa, hace zoom, y — clave — invoca el mismo `onFeatureClick` que dispara un clic real. Esto
significa que seleccionar una fila de la tabla abre la ficha de identificación de P0-5 **sin código
nuevo** en `GeoBiPage.tsx` para esa parte — la conexión ya existía, solo había que activarla desde un
origen distinto.

**Decisión de alcance — sin caja de "buscar" separada.** El mockup de la especificación (§8) pide
"buscar" además de "filtrar". Dado que P0-6 ya ofrece un filtro de texto por campo sobre la misma
capa que alimenta la tabla, agregar una caja de búsqueda global habría sido una segunda forma de
hacer lo mismo, no una capacidad nueva — se documenta como decisión consciente, no como omisión.

**Verificado con Playwright contra el entorno real:**

1. **Apertura** — botón "Ver tabla" en una fila activa del catálogo abre la tabla con las columnas
   reales de `areas_protegidas_ref` (Área, Categoría, dos columnas de nombre distinto ambas
   etiquetadas "Código" — ver hallazgo abajo — Country, Nivel, Nombre, Project Code, Provincia,
   Source Crs…), 20 filas renderizadas (`TABLE_PAGE_SIZE`), "423 registros totales".
2. **Ordenar** — clic en el encabezado "Área" activó el indicador ▲ y reordenó las filas de menor a
   mayor (0,11 / 0,11 / 0,14 / 0,17…), consistente con lo ya verificado por `curl` en
   `geo-api-smoke.mjs`.
3. **Paginación** — "Siguiente" avanzó de "Página 1 de 22" a "Página 2 de 22" (423 ÷ 20 ≈ 22),
   mostrando la continuación correcta del orden ascendente activo.
4. **Sincronización fila ↔ mapa, verificada de punta a punta** — clic en una fila de la página 2:
   el mapa hizo zoom a la geometría exacta de esa fila (parcela `h04_geo_254`) con resaltado visual,
   y la ficha de identificación de P0-5 se abrió mostrando **los mismos datos de esa fila**
   (Código `h04_geo_254`, Área 0,73 ha, Actualización con fecha real) — no una aproximación, la misma
   feature.
5. **Cerrar** funciona — el panel de tabla desaparece.
6. **Hallazgo honesto, sin forzarlo a encajar:** la tabla mostró **dos columnas ambas etiquetadas
   "Código"**. No es un error de datos duplicados — son dos campos reales y distintos del dataset
   (`code`, el campo integrado de SIGI, y otro campo propio del origen de datos que también
   humaniza a "Código" vía `humanizeFieldName`). Cada columna sigue leyendo su propio campo
   correctamente; es una colisión de **etiqueta**, no de datos. Registrado como D12 — ver deuda
   técnica.
7. **Sin regresión** — `geo-visibility-smoke` (4/4), `geo-api-smoke` (20/20, incluye 4 verificaciones
   nuevas de `sort`/`order`), `role-smoke` (33/33), `npm run lint`, `npm run typecheck` (los tres
   workspaces), `npm run test:unit`. Cero errores de consola en las corridas de Playwright.

### P0-4 … P0-7 en la consola admin — paridad completa

Bloque solicitado explícitamente por el usuario: llevar a `frontend-admin` todo lo que
`frontend-country` ya tenía (catálogo, ficha, filtros, tabla), no solo verificar que no se hubiera
roto nada.

**Qué se compartió de verdad, y qué no.** Antes de escribir código admin se leyó
`apps/frontend-admin/src/components/section-kit.tsx` completo: paleta con acento `#0b4f3a` /
`#1f8a5b` (vs. `#0f766e` de país), tipo `SectionIcon` con 13 iconos SVG propios, `Panel`/`MetricCard`
con soporte de icono que el de país no tiene. Los dos *design system* ya habían divergido antes de
este trabajo (515 vs. 193 líneas, confirmado en P0-4 con `diff`) — construir JSX realmente compartido
habría significado reconciliarlos primero, un proyecto aparte no pedido. Lo que **sí** se compartió:
la conversión de formulario de filtros a filtros de servidor (`buildFiltersFromForm`, sin JSX,
determinista) se extrajo de `frontend-country/src/components/GeoLayerFilterControls.tsx` a
`libs/shared/src/index.ts` como `buildGeoFiltersFromForm`, tipada de forma estructural (no importa
`@sigi/domain` — `@sigi/domain` ya importa de `@sigi/shared`, así que la dependencia inversa habría
sido circular) para que `GeoLayerField`/`GeoFeatureQueryFilter` de `@sigi/domain` encajen sin
conversión. Ambos frontends —y cualquier futuro tercero— llaman exactamente a la misma función.

**Cinco componentes nuevos en `apps/frontend-admin/src/components/`** —
`GeoLayerCatalogPanel.tsx`, `MultiLayerMap.tsx`, `FeatureIdentificationPanel.tsx`,
`GeoLayerFilterControls.tsx` (envoltorio delgado sobre `@sigi/shared`),
`GeoLayerAttributeTable.tsx` — mismo comportamiento y contrato de datos que sus equivalentes de país,
restilizados con la paleta real de admin. Integrados en `GeoBiModulePage.tsx` (2.465 → ~2.800 líneas)
como un nuevo panel "Catálogo de capas" insertado antes del panel existente, que se conservó intacto
y se renombró "Visor de mapas (vista clásica)" — mismo patrón exacto que P0-4 usó en país. Backend:
ningún cambio — el módulo `/geo/*` de P0-3 ya era agnóstico de frontend; `adminApi` solo necesitó los
mismos cuatro métodos nuevos que `countryApi` (`getGeoLayers`, `getGeoLayerFeatures` con
`page`/`sort`/`order`/`filters`, `getGeoLayerMetadata`, `getGeoLayerSchema`), reutilizando el
`getJson` existente que ya adjunta el token admin a cada request.

**"Ver proyecto" también funciona de punta a punta en admin.** `ProjectsModulePage.tsx`
(`/admin/projects`) no tenía soporte de `?projectId=` — mismo hueco que `ProjectsPage.tsx` tenía en
país antes de P0-5. Se agregó el mismo parche mínimo y aditivo (con `useSearchParams`, sin alterar el
comportamiento cuando el parámetro está ausente).

**Verificado con Playwright, login real de administrador** (`superadmin@sigi.local`), contra el
contenedor real (`http://localhost:5174`):

1. Catálogo carga y el nuevo panel se ve con la paleta e iconografía admin reales (ícono de mapa,
   verde `#0b4f3a`, no el teal de país).
2. Activar `areas_protegidas_ref` genera los mismos filtros reales que en país (Área, Categoría con
   6 valores `HH`/`OTRAS`/`PN`/`RB`/`RF`/`RNA`, Código) — confirma que el schema del backend (P0-3) es
   verdaderamente agnóstico de frontend.
3. Abrir la tabla de atributos: 20 filas, "423 registros totales", clic en encabezado ordena por
   Área.
4. **Sincronización fila → mapa → ficha, verificada de punta a punta también en admin**: clic en una
   fila de la tabla resaltó la geometría exacta en el mapa, hizo zoom, y abrió la ficha con los
   mismos datos de esa fila (Nivel `parcel`, Área 0,11 ha, Actualización con fecha real, metadatos
   `No disponible`) — el mismo comportamiento verificado en país en §9.6, ahora confirmado en el
   segundo frontend con datos reales, no solo por inspección de código.
5. **Sin regresión en lo que ya existía**: se hizo scroll hasta "Visor de mapas (vista clásica)" —
   visible y con su propio visor Leaflet intacto (dos contenedores Leaflet coexistiendo en la página,
   uno por visor) — y hasta el final de la página, confirmando que los paneles de KPIs, calidad
   geoespacial y publicación siguen renderizando con datos reales.
6. **Cero errores** de consola y **cero respuestas HTTP ≥ 400** de `/api/*` en las tres corridas.
7. `npm run lint`, `npm run typecheck` (los tres workspaces), y los tres *smoke* de backend
   (`geo-visibility-smoke` 4/4, `geo-api-smoke` 20/20, `role-smoke` 33/33) en verde tras el cambio.

### Decisiones de diseño

- **Reutilizar Leaflet**, no migrar a MapLibre/OpenLayers. Ya hay ~3.300 líneas de visor escritas
  contra su API. Migrar no aporta a ningún criterio de aceptación de P0. Sí conviene moverlo de CDN
  a dependencia npm (D4) — cambio contenido y de beneficio claro.
- **No crear un microservicio nuevo.** El análisis espacial va en `gis-service`, que ya tiene acceso
  a PostGIS, o en `sigi-api` mediante consultas parametrizadas.
- **No duplicar auditoría.** Extender `recordAudit` de `geospatial-catalog.service.ts:1324`.
- **Extraer el visor compartido a `libs/`** antes de invertir en él, para no pagar D5 dos veces.
- **Prefijo `/geo` nuevo**, sin tocar `/geo-bi`, `/territories` ni `/admin/geospatial-catalog`, para
  no romper compatibilidad (§34).

---

### P0-8 — diseño y resultados de verificación

Bloque solicitado explícitamente para **ambos frontends desde el inicio** ("Continua con P-08 en
ambos frontend"), no de forma secuencial como P0-4…P0-7. Backend, contrato y UI de ambos frontends
se construyeron y verificaron en la misma pasada.

**Backend — nueva ruta aditiva, sin tocar `/features`.** `GET /geo/layers/:code/export` reutiliza
exactamente el mismo `bbox`/`filters`/`sort`/`order` que `/features` (misma resolución de visibilidad,
mismo `resolveFieldExpression`/`buildFilterClause`/`buildSortClause` parametrizados de P0-3/P0-7) pero
sin `page`/`pageSize`/`zoom`: la exportación no está paginada de cara al cliente ni simplifica
geometría — siempre entrega precisión completa, porque un archivo exportado que el usuario abre en
QGIS/Excel no puede depender del nivel de zoom con el que se generó. Para evitar un export sin límite
que pudiera tumbar el proceso o el navegador, se aplicó el mismo principio ya usado en paginación/bbox
("nunca sin límite"): `MAX_EXPORT_FEATURES = 20000`, con `truncated: true` explícito en la respuesta
(cabeceras `X-SIGI-Export-Total`/`X-SIGI-Export-Exported`/`X-SIGI-Export-Truncated`) cuando el
resultado real excede el tope — nunca se trunca en silencio.

**Tres formatos, reutilizando una dependencia ya presente.** `csv`, `xlsx` (vía `xlsx`/SheetJS,
`^0.18.5`, ya declarada en `apps/sigi-api/package.json` — no se agregó dependencia nueva) y `geojson`
(metadatos de exportación embebidos como *foreign members* de nivel superior, permitidos por RFC 7946
§6.1, sin romper la validez del GeoJSON para cualquier consumidor externo). Construidos en
`geo-export.ts` nuevo: `buildCsvExport`/`buildXlsxExport`/`buildGeoJsonExport`, todos a partir de las
mismas `buildColumns()`/`buildRows()` — un solo lugar que decide cómo se ve una fila exportada,
no tres implementaciones divergentes.

**Auditoría reutilizada, no un tercer subsistema.** `geospatial-catalog.service.ts` ya tenía su propio
`recordAudit` privado (deuda documentada, D-no-duplicar); en vez de replicarlo una tercera vez, P0-8
inyecta el `AuditService` compartido (`recordAccessEvent`, ya usado en otros módulos) en
`GeoController`. Cada exportación se audita con `action: 'geo.layer.export'`, capa, formato, filtros,
orden y conteos — en éxito **y** en fallo (un `try/catch` alrededor de `exportFeatures()` audita el
fallo y vuelve a lanzar el error real; el propio registro de auditoría está envuelto en su propio
`try/catch` para que un fallo al escribir auditoría nunca convierta una exportación exitosa en un
error 500). Verificado con `psql` directo contra `core.audit_events`: existen filas para exportaciones
exitosas y fallidas, con los detalles esperados.

**UI idéntica en contrato, propia en estilo — mismo patrón que P0-4…P0-7.** `GeoLayerAttributeTable.tsx`
en ambos frontends ganó un selector de formato (CSV/Excel/GeoJSON) + botón "Exportar" + aviso de
truncamiento, con la paleta real de cada consola (`#0f766e` en país, `#0b4f3a` en admin). El handler
(`handleExport`, en `GeoBiPage.tsx`/`GeoBiModulePage.tsx`) reutiliza los mismos `tableFilters`/
`tableSort`/`tableOrder` que P0-7 ya mantenía para la tabla — la exportación siempre exporta
*exactamente* lo que la tabla está mostrando, nunca un conjunto distinto. La descarga se dispara con
el mismo patrón `URL.createObjectURL` + `<a download>` ya usado en `DocumentsPage.tsx` (país) y
`FilesExplorerPage.tsx`/`SourcesPage.tsx` (admin) — sin introducir un mecanismo de descarga nuevo.

**Hallazgo real durante la verificación, corregido, no ocultado.** La primera corrida de Playwright
mostró un archivo llamado `export.csv`/`export` genérico en vez de `sigi-<capa>-<timestamp>.<ext>` —
el nombre real que el backend sí envía en `Content-Disposition`. Investigado hasta la causa real:
`app.enableCors()` en `apps/sigi-api/src/main.ts` solo declaraba `exposedHeaders: ['X-Request-ID']` —
por especificación CORS, un navegador oculta a JavaScript **todas** las cabeceras de respuesta salvo
un pequeño conjunto "seguro" por defecto (que no incluye `Content-Disposition` ni cabeceras
personalizadas), así que `response.headers.get('content-disposition')` devolvía `null` pese a que el
backend sí la enviaba — confirmado con `curl` directo (cabecera presente) vs. el `fetch()` del
navegador (cabecera invisible). Se corrigió agregando `Content-Disposition` y las tres cabeceras
`X-SIGI-Export-*` a `exposedHeaders`; tras reconstruir y reiniciar `sigi-api`, ambos frontends
recibieron el nombre de archivo real y los conteos de truncamiento reales. Este defecto ya afectaba
en silencio a las descargas previas del proyecto (`downloadDocument`, `downloadFile`, etc., que caían
a un nombre de archivo genérico) — no se tocaron esos otros llamadores en este bloque (fuera de
alcance de P0-8), pero queda documentado aquí como hallazgo para una futura limpieza.

**Verificado con Playwright en ambos frontends, contra el stack Docker real:**

1. **`frontend-country`** (`http://localhost:5173/geo-bi`, sin autenticar): se activó
   `dnea_activity_points`, se abrió su tabla ("379 registros totales"), se exportó en CSV
   (`sigi-dnea_activity_points-<timestamp>.csv`, descarga real capturada por Playwright) y en GeoJSON
   (`sigi-dnea_activity_points-<timestamp>.geojson`) — ambas con el nombre de archivo real, no el
   *fallback* genérico.
2. **`frontend-admin`** (`http://localhost:5174/admin/geobi`, login real `superadmin@sigi.local`):
   mismo flujo, exportado en CSV y en XLSX (`sigi-dnea_activity_points-<timestamp>.xlsx`) — controles
   de exportación con la paleta verde admin, `Exportar`/`Cerrar tabla` correctamente alineados junto al
   selector de formato.
3. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres workspaces), `npm run test:unit`,
   `geo-visibility-smoke` (4/4), `geo-api-smoke` (28/28, incluye 8 verificaciones de exportación),
   `role-smoke` (33/33) — todos en verde tras el cambio de CORS y la nueva UI.

---

### P0-9 — diseño y resultados de verificación

**Sin cambios de backend.** Ninguna ruta de `apps/sigi-api/src/modules/geo/` cambió; P0-9 fue
enteramente trabajo de frontend sobre la infraestructura que P0-3…P0-8 ya expone.

**Interpretación acotada de "barra de herramientas".** El gap table (§8, requisito §9) describe
"Barra de herramientas (medir, seleccionar…)" con esfuerzo "Medio", pero §4 ("No implementadas")
sitúa explícitamente "herramientas de medición" fuera del alcance P0, junto con buffer/intersección
y el resto de análisis espacial (P1/P2). Implementar medición/selección aquí habría contradicho esa
frontera ya documentada y la instrucción general de no agregar funcionalidad no pedida. Se interpretó
"barra de herramientas" en el sentido que sí encaja en P0 y en la dependencia declarada (P0-4, el
catálogo): una barra de **acciones de catálogo**, no de análisis espacial.

**Auditoría de estados antes de escribir código nuevo.** Se revisaron los cinco componentes de
P0-4…P0-8 (`GeoLayerCatalogPanel`, `MultiLayerMap`, `FeatureIdentificationPanel`,
`GeoLayerFilterControls`, `GeoLayerAttributeTable`) buscando huecos reales de carga/error/vacío antes
de asumir que hacían falta. Resultado de la auditoría: **ya estaban cubiertos** — `MultiLayerMap`
tiene su propio estado vacío (`emptyMessage`) y de error (`leafletError`) independientes del catálogo;
`FeatureIdentificationPanel` ya distingue `metadataLoading`/`metadataError`; `GeoLayerAttributeTable`
ya tiene fila vacía ("Sin registros para los filtros actuales") y su propio error. La única brecha
real: el catálogo (`GeoLayerCatalogPanel`) solo tenía un mensaje de vacío — "No hay capas
geoespaciales disponibles para tu perfil" — que habría sido **engañoso** al usarse también para "cero
resultados de búsqueda" (dando a entender que no existen capas en absoluto). Se resolvió sin tocar
`GeoLayerCatalogPanel`: `GeoBiPage.tsx`/`GeoBiModulePage.tsx` filtran la lista *antes* de pasarla al
panel y renderizan un mensaje distinto ("Ninguna capa coincide con…") cuando el catálogo tiene capas
pero la búsqueda no encontró ninguna — el panel nunca ve la diferencia entre ambos casos, ambos casos
igual de reales para el usuario.

**Cuatro controles, todos sobre capacidades que ya existían pero no estaban expuestas o no existían
como acción de usuario:**

| Control | Qué hace | Base reutilizada |
|---|---|---|
| Buscar capa por nombre | Filtra el catálogo renderizado por `layer.name`/`layer.description`, client-side, sobre la lista ya cargada — sin endpoint nuevo | Ninguna petición nueva; la lista de capas ya vive en memoria (P0-4) |
| Actualizar catálogo | Repite el `GET /geo/layers` inicial | `countryApi.getGeoLayers()`/`adminApi.getGeoLayers()`, ahora extraído a un `useCallback` reutilizable en vez de vivir solo dentro de un `useEffect` de montaje único |
| Desactivar todas | `setActiveCatalogCodes([])` | Mismo estado que cada checkbox individual ya mutaba |
| Zoom a todas las activas | Ajusta el mapa a la extensión combinada de las capas activas | `MultiLayerMapHandle.zoomToAll()` — **ya existía desde P0-4/P0-7, pero ningún botón la invocaba**; P0-9 es la primera vez que se usa |

**Verificado con Playwright en ambos frontends, contra el stack Docker real:**

1. Los cuatro controles del toolbar están presentes y con la paleta correcta de cada consola.
2. Buscar "dnea" deja visible la capa DNEA; buscar una cadena sin coincidencias muestra el mensaje
   "Ninguna capa coincide con…" (no el mensaje genérico de "sin capas").
3. Activar una capa, luego "Desactivar todas": el contador vuelve a "0 activas" y ninguna capa queda
   marcada.
4. "Actualizar catálogo" dispara un nuevo `GET /geo/layers` sin recargar la página ni perder el estado
   de capas activas/filtros.
5. **Cero errores de consola** del navegador en las cuatro corridas (dos por frontend).
6. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres workspaces), `npm run test:unit`,
   `geo-visibility-smoke` (4/4), `geo-api-smoke` (28/28), `role-smoke` (33/33) — todos en verde. Estos
   tres *smoke* de backend no podían verse afectados por P0-9 (cambio 100% frontend) y se re-ejecutaron
   de todas formas para confirmarlo, no por sospecha de una regresión real.

**Nota de proceso:** durante esta verificación, Docker Desktop se detuvo y tuvo que reiniciarse
manualmente (proceso `Docker Desktop.exe` no encontrado en ejecución), lo que reinició todo el stack
de contenedores. Se documenta porque interrumpió momentáneamente `sigi-api`/`gis-service`/`geoserver`
sin relación con el cambio de código — el stack completo se levantó de nuevo (`docker compose up -d`)
antes de continuar con la reconstrucción de las imágenes de frontend y la verificación.

---

### P0-10 — diseño y resultados de verificación

**Interpretación del alcance.** El roadmap describe P0-10 como "Pruebas
(backend: permisos, filtros, exportación; E2E del flujo mínimo) +
`docs/geo/`". Antes de escribir código se verificó qué de esto ya existía:
`scripts/geo-visibility-smoke.mjs` (permisos/visibilidad), `scripts/geo-api-smoke.mjs`
(filtros, orden, exportación) y `scripts/role-smoke.mjs` ya cubrían ese
terreno **como pruebas de integración contra el stack real**, y ya estaban
registradas en `scripts/release-gate.mjs` — no se duplicó esa cobertura.
Lo que genuinamente faltaba, y es lo que este bloque agrega:

1. **Pruebas unitarias reales** (`tests/unit/geo-*.test.mjs`) — rápidas,
   deterministas, sin Postgres ni HTTP — de la lógica pura que hasta ahora
   solo se ejercitaba indirectamente vía smoke tests contra el servidor
   vivo: construcción de SQL parametrizado (filtros, orden), validación de
   query params, evaluación de visibilidad, inferencia de schema, y
   construcción de los tres formatos de exportación.
2. **Un E2E del flujo mínimo** (`tests/e2e/geo.spec.js`) — no existía
   ninguno para el módulo Geo-BI; `tests/e2e/admin.spec.js` y
   `country.spec.js` cubren otros módulos.
3. **`docs/geo/` completo** — faltaban `architecture.md`, `layer-catalog.md`,
   `geoserver.md`, `spatial-analysis.md`, `exports.md` (el archivo de lista
   en §10 ya los nombraba como pendientes desde el diagnóstico inicial).

**Cómo se hicieron las pruebas unitarias sin un test runner de TS.**
`sigi-api` no tiene `ts-node`/`tsx`/`jest` configurado — nada de este
proyecto ejecuta TypeScript de `apps/sigi-api/src` directamente en pruebas.
En vez de agregar una dependencia nueva solo para esto, los nuevos tests
importan el **output compilado** (`apps/sigi-api/dist/modules/geo/*.js`,
`dist/common/geo/geo-visibility.js`), que ya se genera con `npm run build:api`
y ya se versiona en el repositorio. Riesgo real de este enfoque: un test
podría pasar contra un `dist/` desactualizado y ocultar una regresión real
en el `.ts` fuente — el mismo problema documentado como D9 (bind-mount de
Docker sirviendo un `dist/` obsoleto). Mitigado agregando `npm run build:api`
como paso previo obligatorio en el script `test:unit`
(`"test:unit": "npm run build:api && node --test tests/unit/**/*.test.mjs"`) —
cada corrida de `npm run test:unit` compila primero, así que un test nunca
puede pasar contra código más viejo que el fuente actual.

**Qué cubren las 65 pruebas nuevas, por archivo:**

| Archivo | Qué prueba | Casos notables |
|---|---|---|
| `geo-filter-sql.test.mjs` (15) | `resolveFieldExpression`, `buildFilterClause` | Cada operador (eq/neq/gt/gte/lt/lte/in/contains); builtin vs. campo JSONB; el nombre del campo se une como parámetro, nunca interpolado; rechazo de operadores de rango sobre campos de texto |
| `geo-sort-sql.test.mjs` (5) | `buildSortClause` | Un campo marcado `sortable:false` se rechaza; `NULLS LAST` sin importar la dirección |
| `geo-visibility.test.mjs` (8) | Jerarquía de visibilidad, `principalCanReadNonPublicGeoLayers` | Anónimo siempre `false`; `institutional`/`internal` comparten rango (documentado en `permissions.md`) |
| `geo-feature-query-dto.test.mjs` (18) | Los siete parsers de query params | `pageSize` se recorta a `MAX_PAGE_SIZE`, nunca se rechaza por ser grande; `filters` JSON malformado se rechaza, no se ignora en silencio |
| `geo-schema.test.mjs` (12) | `deriveFieldsFromPropertySamples`, humanización de etiquetas | Reproduce el caso real documentado en P0-6: `"CATEGORíA"` → etiqueta `"Categoría"`, clave de filtro sin normalizar |
| `geo-export.test.mjs` (7) | Los tres builders de exportación | El bloque de metadatos en cada formato; un XLSX real (firma `PK`) no un stub; un export vacío no produce un archivo inválido |

**E2E: por qué la sincronización fila→mapa→ficha, no un clic sobre el mapa.**
El clic sobre una geometría real del mapa (usado en las verificaciones
manuales de P0-4/P0-5) depende de una coordenada de viewport que cambia con
el zoom/los bounds combinados de las capas activas — ya causó una lección
documentada en P0-4 (§9.2: el primer intento de clic cayó sobre agua). Un
spec de CI no puede depender de eso. En cambio, el spec hace clic en la
**primera fila de la tabla de atributos** (P0-7), un elemento DOM estable —
y esa fila ya dispara el mismo flujo (resalta en el mapa, hace zoom, abre la
ficha) que un clic real sobre el mapa dispararía, así que la cobertura del
comportamiento es la misma sin la fragilidad de una coordenada de canvas.

**Verificado, con el stack Docker real, contra ambos frontends:**

```
tests/e2e/geo.spec.js
  ✓ país (anónimo): activar capa → tabla con filas → filtros visibles →
    clic en fila → ficha abre → exportar dispara una descarga real con
    nombre "sigi-<capa>-<timestamp>.csv"
  ✓ admin (superadmin@sigi.local): mismo flujo, autenticado, /admin/geobi
```

**Hallazgo, no oculto: `tests/e2e/admin.spec.js` (preexistente, fuera de
P0-10) falla hoy.** Al correr la suite E2E completa para confirmar que
`geo.spec.js` no rompía nada, `admin.spec.js` falló en una aserción no
relacionada con geoespacial: espera un encabezado `"Usuarios y roles"` en
`/admin/users` y la UI real muestra `"Usuarios"`. Verificado que esto es
deuda preexistente, no causada por este trabajo: `UsersPage.tsx` tiene
cambios sin commitear ya presentes en el árbol de trabajo antes de que
empezara esta sesión (confirmado con `git status`/`git diff --stat`, sin
relación con ningún archivo tocado en P0-1…P0-10). No se corrigió — está
fuera del alcance geoespacial de este documento y tocar `UsersPage.tsx`/
`admin.spec.js` sin contexto de esos cambios pendientes habría sido
arriesgado. Documentado aquí para que no se pierda.

**Sin regresión** — `npm run lint`, `npm run typecheck` (los tres
workspaces), `npm run test:unit` (67/67, incluye las 65 nuevas),
`geo-visibility-smoke` (4/4), `geo-api-smoke` (28/28), `role-smoke` (33/33),
`tests/e2e/geo.spec.js` (2/2) — todos en verde.

---

### P1-1 — diseño y resultados de verificación

**Backend — un endpoint nuevo, reutilizando el mismo predicado de visibilidad de siempre.**
`GET /geo/search?q=<término>` busca `t.name`/`t.code` (`ILIKE '%término%'`) sobre
`gis.territory_features tf JOIN core.territories t JOIN gis.geo_layers gl`, con la
**misma** condición de visibilidad que `buildBaseQuery`/`listLayers` ya usaban —
`includeInternal OR (gis.geo_visibility_is_public(gl.visibility) AND gl.status = 'published')` —
copiada literalmente, no re-derivada, para no crear una segunda definición de "qué es
visible" que pudiera divergir de la primera (la lección exacta que motivó
`geo-visibility.ts` en P0-2). Sin `gl.code = ...`: a diferencia de `/features`, esta
consulta busca deliberadamente **a través de** todas las capas, no dentro de una. Un
mismo territorio puede existir en más de una capa (p. ej. el mismo predio en
`ssp_layers` y en `odoo_project_territories`); cada par (territorio, capa) es un
resultado independiente, nunca colapsado, para que el usuario elija a cuál capa saltar.
Tope `MAX_SEARCH_RESULTS = 20` y longitud mínima `MIN_SEARCH_TERM_LENGTH = 2`
(`dto/geo-feature-query.dto.ts`) — mismo principio de "nunca sin límite" que pagina-
ción/bbox/exportación.

**Hallazgo de gobernanza de datos, no un defecto de este endpoint.** Al verificar el
aislamiento por visibilidad con `psql` directo se encontró que buscar
`"OSCAR ALFREDO"` (un nombre de persona real) de forma anónima devuelve un resultado
en la capa `ssp_layers` — porque esa capa está marcada `visibility = 'public'` en
`gis.geo_layers`, y sí contiene nombres de personas. Confirmado con `curl` directo
contra `GET /geo/layers/ssp_layers/features` (endpoint de P0-3, ya en producción)
que esa misma exposición **ya existía antes de P1-1** — `/geo/search` respeta
exactamente la misma clasificación de visibilidad que el resto del módulo, no
introduce una fuga nueva. Se documenta aquí como hallazgo de **clasificación de
datos**, no de código: alguien debe revisar deliberadamente si `ssp_layers` debería
ser `institutional`/`restricted` en vez de `public`, con el mismo cuidado que §2 de
`permissions.md` ya pidió para `odoo_project_territories`. No se cambió la
visibilidad de `ssp_layers` unilateralmente — es una decisión de gobernanza de
datos, no una decisión de implementación.

**Frontend — activar-si-hace-falta, luego seleccionar.** Elegir un resultado de
búsqueda activa su capa (mismos valores por defecto de color/opacidad que el
checkbox del catálogo asigna) y encola la selección de la feature exacta
(`pendingSearchSelection`) hasta que `catalogFeaturesByCode` confirme que esa capa
terminó de cargar — reutilizando el mismo ciclo de fetch que P0-4 ya dispara al
activar cualquier capa, sin una segunda ruta de carga. Una vez cargada,
`MultiLayerMapHandle.selectFeature(layerCode, territoryCode)` hace el resto —
la misma función que P0-7 ya usa para "clic en fila de tabla → mapa → ficha".

**Bug real encontrado y corregido durante la verificación, no ocultado.** La primera
corrida activaba la capa correctamente pero la ficha nunca abría y el mapa nunca
hacía zoom — investigado con logging temporal en vez de reintentarlo a ciegas.
Causa raíz confirmada: `MultiLayerMap` construye su `Map<código, grupo Leaflet>`
dentro de un `.then()` de `ensureLeafletReady()` — una *microtask* — no de forma
síncrona en el cuerpo del `useEffect`. El único llamador de `selectFeature` antes
de P1-1 (el clic en una fila de la tabla de atributos, P0-7) nunca disparaba esta
condición de carrera porque, para cuando la tabla es clicable, el grupo Leaflet ya
lleva un ciclo de render entero existiendo. P1-1 introdujo el primer llamador que
invoca `selectFeature` en el *mismo instante* en que los datos de una capa recién
activada terminan de cargar — exactamente el instante en que el `.then()` de
`MultiLayerMap` podría no haberse resuelto todavía. **Corregido en la fuente**
(`MultiLayerMap.tsx`, ambos frontends): `selectFeature` ahora reintenta hasta 10
veces cada 100 ms (~1 s) si el grupo aún no existe, en vez de fallar en silencio —
una función interna (`selectFeatureWithRetry`), no un cambio de contrato público.
Confirmado con logging temporal (`hasGroup: false` en el primer intento,
resuelto en el reintento siguiente) antes de aplicar la corrección, y confirmado
de nuevo, limpio, después.

**Verificado con Playwright en ambos frontends, contra el stack Docker real:**

1. Buscar "San Vito" (una capa aún no activa) devuelve el resultado real
   (`DNEA-SITE-0005`, capa "Actividades DNEA georreferenciadas"); seleccionarlo
   activa la capa (contador "1 activas"), el mapa hace zoom a la geometría exacta
   y la ficha abre con Nombre/Código/Nivel/Área/Actualización reales — capturado
   visualmente, no solo por aserción.
2. Buscar un término sin coincidencias muestra "Sin resultados para…" en vez de
   una lista vacía silenciosa.
3. Verificación de aislamiento por visibilidad con `psql`/`curl` directo: búsqueda
   anónima nunca incluye `layerCode: odoo_project_territories` (capa `private`);
   con un token `connectors.read` sí lo incluye — mismo par de aserciones que
   `geo-visibility-smoke.mjs` ya usa para `/features`, ahora replicado para
   `/search` en `scripts/geo-api-smoke.mjs` (6 verificaciones nuevas).
4. **Cero errores de consola** en las cuatro corridas (dos por frontend, antes y
   después de la corrección de la condición de carrera).
5. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres workspaces),
   `npm run test:unit` (67/67), `geo-visibility-smoke` (4/4), `geo-api-smoke`
   (34/34, incluye las 6 nuevas de búsqueda), `role-smoke` (33/33),
   `tests/e2e/geo.spec.js` (2/2, extendido con el flujo de búsqueda territorial —
   exactamente lo que habría atrapado una regresión de la corrección de carrera)
   — todos en verde.

---

### P1-2 — diseño y resultados de verificación

**Backend — un endpoint de solo lectura sobre datos ya calculados, nada nuevo que computar.**
`GET /geo/layers/:code/profile` lee `gis.geo_layer_profile` (P0-2: `feature_count`,
`null_geometry_count`, `invalid_geometry_count`, `geometry_type`, `crs`, `extent`,
`profiled_at`) — nunca ejecuta `ST_IsValid`/`ST_Extent`/`COUNT` en el camino de la
petición, solo `SELECT` sobre la tabla cacheada, con `ST_XMin/XMax/YMin/YMax(extent)`
para devolver el extent como `{minLon,minLat,maxLon,maxLat}` en vez de WKB/GeoJSON
crudo. Mismo `findVisibleLayer` que el resto del módulo — la misma verificación de
visibilidad, sin excepciones. `profile: null` explícito (no un error, no un `200`
con datos inventados) cuando `layer_id` no tiene fila en `gis.geo_layer_profile` —
el mismo contrato "ausencia real, nunca inferida" que P0-5 ya estableció para
`gis.geo_layer_metadata`.

**Verificado con datos reales, no un layer vacío de prueba.** Las 11 capas
existentes ya tenían perfil (calculado manualmente durante la verificación de
P0-2, `docs/geo/postgis.md` §2) — `curl` directo contra `dnea_activity_points`
confirma `featureCount: 379` y, notablemente, un `extent.maxLon` de
`0.0003…` — exactamente el defecto de "null island" ya documentado en
`postgis.md` §2 ("Hallazgo nuevo: coordenadas erróneas en dnea_activity_points").
No es un hallazgo nuevo de P1-2; es la confirmación de que el endpoint expone el
dato real tal cual está, sin filtrarlo ni suavizarlo.

**Frontend — mismo ciclo de fetch que el schema de P0-6, no un patrón nuevo.**
Al activar una capa, un efecto marca su perfil como `loading`, un segundo efecto
lo resuelve (`getGeoLayerProfile`), y `GeoLayerCatalogPanel` renderiza una línea
compacta: *"379 elementos · 100% con geometría válida · Perfilado: 1 sept 2026"*.
Un tercer estado (`fetched`, no expuesto al componente de presentación) evita
que, antes de que el efecto de carga dispare, el panel muestre por error "Sin
estadísticas disponibles todavía" en vez de "Cargando…" — la misma clase de
condición de uno-o-dos-renders que ya existía implícitamente en el patrón de
schema, hecha explícita aquí porque el perfil sí necesita distinguir tres
estados (cargando / con datos / confirmado sin datos) en vez de dos.

**Deuda explícitamente NO resuelta en este bloque.** `postgis.md` §2 ya decía
"P0-3 debe invocarlo [`gis.refresh_geo_layer_profile`] después de cada
importación/publicación" — sigue sin estar wireado a ningún flujo de
importación (`/admin/geospatial-catalog/import`, `/shapefile/import`,
`/kobo/promote`). P1-2 expone lo que ya existe; no resuelve cuándo se
recalcula. Una capa importada después del 1 de septiembre de 2026 devolvería
`profile: null` hasta que alguien ejecute `gis.refresh_geo_layer_profile`
manualmente. Documentado, no resuelto — agregar un botón de "Actualizar
estadísticas" o wirear el refresco automático al flujo de importación son
extensiones futuras, no parte de este bloque.

**Verificado con Playwright en ambos frontends, contra el stack Docker real:**

1. Activar `dnea_activity_points` (país) y `dnea_activity_points` (admin)
   muestra la línea de estadísticas real ("379 elementos · 100% con geometría
   válida · Perfilado: 1 sept 2026") — capturado visualmente, no solo por
   aserción de texto.
2. **Cero errores de consola** en ambas corridas.
3. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres
   workspaces), `npm run test:unit` (67/67), `geo-visibility-smoke` (4/4),
   `geo-api-smoke` (38/38, incluye 4 verificaciones nuevas de perfil —
   capa pública, capa inexistente, capa restringida anónima/autorizada),
   `role-smoke` (33/33), `tests/e2e/geo.spec.js` (2/2, extendido con la
   aserción de la línea de estadísticas en el flujo mínimo) — todos en verde.

---

### P1-3 — diseño y resultados de verificación

**Primer bloque P1 sin ningún cambio de backend.** WMS e imágenes raster se
sirven directamente por el servidor externo que el usuario indique; Leaflet
(`L.tileLayer.wms`) las pide desde el navegador, exactamente el mismo
mecanismo que `GeoBiLayerMap.tsx` ya usaba para superponer el WMS de
GeoServer propio (`countryGeoServerConfig`/`adminGeoServerConfig`) — no un
patrón nuevo, una reutilización literal. GeoJSON se descarga también desde
el navegador (`fetch(url)`); el resultado, una vez normalizado a
`FeatureCollection`, se agrega al mismo arreglo `MultiLayerMapEntry[]` que
ya alimenta las capas internas del catálogo — por eso una capa GeoJSON
externa hereda gratis el mismo renderizado, tooltip y clic-para-identificar
que cualquier capa interna, sin código de renderizado adicional.

**Decisión explícita: sin proxy de backend.** Un proxy resolvería CORS de
forma uniforme, pero abre una superficie real de SSRF (el servidor haciendo
peticiones a una URL que controla el usuario) que requeriría, como mínimo,
una lista blanca de dominios, bloqueo de rangos de red internos, límites de
tamaño/tiempo — diseño no trivial y no pedido explícitamente. Se optó por
el camino más simple y ya usado en el proyecto (fetch/tile directamente
desde el navegador), aceptando la limitación real y honesta: **una capa
externa solo carga si el servidor que la sirve permite CORS** (WMS vía
tiles de imagen no tiene esta restricción — las imágenes no están sujetas
a CORS de la misma manera que `fetch`; GeoJSON sí). Un fallo de CORS se
muestra como un error real ("La solicitud falló…"), nunca como una capa
vacía silenciosa.

**Efímero por diseño, no un descuido.** Las capas externas viven en estado
de React de la página (`externalLayers`), no en `localStorage` ni en el
backend — se pierden al recargar. Persistirlas es exactamente lo que P1-4
("análisis guardados / vistas guardadas") va a resolver; implementarlo aquí
habría solapado dos bloques del roadmap.

**Tope y validación, mismo principio que el resto del módulo.**
`MAX_EXTERNAL_GEOJSON_FEATURES = 2000` — una capa externa con más elementos
se trunca con aviso explícito, igual que exportación/paginación. La URL
debe empezar con `http://`/`https://` (rechaza `javascript:`/`data:` antes
de llegar a Leaflet o `fetch`); WMS exige además un nombre de capa no
vacío. El GeoJSON recibido se valida como `Feature` o `FeatureCollection`
antes de renderizarse — cualquier otra forma se rechaza con un mensaje
claro, nunca se intenta "adivinar" la estructura.

**Verificado con servicios reales ya en ejecución, no con mocks.**
`http://127.0.0.1:8081/geoserver/wms` (el propio GeoServer del
`docker-compose`, capa `sigi:public_dnea_activity_points`) como fuente WMS,
y `GET /geo/layers/dnea_activity_points/export?format=geojson` (el propio
endpoint de exportación de P0-8, ya con CORS habilitado hacia ambos
frontends) como fuente GeoJSON — ninguna dependencia de un servicio externo
a Internet, evitando que la verificación (o una futura prueba automatizada)
dependa de la disponibilidad de un tercero.

**Verificado con Playwright en ambos frontends, contra el stack Docker real:**

1. Agregar la capa WMS de prueba la deja listada y visible en el panel
   "Capas externas"; agregar la capa GeoJSON de prueba la carga
   correctamente (sin mensaje de error en su fila).
2. Quitar ambas capas las remueve de la lista (`0` filas restantes).
3. **Cero errores de consola** en las cuatro corridas (dos por frontend).
4. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres
   workspaces), `npm run test:unit` (67/67), `geo-visibility-smoke` (4/4),
   `geo-api-smoke` (38/38 — sin cambios, P1-3 no tocó el backend),
   `role-smoke` (33/33), `tests/e2e/geo.spec.js` (2/2) — todos en verde.
   El flujo mínimo de `geo.spec.js` no se amplió con capas externas — usa
   solo servicios locales pero introduciría una dependencia de timing de
   GeoServer (`geoserver-init`) al *smoke* central; se verificó por
   separado en su lugar, igual que otros bloques exploratorios.

---

### P1-4 — diseño y resultados de verificación

**Primera decisión, tomada antes de escribir código: ¿quién es dueño de una
vista guardada?** Se verificó con `grep` que `apps/frontend-country` no
tiene ningún código de login/sesión — cero coincidencias para
`login`/`sessionToken`/`Bearer` en toda la app. Una vista guardada
"propiedad de un usuario" en el sentido que spec §19 describe **no puede
existir server-side para el portal país**, porque no hay identidad de
usuario que asignarle. En vez de forzar una solución server-side que no
encaja o, al otro extremo, omitir el bloque completo para país, se dividió
honestamente: **`frontend-admin` obtiene persistencia real** (tabla nueva,
ligada al usuario autenticado); **`frontend-country` obtiene un equivalente
local vía `localStorage`** — mismo concepto de UX, garantía distinta y
explícita ("en este navegador", no "en tu cuenta").

**Backend — la primera ruta de todo `/geo/*` que exige sesión real, no solo
un nivel de visibilidad.** `gis.geo_saved_views` (migración
`012_geo_saved_views.sql`, aplicada contra la base en ejecución) —
`user_id` con `FK` a `core.users`, `view_state JSONB` (deliberadamente no
normalizado en columnas: es una foto de estado de UI, no una entidad de
dominio que este esquema necesite consultar o unir). `GET`/`POST`/`DELETE
/geo/saved-views` usan un helper nuevo, `requireAuthenticatedPrincipal`,
que lanza `401` real ante un caller anónimo — distinto del patrón
`resolveIncludeInternal` que el resto del controlador usa (ese nunca
rechaza, solo estrecha lo que se ve). Eliminar valida propiedad en código
de aplicación (`SELECT` primero, comparar `user_id`, **luego** `DELETE`) en
vez de confiar implícitamente en la cláusula `WHERE` — así un intento de
borrar la vista de otro usuario recibe `403` real, y un id inexistente
recibe `404` real, nunca la misma respuesta ambigua para ambos casos.

**Validación server-side de un `viewState` que el propio frontend generó —
nunca confiado solo por venir "de nuestro código".** `parseSavedViewCreateInput`
reutiliza literalmente la misma validación por filtro que `parseFiltersParam`
ya usaba (`parseFilterArray`, extraído para que ambos compartan una sola
definición de "qué es un filtro válido"), y valida `opacity` como número
entre 0 y 1, `code`/`color` como texto no vacío, con topes explícitos
(`MAX_SAVED_VIEW_LAYERS = 50`, `MAX_SAVED_VIEW_NAME_LENGTH = 200`) — mismo
principio de "nunca sin límite" del resto del módulo.

**Alcance explícitamente recortado: sin filtros ni viewport al restaurar.**
El backend sí captura y persiste los filtros de cada capa activa (por si un
consumo futuro de la API los necesita), pero **la UI de "Cargar" hoy solo
restaura capas activas, color y opacidad** — no reconstruye el estado del
formulario de filtros. La razón: el estado del formulario
(`GeoLayerFilterFormState`, texto/checkbox/rango según el tipo de campo,
P0-6) y el formato de filtro que viaja por la red (`{field, operator,
value}`) no son la misma forma; reconstruir el primero desde el segundo de
manera genérica y correcta para los cinco tipos de campo es trabajo real,
no una línea de código, y se decidió no improvisarlo bajo presión de
alcance. Tampoco se captura el viewport (centro/zoom del mapa): restaurar
el conjunto de capas ya dispara el auto-ajuste de `MultiLayerMap` a sus
límites combinados, dando una vista razonable sin necesitar una nueva
capacidad de "viewport controlado" que hoy no existe. Ambas omisiones están
documentadas aquí, no descubiertas por un usuario que esperaba más.

**Verificado con Playwright en ambos frontends, contra el stack real —
incluyendo persistencia real entre recargas, no solo el ciclo de vida en
memoria de una sola sesión de página:**

1. **País**: guardar la vista actual la lista; "Desactivar todas" la
   vacía; "Cargar" la restaura (capa activa de nuevo); **recargar la
   página completa** y la vista sigue listada (confirma persistencia real
   en `localStorage`, no solo estado de React); "Eliminar" la quita.
2. **Admin**: mismo flujo, pero contra el backend real — se confirmó con
   `curl` directo, antes de la verificación con navegador, que: un caller
   anónimo recibe `401` en `GET` y `POST`; `opacity: 5` y `name` ausente
   se rechazan con `400`; crear devuelve `201` (no `200` — corregido en
   `scripts/geo-api-smoke.mjs`, que inicialmente esperaba `200` y fallaba
   de forma intermitente-parecida hasta que se identificó la causa real);
   listar después de crear incluye la vista nueva; eliminar devuelve `200`
   y un segundo intento de eliminar la misma vista devuelve `404`.
   Con Playwright: guardar, desactivar todas, cargar, **recargar la
   página completa** (la vista sigue ahí — persistencia real en Postgres,
   no un artefacto de la sesión del navegador), eliminar.
3. **Cero errores de consola** en las ocho corridas (cuatro por frontend).
4. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres
   workspaces), `npm run test:unit` (67/67), `geo-visibility-smoke` (4/4),
   `geo-api-smoke` (46/46, incluye 8 verificaciones nuevas de vistas
   guardadas), `role-smoke` (33/33), `tests/e2e/geo.spec.js` (2/2) — todos
   en verde.

---

### P1-5 — diseño y resultados de verificación

**La regla que define todo este bloque: nunca graficar la página, siempre el
conjunto filtrado completo.** La tabla de atributos (P0-7) pagina de a 20
filas — un gráfico construido solo con esas 20 filas visibles habría sido
engañoso, no una foto real de la distribución bajo los filtros activos. Por
eso `getLayerStats` no reutiliza `queryFeatures` (que sí pagina); reutiliza
únicamente `buildBaseQuery` — la parte que resuelve visibilidad + bbox +
filtros — y construye su propio `SELECT` de agregación (`GROUP BY` o
`MIN`/`MAX`/`AVG`) encima, sin `LIMIT`/`OFFSET`.

**Reutilización literal de `resolveFieldExpression`, no una copia.** El
mismo resolutor que ya traduce un nombre de campo a una expresión SQL seguro
para filtros (P0-6) y orden (P0-7) decide aquí también si el campo es un
alias JSONB o una columna real, y con qué parámetro se une — la tercera vez
que esta función se reutiliza sin reescribirla, exactamente el patrón que
motivó extraerla de `resolveFilterExpression` en P0-7.

**Tipo de campo decide la forma de la respuesta, no una casilla que el
usuario marca.** Texto/booleano/enum → conteos agrupados (`GROUP BY`,
`ORDER BY COUNT(*) DESC`, tope `MAX_STATS_GROUPS = 20` con `truncated: true`
si hay más valores distintos — mismo principio de "nunca sin límite" de
paginación/exportación). Número → `MIN`/`MAX`/`AVG`. Fecha → `MIN`/`MAX`
(sin promedio: promediar fechas no es una operación con significado
directo, y agregarla habría sido inventar una capacidad no pedida). Se
filtran explícitamente los valores `NULL` antes de agrupar/agregar
(`AND ${expr} IS NOT NULL`) — un valor de propiedad ausente no debe aparecer
como su propio grupo "vacío" en el gráfico.

**Verificado con datos reales, no un campo trivial.** `curl` directo contra
`areas_protegidas_ref` con `field=CATEGORíA` (el mismo campo crudo,
sin normalizar, documentado desde P0-6) reprodujo la distribución real de 8
categorías (RVS: 124, HH: 109, PN: 91…), y aplicar un filtro
`{"field":"CATEGORíA","operator":"in","value":["PN"]}` devolvió
correctamente un solo grupo con conteo 91 — confirmando que `/stats`
respeta exactamente el mismo filtro que ya angosta la tabla y el mapa.

**Sin librería de gráficos nueva.** `apps/frontend-admin/src/pages/BiVisualizerPage.tsx`
ya construye sus barras con `<div style={{width: '${pct}%'}}>` — sin
`recharts`, `chart.js` ni ninguna dependencia de gráficos. La sección
"Distribución" de `GeoLayerAttributeTable.tsx` sigue exactamente ese mismo
patrón, ya establecido y ya probado en producción, en vez de introducir una
dependencia nueva para una barra horizontal.

**Verificado con Playwright en ambos frontends, contra el stack Docker real:**

1. Abrir la tabla de atributos y elegir el campo "Nivel" en el selector de
   "Distribución" muestra la barra real (`site → 379`, capa DNEA) —
   confirmado visualmente, no solo por presencia de texto en el DOM (un
   selector de prueba inicial demasiado estricto dio un falso negativo;
   investigado con una captura de pantalla completa en vez de asumir un
   defecto real, y confirmado que el gráfico sí renderiza correctamente).
2. Elegir un campo numérico ("Área") muestra el resumen Elementos/Mínimo/
   Máximo/Promedio en vez de barras — la forma de la respuesta cambia según
   el tipo de campo, tal como se diseñó.
3. **Cero errores de consola** en ambos frontends.
4. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres
   workspaces), `npm run test:unit` (67/67), `geo-visibility-smoke` (4/4),
   `geo-api-smoke` (53/53, incluye 7 verificaciones nuevas de distribución —
   campo ausente/desconocido, agrupado, numérico, respeta filtros, capa
   restringida anónima/autorizada), `role-smoke` (33/33), `tests/e2e/geo.spec.js`
   (2/2) — todos en verde.

---

### P1-6 — diseño y resultados de verificación

**La decisión que definió este bloque, tomada antes de escribir código:**
spec §10 pide "buffer, intersección, distancia" como si fueran tres
capacidades independientes, pero ninguna decisión de UX existía sobre qué
haría un usuario con un buffer suelto o una intersección entre dos capas
arbitrarias — implementar las tres primitivas sin esa decisión habría sido
exactamente el tipo de funcionalidad no solicitada que este proyecto evitó
en cada bloque anterior. `ST_DWithin` sobre un cast `::geography` resuelve
las tres a la vez con una sola operación bien definida: "¿qué hay a menos
de R metros de este punto/polígono?" es, literalmente, "qué intersecta un
buffer(geometría, R)" — ver el comentario en
`dto/geo-feature-query.dto.ts` (`parseNearbyQueryInput`). Se optó por
implementar **esta única operación**, bien acotada y con una UX ya conocida
(reutiliza la ficha de identificación de P0-5), en vez de exponer
primitivas crudas sin resolver cómo se usarían.

**`::geography`, no `::geometry` — la razón es precisión métrica real, no
estilo.** El resto del módulo (`ST_Intersects` en `buildBaseQuery` para
bbox) opera sobre geometría plana en grados — correcto para "¿el bbox del
viewport se solapa con esto?", donde no importa que un grado de longitud
no mida lo mismo en el ecuador que cerca de los polos. Un radio en metros
sí necesita esa corrección geodésica: `ST_DWithin(a::geography,
b::geography, radiusMeters)` calcula la distancia real sobre un esferoide,
no una distancia en grados reinterpretada como metros. Confirmado con
datos reales: dos features de `dnea_activity_points` centradas a
~5.721 m de distancia real (verificado con `ST_Distance` directo antes de
escribir el endpoint) — la cifra que el endpoint devuelve coincide.

**Reutilización, otra vez, no un mecanismo de selección nuevo.**
`GeoNearbyTerritoryResult` es literalmente `GeoTerritorySearchResult &
{ distanceMeters: number }` — mismo (`territoryCode`, `territoryName`,
`territoryLevel`, `layerCode`, `layerName`) que P1-1 ya definió. Elegir un
resultado de "Elementos cercanos" en la ficha llama a
`handleSelectSearchResult`, la misma función de P1-1, sin cambio ni
adaptador: activa la capa objetivo si no estaba activa, y encola la
selección de la feature exacta a través del mismo `pendingSearchSelection`
→ `MultiLayerMap.selectFeature` (con el reintento acotado que P1-1 ya
corrigió) que todo el módulo usa desde entonces.

**Validación real de la geometría de entrada, no solo del radio.** El
`geometry` que el cliente envía (siempre la del feature ya seleccionado,
nunca dibujado a mano por el usuario — no hay una herramienta de dibujo en
este bloque) se valida en dos capas: `parseNearbyQueryInput` exige un
`type` de una lista cerrada de tipos GeoJSON válidos y una clave
`coordinates` presente; si aun así `ST_GeomFromGeoJSON` falla en Postgres
(coordenadas mal formadas dentro de una estructura que sí parece válida),
el error se captura y se convierte en `400`, nunca en un `500`. Tope
`MAX_NEARBY_RESULTS = 100` y `MAX_NEARBY_RADIUS_METERS = 50000` (50 km) —
mismo principio de "nunca sin límite" del resto del módulo.

**Hallazgo real durante la verificación, corregido, no ocultado — la
misma clase de bug que P1-4 ya había encontrado.** Los primeros
`geo-api-smoke.mjs` para `/nearby` esperaban `200`, y fallaron de forma
aparentemente intermitente (un check distinto fallaba en cada corrida).
Investigado con `curl` directo en vez de asumir una condición de carrera:
`POST /geo/layers/:code/nearby` devuelve `201` (el código por defecto de
NestJS para un manejador `@Post()`), no `200` — el mismo error de
aserción, no de comportamiento, que ya se había corregido para
`POST /geo/saved-views` en P1-4. Corregido en `scripts/geo-api-smoke.mjs`;
confirmado estable en tres corridas consecutivas (60/60 cada vez) después
de la corrección.

**Verificado con Playwright en ambos frontends, contra el stack Docker
real, con datos y coordenadas reales (nunca sintéticos):**

1. Abrir la tabla de atributos de `dnea_activity_points`, seleccionar una
   fila real (mismo patrón estable de P0-7/P0-10 — nunca un clic sobre el
   mapa) y ampliar el radio a 10 km en "Elementos cercanos" devolvió 30
   resultados reales ordenados por distancia (`0 m`, luego crecientes).
2. Seleccionar un resultado actualizó la ficha completa al elemento
   elegido (confirmado visualmente: metadatos, "Ver todos los atributos"
   y el radio de "Elementos cercanos" vuelven a su estado inicial para el
   nuevo elemento) — el mismo flujo de P1-1, ahora disparado desde un
   resultado de proximidad en vez de una búsqueda por texto.
3. **Cero errores de consola** en las cuatro corridas (dos por frontend).
4. **Sin regresión** — `npm run lint`, `npm run typecheck` (los tres
   workspaces), `npm run test:unit` (76/76 — incluye pruebas nuevas de un
   trabajo concurrente no relacionado con este módulo, ver nota de proceso
   abajo), `geo-visibility-smoke` (4/4), `geo-api-smoke` (60/60, incluye 7
   verificaciones nuevas de proximidad), `role-smoke` (33/33),
   `tests/e2e/geo.spec.js` (2/2) — todos en verde.

**Nota de proceso: trabajo concurrente no relacionado detectado durante la
verificación.** Durante este bloque, `npm run build:api` falló una vez de
forma transitoria por un módulo `reports` que no existe en el alcance de
este trabajo — investigado antes de asumir una regresión propia: el
archivo sí existía en disco: otro proceso (otra sesión de Claude Code, o
el usuario) está editando `apps/sigi-api/src/modules/reports/` y
`libs/domain`/`libs/contracts` **al mismo tiempo**, agregando tipos como
`ReportFramework`/`ConfigurableReportTemplate` no relacionados con Geo-BI.
Una segunda corrida de `typecheck`/`test:unit` pasó limpia — el fallo fue
una foto de un archivo a mitad de guardado por ese otro proceso, no un
defecto real. Ninguna edición de este trabajo se revirtió ni se tocó ese
módulo.

---

## 10. Archivos que deberán modificarse

**Corrección de seguridad (P0-1)**
- `services/gis-service/app/api/routes/geometry.py`
- `services/gis-service/app/main.py`
- `apps/sigi-api/src/modules/territories/territories.controller.ts`
- `apps/sigi-api/src/modules/territories/territories.service.ts`
- `docker-compose.yml` (dejar de publicar el puerto 8002)

**Backend nuevo (P0-3 — completado)**
- `apps/sigi-api/src/modules/geo/geo.module.ts`, `geo.controller.ts`, `geo.service.ts` — nuevo
- `apps/sigi-api/src/modules/geo/geo.types.ts` — tipos locales, espejo de `@sigi/domain` (el backend
  no depende del paquete compartido — ver comentario en el archivo)
- `apps/sigi-api/src/modules/geo/geo-schema.ts` — derivación de `GeoLayerSchema` desde datos reales
- `apps/sigi-api/src/modules/geo/geo-filter-sql.ts` — traducción segura de filtros a SQL parametrizado
- `apps/sigi-api/src/modules/geo/dto/geo-feature-query.dto.ts` — validación manual de query params
- `apps/sigi-api/src/common/auth/optional-principal.ts` — nuevo, extrae la resolución de principal
  opcional antes duplicada entre `TerritoriesController` y el nuevo `GeoController`
- `apps/sigi-api/src/modules/territories/territories.controller.ts` (reutiliza el helper anterior)
- `apps/sigi-api/src/app.module.ts` (registro de `GeoModule`)
- `scripts/geo-api-smoke.mjs` — nuevo, registrado en el *release gate* (`smoke:geo-api`)

**Datos (P0-2 — completado)**
- `infra/postgres/init/011_geo_layer_intelligence.sql` — jerarquía de visibilidad, metadata,
  índices, perfilado, función bbox+simplify
- `infra/postgres/migrations/20260901_geo_layer_intelligence.sql` — wrapper de aplicación
- `apps/sigi-api/src/common/geo/geo-visibility.ts` — contrato TS único de visibilidad
- `apps/sigi-api/src/modules/geo-bi/geo-bi.service.ts` (usa el nuevo predicado en lugar de la
  comparación de texto duplicada)
- `services/gis-service/app/api/routes/geometry.py` (usa `gis.geo_visibility_is_public`)
- `libs/domain/src/index.ts`, `libs/contracts/src/index.ts` — contratos `GeoLayer`,
  `GeoLayerMetadata`, `GeoLayerField`, `GeoLayerSchema`, `GeoFeatureQuery`, `GeoExtent`,
  `GeoDatasetProfile` — ahora servidos por el módulo `/geo/*` de P0-3

**Frontend — portal país (P0-4, completado)**
- `apps/frontend-country/src/components/GeoLayerCatalogPanel.tsx` — nuevo
- `apps/frontend-country/src/components/MultiLayerMap.tsx` — nuevo
- `apps/frontend-country/src/pages/GeoBiPage.tsx` (nuevo panel "Catálogo de capas"; panel existente
  conservado y renombrado "Visor de mapas (vista clásica)")
- `apps/frontend-country/src/services/api.ts` (`getGeoLayers`, `getGeoLayerFeatures`)

**Frontend — portal país (P0-5, completado)**
- `apps/frontend-country/src/components/FeatureIdentificationPanel.tsx` — nuevo
- `apps/frontend-country/src/components/MultiLayerMap.tsx` (click-to-identify + resaltado; `emptyMessage` sin cambios)
- `apps/frontend-country/src/pages/GeoBiPage.tsx` (estado y disposición de 3 columnas cuando hay selección)
- `apps/frontend-country/src/pages/ProjectsPage.tsx` (`?projectId=` opcional, aditivo)
- `apps/frontend-country/src/services/api.ts` (`getGeoLayerMetadata`)
- `apps/sigi-api/src/modules/geo/geo.service.ts` (`tf.updated_at` en `queryFeatures`, aditivo)

**Frontend — portal país (P0-6, completado)**
- `apps/frontend-country/src/components/GeoLayerFilterControls.tsx` — nuevo
- `apps/frontend-country/src/components/GeoLayerCatalogPanel.tsx` (renderiza los filtros por capa activa)
- `apps/frontend-country/src/pages/GeoBiPage.tsx` (schema por capa, formulario de filtros, *debounce*, *refetch*)
- `apps/frontend-country/src/services/api.ts` (`getGeoLayerSchema`; `getGeoLayerFeatures` acepta `filters`)

**Backend (P0-7, completado)**
- `apps/sigi-api/src/modules/geo/geo-filter-sql.ts` (`resolveFilterExpression` → `resolveFieldExpression`, reutilizable)
- `apps/sigi-api/src/modules/geo/geo-sort-sql.ts` — nuevo
- `apps/sigi-api/src/modules/geo/geo.service.ts` (`ORDER BY` dinámico; deriva schema también para `sort`)
- `apps/sigi-api/src/modules/geo/geo.controller.ts` (`sort`, `order`)
- `apps/sigi-api/src/modules/geo/dto/geo-feature-query.dto.ts` (`parseSortParam`)
- `scripts/geo-api-smoke.mjs` (4 verificaciones nuevas de orden)

**Frontend — portal país (P0-7, completado)**
- `apps/frontend-country/src/components/GeoLayerAttributeTable.tsx` — nuevo
- `apps/frontend-country/src/components/MultiLayerMap.tsx` (`selectFeature(layerCode, featureCode)`)
- `apps/frontend-country/src/components/GeoLayerCatalogPanel.tsx` (botón "Ver tabla" por capa activa)
- `apps/frontend-country/src/pages/GeoBiPage.tsx` (estado de tabla: página, orden, *fetch*, sincronización con la ficha)
- `apps/frontend-country/src/services/api.ts` (`getGeoLayerFeatures` acepta `page`/`sort`/`order`)

**Frontend — consola admin (P0-4 … P0-7, completado — ver §9.7)**
- `apps/frontend-admin/src/components/GeoLayerCatalogPanel.tsx` — nuevo
- `apps/frontend-admin/src/components/MultiLayerMap.tsx` — nuevo
- `apps/frontend-admin/src/components/FeatureIdentificationPanel.tsx` — nuevo
- `apps/frontend-admin/src/components/GeoLayerFilterControls.tsx` — nuevo (envoltorio sobre `@sigi/shared`)
- `apps/frontend-admin/src/components/GeoLayerAttributeTable.tsx` — nuevo
- `apps/frontend-admin/src/pages/GeoBiModulePage.tsx` (nuevo panel "Catálogo de capas"; panel existente
  conservado y renombrado "Visor de mapas (vista clásica)"; `GeoBiLayerMap.tsx` sin tocar)
- `apps/frontend-admin/src/pages/ProjectsModulePage.tsx` (`?projectId=` opcional, aditivo)
- `apps/frontend-admin/src/services/api.ts` (`getGeoLayers`, `getGeoLayerFeatures`, `getGeoLayerMetadata`, `getGeoLayerSchema`)
- `libs/shared/src/index.ts` (`buildGeoFiltersFromForm` — nuevo, compartido de verdad entre ambos frontends)
- `apps/frontend-country/src/components/GeoLayerFilterControls.tsx` (refactorizado para reutilizar `@sigi/shared` en vez de definir la conversión localmente)

**Backend (P0-8, completado — ver §9.8)**
- `apps/sigi-api/src/modules/geo/geo-export.ts` — nuevo (`buildCsvExport`, `buildXlsxExport`, `buildGeoJsonExport`)
- `apps/sigi-api/src/modules/geo/geo.service.ts` (`buildBaseQuery` extraído/reutilizado; `exportFeatures`, `MAX_EXPORT_FEATURES`)
- `apps/sigi-api/src/modules/geo/geo.controller.ts` (`GET layers/:code/export`; auditoría vía `AuditService`)
- `apps/sigi-api/src/modules/geo/geo.module.ts` (importa `AuditModule`)
- `apps/sigi-api/src/modules/geo/dto/geo-feature-query.dto.ts` (`parseFormatParam`, `GeoExportFormat`)
- `apps/sigi-api/src/main.ts` (`exposedHeaders` de CORS ampliado con `Content-Disposition` y
  `X-SIGI-Export-*` — hallazgo real de la verificación, ver §9.8)
- `scripts/geo-api-smoke.mjs` (8 verificaciones nuevas de exportación; 28/28 en total)

**Frontend — portal país (P0-8, completado — ver §9.8)**
- `apps/frontend-country/src/components/GeoLayerAttributeTable.tsx` (selector de formato + botón
  "Exportar" + aviso de truncamiento)
- `apps/frontend-country/src/pages/GeoBiPage.tsx` (`handleExport`, estado `exportFormat`/`exportState`)
- `apps/frontend-country/src/services/api.ts` (`exportGeoLayerFeatures`, `downloadGeoExport`,
  `buildGeoFeaturesQuery` acepta `format`)

**Frontend — consola admin (P0-8, completado — ver §9.8)**
- `apps/frontend-admin/src/components/GeoLayerAttributeTable.tsx` (mismos controles que país, paleta admin)
- `apps/frontend-admin/src/pages/GeoBiModulePage.tsx` (`handleExport`, estado `exportFormat`/`exportState`)
- `apps/frontend-admin/src/services/api.ts` (`exportGeoLayerFeatures`, `downloadGeoExport`,
  `buildGeoFeaturesQuery` acepta `format`)

**Frontend — portal país y consola admin (P0-9, completado — ver §9.9)**
- `apps/frontend-country/src/pages/GeoBiPage.tsx` (barra de herramientas del catálogo: búsqueda,
  `fetchGeoLayers` extraído a `useCallback`, `handleRefreshCatalog`/`handleDeactivateAllLayers`/
  `handleZoomToAllActiveLayers`, mensaje distinto para "sin resultados de búsqueda")
- `apps/frontend-admin/src/pages/GeoBiModulePage.tsx` (mismos cambios, paleta admin)
- Sin cambios en `GeoLayerCatalogPanel.tsx` de ningún frontend — el filtrado de búsqueda ocurre antes
  de pasarle las entradas, y el estado vacío distinto se resuelve fuera del componente

**Pruebas y documentación (P0-10, completado — ver §9.10)**
- `tests/unit/geo-filter-sql.test.mjs`, `geo-sort-sql.test.mjs`, `geo-visibility.test.mjs`,
  `geo-feature-query-dto.test.mjs`, `geo-schema.test.mjs`, `geo-export.test.mjs` — nuevos, 65 pruebas,
  importan el output compilado de `apps/sigi-api/dist`
- `tests/e2e/geo.spec.js` — nuevo, flujo mínimo en ambos frontends (`@country`/`@admin`)
- `package.json` (`test:unit` ahora corre `npm run build:api` antes de las pruebas, para que nunca
  se ejecuten contra un `dist/` desactualizado — mismo riesgo que D9)
- `docs/geo/architecture.md`, `layer-catalog.md`, `geoserver.md`, `spatial-analysis.md`, `exports.md`
  — nuevos. `permissions.md` y `postgis.md` ya existían desde P0-2
- `.env.example` — revisado, sin cambios (ninguna variable nueva introducida por P0-2…P0-9)

**Backend y frontend (P1-1, completado — ver §9.11)**
- `apps/sigi-api/src/modules/geo/geo.types.ts` (`GeoTerritorySearchResult`)
- `apps/sigi-api/src/modules/geo/dto/geo-feature-query.dto.ts` (`parseSearchTermParam`,
  `MIN_SEARCH_TERM_LENGTH`, `MAX_SEARCH_RESULTS`)
- `apps/sigi-api/src/modules/geo/geo.service.ts` (`searchTerritories`)
- `apps/sigi-api/src/modules/geo/geo.controller.ts` (`GET search`)
- `libs/domain/src/index.ts`, `libs/contracts/src/index.ts` (`GeoTerritorySearchResult`,
  `GeoSearchResponse`)
- `apps/frontend-country/src/services/api.ts`, `apps/frontend-admin/src/services/api.ts`
  (`searchGeoTerritories`)
- `apps/frontend-country/src/pages/GeoBiPage.tsx`, `apps/frontend-admin/src/pages/GeoBiModulePage.tsx`
  (estado y UI de búsqueda territorial, `pendingSearchSelection`)
- `apps/frontend-country/src/components/MultiLayerMap.tsx`,
  `apps/frontend-admin/src/components/MultiLayerMap.tsx` (`selectFeature` reescrito con
  reintento acotado — corrección de la condición de carrera real, ver §9.11)
- `scripts/geo-api-smoke.mjs` (6 verificaciones nuevas de búsqueda; 34/34 en total)
- `tests/e2e/geo.spec.js` (`verifyTerritorialSearch`, ejercitado en el flujo mínimo de ambos frontends)

**Backend y frontend (P1-2, completado — ver §9.12)**
- `apps/sigi-api/src/modules/geo/geo.types.ts` (`GeoDatasetProfile`)
- `apps/sigi-api/src/modules/geo/geo.service.ts` (`getLayerProfile`, `mapProfileRow`)
- `apps/sigi-api/src/modules/geo/geo.controller.ts` (`GET layers/:code/profile`)
- `libs/contracts/src/index.ts` (`GeoLayerProfileResponse` actualizado a `{ profile: GeoDatasetProfile | null }`)
- `apps/frontend-country/src/services/api.ts`, `apps/frontend-admin/src/services/api.ts`
  (`getGeoLayerProfile`)
- `apps/frontend-country/src/pages/GeoBiPage.tsx`, `apps/frontend-admin/src/pages/GeoBiModulePage.tsx`
  (estado `catalogProfileByCode`, mismo ciclo fetch que el schema de P0-6)
- `apps/frontend-country/src/components/GeoLayerCatalogPanel.tsx`,
  `apps/frontend-admin/src/components/GeoLayerCatalogPanel.tsx` (`formatProfileSummary`, línea de
  estadísticas por capa activa)
- `scripts/geo-api-smoke.mjs` (4 verificaciones nuevas de perfil; 38/38 en total)
- `tests/e2e/geo.spec.js` (aserción de la línea de estadísticas en el flujo mínimo)

**Frontend únicamente (P1-3, completado — ver §9.13; sin cambios de backend)**
- `apps/frontend-country/src/components/MultiLayerMap.tsx`,
  `apps/frontend-admin/src/components/MultiLayerMap.tsx` (`MultiLayerMapWmsEntry`, `wmsLayers` prop,
  sincronización de overlays WMS vía `L.tileLayer.wms`, separada de `layerGroupsRef`)
- `apps/frontend-country/src/pages/GeoBiPage.tsx`, `apps/frontend-admin/src/pages/GeoBiModulePage.tsx`
  (estado `externalLayers`/`externalForm`, `normalizeExternalGeoJson`, fetch de GeoJSON externo,
  formulario y lista "Capas externas (WMS/GeoJSON)")

**Backend y frontend (P1-4, completado — ver §9.14)**
- `infra/postgres/init/012_geo_saved_views.sql`, `infra/postgres/migrations/20260903_geo_saved_views.sql`
  — nuevos (`gis.geo_saved_views`)
- `apps/sigi-api/src/modules/geo/geo.types.ts` (`GeoSavedView`, `GeoSavedViewState`, `GeoSavedViewLayerState`)
- `apps/sigi-api/src/modules/geo/dto/geo-feature-query.dto.ts` (`parseSavedViewCreateInput`,
  `parseFilterArray` extraído de `parseFiltersParam` para reutilizar)
- `apps/sigi-api/src/modules/geo/geo.service.ts` (`listSavedViews`, `createSavedView`, `deleteSavedView`)
- `apps/sigi-api/src/modules/geo/geo.controller.ts` (`GET`/`POST`/`DELETE saved-views`,
  `requireAuthenticatedPrincipal`)
- `libs/domain/src/index.ts`, `libs/contracts/src/index.ts` (`GeoSavedView`, `GeoSavedViewState`,
  `GeoSavedViewLayerState`, `GeoSavedViewsListResponse`, `GeoSavedViewResponse`, `GeoSavedViewDeleteResponse`)
- `apps/frontend-admin/src/services/api.ts` (`getGeoSavedViews`, `createGeoSavedView`, `deleteGeoSavedView`)
- `apps/frontend-admin/src/pages/GeoBiModulePage.tsx` (estado `savedViews`, guardar/cargar/eliminar,
  persistido en `gis.geo_saved_views`)
- `apps/frontend-country/src/pages/GeoBiPage.tsx` (`loadLocalSavedViews`/`persistLocalSavedViews`,
  equivalente local vía `localStorage`, sin llamadas al backend)
- `scripts/geo-api-smoke.mjs` (`postJson`/`deleteJson` agregados; 8 verificaciones nuevas de vistas
  guardadas; 46/46 en total)

**Backend y frontend (P1-5, completado — ver §9.15)**
- `apps/sigi-api/src/modules/geo/geo.types.ts` (`GeoLayerFieldStats`, `GeoLayerFieldStatsGroup`)
- `apps/sigi-api/src/modules/geo/dto/geo-feature-query.dto.ts` (`parseStatsFieldParam`, `MAX_STATS_GROUPS`)
- `apps/sigi-api/src/modules/geo/geo.service.ts` (`getLayerStats`, reutiliza `buildBaseQuery` +
  `resolveFieldExpression`, ahora importado de `geo-filter-sql.ts`)
- `apps/sigi-api/src/modules/geo/geo.controller.ts` (`GET layers/:code/stats`)
- `libs/domain/src/index.ts`, `libs/contracts/src/index.ts` (`GeoLayerFieldStats`,
  `GeoLayerFieldStatsGroup`, `GeoLayerStatsResponse`)
- `apps/frontend-country/src/services/api.ts`, `apps/frontend-admin/src/services/api.ts`
  (`getGeoLayerStats`)
- `apps/frontend-country/src/pages/GeoBiPage.tsx`, `apps/frontend-admin/src/pages/GeoBiModulePage.tsx`
  (estado `chartField`/`chartState`, refetch en cambio de campo o de filtros de la tabla)
- `apps/frontend-country/src/components/GeoLayerAttributeTable.tsx`,
  `apps/frontend-admin/src/components/GeoLayerAttributeTable.tsx` (sección "Distribución",
  `GeoLayerFieldChart`, barras CSS — mismo patrón que `BiVisualizerPage.tsx`)
- `scripts/geo-api-smoke.mjs` (7 verificaciones nuevas de distribución; 53/53 en total)

**Backend y frontend (P1-6, completado — ver §9.16)**
- `apps/sigi-api/src/modules/geo/dto/geo-feature-query.dto.ts` (`parseNearbyQueryInput`,
  `MAX_NEARBY_RADIUS_METERS`, `MAX_NEARBY_RESULTS`, `ALLOWED_GEOMETRY_TYPES`)
- `apps/sigi-api/src/modules/geo/geo.types.ts` (`GeoNearbyTerritoryResult`)
- `apps/sigi-api/src/modules/geo/geo.service.ts` (`findNearbyTerritories`, `ST_DWithin` sobre
  `::geography`, errores de geometría convertidos a `BadRequestException`)
- `apps/sigi-api/src/modules/geo/geo.controller.ts` (`POST layers/:code/nearby`)
- `libs/domain/src/index.ts`, `libs/contracts/src/index.ts` (`GeoNearbyTerritoryResult`,
  `GeoNearbyResponse`)
- `apps/frontend-country/src/services/api.ts` (nuevo helper `postJson`, primer `POST` de este
  frontend), `apps/frontend-admin/src/services/api.ts` (reutiliza `postJson` existente) —
  ambos con `findNearbyTerritories`
- `apps/frontend-country/src/components/FeatureIdentificationPanel.tsx`,
  `apps/frontend-admin/src/components/FeatureIdentificationPanel.tsx` (sección "Elementos
  cercanos": selector de capa, selector de radio, resultados ordenados por distancia)
- `apps/frontend-country/src/pages/GeoBiPage.tsx`, `apps/frontend-admin/src/pages/GeoBiModulePage.tsx`
  (estado `nearbyLayerCode`/`nearbyRadiusMeters`/`nearbyState`, `handleSearchNearby`; selección de
  un resultado reutiliza `handleSelectSearchResult` de P1-1 sin cambios)
- `scripts/geo-api-smoke.mjs` (7 verificaciones nuevas de proximidad; 60/60 en total)

---

## 11. Migraciones requeridas

**~~M1 — Metadatos de capa~~ ✅ Completada en P0-2**
(`infra/postgres/init/011_geo_layer_intelligence.sql`). Implementada dividida en dos, no como una
lista plana sobre `gis.geo_layers`: columnas operacionales (`description`, `category`, `group_name`,
`geometry_type`, `crs`, `sort_order`) directamente en `gis.geo_layers`, y metadata institucional
(`institution_id`, `source_name`, `owner`, `responsible`, `data_date`, `update_frequency`, `license`,
`classification`, `access_level`, `service_url`, `quality_status`, `metadata_json`) en una tabla 1:1
nueva `gis.geo_layer_metadata` — para que un dato institucional ausente sea una fila faltante, nunca
un valor inventado. Todas las columnas nuevas nulables salvo `crs` (`'EPSG:4326'`, verificado desde el
tipo de columna existente, no una suposición) y `sort_order` (`0`). También agregó la jerarquía formal
de visibilidad y las funciones `gis.geo_visibility_rank`/`gis.geo_visibility_is_public` — ver
`docs/geo/permissions.md`.

**~~M2 — Índices espaciales~~ ✅ Completada en P0-2.** Los tres índices propuestos, más
`territory_features_territory_id_idx` (no listado originalmente, agregado por simetría con
`layer_id`). Medido con `EXPLAIN ANALYZE` antes/después — ver `docs/geo/postgis.md` §1.

**M2b — Perfilado de capas (nueva, no prevista en el diagnóstico original) ✅ Completada en P0-2.**
Tabla `gis.geo_layer_profile` + función `gis.refresh_geo_layer_profile(layer_id)`. Atiende §5 y §6 de
esta tarea (extent, conteos de nulas/inválidas, sin recalcular en cada request). Ejecutada
manualmente sobre las 11 capas existentes como verificación; no automatizada en ningún flujo de
escritura todavía. **Sigue pendiente tras P0-3** — el alcance de P0-3 fue el módulo `/geo/*` de
lectura (§9, tabla de bloques); conectar `gis.refresh_geo_layer_profile` a
`geospatial-catalog.service.ts` (tras `importGeoJsonLayer`, `importShapefileLayer`, `publishLayer`)
queda para una iteración posterior, junto con el endpoint `/geo/layers/:code/statistics` que lo
expondría (no incluido en el alcance de P0-3).

**~~M3 — Vistas guardadas~~ ✅ Completada en P1-4**, con dos diferencias deliberadas respecto de lo
previsto originalmente aquí: la tabla se llamó `gis.geo_saved_views` (no `gis.saved_views`, por
consistencia de prefijo con el resto del esquema geoespacial de este módulo), y **no incluye una
columna `shared`** — nadie pidió compartir vistas entre usuarios, y agregarla habría exigido decidir
un modelo de permisos para ese compartir (¿institución completa? ¿usuarios específicos?) sin que
existiera ese requisito. `user_id`, `name`, `view_state` (JSONB, equivalente al `config_json`
previsto), `created_at`/`updated_at` sí están, tal como se planteó. Ver §9.14.

**M4 — Tipo de geometría** (atiende D2): ampliar la columna a `geometry(Geometry, 4326)` para admitir
puntos y líneas nativamente. **Rompe compatibilidad** con las vistas de GeoServer y con el importador.
Diseño completo (columna paralela, backfill, corte) documentado en `docs/geo/postgis.md` §5;
deliberadamente no ejecutada en P0-2.

**M5 — Asignación de permisos por nivel de visibilidad** (nueva, P1, no implementar sin decisión de
producto). `core.permissions` ya tiene `geo.layers.read_institutional` / `read_restricted` /
`read_private` (P0-2, sin ningún `role_permissions` que los otorgue). Antes de otorgarlos y de mover
el *enforcement* de binario a por-nivel, resolver la revisión pendiente de D10 sobre la capa
`odoo_project_territories` — ver `docs/geo/permissions.md` §2 y §4.

---

## 12. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Capas no públicas expuestas (§5) | **Alto** | ✅ Cerrado en P0-1. Pendiente: auditar en cada despliegue qué capas no públicas existen y **revisar los registros de acceso previos**, ya que el endpoint era anónimo |
| Respuestas de 59 MB en el portal público (D6) | Medio | ✅ **Solucionable desde P0-3.** `GET /geo/layers/territories/features?zoom=5` mide 69 KB (854× menor) contra los 59,1 MB de `/territories/features`. La ruta antigua sigue sin acotar — el riesgo baja de Alto a Medio porque ahora existe una alternativa, pero persiste mientras el frontend (P0-4+) no migre a `/geo/*` y solicite `zoom` en cada carga de mapa |
| GeoServer no disponible | Medio | Ya se maneja; mantener el comportamiento al refactorizar |
| Refactor de páginas de 2.465 líneas | Medio | Cambios por bloques pequeños con typecheck entre cada uno |
| Ampliar el tipo de geometría (M4) | Medio | Diseño documentado en P0-2 (`docs/geo/postgis.md` §5); diferir ejecución a P1 — requiere recrear vistas GeoServer |
| Rendimiento sin GiST al activar análisis | Medio | ✅ Cerrado en P0-2 (M2) |
| Divergencia entre los dos frontends | Bajo | Extraer a `libs/` antes de invertir en el visor |
| Pérdida de funcionalidad Kobo/DNEA existente | Medio | No eliminar rutas legacy en P0; marcar como *deprecated* |
| Reclasificar `odoo_project_territories` sin revisión de dominio (D10) | Medio | No se tocó en P0-2; requiere decisión explícita antes de asignar permisos por nivel (M5) |
| Coordenadas en `dnea_activity_points` cerca de longitud 0 (D11) | Medio (subido de Bajo tras P0-4) | Detectado en P0-2, **confirmado visible al usuario en P0-4** (degrada el zoom automático del catálogo a vista mundial); requiere revisar el script de carga, no una migración |
| `fitBounds` combinado frágil ante outliers de una sola capa (nuevo, P0-4) | Medio | Mitigación futura (P1): excluir outliers estadísticos del cálculo de límites en `MultiLayerMap.tsx`, no solo del conteo nulas/inválidas de `gis.geo_layer_profile` |

---

## 13. Dependencias externas no verificables desde el repositorio

- Disponibilidad real de una instancia de GeoServer y sus credenciales.
- Existencia de capas institucionales reales más allá del seed de El Salvador.
- Origen autoritativo de la división administrativa (provincia/cantón/distrito) que §7 y §18 asumen.
- Servicio de geocodificación para la búsqueda por nombre de §18.

Estas quedan marcadas como `TODO` en el código cuando corresponda, conforme a §34.
