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

CREATE TABLE IF NOT EXISTS core.egi_memberships (
  egi_id UUID NOT NULL REFERENCES core.egi_spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  membership_status TEXT NOT NULL DEFAULT 'active',
  permissions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (egi_id, user_id)
);

CREATE TABLE IF NOT EXISTS core.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  active_egi_id UUID REFERENCES core.egi_spaces(id),
  preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_egi_selected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.roles (code, name)
VALUES
  ('egi_owner', 'Responsable del espacio'),
  ('egi_admin', 'Administrador del espacio'),
  ('egi_editor', 'Editor del espacio'),
  ('egi_validator', 'Validador del espacio'),
  ('egi_viewer', 'Lector del espacio')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.permissions (code, name)
VALUES
  ('egi.read', 'Ver espacios de gestion'),
  ('egi.create', 'Crear espacios de gestion'),
  ('egi.update', 'Editar espacios de gestion'),
  ('egi.select', 'Seleccionar espacio activo'),
  ('egi.memberships.manage', 'Gestionar usuarios del espacio'),
  ('egi.summary.read', 'Ver resumen del espacio')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
INNER JOIN (
  VALUES
    ('superadmin', 'egi.read'),
    ('superadmin', 'egi.create'),
    ('superadmin', 'egi.update'),
    ('superadmin', 'egi.select'),
    ('superadmin', 'egi.memberships.manage'),
    ('superadmin', 'egi.summary.read'),
    ('national_admin', 'egi.read'),
    ('national_admin', 'egi.create'),
    ('national_admin', 'egi.update'),
    ('national_admin', 'egi.select'),
    ('national_admin', 'egi.memberships.manage'),
    ('national_admin', 'egi.summary.read'),
    ('institution_editor', 'egi.read'),
    ('institution_editor', 'egi.select'),
    ('institution_editor', 'egi.summary.read'),
    ('technical_validator', 'egi.read'),
    ('technical_validator', 'egi.select'),
    ('technical_validator', 'egi.summary.read'),
    ('technical_integration', 'egi.read'),
    ('technical_integration', 'egi.select'),
    ('technical_integration', 'egi.summary.read'),
    ('read_consumer', 'egi.read'),
    ('read_consumer', 'egi.select'),
    ('read_consumer', 'egi.summary.read'),
    ('egi_owner', 'egi.read'),
    ('egi_owner', 'egi.select'),
    ('egi_owner', 'egi.update'),
    ('egi_owner', 'egi.memberships.manage'),
    ('egi_owner', 'egi.summary.read'),
    ('egi_admin', 'egi.read'),
    ('egi_admin', 'egi.select'),
    ('egi_admin', 'egi.update'),
    ('egi_admin', 'egi.memberships.manage'),
    ('egi_admin', 'egi.summary.read'),
    ('egi_editor', 'egi.read'),
    ('egi_editor', 'egi.select'),
    ('egi_editor', 'egi.summary.read'),
    ('egi_validator', 'egi.read'),
    ('egi_validator', 'egi.select'),
    ('egi_validator', 'egi.summary.read'),
    ('egi_viewer', 'egi.read'),
    ('egi_viewer', 'egi.select'),
    ('egi_viewer', 'egi.summary.read')
) AS grants(role_code, permission_code) ON grants.role_code = r.code
INNER JOIN core.permissions p ON p.code = grants.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

ALTER TABLE core.data_sources
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id);

ALTER TABLE core.datasets
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id);

ALTER TABLE core.projects
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id);

ALTER TABLE core.audit_events
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id);

ALTER TABLE integration.import_batches
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id);

ALTER TABLE core.validation_results
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id);

ALTER TABLE documents.folders
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id);

ALTER TABLE documents.files
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id);

CREATE INDEX IF NOT EXISTS idx_egi_spaces_institution_id
  ON core.egi_spaces(institution_id);

CREATE INDEX IF NOT EXISTS idx_egi_memberships_user_id
  ON core.egi_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_data_sources_egi_id
  ON core.data_sources(egi_id);

CREATE INDEX IF NOT EXISTS idx_datasets_egi_id
  ON core.datasets(egi_id);

CREATE INDEX IF NOT EXISTS idx_projects_egi_id
  ON core.projects(egi_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_egi_id
  ON core.audit_events(egi_id);

CREATE INDEX IF NOT EXISTS idx_import_batches_egi_id
  ON integration.import_batches(egi_id);

CREATE INDEX IF NOT EXISTS idx_validation_results_egi_id
  ON core.validation_results(egi_id);

CREATE INDEX IF NOT EXISTS idx_documents_folders_egi_id
  ON documents.folders(egi_id);

CREATE INDEX IF NOT EXISTS idx_documents_files_egi_id
  ON documents.files(egi_id);
