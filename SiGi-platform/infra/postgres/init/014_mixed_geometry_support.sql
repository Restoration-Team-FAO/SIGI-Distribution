-- Allow a catalog layer to retain its native geometry type. Kobo submissions
-- are points and must not be represented as artificial polygon buffers.
DO $migration$
DECLARE
  view_record RECORD;
BEGIN
  CREATE TEMP TABLE sigi_geometry_dependent_views (
    schema_name TEXT NOT NULL,
    view_name TEXT NOT NULL,
    view_definition TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO sigi_geometry_dependent_views (schema_name, view_name, view_definition)
  SELECT schemaname, viewname, definition
  FROM pg_views
  WHERE schemaname = 'gis'
    AND definition ILIKE '%territory_features%';

  FOR view_record IN SELECT schema_name, view_name FROM sigi_geometry_dependent_views
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', view_record.schema_name, view_record.view_name);
  END LOOP;

  ALTER TABLE gis.territory_features
    ALTER COLUMN geometry TYPE geometry(Geometry, 4326)
    USING ST_SetSRID(geometry, 4326);

  FOR view_record IN SELECT schema_name, view_name, view_definition FROM sigi_geometry_dependent_views
  LOOP
    EXECUTE format('CREATE VIEW %I.%I AS %s', view_record.schema_name, view_record.view_name, view_record.view_definition);
  END LOOP;
END
$migration$;

COMMENT ON COLUMN gis.territory_features.geometry IS
  'Native EPSG:4326 geometry. The geometry type is governed per geo layer.';
