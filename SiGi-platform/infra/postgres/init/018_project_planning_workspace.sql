\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS core.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES core.project_tasks(id) ON DELETE SET NULL,
  owner_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL DEFAULT 'task' CHECK (task_type IN ('phase', 'activity', 'task')),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done', 'blocked', 'cancelled')),
  progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  weight NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (weight >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS core.project_task_dependencies (
  task_id UUID NOT NULL REFERENCES core.project_tasks(id) ON DELETE CASCADE,
  predecessor_task_id UUID NOT NULL REFERENCES core.project_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start' CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
  lag_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, predecessor_task_id),
  CHECK (task_id <> predecessor_task_id)
);

CREATE TABLE IF NOT EXISTS core.project_budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES core.project_tasks(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  funding_source TEXT,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  planned_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  committed_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (committed_amount >= 0),
  actual_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (actual_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS core.project_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  owner_actor_id UUID REFERENCES core.project_actors(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  probability SMALLINT NOT NULL DEFAULT 1 CHECK (probability BETWEEN 1 AND 5),
  impact SMALLINT NOT NULL DEFAULT 1 CHECK (impact BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'monitoring', 'mitigated', 'closed', 'accepted')),
  response_strategy TEXT NOT NULL DEFAULT 'mitigate' CHECK (response_strategy IN ('avoid', 'mitigate', 'transfer', 'accept')),
  mitigation TEXT,
  review_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code)
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON core.project_tasks (project_id, sort_order, start_date);
CREATE INDEX IF NOT EXISTS idx_project_tasks_parent ON core.project_tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS idx_project_task_dependencies_predecessor ON core.project_task_dependencies (predecessor_task_id);
CREATE INDEX IF NOT EXISTS idx_project_budget_items_project ON core.project_budget_items (project_id, category);
CREATE INDEX IF NOT EXISTS idx_project_risks_project ON core.project_risks (project_id, status, probability, impact);
