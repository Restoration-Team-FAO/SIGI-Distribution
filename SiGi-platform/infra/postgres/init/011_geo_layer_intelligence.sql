-- =====================================================================
-- Geo layer intelligence foundation (Mapa SIGI — P0-2)
--
-- Purely additive data foundation for the future Visor Inteligente GIS
-- SIGI. No existing column is renamed, retyped or dropped; every new
-- column accepts NULL unless the value is a verifiable fact about the
-- existing schema (see inline comments). See:
--   docs/geo/MAPA_SIGI_DIAGNOSTICO.md
--   docs/geo/permissions.md
--   docs/geo/postgis.md
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Visibility hierarchy
--
-- Formalizes the values already found in production
-- (gis.geo_layers.visibility currently holds 'public', 'private' and
-- 'internal') alongside the two tiers the specification introduces
-- ('institutional', 'restricted'). This is documentation and future
-- readiness, NOT a change in who can read what today — see
-- docs/geo/permissions.md for the full rationale, including why the
-- existing 'private'/'internal' rows are intentionally NOT reclassified
-- by this migration.
-- ---------------------------------------------------------------------

ALTER TABLE gis.geo_layers
  DROP CONSTRAINT IF EXISTS geo_layers_visibility_check;

ALTER TABLE gis.geo_layers
  ADD CONSTRAINT geo_layers_visibility_check
  CHECK (visibility IN ('public', 'institutional', 'restricted', 'private', 'internal'));

CREATE OR REPLACE FUNCTION gis.geo_visibility_rank(p_visibility TEXT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_visibility
    WHEN 'public' THEN 0
    WHEN 'institutional' THEN 1
    WHEN 'internal' THEN 1     -- legacy alias, see docs/geo/permissions.md
    WHEN 'restricted' THEN 2
    WHEN 'private' THEN 3
    ELSE 3                     -- unknown values fail safe to the strictest tier
  END;
$$;

COMMENT ON FUNCTION gis.geo_visibility_rank(TEXT) IS
  'Canonical strictness rank for gis.geo_layers.visibility: 0=public, '
  '1=institutional (includes legacy internal), 2=restricted, 3=private. '
  'Descriptive today (labelling/ordering); not yet wired into access '
  'control, which still uses gis.geo_visibility_is_public(). '
  'Single source of truth — see docs/geo/permissions.md.';

CREATE OR REPLACE FUNCTION gis.geo_visibility_is_public(p_visibility TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_visibility = 'public';
$$;

COMMENT ON FUNCTION gis.geo_visibility_is_public(TEXT) IS
  'Single predicate for "is this geo layer readable without authorization". '
  'Used by sigi-api (geo-bi module) and gis-service (geometry routes) so '
  'the definition of public lives in exactly one place instead of being '
  'duplicated as an inline string comparison in each caller.';

-- Inert scaffolding for the finer-grained tiers above. No role is granted
-- these permissions by this migration — access enforcement is unchanged
-- until a future migration deliberately assigns them. Mirrors the existing
-- files.view_sensitive permission, which is defined and likewise unused
-- pending a future gating decision.
INSERT INTO core.permissions (code, name)
VALUES
  ('geo.layers.read_institutional', 'Ver capas geoespaciales institucionales'),
  ('geo.layers.read_restricted', 'Ver capas geoespaciales restringidas'),
  ('geo.layers.read_private', 'Ver capas geoespaciales privadas')
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. Layer metadata
--
-- Operational metadata (catalog display, filtering) lives directly on
-- gis.geo_layers. Institutional/provenance metadata — the fields the
-- specification's "ficha de metadatos" needs, which are edited less often
-- and may be absent — lives in a 1:1 gis.geo_layer_metadata table so an
-- unknown value is a missing row, never an invented default.
-- ---------------------------------------------------------------------

ALTER TABLE gis.geo_layers
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS geometry_type TEXT,
  ADD COLUMN IF NOT EXISTS crs TEXT NOT NULL DEFAULT 'EPSG:4326',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN gis.geo_layers.crs IS
  'All existing rows are backed by gis.territory_features.geometry, '
  'declared geometry(Geometry, 4326) — EPSG:4326 is a verified fact '
  'for every current layer, not a guess.';
COMMENT ON COLUMN gis.geo_layers.geometry_type IS
  'Free text today (e.g. MultiPolygon, Point). NULL means not '
  'yet classified — backfilled below only where the fact is verifiable.';
COMMENT ON COLUMN gis.geo_layers.description IS
  'NULL means not documented. Never populate with an invented description.';
COMMENT ON COLUMN gis.geo_layers.category IS
  'NULL means uncategorized. Intended values come from a future catalog, '
  'never a hardcoded frontend list — see docs/geo/layer-catalog.md.';

-- Derive the geometry classification from the features that actually exist
-- in each layer. Mixed layers remain explicitly classified as Geometry.
UPDATE gis.geo_layers gl
SET geometry_type = derived.geometry_type
FROM (
  SELECT
    layer_id,
    CASE
      WHEN COUNT(DISTINCT GeometryType(geometry)) = 1 THEN MAX(GeometryType(geometry))
      ELSE 'Geometry'
    END AS geometry_type
  FROM gis.territory_features
  GROUP BY layer_id
) derived
WHERE gl.geometry_type IS NULL
  AND derived.layer_id = gl.id;

CREATE TABLE IF NOT EXISTS gis.geo_layer_metadata (
  layer_id UUID PRIMARY KEY REFERENCES gis.geo_layers(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES core.institutions(id),
  source_name TEXT,
  owner TEXT,
  responsible TEXT,
  data_date DATE,
  update_frequency TEXT,
  license TEXT,
  classification TEXT,
  access_level TEXT,
  service_url TEXT,
  quality_status TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gis.geo_layer_metadata IS
  'Institutional/provenance metadata for the layer information panel '
  '(spec §13). 1:1 with gis.geo_layers via layer_id. A missing row, or a '
  'NULL column, must render as "No disponible" in the UI — never inferred.';


-- ---------------------------------------------------------------------
-- 3. Spatial and lookup indexes
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS territory_features_geometry_gix
  ON gis.territory_features USING GIST (geometry);

CREATE INDEX IF NOT EXISTS territory_features_layer_id_idx
  ON gis.territory_features (layer_id);

CREATE INDEX IF NOT EXISTS territory_features_territory_id_idx
  ON gis.territory_features (territory_id);

-- A GIN index on properties_json was evaluated and deliberately NOT added.
-- Measured on the current data (5,496 rows across all layers, largest
-- layer 2,248 rows): `EXPLAIN ANALYZE` on a representative
-- `properties_json ->> 'x' = 'y'` filter costs ~15ms via sequential scan.
-- At this volume a GIN index adds write overhead for no measurable read
-- benefit. Revisit once any single layer approaches tens of thousands of
-- features — see docs/geo/postgis.md for the measurement and the
-- re-evaluation trigger.


-- ---------------------------------------------------------------------
-- 4. Dataset profiling (feature count, extent, geometry validity)
--
-- Profiling a layer (COUNT, ST_Extent, ST_IsValid over every feature) is
-- too costly to run on every request. gis.geo_layer_profile persists the
-- result; gis.refresh_geo_layer_profile(layer_id) computes it on demand
-- (after an import/publish, or manually) — it is not wired into any
-- import path automatically by this migration, so existing write flows
-- are unaffected. See docs/geo/spatial-analysis.md for the P0-3 call
-- sites this is meant to serve.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gis.geo_layer_profile (
  layer_id UUID PRIMARY KEY REFERENCES gis.geo_layers(id) ON DELETE CASCADE,
  feature_count INTEGER NOT NULL DEFAULT 0,
  null_geometry_count INTEGER NOT NULL DEFAULT 0,
  invalid_geometry_count INTEGER NOT NULL DEFAULT 0,
  geometry_type TEXT,
  crs TEXT,
  extent geometry(Polygon, 4326),
  profiled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gis.geo_layer_profile IS
  'Cached per-layer profile: feature_count, null/invalid geometry counts, '
  'geometry_type, crs and extent. Populated by '
  'gis.refresh_geo_layer_profile(); never computed inline on a request '
  'path. valid_geometry_count = feature_count - null_geometry_count - '
  'invalid_geometry_count.';

CREATE OR REPLACE FUNCTION gis.refresh_geo_layer_profile(p_layer_id UUID)
RETURNS gis.geo_layer_profile
LANGUAGE plpgsql
AS $$
DECLARE
  v_result gis.geo_layer_profile;
  v_sample_type TEXT;
BEGIN
  SELECT ST_GeometryType(tf.geometry)
    INTO v_sample_type
    FROM gis.territory_features tf
   WHERE tf.layer_id = p_layer_id
     AND tf.geometry IS NOT NULL
   LIMIT 1;

  INSERT INTO gis.geo_layer_profile AS profile (
    layer_id, feature_count, null_geometry_count, invalid_geometry_count,
    geometry_type, crs, extent, profiled_at, updated_at
  )
  SELECT
    p_layer_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE tf.geometry IS NULL),
    COUNT(*) FILTER (WHERE tf.geometry IS NOT NULL AND NOT ST_IsValid(tf.geometry)),
    v_sample_type,
    'EPSG:4326',
    ST_SetSRID(ST_Extent(tf.geometry)::geometry, 4326),
    NOW(),
    NOW()
  FROM gis.territory_features tf
  WHERE tf.layer_id = p_layer_id
  ON CONFLICT (layer_id) DO UPDATE SET
    feature_count = EXCLUDED.feature_count,
    null_geometry_count = EXCLUDED.null_geometry_count,
    invalid_geometry_count = EXCLUDED.invalid_geometry_count,
    geometry_type = EXCLUDED.geometry_type,
    crs = EXCLUDED.crs,
    extent = EXCLUDED.extent,
    profiled_at = EXCLUDED.profiled_at,
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION gis.refresh_geo_layer_profile(UUID) IS
  'Recomputes and upserts gis.geo_layer_profile for one layer. Scans that '
  'layer''s features once; call after import/publish, not per request. '
  'v_sample_type reflects the first non-null geometry found today (the '
  'column is uniformly MultiPolygon) — revisit if the geometry column is '
  'ever widened to geometry(Geometry,4326), see docs/geo/postgis.md §7.';


-- ---------------------------------------------------------------------
-- 5. Bbox + simplification query, prepared for P0-3
--
-- Not called by any endpoint yet. Exists so P0-3's /geo/layers/:id/features
-- can adopt bbox + simplify + limit/offset without redesigning the query
-- from scratch, and so its performance characteristics can be validated
-- now against real data. See docs/geo/postgis.md §4 for the EXPLAIN
-- ANALYZE results captured before/after the GiST index in step 3.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gis.features_geojson_in_bbox(
  p_layer_code TEXT,
  p_min_lon DOUBLE PRECISION,
  p_min_lat DOUBLE PRECISION,
  p_max_lon DOUBLE PRECISION,
  p_max_lat DOUBLE PRECISION,
  p_simplify_tolerance DOUBLE PRECISION DEFAULT 0,
  p_limit INTEGER DEFAULT 500,
  p_offset INTEGER DEFAULT 0,
  p_include_internal BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  territory_code TEXT,
  territory_name TEXT,
  territory_level TEXT,
  area_ha NUMERIC,
  properties_json JSONB,
  geometry_geojson TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    tf.id,
    t.code,
    t.name,
    t.level,
    tf.area_ha,
    tf.properties_json,
    ST_AsGeoJSON(
      CASE
        WHEN p_simplify_tolerance > 0
          THEN ST_SimplifyPreserveTopology(tf.geometry, p_simplify_tolerance)
        ELSE tf.geometry
      END
    )
  FROM gis.territory_features tf
  INNER JOIN core.territories t ON t.id = tf.territory_id
  INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
  WHERE gl.code = p_layer_code
    AND (p_include_internal OR (gis.geo_visibility_is_public(gl.visibility) AND gl.status = 'published'))
    AND ST_Intersects(
      tf.geometry,
      ST_MakeEnvelope(p_min_lon, p_min_lat, p_max_lon, p_max_lat, 4326)
    )
  ORDER BY t.name ASC
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
$$;

COMMENT ON FUNCTION gis.features_geojson_in_bbox IS
  'Bbox-filtered, optionally simplified feature read for P0-3. Same '
  'visibility rule as gis-service''s /geometry route '
  '(gis.geo_visibility_is_public). Not called by any endpoint as of P0-2 — '
  'behavior of the public /territories/features route is unchanged.';
