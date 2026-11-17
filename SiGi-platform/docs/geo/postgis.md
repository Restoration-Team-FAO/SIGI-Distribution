# PostGIS — índices, perfilado y estrategia de rendimiento

Estado: P0-2 completado (2026-09-01). Mediciones tomadas contra los datos
reales del entorno de desarrollo (5.496 features en 11 capas), no simuladas.

## 1. Índices

Agregados por `infra/postgres/init/011_geo_layer_intelligence.sql`:

```sql
CREATE INDEX territory_features_geometry_gix ON gis.territory_features USING GIST (geometry);
CREATE INDEX territory_features_layer_id_idx ON gis.territory_features (layer_id);
CREATE INDEX territory_features_territory_id_idx ON gis.territory_features (territory_id);
```

**Antes** (`EXPLAIN ANALYZE`, bbox contra la capa `pastos_ref`):

```
Seq Scan on territory_features tf (actual time=53.424..58.472 rows=2 loops=1)
  Filter: st_intersects(geometry, …)
  Rows Removed by Filter: 5494
Execution Time: 59.229 ms
```

**Después**, misma consulta:

```
Index Scan using territory_features_geometry_gix on territory_features tf
  Index Cond: (geometry && …)
  Filter: st_intersects(geometry, …)
Execution Time: 1.640 ms
```

De *sequential scan* sobre las 5.496 filas a *index scan* — ~36× más rápido
en esta medición puntual, y la diferencia crece con el volumen de datos.

### Índice GIN sobre `properties_json` — evaluado, no agregado

```
EXPLAIN ANALYZE SELECT tf.id FROM gis.territory_features tf
WHERE tf.properties_json ->> 'activityGeneral' = 'Agroforestería';

Seq Scan on territory_features tf (actual time=15.487..15.489 rows=0 loops=1)
Execution Time: 15.526 ms
```

Con 5.496 filas totales (la capa más grande, `pastos_ref`, tiene 2.248), el
*sequential scan* ya cuesta ~15 ms. Un índice GIN añadiría sobrecarga de
escritura en cada importación sin beneficio de lectura medible a este
volumen. **Criterio de reevaluación:** revisar de nuevo cuando una sola capa
se acerque a las decenas de miles de features.

## 2. Perfilado de capas (`gis.geo_layer_profile`)

`gis.refresh_geo_layer_profile(layer_id)` calcula, en un único recorrido de
la capa, `feature_count`, `null_geometry_count`, `invalid_geometry_count`
(vía `ST_IsValid`), `geometry_type` y `extent` (`ST_Extent`), y los persiste.
No se invoca automáticamente desde ningún flujo de importación — se ejecutó
manualmente sobre las 11 capas existentes como parte de la verificación de
P0-2. P0-3 debe invocarlo después de cada importación/publicación — **sigue
sin estar wireado**, ver `MAPA_SIGI_DIAGNOSTICO.md` §9.12 (P1-2).

**Expuesto en `GET /geo/layers/:code/profile` desde P1-2** — lee esta tabla
tal cual, nunca recalcula nada en el camino de la petición. Ver
`MAPA_SIGI_DIAGNOSTICO.md` §9.12 para el diseño y la verificación completos.

**Resultado real, las 11 capas:**

| Capa | Features | Nulas | Inválidas |
|---|---|---|---|
| pastos_ref | 2.248 | 0 | 0 |
| ssp_layers / odoo_project_territories | 1.160 c/u | 0 | 0 |
| areas_protegidas_ref | 423 | 0 | 0 |
| dnea_activity_points | 379 | 0 | 0 |
| kobo_pruebakobo_points | 35 | 0 | 0 |
| kobo_dnea_demo_* | 26 c/u | 0 | 0 |
| territories / corredor_seco | 19 c/u | 0 | 0 |
| project_polygons | 1 | 0 | 0 |

**Cero geometrías nulas o inválidas en todo el sistema.** Es una buena
noticia de calidad de datos, verificada, no asumida.

### Hallazgo nuevo: coordenadas erróneas en `dnea_activity_points`

El perfilado de extensión (`ST_Extent`) mostró que `dnea_activity_points`
—cuyos puntos reales están en Costa Rica, longitud ≈ -84— tiene una
extensión que llega hasta longitud `0.0003`. Investigado:

```sql
SELECT id, ST_AsText(ST_Centroid(geometry)) FROM gis.territory_features
WHERE layer_id = (SELECT id FROM gis.geo_layers WHERE code='dnea_activity_points')
  AND ST_X(ST_Centroid(geometry)) > -1;
-- POINT(-2.25e-19 11.05...)
-- POINT(-2.29e-19 11.03...)
```

Dos features tienen longitud prácticamente `0` — el defecto clásico de
"null island": un valor de longitud ausente que se procesó como `0` en algún
punto de la carga (`scripts/load_dnea_excel_to_geobi.py`), no una geometría
inválida según `ST_IsValid` (es un punto/buffer sintácticamente correcto,
simplemente en el lugar equivocado). `ST_IsValid` no detecta este tipo de
defecto — es la razón por la que §6 de la especificación pide reportar
también nulas/inválidas por separado en vez de usar solo `ST_IsValid` como
filtro binario. **Registrado como hallazgo para corregir en el origen del
dato (el script de carga DNEA), no en P0-2.**

## 3. Reparación de geometrías (`ST_MakeValid`) — diseño, no implementado

Dado que hoy no existe ninguna geometría inválida (§2), no se creó una
función `ST_MakeValid` sin uso verificable. Diseño previsto para cuando
aparezca la primera geometría inválida real:

```sql
-- Futuro, no implementado en P0-2:
UPDATE gis.territory_features
SET geometry = ST_Multi(ST_MakeValid(geometry))
WHERE id = $1 AND NOT ST_IsValid(geometry);
```

Debe ejecutarse por feature, con revisión humana del resultado antes de
publicar (`ST_MakeValid` puede alterar la geometría de forma no trivial), y
quedar registrado en auditoría igual que cualquier otra mutación del catálogo.

## 4. Bbox + simplificación — `gis.features_geojson_in_bbox`

Preparada para P0-3, sin llamar desde ningún endpoint. Firma:

```sql
gis.features_geojson_in_bbox(layer_code, min_lon, min_lat, max_lon, max_lat,
                              simplify_tolerance, limit, offset, include_internal)
```

Reutiliza `gis.geo_visibility_is_public` — la misma regla de visibilidad que
`/territories/features`. Verificado que respeta la visibilidad: con
`include_internal=false` sobre `odoo_project_territories` devuelve 0 filas;
con `true`, 1.160.

### El hallazgo de 59,1 MB — causa raíz confirmada

`docs/geo/MAPA_SIGI_DIAGNOSTICO.md` (D6) midió que la capa `territories`
devuelve 59,1 MB para apenas 19 features. Con el perfilado y
`ST_NPoints` se confirmó la causa exacta:

```sql
SELECT id, ST_NPoints(geometry), pg_size_pretty(pg_column_size(geometry)::bigint)
FROM gis.territory_features WHERE layer_id = (…'territories'…)
ORDER BY 2 DESC LIMIT 3;

-- 574.381 vértices — 8.977 kB — una sola geometría
-- 386.049 vértices — 6.034 kB
-- 254.654 vértices — 3.981 kB
```

Una sola geometría de `territories` tiene **574.381 vértices** — casi
9 MB. Es un trazado de altísima resolución (probablemente una fuente
cartográfica sin simplificar en el momento de la carga), no un problema
general de la capa `pastos_ref` (2.248 features de densidad normal).

**Medido con `gis.features_geojson_in_bbox`:**

| Consulta | `simplify_tolerance` | Tiempo | Tamaño de salida |
|---|---|---|---|
| `territories`, bbox completo | `0` (sin simplificar) | 246 ms | — |
| `territories`, bbox completo | `0.01` | **2.499 ms** | 107.573 bytes (vs. 59.105.886 sin simplificar — **549× más pequeño**) |
| `pastos_ref`, bbox acotado | `0.001` | 21 ms | — |

`ST_SimplifyPreserveTopology` reduce el payload 549× para `territories`,
pero **simplificar sobre la marcha cuesta más que servir la geometría cruda**
para esta capa específica (2,5 s vs 246 ms) — el costo de vértices por
recorrer supera el ahorro de un cálculo por request. En cambio sobre
`pastos_ref` (densidad normal) el costo es trivial (21 ms).

**Recomendación para P0-3, no implementada aquí:** para capas con
densidad de vértice extrema como `territories`, simplificar **una vez, al
importar o publicar** (o mediante un job de mantenimiento), no en cada
request — y cachear el resultado por nivel de zoom, en vez de invocar
`ST_SimplifyPreserveTopology` dentro del *request path* público. Para capas
de densidad normal, simplificar por request es viable tal como está.

## 5. Tipo de geometría — deuda documentada (§7 de la especificación)

`gis.territory_features.geometry` es `geometry(MultiPolygon, 4326)`, fijo.
Confirmado en esta migración: **todas las 5.496 features existentes son
`MultiPolygon`** (columna `geo_layers.geometry_type`, backfill verificado por
hecho de esquema, no supuesto).

Los puntos (p. ej. DNEA) se cargan como `MultiPolygon` mediante
`ST_Buffer` sobre el punto original
(`scripts/load_dnea_excel_to_geobi.py:412-418`); el par lon/lat viaja además
en `properties_json` y el frontend reconstruye el punto en el navegador
(`GeoBiLayerMap.tsx:123-135`). **Confirmado en esta migración que ningún
flujo de escritura activo de la API introduce nuevos casos:** tanto
`normalizeImportedFeature` (importación GeoJSON,
`geospatial-catalog.service.ts:1811-1850`) como el importador de shapefiles
rechazan explícitamente cualquier geometría que no sea `Polygon`/
`MultiPolygon`. El rodeo Point→Buffer existe solo en el script de carga DNEA,
que no forma parte del flujo servido por la API.

**No se migra el tipo de columna en P0-2** — haría falta recrear las tres
vistas de GeoServer (`gis.v_public_*`) y el importador, con riesgo de romper
la publicación WMS/WFS ya en producción. Diseño para una futura migración:

1. Añadir `geometry_native geometry(Geometry, 4326)` como columna nueva
   (no reemplaza la existente).
2. Backfill: `UPDATE … SET geometry_native = geometry` para las filas
   existentes (ya son válidas como `Geometry` genérica).
3. Nuevas importaciones de puntos escriben directamente en
   `geometry_native` como `Point`, sin `ST_Buffer`.
4. Recrear las vistas de GeoServer sobre `geometry_native`.
5. Cuando todos los consumidores lean `geometry_native`, retirar la columna
   `geometry` original.

Cada paso es reversible por separado; no se ejecuta ninguno en P0-2.
