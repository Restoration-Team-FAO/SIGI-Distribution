\set ON_ERROR_STOP on

-- Ephemeral, deterministic data for scripts/geo-api-smoke.mjs.  These rows
-- deliberately do not overlap the demo catalog so the release gate can run
-- against both an empty production database and a populated validation copy.
DELETE FROM gis.territory_features
WHERE layer_id IN (
  SELECT id FROM gis.geo_layers
  WHERE code IN ('sigi_release_public', 'sigi_release_private')
);
DELETE FROM gis.geo_layers
WHERE code IN ('sigi_release_public', 'sigi_release_private');
DELETE FROM core.territories
WHERE code IN ('SIGI-RELEASE-TERRITORY', 'R7-PUBLIC-01', 'R7-PRIVATE-01');

INSERT INTO core.territories (id, code, name, level, status)
VALUES
  (
    '70000000-0000-4000-8000-000000000001',
    'SIGI-RELEASE-TERRITORY',
    'Territorio fixture release',
    'country',
    'active'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    'R7-PUBLIC-01',
    'San Vito Release',
    'site',
    'active'
  ),
  (
    '70000000-0000-4000-8000-000000000003',
    'R7-PRIVATE-01',
    'Oscar Alfredo Release',
    'site',
    'active'
  );

INSERT INTO gis.geo_layers (
  id, code, name, layer_type, visibility, status,
  description, category, geometry_type, crs, sort_order
)
VALUES
  (
    '70000000-0000-4000-8000-000000000010',
    'sigi_release_public',
    'Fixture público release',
    'point',
    'public',
    'published',
    'Fixture efímero del release gate',
    'validation',
    'Geometry',
    'EPSG:4326',
    9000
  ),
  (
    '70000000-0000-4000-8000-000000000020',
    'sigi_release_private',
    'Fixture privado release',
    'point',
    'private',
    'published',
    'Fixture efímero del release gate',
    'validation',
    'Point',
    'EPSG:4326',
    9001
  );

INSERT INTO gis.territory_features (
  id, territory_id, layer_id, area_ha, geometry, properties_json
)
SELECT
  ('70000000-0000-4000-8000-' || LPAD(series::text, 12, '0'))::uuid,
  CASE
    WHEN series = 1 THEN '70000000-0000-4000-8000-000000000002'::uuid
    ELSE '70000000-0000-4000-8000-000000000001'::uuid
  END,
  '70000000-0000-4000-8000-000000000010'::uuid,
  series * 10,
  CASE
    WHEN series = 7 THEN ST_Multi(ST_Buffer(ST_SetSRID(ST_Point(-84.20, 9.90), 4326), 0.05, 256))
    ELSE ST_SetSRID(ST_Point(-84.0000 + series * 0.005, 10.0000), 4326)
  END,
  jsonb_build_object(
    'code', 'R7-PUBLIC-' || LPAD(series::text, 2, '0'),
    'name', CASE WHEN series = 1 THEN 'San Vito Release' ELSE 'Punto release ' || series END,
    'level', 'site',
    'province', CASE WHEN series <= 4 THEN 'Alajuela' ELSE 'San José' END,
    'areaHa', series * 10,
    'activityGeneral', CASE WHEN series % 2 = 0 THEN 'Restauración' ELSE 'Monitoreo' END
  )
FROM generate_series(1, 7) AS series;

INSERT INTO gis.territory_features (
  id, territory_id, layer_id, area_ha, geometry, properties_json
)
VALUES
  (
    '70000000-0000-4000-8000-000000000101',
    '70000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000020',
    5,
    ST_SetSRID(ST_Point(-84.1000, 10.1000), 4326),
    '{"code":"R7-PRIVATE-01","name":"Oscar Alfredo Release","level":"site","province":"Alajuela","areaHa":5,"activityGeneral":"Privado"}'::jsonb
  ),
  (
    '70000000-0000-4000-8000-000000000102',
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000020',
    15,
    ST_SetSRID(ST_Point(-84.1050, 10.1000), 4326),
    '{"code":"R7-PRIVATE-02","name":"Privado Release 2","level":"site","province":"San José","areaHa":15,"activityGeneral":"Privado"}'::jsonb
  );

SELECT gis.refresh_geo_layer_profile('70000000-0000-4000-8000-000000000010');
INSERT INTO gis.geo_layer_profile (
  layer_id, feature_count, null_geometry_count, invalid_geometry_count,
  geometry_type, crs, extent, profiled_at, updated_at
)
VALUES (
  '70000000-0000-4000-8000-000000000020', 2, 0, 0,
  'ST_Point', 'EPSG:4326', ST_MakeEnvelope(-84.11, 10.09, -84.09, 10.11, 4326), NOW(), NOW()
);
