# Permisos y visibilidad geoespacial

Estado: P0-2 completado (2026-09-01). Cimientos de datos y contrato de evaluación
de visibilidad. La política de acceso por nivel (§ "Nivel de enforcement" abajo)
sigue siendo binaria — pública / no pública — como ya era el caso tras P0-1.

## 1. Jerarquía formal

`gis.geo_layers.visibility` admite, desde la migración `011_geo_layer_intelligence.sql`:

| Valor | Rango (`gis.geo_visibility_rank`) | Origen |
|---|---|---|
| `public` | 0 | Valor normal, escrito por `normalizeVisibility()` |
| `institutional` | 1 | Nuevo, no usado todavía por ningún flujo de escritura |
| `internal` | 1 (alias legado) | Escrito por `normalizeVisibility()` cuando el valor de entrada no es `'public'` |
| `restricted` | 2 | Nuevo, no usado todavía |
| `private` | 3 | Legado — ver §2 |

Un `CHECK CONSTRAINT` (`geo_layers_visibility_check`) impide cualquier otro valor.
El rango se calcula con `gis.geo_visibility_rank(text)`, y la pregunta binaria
"¿es pública?" con `gis.geo_visibility_is_public(text)` — ambas son funciones
SQL, por lo que son la **única** definición compartida entre `sigi-api`
(NestJS) y `gis-service` (FastAPI/Python), dos runtimes distintos que no
pueden compartir un módulo de lenguaje.

## 2. La colisión con el valor `private` existente — decisión y por qué

Antes de esta migración, `gis.geo_layers.visibility` ya tenía tres valores en
producción: `public`, `internal` (escrito por `geospatial-catalog.service.ts`)
y **`private`** (escrito directamente por `odoo-sources.service.ts:1561` al
importar `odoo_project_territories`, sin pasar por `normalizeVisibility()`).

La especificación de esta tarea pide que `private` sea el nivel **más
estricto** de la jerarquía (rango 3). Pero el `private` que ya existe en la
base de datos se comportaba, en el código anterior a esta migración,
**exactamente igual que `internal`**: cualquier principal con el permiso
`connectors.read` podía leerlo. No hay evidencia en el código de que quien
escribió `odoo-sources.service.ts` haya escogido `'private'` con la intención
de un nivel más estricto que `'internal'` — es, con más probabilidad, una
palabra distinta para el mismo concepto, usada sin coordinación entre los dos
módulos que crean capas.

**Decisión:** esta migración *no* reclasifica los datos existentes. Los
literales `private` e `internal` permanecen sin cambios en la base de datos,
y **el nivel de aplicación (enforcement) sigue siendo el binario que ya regía
tras P0-1**: cualquier valor distinto de `public` requiere el permiso
`connectors.read`. `gis.geo_visibility_rank('private')` devuelve 3 como
**clasificación descriptiva** (para futura UI, ordenamiento, badges) — hoy no
alimenta ninguna decisión de acceso.

Se documenta como hallazgo abierto: **antes de asignar los permisos
`geo.layers.read_restricted` / `read_private` a un rol (§4) alguien con
conocimiento del dominio debe revisar la única capa `private` real que existe
hoy —`odoo_project_territories` (1.160 features, territorios de proyectos
Odoo)— y decidir deliberadamente si corresponde al rango 3 (privada) o al
rango 1 (institucional, que es como se comporta hoy).** Cambiar el
enforcement sin esa revisión podría dejar sin acceso a consumidores
existentes — ver §5.

## 3. Función y contrato único

- **SQL** (fuente de verdad compartida entre ambos runtimes):
  `gis.geo_visibility_rank(text)`, `gis.geo_visibility_is_public(text)` —
  `infra/postgres/init/011_geo_layer_intelligence.sql`.
- **TypeScript** (`apps/sigi-api/src/common/geo/geo-visibility.ts`):
  - `GEO_VISIBILITY_LEVELS` — espejo tipado de la jerarquía SQL, para UI futura.
  - `GEO_NON_PUBLIC_LAYERS_PERMISSION = 'connectors.read'` — el único lugar
    donde se declara qué permiso abre capas no públicas.
  - `principalCanReadNonPublicGeoLayers(principal)` — usado por
    `TerritoriesController`; será el mismo predicado que use el módulo
    `/geo/*` en P0-3.
  - `buildGeoLayerVisibilitySql(alias, includeNonPublic)` — genera el
    fragmento SQL `gis.geo_visibility_is_public(<alias>.visibility)`, usado
    por `GeoBiService` en lugar de la comparación de texto duplicada que
    tenía antes.
- **Python** (`services/gis-service/app/api/routes/geometry.py`): llama
  directamente a `gis.geo_visibility_is_public(...)` en el `WHERE` — no hay
  (ni puede haber limpiamente) un módulo Python espejo del TypeScript, pero
  ya no duplica la comparación de texto: delega en la misma función SQL.

Antes de esta migración existían **tres** copias de la misma comparación de
texto (`geo-bi.service.ts` dos veces, `geometry.py` una vez). Ahora hay una.

## 4. Permisos preparados, no otorgados

Se agregaron a `core.permissions` (sin ninguna fila en `core.role_permissions`
que los conceda — inertes, igual que el precedente `files.view_sensitive`,
que existe en el catálogo sin que ningún código lo verifique todavía):

- `geo.layers.read_institutional`
- `geo.layers.read_restricted`
- `geo.layers.read_private`

Diseño previsto para P1 (no implementado): reemplazar el chequeo binario de
`principalCanReadNonPublicGeoLayers` por uno que compare
`gis.geo_visibility_rank(capa.visibility)` contra el rango máximo que los
permisos del principal habilitan. Requiere primero resolver §2.

## 5. Roles con `connectors.read` hoy

Verificado contra la base de datos en ejecución:

| Rol | `connectors.read` |
|---|---|
| `superadmin` | ✅ |
| `national_admin` | ✅ |
| `institution_editor` | ✅ |
| `technical_integration` | ✅ |
| `technical_validator` | ❌ |
| `read_consumer` | ❌ |
| resto | ❌ |

`read_consumer` tiene `projects.read` pero no `connectors.read`: si en algún
momento consulta `odoo_project_territories` vía `/territories/features`,
recibe `200` con `features: []` (no un error) — comportamiento ya vigente
desde P0-1, sin cambios en P0-2.

## 6. Hallazgo de gobernanza de datos (P1-1) — pendiente de revisión, no de código

Al verificar `GET /geo/search` (P1-1, búsqueda territorial cruzando capas) se
encontró que la capa `ssp_layers`, marcada `visibility = 'public'` en
`gis.geo_layers`, contiene nombres de personas reales en sus features (mismo
tipo de dato que motivó la revisión pendiente de `odoo_project_territories`
en §2). Confirmado que esta exposición **no es nueva**: `GET /geo/layers/
ssp_layers/features` (P0-3, en producción desde antes de P1-1) ya la servía a
cualquier caller anónimo — `/geo/search` solo respeta la misma clasificación
existente, no introduce una fuga. Igual que en §2: **no se reclasificó
`ssp_layers` unilateralmente**. Queda como hallazgo abierto para quien tenga
contexto de dominio sobre esa capa — decidir si `visibility` debería subir a
`institutional`/`restricted`, o si los nombres que contiene no son en
realidad datos personales sensibles en este contexto. Ver
`docs/geo/MAPA_SIGI_DIAGNOSTICO.md` §9.11 para el detalle de cómo se
encontró.
