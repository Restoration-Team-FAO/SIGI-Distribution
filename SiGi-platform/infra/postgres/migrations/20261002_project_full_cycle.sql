\set ON_ERROR_STOP on

ALTER TABLE core.projects
  ADD COLUMN IF NOT EXISTS financial_management_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS financial_base_currency CHAR(3),
  ADD COLUMN IF NOT EXISTS financial_source_system TEXT,
  ADD COLUMN IF NOT EXISTS external_project_code TEXT,
  ADD COLUMN IF NOT EXISTS external_financial_url TEXT,
  ADD COLUMN IF NOT EXISTS financial_data_source TEXT,
  ADD COLUMN IF NOT EXISTS financial_update_method TEXT,
  ADD COLUMN IF NOT EXISTS financial_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS financial_data_cutoff_date DATE,
  ADD COLUMN IF NOT EXISTS financial_data_last_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_budget_amount NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS external_committed_amount NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS external_executed_amount NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS external_available_amount NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS actual_end_date DATE,
  ADD COLUMN IF NOT EXISTS closure_summary TEXT,
  ADD COLUMN IF NOT EXISTS lessons_learned TEXT,
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE core.projects ADD CONSTRAINT projects_financial_management_mode_check
    CHECK (financial_management_mode IN ('none','planning','execution','external'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE core.projects ADD CONSTRAINT projects_financial_update_method_check
    CHECK (financial_update_method IS NULL OR financial_update_method IN ('manual','api','connector'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE core.projects ADD CONSTRAINT projects_actual_end_date_check
    CHECK (actual_end_date IS NULL OR start_date IS NULL OR actual_end_date >= start_date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE core.project_tasks
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_end_date DATE,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS constraint_text TEXT,
  ADD COLUMN IF NOT EXISTS collaborator_actor_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS comments TEXT,
  ADD COLUMN IF NOT EXISTS progress_source TEXT NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  ALTER TABLE core.project_tasks ADD CONSTRAINT project_tasks_actual_dates_check
    CHECK (actual_end_date IS NULL OR actual_start_date IS NULL OR actual_end_date >= actual_start_date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE core.project_milestones
  ADD COLUMN IF NOT EXISTS owner_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_task_id UUID REFERENCES core.project_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT,
  ADD COLUMN IF NOT EXISTS evidence_required TEXT,
  ADD COLUMN IF NOT EXISTS evidence_presented TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approver_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observations TEXT;

ALTER TABLE core.project_deliverables
  ADD COLUMN IF NOT EXISTS related_task_id UUID REFERENCES core.project_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approver_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_file_id UUID,
  ADD COLUMN IF NOT EXISTS observations TEXT;

CREATE TABLE IF NOT EXISTS core.project_funding_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'institutional',
  funder TEXT,
  currency CHAR(3) NOT NULL,
  approved_amount NUMERIC(16,2),
  received_amount NUMERIC(16,2),
  valid_from DATE,
  valid_to DATE,
  restrictions TEXT,
  observations TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, code),
  CHECK (approved_amount IS NULL OR approved_amount >= 0),
  CHECK (received_amount IS NULL OR received_amount >= 0),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE IF NOT EXISTS core.project_budget_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_date DATE NOT NULL,
  total_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  support_file_id UUID,
  created_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, version_number),
  CHECK (total_amount >= 0)
);

ALTER TABLE core.project_budget_items
  ADD COLUMN IF NOT EXISTS budget_version_id UUID REFERENCES core.project_budget_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS funding_source_id UUID REFERENCES core.project_funding_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS cost_center TEXT,
  ADD COLUMN IF NOT EXISTS component TEXT,
  ADD COLUMN IF NOT EXISTS result_code TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_year INTEGER,
  ADD COLUMN IF NOT EXISTS period_label TEXT,
  ADD COLUMN IF NOT EXISTS original_currency CHAR(3),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS initial_amount NUMERIC(16,2);

UPDATE core.project_budget_items
SET initial_amount = planned_amount
WHERE initial_amount IS NULL;

CREATE TABLE IF NOT EXISTS core.project_financial_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  budget_item_id UUID REFERENCES core.project_budget_items(id) ON DELETE RESTRICT,
  destination_budget_item_id UUID REFERENCES core.project_budget_items(id) ON DELETE RESTRICT,
  funding_source_id UUID REFERENCES core.project_funding_sources(id) ON DELETE SET NULL,
  task_id UUID REFERENCES core.project_tasks(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL,
  budget_effect TEXT NOT NULL DEFAULT 'neutral',
  movement_date DATE NOT NULL,
  amount NUMERIC(16,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1,
  base_amount NUMERIC(16,2) NOT NULL,
  supplier_or_beneficiary TEXT,
  concept TEXT NOT NULL,
  external_reference TEXT,
  document_number TEXT,
  support_file_id UUID,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (movement_type IN ('allocation','commitment','accrual','payment','disbursement','adjustment','transfer')),
  CHECK (budget_effect IN ('increase','decrease','neutral')),
  CHECK (amount >= 0),
  CHECK (exchange_rate > 0),
  CHECK (base_amount >= 0)
);

CREATE TABLE IF NOT EXISTS core.project_management_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  requester_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  owner_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  approver_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  requested_at DATE,
  decided_at DATE,
  due_date DATE,
  impact_scope TEXT,
  impact_schedule_days INTEGER,
  impact_amount NUMERIC(16,2),
  previous_value_json JSONB,
  proposed_value_json JSONB,
  resolution TEXT,
  support_file_id UUID,
  created_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, code),
  CHECK (record_type IN ('issue','decision','change_request'))
);

CREATE TABLE IF NOT EXISTS core.project_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  cutoff_date DATE NOT NULL,
  period_label TEXT NOT NULL,
  physical_progress_pct NUMERIC(5,2) CHECK (physical_progress_pct BETWEEN 0 AND 100),
  financial_progress_pct NUMERIC(5,2) CHECK (financial_progress_pct BETWEEN 0 AND 100),
  financial_data_mode TEXT,
  executive_summary TEXT NOT NULL,
  achievements TEXT,
  delays TEXT,
  main_risks TEXT,
  issues TEXT,
  decisions_required TEXT,
  next_steps TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  responsible_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, cutoff_date)
);

CREATE INDEX IF NOT EXISTS idx_project_funding_sources_project ON core.project_funding_sources(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_budget_versions_project ON core.project_budget_versions(project_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_project_financial_movements_project ON core.project_financial_movements(project_id, movement_date DESC, movement_type);
CREATE INDEX IF NOT EXISTS idx_project_financial_movements_budget_item ON core.project_financial_movements(budget_item_id);
CREATE INDEX IF NOT EXISTS idx_project_management_records_project ON core.project_management_records(project_id, record_type, status);
CREATE INDEX IF NOT EXISTS idx_project_status_updates_project ON core.project_status_updates(project_id, cutoff_date DESC);

INSERT INTO core.permissions (code, name) VALUES
  ('projects.planning.manage', 'Gestionar planificación de proyectos'),
  ('projects.budget.read', 'Consultar presupuesto de proyectos'),
  ('projects.budget.manage', 'Gestionar presupuesto de proyectos'),
  ('projects.budget.approve', 'Aprobar presupuesto de proyectos'),
  ('projects.finance.read', 'Consultar ejecución financiera de proyectos'),
  ('projects.finance.manage', 'Gestionar ejecución financiera de proyectos'),
  ('projects.risks.manage', 'Gestionar riesgos y cambios de proyectos'),
  ('projects.close', 'Cerrar proyectos')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
JOIN core.permissions p ON p.code IN (
  'projects.planning.manage','projects.budget.read','projects.budget.manage','projects.budget.approve',
  'projects.finance.read','projects.finance.manage','projects.risks.manage','projects.close'
)
WHERE r.code IN ('superadmin','national_admin')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
JOIN core.permissions p ON p.code IN (
  'projects.planning.manage','projects.budget.read','projects.budget.manage',
  'projects.finance.read','projects.finance.manage','projects.risks.manage'
)
WHERE r.code IN ('institution_editor','technical_integration')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
JOIN core.permissions p ON p.code IN ('projects.budget.read','projects.finance.read')
WHERE r.code='read_consumer'
ON CONFLICT DO NOTHING;

