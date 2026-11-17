\set ON_ERROR_STOP on

-- Apply the Phase 5 demo data seed into an existing volume.
\i /docker-entrypoint-initdb.d/900_phase5_demo_seed.sql
