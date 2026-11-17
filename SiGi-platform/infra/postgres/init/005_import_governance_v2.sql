CREATE TABLE IF NOT EXISTS integration.canonical_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  field_code TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'text',
  required BOOLEAN NOT NULL DEFAULT FALSE,
  normalization_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, field_code)
);

CREATE TABLE IF NOT EXISTS integration.source_mapping_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES core.data_sources(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  key_resolution_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, entity_type, profile_name, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_source_mapping_profiles_default
  ON integration.source_mapping_profiles (source_id, entity_type)
  WHERE is_default = TRUE AND status = 'active';

CREATE TABLE IF NOT EXISTS core.institution_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES core.institutions(id) ON DELETE CASCADE,
  source_id UUID REFERENCES core.data_sources(id) ON DELETE SET NULL,
  alias_key TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'code',
  confidence NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_institution_keys_scope
  ON core.institution_keys (
    institution_id,
    alias_key,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_core_institution_keys_lookup
  ON core.institution_keys (alias_key, source_id)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS core.project_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  source_id UUID REFERENCES core.data_sources(id) ON DELETE SET NULL,
  alias_key TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'code',
  confidence NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_project_keys_scope
  ON core.project_keys (
    project_id,
    alias_key,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_core_project_keys_lookup
  ON core.project_keys (alias_key, source_id)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS core.territory_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID NOT NULL REFERENCES core.territories(id) ON DELETE CASCADE,
  source_id UUID REFERENCES core.data_sources(id) ON DELETE SET NULL,
  alias_key TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'code',
  confidence NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_territory_keys_scope
  ON core.territory_keys (
    territory_id,
    alias_key,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_core_territory_keys_lookup
  ON core.territory_keys (alias_key, source_id)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS integration.import_batch_rule_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES integration.import_batches(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  rule_code TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  affected_rows INTEGER NOT NULL DEFAULT 0 CHECK (affected_rows >= 0),
  message TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_import_batch_rule_results_batch_id
  ON integration.import_batch_rule_results (batch_id);

ALTER TABLE integration.import_batches
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES core.data_sources(id);

ALTER TABLE integration.import_batches
  ADD COLUMN IF NOT EXISTS mapping_profile_id UUID REFERENCES integration.source_mapping_profiles(id);

ALTER TABLE integration.import_batches
  ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES core.datasets(id);

ALTER TABLE integration.import_batches
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5,2);

ALTER TABLE integration.import_batches
  ADD COLUMN IF NOT EXISTS quality_grade TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE integration.import_batches
  ADD COLUMN IF NOT EXISTS quality_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'import_batches_quality_score_range'
  ) THEN
    ALTER TABLE integration.import_batches
      ADD CONSTRAINT import_batches_quality_score_range
      CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_integration_import_batches_source_id
  ON integration.import_batches (source_id);

CREATE INDEX IF NOT EXISTS idx_integration_import_batches_mapping_profile_id
  ON integration.import_batches (mapping_profile_id);

CREATE INDEX IF NOT EXISTS idx_integration_import_batches_dataset_id
  ON integration.import_batches (dataset_id);

CREATE INDEX IF NOT EXISTS idx_integration_import_batches_quality_grade
  ON integration.import_batches (quality_grade);

INSERT INTO integration.canonical_fields (
  entity_type,
  field_code,
  data_type,
  required,
  normalization_json,
  active
)
VALUES
  ('institutions', 'institution_code', 'text', TRUE, '{}'::jsonb, TRUE),
  ('institutions', 'institution_name', 'text', TRUE, '{}'::jsonb, TRUE),
  ('institutions', 'country', 'text', TRUE, '{}'::jsonb, TRUE),
  ('projects', 'project_code', 'text', TRUE, '{}'::jsonb, TRUE),
  ('projects', 'project_name', 'text', TRUE, '{}'::jsonb, TRUE),
  ('projects', 'lead_institution_code', 'text', TRUE, '{}'::jsonb, TRUE),
  ('projects', 'start_date', 'date', TRUE, '{}'::jsonb, TRUE),
  ('projects', 'end_date', 'date', TRUE, '{}'::jsonb, TRUE),
  ('projects', 'total_area_ha', 'number', TRUE, '{}'::jsonb, TRUE),
  ('project_indicators', 'project_code', 'text', TRUE, '{}'::jsonb, TRUE),
  ('project_indicators', 'indicator_code', 'text', TRUE, '{}'::jsonb, TRUE),
  ('project_indicators', 'unit', 'text', TRUE, '{}'::jsonb, TRUE),
  ('project_territories', 'project_code', 'text', TRUE, '{}'::jsonb, TRUE),
  ('project_territories', 'country', 'text', TRUE, '{}'::jsonb, TRUE),
  ('project_territories', 'area_ha', 'number', TRUE, '{}'::jsonb, TRUE)
ON CONFLICT (entity_type, field_code)
DO UPDATE SET
  data_type = EXCLUDED.data_type,
  required = EXCLUDED.required,
  normalization_json = EXCLUDED.normalization_json,
  active = EXCLUDED.active,
  updated_at = NOW();

INSERT INTO core.institution_keys (
  institution_id,
  source_id,
  alias_key,
  match_type,
  confidence,
  active
)
SELECT
  i.id,
  NULL,
  LOWER(i.code),
  'code',
  1.00,
  TRUE
FROM core.institutions i
WHERE i.code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM core.institution_keys k
    WHERE k.institution_id = i.id
      AND k.alias_key = LOWER(i.code)
      AND k.source_id IS NULL
  );

INSERT INTO core.project_keys (
  project_id,
  source_id,
  alias_key,
  match_type,
  confidence,
  active
)
SELECT
  p.id,
  NULL,
  LOWER(p.code),
  'code',
  1.00,
  TRUE
FROM core.projects p
WHERE p.code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM core.project_keys k
    WHERE k.project_id = p.id
      AND k.alias_key = LOWER(p.code)
      AND k.source_id IS NULL
  );

INSERT INTO core.territory_keys (
  territory_id,
  source_id,
  alias_key,
  match_type,
  confidence,
  active
)
SELECT
  t.id,
  NULL,
  LOWER(t.code),
  'code',
  1.00,
  TRUE
FROM core.territories t
WHERE t.code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM core.territory_keys k
    WHERE k.territory_id = t.id
      AND k.alias_key = LOWER(t.code)
      AND k.source_id IS NULL
  );
