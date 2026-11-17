# Arquitectura del módulo geoespacial

Estado: P0-1…P0-9 completados (2026-09-03). Este documento es un mapa de
navegación del módulo, no una repetición de `MAPA_SIGI_DIAGNOSTICO.md` — para
el diseño y la verificación de cada bloque P0, ver ese documento; para
visibilidad/permisos y PostGIS/rendimiento, ver `permissions.md` y
`postgis.md` respectivamente.

## 1. Componentes reales, no aspiracionales

| Componente | Rol | Runtime |
|---|---|---|
| `apps/sigi-api` | API pública/autenticada (`/geo/*`, `/geo-bi`, `/territories`, `/admin/geospatial-catalog`) | NestJS (Node) |
| `services/gis-service` | Ruta `/geometry` interna, consumida por `TerritoriesController` — no expuesta directamente al navegador | FastAPI (Python) |
| PostGIS (`postgres`) | Almacena `gis.geo_layers`, `gis.geo_layer_metadata`, `gis.territory_features`, `core.territories` | PostgreSQL 15 + PostGIS |
| GeoServer | Publica capas WMS/WFS para el visor clásico y GeoServerWMS overlay (independiente de `/geo/*`, ver `geoserver.md`) | GeoServer |
| `apps/frontend-country` | Portal público (anónimo, opcionalmente autenticado) | React + Vite |
| `apps/frontend-admin` | Consola administrativa (autenticada) | React + Vite |

Ningún componente nuevo se creó para este trabajo: P0-1…P0-9 son cambios
dentro de los componentes de arriba, no un microservicio ni un frontend
paralelo — decisión explícita del alcance original (`MAPA_SIGI_DIAGNOSTICO.md`
§9, "Decisiones de diseño").

## 2. Dos caminos de lectura geoespacial que no se mezclan

1. **`/geo/*` (P0-3…P0-9)** — JSON tipado (`GeoFeatureCollection`), leído
   directamente de `gis.territory_features`/`core.territories` vía
   `sigi-api`. Es lo que alimenta el catálogo multi-capa, la ficha, los
   filtros, la tabla de atributos y la exportación en ambos frontends.
2. **GeoServer WMS** — tiles de imagen, servidas por GeoServer y superpuestas
   en Leaflet vía `L.tileLayer.wms` con la configuración de
   `countryGeoServerConfig`/`adminGeoServerConfig` (visor clásico, no el
   catálogo multi-capa de P0-4). No pasa por `/geo/*` ni por `sigi-api` en el
   camino de lectura — GeoServer consulta PostGIS directamente vía su propio
   datastore.

Ambos caminos leen la misma base de datos pero por rutas de código
completamente separadas; una capa puede existir en uno, en el otro, en
ambos, o en ninguno (ver `geoserver.md` §2 para el estado real de qué está
publicado hoy).

## 3. `apps/sigi-api/src/modules/geo/` — layout

```
geo.module.ts        — registra GeoController/GeoService, importa AuthModule y AuditModule
geo.controller.ts     — GET layers, layers/:code, :code/metadata, :code/schema, :code/features, :code/export
geo.service.ts        — consultas SQL parametrizadas; buildBaseQuery() compartido entre queryFeatures/exportFeatures
geo.types.ts           — tipos locales (sigi-api no depende de @sigi/domain — ver comentario en el archivo)
geo-schema.ts          — deriveFieldsFromPropertySamples(): infiere el schema de filtros/columnas desde datos reales
geo-filter-sql.ts       — ParamBuilder, resolveFieldExpression(), buildFilterClause() — SQL siempre parametrizado
geo-sort-sql.ts         — buildSortClause(), reutiliza resolveFieldExpression()
geo-export.ts           — buildCsvExport()/buildXlsxExport()/buildGeoJsonExport()
dto/geo-feature-query.dto.ts — validación manual de query params (sin class-validator)
```

`apps/sigi-api/src/common/geo/geo-visibility.ts` y
`apps/sigi-api/src/common/auth/optional-principal.ts` son compartidos con
`TerritoriesController` (P0-1/P0-2) — ver `permissions.md`.

## 4. Autorización: "público con auth opcional"

Todas las rutas de `/geo/*` aceptan una petición anónima (devuelve solo el
subconjunto público) o una con `Authorization: Bearer <token>` cuyo
principal tenga el permiso `connectors.read` (devuelve también capas no
públicas). No hay una segunda ruta administrativa duplicada — `frontend-admin`
llama exactamente los mismos endpoints que `frontend-country`, con el token
adjunto. Ver `permissions.md` para la jerarquía completa y el hallazgo de
seguridad que originó este modelo (P0-1).

## 5. Frontends: paridad de comportamiento, no de código

`frontend-country` y `frontend-admin` tienen sistemas de diseño ya
divergentes antes de este trabajo (paleta `#0f766e` vs. `#0b4f3a`/`#1f8a5b`,
193 vs. 515 líneas en `section-kit.tsx`). La decisión tomada en P0-4 y
mantenida hasta P0-9: **JSX y estilos se duplican deliberadamente por
frontend** (documentado como D5); la única pieza de lógica pura extraída a
`libs/shared` es `buildGeoFiltersFromForm` (conversión de formulario de
filtros a filtros de servidor, P0-6/paridad admin). Ambos frontends llaman a
los mismos endpoints `/geo/*` con la misma forma de query params.

## 6. Dónde mirar para cada bloque

| Bloque | Diseño y verificación | Archivos |
|---|---|---|
| P0-1 (seguridad) | `MAPA_SIGI_DIAGNOSTICO.md` §5 | `optional-principal.ts`, `territories.controller.ts` |
| P0-2 (datos) | `permissions.md`, `postgis.md` | `011_geo_layer_intelligence.sql` |
| P0-3 (`/geo/*`) | `MAPA_SIGI_DIAGNOSTICO.md` §9.1 | `geo.controller.ts`, `geo.service.ts` |
| P0-4…P0-7 (catálogo/ficha/filtros/tabla) | `MAPA_SIGI_DIAGNOSTICO.md` §9.2-§9.7 | `GeoLayerCatalogPanel.tsx` y afines, en ambos frontends |
| P0-8 (exportación) | `exports.md`, `MAPA_SIGI_DIAGNOSTICO.md` §9.8 | `geo-export.ts`, `GeoLayerAttributeTable.tsx` |
| P0-9 (toolbar/estados) | `MAPA_SIGI_DIAGNOSTICO.md` §9.9 | `GeoBiPage.tsx`/`GeoBiModulePage.tsx` |
| Catálogo de capas (columnas, metadata) | `layer-catalog.md` | `gis.geo_layers`, `gis.geo_layer_metadata` |
| GeoServer/WMS | `geoserver.md` | `geospatial-catalog.controller.ts` |
| Análisis espacial (no implementado) | `spatial-analysis.md` | — |
