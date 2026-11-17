\set ON_ERROR_STOP on

DELETE FROM gis.territory_features
WHERE layer_id IN (
  SELECT id FROM gis.geo_layers
  WHERE code IN ('sigi_release_public', 'sigi_release_private')
);
DELETE FROM gis.geo_layers
WHERE code IN ('sigi_release_public', 'sigi_release_private');
DELETE FROM core.territories
WHERE code IN ('SIGI-RELEASE-TERRITORY', 'R7-PUBLIC-01', 'R7-PRIVATE-01');
