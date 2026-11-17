\set ON_ERROR_STOP on

-- Intentionally empty. The isolated empty-demo profile masks the regular
-- operational demo seed with this file before PostgreSQL initializes.
SELECT 'Skipping operational demo seed for empty SIGI instance' AS empty_demo_bootstrap;
