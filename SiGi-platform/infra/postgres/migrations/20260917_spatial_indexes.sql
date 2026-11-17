\set ON_ERROR_STOP on

-- The accepted baseline already creates this index during clean bootstrap.
-- Keeping it as an idempotent migration protects upgraded databases where the
-- index may be absent without introducing a second equivalent GiST index.
CREATE INDEX IF NOT EXISTS territory_features_geometry_gix
  ON gis.territory_features
  USING GIST (geometry);
