\set ON_ERROR_STOP on

-- The documents migration references this table before the full EGI migration
-- runs. Creating only its dependency here keeps the later migration idempotent
-- and avoids running its import-pipeline alterations too early.
CREATE TABLE IF NOT EXISTS core.egi_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES core.institutions(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  responsible TEXT,
  territorial_scope TEXT,
  thematic_scope TEXT,
  visibility TEXT NOT NULL DEFAULT 'institutional',
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES core.users(id),
  updated_by UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
