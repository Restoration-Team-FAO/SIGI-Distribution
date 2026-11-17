\set ON_ERROR_STOP on

-- Apply import pipeline schema and staging/final-table extensions
-- into an existing dev volume.
\i /docker-entrypoint-initdb.d/004_import_pipeline_schema.sql
