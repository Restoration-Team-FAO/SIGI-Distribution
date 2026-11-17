CREATE TABLE IF NOT EXISTS integration.odoo_source_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL UNIQUE REFERENCES core.data_sources(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL UNIQUE REFERENCES core.connectors(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted BYTEA NOT NULL,
  mapping_profile_id UUID REFERENCES integration.source_mapping_profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'configured',
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_error TEXT,
  last_sync_job_id UUID REFERENCES core.sync_jobs(id) ON DELETE SET NULL,
  last_sync_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES core.users(id),
  updated_by_user_id UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_odoo_source_configs_connector_id
  ON integration.odoo_source_configs (connector_id);

CREATE INDEX IF NOT EXISTS idx_integration_odoo_source_configs_last_sync_at
  ON integration.odoo_source_configs (last_sync_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_odoo_source_configs_status
  ON integration.odoo_source_configs (status);
