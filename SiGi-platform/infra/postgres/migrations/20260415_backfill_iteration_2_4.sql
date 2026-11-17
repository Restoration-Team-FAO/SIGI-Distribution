\set ON_ERROR_STOP on

-- Backfill an existing dev volume to the current SIGI schema.
\i /docker-entrypoint-initdb.d/001_extensions.sql
\i /docker-entrypoint-initdb.d/002_core_schema.sql
