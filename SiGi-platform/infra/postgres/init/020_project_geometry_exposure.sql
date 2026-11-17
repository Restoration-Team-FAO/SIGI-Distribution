-- V2-02 / H-01: geometrías de proyectos internos expuestas sin autenticación.
-- La capa project_polygons (y odoo_project_territories) se publicaba si la CAPA era pública, sin mirar
-- la visibilidad de los PROYECTOS dueños de cada geometría. Esto afectaba a WMS/WFS
-- (gis.v_public_territories), a /api/geo/* anónimo y a gis-service /geometry.
--
-- Regla única: una feature de una capa de geometría de proyecto solo es pública si está vinculada a
-- al menos un proyecto y TODOS sus proyectos vinculados son públicos. Las demás capas (límites
-- oficiales, referencia) siguen gobernadas solo por la visibilidad de la capa: un proyecto interno
-- ubicado en una provincia no oculta el límite oficial de esa provincia.

CREATE OR REPLACE FUNCTION gis.project_geometry_is_public(p_layer_code TEXT, p_territory_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_layer_code IN ('project_polygons', 'odoo_project_territories') THEN
      EXISTS (
        SELECT 1
        FROM core.project_territories pt
        WHERE pt.territory_id = p_territory_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM core.project_territories pt
        INNER JOIN core.projects p ON p.id = pt.project_id
        WHERE pt.territory_id = p_territory_id
          AND p.visibility IS DISTINCT FROM 'public'
      )
    ELSE TRUE
  END;
$$;

COMMENT ON FUNCTION gis.project_geometry_is_public(TEXT, UUID) IS
  'V2-02/H-01: project-geometry features are public only when every linked project is public. '
  'SECURITY DEFINER so read-only roles (geoserver_ro) can evaluate it without SELECT on core.';

CREATE OR REPLACE VIEW gis.v_public_territories AS
SELECT
  tf.id,
  gl.code AS layer_code,
  t.code AS territory_code,
  t.name AS territory_name,
  t.level AS territory_level,
  tf.area_ha,
  tf.geometry
FROM gis.territory_features tf
INNER JOIN core.territories t ON t.id = tf.territory_id
INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
WHERE gl.visibility = 'public'
  AND gl.status = 'published'
  AND gl.code <> 'project_polygons'
  AND gis.project_geometry_is_public(gl.code, tf.territory_id);

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
    AND (p_include_internal OR gis.project_geometry_is_public(gl.code, tf.territory_id))
    AND ST_Intersects(
      tf.geometry,
      ST_MakeEnvelope(p_min_lon, p_min_lat, p_max_lon, p_max_lat, 4326)
    )
  ORDER BY t.name ASC
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
$$;

-- Visibilidad de capa fail-closed: una capa nueva no es pública salvo decisión explícita.
ALTER TABLE gis.geo_layers ALTER COLUMN visibility SET DEFAULT 'internal';
