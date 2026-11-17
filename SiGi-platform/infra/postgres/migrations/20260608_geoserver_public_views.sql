\set ON_ERROR_STOP on

BEGIN;
\i /docker-entrypoint-initdb.d/008_geoserver_public_views.sql
COMMIT;
