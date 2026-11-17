CREATE TABLE IF NOT EXISTS integration.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  source_format TEXT NOT NULL,
  file_name TEXT NOT NULL,
  sheet_name TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  initiated_by_user_id UUID REFERENCES core.users(id),
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  staged_rows INTEGER NOT NULL DEFAULT 0 CHECK (staged_rows >= 0),
  valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  promoted_rows INTEGER NOT NULL DEFAULT 0 CHECK (promoted_rows >= 0),
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration.import_batch_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES integration.import_batches(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration.staging_institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES integration.import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  institution_code TEXT,
  institution_name TEXT,
  country TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration.staging_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES integration.import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  project_code TEXT,
  project_name TEXT,
  lead_institution_code TEXT,
  start_date DATE,
  end_date DATE,
  total_area_ha NUMERIC(12,2),
  status TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration.staging_project_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES integration.import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  project_code TEXT,
  indicator_code TEXT,
  indicator_name TEXT,
  unit TEXT,
  value_numeric NUMERIC(14,2),
  value_text TEXT,
  category TEXT,
  observed_at DATE,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration.staging_project_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES integration.import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  project_code TEXT,
  territory_code TEXT,
  territory_name TEXT,
  territory_level TEXT,
  country TEXT,
  area_ha NUMERIC(12,2),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE core.institutions
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE core.projects
  ADD COLUMN IF NOT EXISTS code TEXT;

ALTER TABLE core.projects
  ADD COLUMN IF NOT EXISTS start_date DATE;

ALTER TABLE core.projects
  ADD COLUMN IF NOT EXISTS end_date DATE;

DROP INDEX IF EXISTS core.uq_core_projects_code;

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_projects_code
  ON core.projects (code);

UPDATE core.projects
SET code = CASE title
  WHEN 'Restauración de Manglares del Pacífico Norte' THEN 'CR-PRJ-001'
  WHEN 'Corredor Biológico Talamanca-Caribe' THEN 'CR-PRJ-002'
  WHEN 'Recuperación de Cuencas del Río Tempisque' THEN 'CR-PRJ-003'
  WHEN 'PSA en Territorios Indígenas Bribri-Cabécar' THEN 'CR-PRJ-004'
  WHEN 'Reforestación Productiva Zona Norte' THEN 'CR-PRJ-005'
  WHEN 'Protección de Nacientes GAM' THEN 'CR-PRJ-006'
  WHEN 'Control de Incendios Forestales Guanacaste' THEN 'CR-PRJ-007'
  WHEN 'Restauración de Bosque Seco en Nicoya' THEN 'CR-PRJ-008'
  ELSE code
END
WHERE code IS NULL;

CREATE TABLE IF NOT EXISTS core.project_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  indicator_code TEXT NOT NULL,
  indicator_name TEXT,
  unit TEXT NOT NULL,
  value_numeric NUMERIC(14,2),
  value_text TEXT,
  category TEXT NOT NULL DEFAULT 'project',
  observed_at DATE NOT NULL DEFAULT DATE '1970-01-01',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, indicator_code, observed_at)
);

CREATE TABLE IF NOT EXISTS core.project_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  territory_id UUID REFERENCES core.territories(id),
  territory_code TEXT NOT NULL,
  territory_name TEXT,
  country TEXT NOT NULL,
  area_ha NUMERIC(12,2) NOT NULL CHECK (area_ha >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, territory_code, country)
);

CREATE INDEX IF NOT EXISTS idx_integration_import_batches_entity_type
  ON integration.import_batches (entity_type);

CREATE INDEX IF NOT EXISTS idx_integration_import_batches_status
  ON integration.import_batches (status);

CREATE INDEX IF NOT EXISTS idx_integration_import_batch_errors_batch_id
  ON integration.import_batch_errors (batch_id);

CREATE INDEX IF NOT EXISTS idx_integration_staging_institutions_batch_id
  ON integration.staging_institutions (batch_id);

CREATE INDEX IF NOT EXISTS idx_integration_staging_projects_batch_id
  ON integration.staging_projects (batch_id);

CREATE INDEX IF NOT EXISTS idx_integration_staging_project_indicators_batch_id
  ON integration.staging_project_indicators (batch_id);

CREATE INDEX IF NOT EXISTS idx_integration_staging_project_territories_batch_id
  ON integration.staging_project_territories (batch_id);

CREATE INDEX IF NOT EXISTS idx_core_project_indicators_project_id
  ON core.project_indicators (project_id);

CREATE INDEX IF NOT EXISTS idx_core_project_territories_project_id
  ON core.project_territories (project_id);
