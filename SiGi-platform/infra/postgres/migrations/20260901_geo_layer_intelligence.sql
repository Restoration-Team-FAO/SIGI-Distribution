\set ON_ERROR_STOP on

BEGIN;
\i /docker-entrypoint-initdb.d/011_geo_layer_intelligence.sql
COMMIT;
