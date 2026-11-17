CREATE SCHEMA IF NOT EXISTS documents;

CREATE TABLE IF NOT EXISTS documents.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES documents.folders(id),
  institution_id UUID REFERENCES core.institutions(id),
  project_id UUID REFERENCES core.projects(id),
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'internal',
  created_by UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS documents.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES documents.folders(id),
  institution_id UUID REFERENCES core.institutions(id),
  project_id UUID REFERENCES core.projects(id),
  current_version_id UUID,
  name TEXT NOT NULL,
  title TEXT,
  description TEXT,
  file_type TEXT,
  mime_type TEXT,
  extension TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  confidentiality_level TEXT NOT NULL DEFAULT 'internal',
  validation_status TEXT NOT NULL DEFAULT 'draft',
  source_type TEXT NOT NULL DEFAULT 'manual',
  is_geospatial BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS documents.file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES documents.files(id),
  version_number INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  change_note TEXT,
  uploaded_by UUID REFERENCES core.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, version_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'documents'
      AND table_name = 'files'
      AND constraint_name = 'files_current_version_fk'
  ) THEN
    ALTER TABLE documents.files
      ADD CONSTRAINT files_current_version_fk
      FOREIGN KEY (current_version_id)
      REFERENCES documents.file_versions(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS documents.file_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL UNIQUE REFERENCES documents.files(id),
  country TEXT,
  department TEXT,
  municipality TEXT,
  thematic_area TEXT,
  document_type TEXT,
  data_owner TEXT,
  technical_custodian TEXT,
  license TEXT,
  retention_policy TEXT,
  spatial_reference TEXT,
  geometry_type TEXT,
  bbox JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents.file_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents.file_tag_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES documents.files(id),
  tag_id UUID NOT NULL REFERENCES documents.file_tags(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, tag_id)
);

CREATE TABLE IF NOT EXISTS documents.file_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES documents.files(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'related',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents.file_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES documents.files(id),
  folder_id UUID REFERENCES documents.folders(id),
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents.file_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  egi_id UUID REFERENCES core.egi_spaces(id),
  file_id UUID REFERENCES documents.files(id),
  folder_id UUID REFERENCES documents.folders(id),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES core.users(id),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents.file_storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES documents.files(id),
  version_id UUID REFERENCES documents.file_versions(id),
  storage_key TEXT NOT NULL UNIQUE,
  storage_provider TEXT NOT NULL DEFAULT 'local_fs',
  absolute_path TEXT NOT NULL,
  exists_on_disk BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS documents.file_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES documents.files(id),
  version_id UUID REFERENCES documents.file_versions(id),
  preview_type TEXT NOT NULL,
  storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_folders_parent_id
  ON documents.folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_folders_project_id
  ON documents.folders(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_folders_institution_id
  ON documents.folders(institution_id);
CREATE INDEX IF NOT EXISTS idx_documents_folders_deleted_at
  ON documents.folders(deleted_at);

CREATE INDEX IF NOT EXISTS idx_documents_files_folder_id
  ON documents.files(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_files_project_id
  ON documents.files(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_files_institution_id
  ON documents.files(institution_id);
CREATE INDEX IF NOT EXISTS idx_documents_files_checksum_sha256
  ON documents.files(checksum_sha256);
CREATE INDEX IF NOT EXISTS idx_documents_files_deleted_at
  ON documents.files(deleted_at);

CREATE INDEX IF NOT EXISTS idx_documents_file_metadata_file_id
  ON documents.file_metadata(file_id);
CREATE INDEX IF NOT EXISTS idx_documents_file_metadata_gin
  ON documents.file_metadata
  USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_documents_file_versions_file_id
  ON documents.file_versions(file_id);

CREATE INDEX IF NOT EXISTS idx_documents_file_entity_links_file_id
  ON documents.file_entity_links(file_id);

CREATE INDEX IF NOT EXISTS idx_documents_file_permissions_file_id
  ON documents.file_permissions(file_id);
CREATE INDEX IF NOT EXISTS idx_documents_file_permissions_folder_id
  ON documents.file_permissions(folder_id);

CREATE INDEX IF NOT EXISTS idx_documents_file_audit_events_file_id
  ON documents.file_audit_events(file_id);
CREATE INDEX IF NOT EXISTS idx_documents_file_audit_events_folder_id
  ON documents.file_audit_events(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_file_audit_events_egi_id
  ON documents.file_audit_events(egi_id);

INSERT INTO core.permissions (code, name)
VALUES
  ('files.read', 'Ver documentos'),
  ('files.create', 'Crear carpetas y subir archivos'),
  ('files.update', 'Editar documentos y metadatos'),
  ('files.delete', 'Eliminar lógicamente documentos'),
  ('files.download', 'Descargar documentos'),
  ('files.share', 'Compartir y vincular documentos'),
  ('files.approve', 'Aprobar documentos'),
  ('files.manage_permissions', 'Gestionar permisos documentales'),
  ('files.view_sensitive', 'Ver documentos sensibles'),
  ('files.admin', 'Administración total documental')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
INNER JOIN (
  VALUES
    ('superadmin', 'files.read'),
    ('superadmin', 'files.create'),
    ('superadmin', 'files.update'),
    ('superadmin', 'files.delete'),
    ('superadmin', 'files.download'),
    ('superadmin', 'files.share'),
    ('superadmin', 'files.approve'),
    ('superadmin', 'files.manage_permissions'),
    ('superadmin', 'files.view_sensitive'),
    ('superadmin', 'files.admin'),
    ('national_admin', 'files.read'),
    ('national_admin', 'files.create'),
    ('national_admin', 'files.update'),
    ('national_admin', 'files.delete'),
    ('national_admin', 'files.download'),
    ('national_admin', 'files.share'),
    ('national_admin', 'files.approve'),
    ('national_admin', 'files.manage_permissions'),
    ('national_admin', 'files.view_sensitive'),
    ('national_admin', 'files.admin'),
    ('institution_editor', 'files.read'),
    ('institution_editor', 'files.create'),
    ('institution_editor', 'files.update'),
    ('institution_editor', 'files.download'),
    ('institution_editor', 'files.share'),
    ('technical_validator', 'files.read'),
    ('technical_validator', 'files.download'),
    ('read_consumer', 'files.read'),
    ('read_consumer', 'files.download'),
    ('technical_integration', 'files.read'),
    ('technical_integration', 'files.create'),
    ('technical_integration', 'files.update'),
    ('technical_integration', 'files.download'),
    ('technical_integration', 'files.share')
) AS grants(role_code, permission_code) ON grants.role_code = r.code
INNER JOIN core.permissions p ON p.code = grants.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
