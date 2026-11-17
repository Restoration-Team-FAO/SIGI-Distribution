# Catálogo de capas (`gis.geo_layers` / `gis.geo_layer_metadata`)

Estado: P0-2…P0-9 completados (2026-09-03). Referencia de las columnas reales
y de cómo el catálogo multi-capa (P0-4) las consume. Para la jerarquía de
visibilidad y quién puede leer qué, ver `permissions.md`; para
`ST_IsValid`/índices/perfilado, ver `postgis.md`.

## 1. Separación operacional vs. institucional (P0-2)

`gis.geo_layers` guarda lo que el sistema necesita para *renderizar* una
capa; `gis.geo_layer_metadata` (1:1 vía `layer_id`, `ON DELETE CASCADE`)
guarda lo que una institución declara sobre su *procedencia*. Nunca se
mezclaron en una sola tabla — una capa puede existir (y de hecho existe hoy,
para las 11 capas activas) sin ninguna fila de metadata: la ficha de
identificación (P0-5) renderiza cada campo ausente como "No disponible",
nunca inventa un valor.

### `gis.geo_layers` (columnas agregadas por P0-2)

| Columna | Tipo | Notas |
|---|---|---|
| `description` | `TEXT` | Nula en las 11 capas hoy |
| `category` | `TEXT` | Nula en las 11 capas hoy → el catálogo (P0-4) agrupa todo bajo "Sin categoría" |
| `group_name` | `TEXT` | Igual que `category` |
| `geometry_type` | `TEXT` | Backfilled a `'MultiPolygon'` para toda capa poligonal existente (deuda documentada, ver §3) |
| `crs` | `TEXT NOT NULL DEFAULT 'EPSG:4326'` | Toda capa actual usa EPSG:4326 |
| `sort_order` | `INTEGER NOT NULL DEFAULT 0` | Sin UI para reordenar todavía |

### `gis.geo_layer_metadata` (nueva en P0-2)

| Columna | Corresponde a (ficha, spec §13) |
|---|---|
| `institution_id` | Institución |
| `source_name` | Fuente |
| `owner` | Propietario |
| `responsible` | Responsable |
| `data_date` | Fecha del dato |
| `update_frequency` | Frecuencia de actualización |
| `license` | Licencia |
| `classification` | Clasificación |
| `access_level` | Nivel de acceso |
| `service_url` | Servicio de origen |
| `quality_status` | Calidad |
| `metadata_json` | Campo abierto, no consumido por ninguna UI todavía |

Ninguna de las 11 capas activas tiene fila en esta tabla — verificado, no
asumido — por lo que todo el panel de "Fuente y metadatos" se renderiza como
"No disponible" hoy. Cargar estos datos es trabajo de captura institucional,
no de código, y queda fuera de P0.

## 2. Cómo el catálogo (P0-4) agrupa y ordena

`GeoLayerCatalogPanel` agrupa por `category` (`"Sin categoría"` cuando es
`NULL`, que es el caso real de las 11 capas) y ordena los grupos
alfabéticamente en español, con "Sin categoría" siempre al final. Dentro de
un grupo no hay orden explícito por `sort_order` en la UI todavía — las capas
aparecen en el orden que `GET /geo/layers` devuelve.

## 3. Deuda documentada: la columna de geometría es `MultiPolygon` fijo, incluso para capas de puntos

`gis.territory_features.geometry` está declarada `geometry(MultiPolygon, 4326)`
a nivel de columna — un hecho de esquema, no una preferencia. Las 5.496
features existentes son, todas, `MultiPolygon` a ese nivel, por lo que el
backfill de P0-2 escribió `geometry_type = 'MultiPolygon'` en **toda** capa
con al menos una feature, incluidas las que el catálogo etiqueta como
`layerType: point` (p. ej. `dnea_activity_points`): sus puntos se cargaron
como un `ST_Buffer` diminuto alrededor de la coordenada original
(`scripts/load_dnea_excel_to_geobi.py`), no como una geometría `Point` real.
El par lon/lat original viaja además en `properties_json`, y es lo que el
visor clásico (`GeoBiLayerMap.tsx`) usa para reconstruir el punto en el
navegador en vez de leerlo de la geometría.

Confirmado (P0-2): **ningún flujo de escritura activo de la API** introduce
nuevos casos de este tipo — tanto la importación GeoJSON como la de
shapefile rechazan explícitamente cualquier geometría que no sea
`Polygon`/`MultiPolygon`; el rodeo Point→Buffer existe solo en el script de
carga DNEA, fuera del camino servido por la API. No se migra el tipo de
columna en P0 — haría falta recrear las vistas de GeoServer y el
importador. Ver `postgis.md` §5 para el diseño de migración futura
(`geometry_native geometry(Geometry, 4326)`) y la medición completa.

## 4. Endpoints que exponen esto

| Ruta | Devuelve |
|---|---|
| `GET /geo/layers` | Lista de `GeoLayer` (columnas operacionales, no metadata) |
| `GET /geo/layers/:code` | Un `GeoLayer` |
| `GET /geo/layers/:code/metadata` | La fila de `gis.geo_layer_metadata` (o null en cada campo) |
| `GET /geo/layers/:code/schema` | `GeoLayerField[]` derivado de los datos reales — ver `geo-schema.ts`, no una configuración por dataset |

Las tres primeras filtran por visibilidad (ver `permissions.md`); `/schema`
también, indirectamente, porque solo puede derivar el schema de una capa que
el principal puede leer.
