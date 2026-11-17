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
  AND gl.status = 'published';

CREATE OR REPLACE VIEW gis.v_public_project_polygons AS
SELECT
  tf.id,
  gl.code AS layer_code,
  p.code AS project_code,
  p.title AS project_name,
  pt.territory_code,
  COALESCE(pt.territory_name, t.name) AS territory_name,
  pt.country,
  pt.area_ha,
  tf.geometry
FROM gis.territory_features tf
INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
INNER JOIN core.territories t ON t.id = tf.territory_id
INNER JOIN core.project_territories pt ON pt.territory_id = t.id
INNER JOIN core.projects p ON p.id = pt.project_id
WHERE gl.code = 'project_polygons'
  AND gl.visibility = 'public'
  AND gl.status = 'published'
  AND p.visibility = 'public';

CREATE OR REPLACE VIEW gis.v_public_project_centroids AS
SELECT
  tf.id,
  gl.code AS layer_code,
  p.code AS project_code,
  p.title AS project_name,
  pt.country,
  pt.area_ha,
  ST_Centroid(tf.geometry)::geometry(Point, 4326) AS geometry
FROM gis.territory_features tf
INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
INNER JOIN core.territories t ON t.id = tf.territory_id
INNER JOIN core.project_territories pt ON pt.territory_id = t.id
INNER JOIN core.projects p ON p.id = pt.project_id
WHERE gl.code = 'project_polygons'
  AND gl.visibility = 'public'
  AND gl.status = 'published'
  AND p.visibility = 'public';
