\set ON_ERROR_STOP on
-- V2-02 / H-01: las geometrías de proyectos internos nunca son públicas (WMS/WFS vía
-- gis.v_public_territories y lecturas anónimas vía gis.features_geojson_in_bbox), mientras que un
-- límite oficial no se oculta por estar vinculado a un proyecto interno. Termina en ROLLBACK.

BEGIN;

INSERT INTO core.institutions (id, code, name, status)
VALUES ('50000000-0000-4000-8000-000000000001', 'V202-CI', 'V2.0.2 fixture', 'active');

INSERT INTO core.projects (id, institution_id, code, title, status, priority, visibility) VALUES
  ('50000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000001', 'V202-PUB', 'Proyecto público', 'active', 'medium', 'public'),
  ('50000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000001', 'V202-INT', 'Proyecto interno confidencial', 'active', 'medium', 'internal');

INSERT INTO core.territories (id, code, name, level, status) VALUES
  ('50000000-0000-4000-8000-000000000021', 'v202-pub-polygon', 'Proyecto público', 'custom', 'inactive'),
  ('50000000-0000-4000-8000-000000000022', 'v202-int-polygon', 'Proyecto interno confidencial', 'custom', 'inactive'),
  ('50000000-0000-4000-8000-000000000023', 'v202-province', 'Provincia oficial', 'province', 'active');

INSERT INTO core.project_territories (project_id, territory_id, territory_code, territory_name, country, area_ha) VALUES
  ('50000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000021', 'v202-pub-polygon', 'Proyecto público', 'XX', 1),
  ('50000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000022', 'v202-int-polygon', 'Proyecto interno confidencial', 'XX', 1),
  -- el proyecto interno además está ubicado en la provincia oficial
  ('50000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000023', 'v202-province', 'Provincia oficial', 'XX', 1);

INSERT INTO gis.geo_layers (code, name, layer_type, visibility, status) VALUES
  ('project_polygons', 'Project Polygons', 'project-polygon', 'public', 'published'),
  ('v202_admin_limits', 'Límites oficiales', 'polygon', 'public', 'published'),
  ('v202_internal', 'Capa interna', 'polygon', 'internal', 'published')
ON CONFLICT (code) DO UPDATE SET visibility = EXCLUDED.visibility, status = EXCLUDED.status;

WITH g AS (SELECT ST_Multi(ST_MakeEnvelope(-80.00, 8.00, -79.99, 8.01, 4326))::geometry(MultiPolygon, 4326) AS geom)
INSERT INTO gis.territory_features (territory_id, layer_id, area_ha, geometry)
SELECT f.territory_id, gl.id, 1, g.geom
FROM g,
  (VALUES
    ('50000000-0000-4000-8000-000000000021'::uuid, 'project_polygons'),
    ('50000000-0000-4000-8000-000000000022'::uuid, 'project_polygons'),
    ('50000000-0000-4000-8000-000000000023'::uuid, 'v202_admin_limits'),
    ('50000000-0000-4000-8000-000000000023'::uuid, 'v202_internal')
  ) AS f(territory_id, layer_code)
INNER JOIN gis.geo_layers gl ON gl.code = f.layer_code;

DO $$
DECLARE
  leaked INTEGER;
  anonymous_codes TEXT[];
BEGIN
  -- WMS/WFS
  SELECT count(*) INTO leaked FROM gis.v_public_territories
  WHERE territory_code IN ('v202-pub-polygon', 'v202-int-polygon') OR layer_code IN ('project_polygons', 'v202_internal');
  IF leaked <> 0 THEN
    RAISE EXCEPTION 'H-01: v_public_territories exposes % project/internal feature(s)', leaked;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM gis.v_public_territories WHERE layer_code = 'v202_admin_limits' AND territory_code = 'v202-province') THEN
    RAISE EXCEPTION 'Official boundary must stay public even if an internal project is located in it';
  END IF;

  -- Lecturas anónimas (p_include_internal = false) de la capa de proyectos
  SELECT array_agg(territory_code ORDER BY territory_code) INTO anonymous_codes
  FROM gis.features_geojson_in_bbox('project_polygons', -180, -90, 180, 90, 0, 100, 0, FALSE)
  WHERE territory_code LIKE 'v202-%';
  IF anonymous_codes IS DISTINCT FROM ARRAY['v202-pub-polygon'] THEN
    RAISE EXCEPTION 'Anonymous project_polygons read should expose only v202-pub-polygon, got %', anonymous_codes;
  END IF;

  -- Con permiso (p_include_internal = true) se ven ambas
  IF (SELECT count(*) FROM gis.features_geojson_in_bbox('project_polygons', -180, -90, 180, 90, 0, 100, 0, TRUE)
      WHERE territory_code LIKE 'v202-%') <> 2 THEN
    RAISE EXCEPTION 'Authorized read should include internal project geometry';
  END IF;

  IF gis.project_geometry_is_public('project_polygons', '50000000-0000-4000-8000-000000000022') THEN
    RAISE EXCEPTION 'Internal project geometry reported as public';
  END IF;

  IF (SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'gis' AND table_name = 'geo_layers' AND column_name = 'visibility') NOT LIKE '%internal%' THEN
    RAISE EXCEPTION 'gis.geo_layers.visibility default must be internal (fail-closed)';
  END IF;
END $$;

ROLLBACK;
