\set ON_ERROR_STOP on

BEGIN;
\i /docker-entrypoint-initdb.d/012_geo_saved_views.sql
COMMIT;
