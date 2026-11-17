\set ON_ERROR_STOP on

-- Production starts with catalogs, roles and bootstrap identities only.
-- Operational examples belong exclusively to the demo compose profile.
TRUNCATE TABLE
  core.audit_events,
  core.connectors,
  core.data_sources,
  core.datasets,
  core.export_runs,
  core.incidents,
  core.indicators,
  core.project_portfolios,
  core.projects,
  core.publications,
  core.report_runs,
  core.territories,
  core.validation_results,
  gis.geo_layers
RESTART IDENTITY CASCADE;

SELECT 'Production bootstrap initialized without operational demo records' AS production_bootstrap;
