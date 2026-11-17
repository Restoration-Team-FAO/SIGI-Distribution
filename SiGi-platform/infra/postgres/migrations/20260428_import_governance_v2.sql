\set ON_ERROR_STOP on

-- Apply governance v2 schema for import profiles, business-key aliases and quality scoring.
\i /docker-entrypoint-initdb.d/005_import_governance_v2.sql
