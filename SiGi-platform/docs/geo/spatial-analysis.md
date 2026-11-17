# Análisis espacial — proximidad y cruce de capas implementados

Estado: proximidad y cruce capa-contra-capa implementados. Siguen pendientes
las herramientas de dibujo y geoprocesamiento destructivo. Este documento
mantiene explícito el límite entre consulta analítica y edición — y porque
`infra/postgres/init/011_geo_layer_intelligence.sql` referencia este archivo
en un comentario (`gis.refresh_geo_layer_profile`) sin que existiera hasta
ahora.

## 1. Qué pide la especificación y qué se construyó / qué no

Spec §9 ("barra de herramientas: medir, seleccionar…") y §10 ("análisis
espacial: buffer, intersección, distancia, estadísticas dinámicas por
selección") describen capacidades interactivas de análisis geoespacial.

**Búsqueda de proximidad (spec §10, "distancia") — implementada en P1-6.**
`POST /geo/layers/:code/nearby` resuelve, en una sola operación, "qué hay a
menos de R metros de este elemento" vía `ST_DWithin` sobre un cast
`::geography` (distancia geodésica real en metros, no en grados) — que es,
en efecto, buffer(geometría, R) + intersección con la capa objetivo,
combinados. Ver `MAPA_SIGI_DIAGNOSTICO.md` §9.16 para el diseño completo y
la verificación. La decisión deliberada fue implementar **esta** operación
acotada, con una UX ya conocida (reutiliza la ficha de identificación de
P0-5 y la selección de resultados de P1-1), en vez de primitivas crudas de
buffer/intersección sin una decisión de UX previa sobre cómo se usarían.

Lo que sigue **sin implementar**, deliberadamente:

- Medición de distancia/área sobre el mapa (herramienta interactiva, no una
  consulta contra un elemento ya seleccionado).
- Selección de features por polígono/radio dibujado por el usuario.
- Unión, diferencia y generación persistente de nuevas capas derivadas.

**Cruce de capas — implementado (2026-09-30).**
`POST /geo/analysis/intersection` recibe dos códigos de capa visibles para el
usuario. PostGIS ejecuta `ST_Intersects` y `ST_Intersection`, entrega conteos
de entidades afectadas, pares coincidentes, área de intersección y una muestra
GeoJSON limitada a 200 geometrías. La operación es de solo lectura: no crea
silenciosamente una capa derivada ni altera los insumos. La vista Análisis
presenta parámetros, métricas, mapa multicapa y tabla de coincidencias.

Los Shapefile ZIP se incorporan mediante el catálogo existente: preview,
validación de componentes/CRS/geometría, transformación por GIS Service,
carga a PostGIS y registro en catálogo. Una vez importados participan en el
cruce con el mismo contrato que cualquier otra capa autorizada.

**Búsqueda territorial (spec §18) — parcialmente implementada en P1-1, no
más.** `GET /geo/search?q=` busca un territorio por **nombre o código** a
través de todas las capas visibles — ver `MAPA_SIGI_DIAGNOSTICO.md` §9.11
para el diseño y la verificación completos. Lo que spec §18 pide y **no**
existe todavía: búsqueda **por coordenada** (clic en el mapa → "¿qué
territorio hay aquí?", una consulta espacial real, no de texto) — eso sigue
correspondiendo a este documento, no a P1-1 ni a P1-6 (que busca por
proximidad a un elemento ya seleccionado, no por un clic arbitrario en el
mapa).

Análisis guardados (spec §19) — implementado en P1-4, ver
`MAPA_SIGI_DIAGNOSTICO.md` §9.14.

## 2. Por qué, explícitamente

El roadmap P0 (`MAPA_SIGI_DIAGNOSTICO.md` §9) sitúa estas capacidades en
P1/P2 desde el diagnóstico inicial, antes de que empezara la implementación
— no es un recorte de última hora. Cuando P0-9 llegó a un ítem del roadmap
("Barra de herramientas, estados de carga/error/vacío") que en el gap table
(§8) aparece descrito con lenguaje de análisis espacial ("medir,
seleccionar…"), se optó explícitamente por **no** interpretar eso como luz
verde para adelantar P1 dentro de P0 — ver `MAPA_SIGI_DIAGNOSTICO.md` §9.9
para el razonamiento completo. Agregarlo aquí habría sido funcionalidad no
solicitada, y habría requerido decisiones de UX/alcance (¿qué operaciones
espaciales exactamente? ¿sobre qué combinación de capas?) que nadie había
tomado todavía en ese momento. P1-6 (spec §10, "distancia") fue la primera
vez que esa decisión sí se tomó explícitamente — ver §1 arriba y
`MAPA_SIGI_DIAGNOSTICO.md` §9.16 — y por eso es la única capacidad de esta
lista que dejó de estar ausente. El resto sigue sin decisión de UX y, por
lo tanto, sin implementar.

## 3. Qué cimiento SÍ existe, listo para que P1 lo use

Nada de lo siguiente está cableado a ningún endpoint hoy — es preparación
deliberada de P0-2/P0-3, no trabajo de análisis en sí:

- **PostGIS instalado y en uso real** (índices GiST, `ST_Intersects`,
  `ST_Extent`, `ST_IsValid`, `ST_SimplifyPreserveTopology`) — la extensión
  y las funciones que cualquier análisis espacial futuro necesitaría ya
  están probadas contra datos reales, no son una dependencia nueva por
  agregar.
- **`gis.geo_layer_profile`** (`gis.refresh_geo_layer_profile(layer_id)`) —
  feature count, conteo de geometrías nulas/inválidas, tipo de geometría,
  extent — cacheado, no calculado por request. Una futura pantalla de
  "estadísticas dinámicas por selección" (spec §10/§11) tiene aquí de dónde
  partir en vez de diseñar el cacheo desde cero.
- **`gis.features_geojson_in_bbox`** — bbox + simplificación + límite,
  ya escrita y medida (`postgis.md` §4), sin endpoint que la llame todavía.
  Cualquier operación futura que necesite "features dentro de un área"
  reutiliza esto en vez de reescribirlo.
- **Reparación de geometrías vía `ST_MakeValid`** — diseñada, no
  implementada (`postgis.md` §3): 0 geometrías inválidas hoy, así que no
  había nada que reparar todavía, pero el diseño (reporte total/válidas/
  inválidas/nulas, no un gate binario) queda documentado para cuando haga
  falta.

## 4. Qué NO asumir de lo anterior

Que la infraestructura esté lista no significa que la UX esté decidida.
Antes de implementar cualquier ítem de §1, alguien debe decidir: qué
herramientas de medición expone la barra (¿distancia, área, ambas?), si el
buffer/intersección corre en el navegador o en `gis-service`/`sigi-api`, y
cómo se pagina/limita un resultado de análisis potencialmente grande — el
mismo principio de "nunca sin límite" que ya rige paginación, bbox y
exportación (P0-3/P0-8) tendría que aplicarse aquí también.
