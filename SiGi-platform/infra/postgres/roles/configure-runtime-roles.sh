#!/bin/sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${SIGI_APP_DB_PASSWORD:?SIGI_APP_DB_PASSWORD is required}"
: "${GEOSERVER_DB_PASSWORD:?GEOSERVER_DB_PASSWORD is required}"

if [ "${SIGI_APP_DB_USER:-sigi_app}" != "sigi_app" ]; then
  echo "SIGI_APP_DB_USER must be sigi_app." >&2
  exit 1
fi
if [ "${GEOSERVER_DB_USER:-geoserver_ro}" != "geoserver_ro" ]; then
  echo "GEOSERVER_DB_USER must be geoserver_ro." >&2
  exit 1
fi

export PGPASSWORD="${POSTGRES_PASSWORD}"
psql --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" \
  --set ON_ERROR_STOP=1 \
  --set app_password="${SIGI_APP_DB_PASSWORD}" \
  --set geoserver_password="${GEOSERVER_DB_PASSWORD}" \
  --set db_name="${POSTGRES_DB}" \
  --set app_owner="${POSTGRES_USER}" <<'SQL'
SELECT format(
  'CREATE ROLE sigi_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sigi_app') \gexec
SELECT format(
  'ALTER ROLE sigi_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION',
  :'app_password'
) \gexec

GRANT CONNECT ON DATABASE :"db_name" TO sigi_app;
GRANT USAGE ON SCHEMA public, core, documents, gis, integration TO sigi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, core, documents, gis, integration TO sigi_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public, core, documents, gis, integration TO sigi_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"app_owner" IN SCHEMA public, core, documents, gis, integration
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sigi_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"app_owner" IN SCHEMA public, core, documents, gis, integration
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sigi_app;
REVOKE CREATE ON SCHEMA public, core, documents, gis, integration FROM sigi_app;

SELECT format(
  'CREATE ROLE geoserver_ro LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION',
  :'geoserver_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'geoserver_ro') \gexec
SELECT format(
  'ALTER ROLE geoserver_ro WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION',
  :'geoserver_password'
) \gexec

GRANT CONNECT ON DATABASE :"db_name" TO geoserver_ro;
GRANT USAGE ON SCHEMA gis TO geoserver_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA gis TO geoserver_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE :"app_owner" IN SCHEMA gis
  GRANT SELECT ON TABLES TO geoserver_ro;
REVOKE CREATE ON SCHEMA public, gis FROM geoserver_ro;
REVOKE ALL ON SCHEMA core, integration FROM geoserver_ro;
REVOKE ALL ON ALL TABLES IN SCHEMA core, integration FROM geoserver_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA core, integration FROM geoserver_ro;
SQL
