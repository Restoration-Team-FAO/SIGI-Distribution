CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS gis;

CREATE TABLE IF NOT EXISTS core.institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.institutions (id, code, name, status)
VALUES (
  '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
  'min-health',
  'Ministry of Health',
  'active'
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES core.institutions(id),
  connector_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.connectors (
  id,
  institution_id,
  connector_type,
  display_name,
  status,
  config_json
)
VALUES (
  'f2d8678f-bb0c-4e15-b8ca-135fd6053e16',
  '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
  'kobo',
  'Kobo Primary Connector',
  'active',
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.roles (id, code, name)
VALUES
  ('d712912f-37eb-45aa-94e7-17352f1eb17e', 'superadmin', 'Superadministrador SIGI'),
  ('0f750dac-c4db-4e34-8445-bbc3f2cdb3c5', 'national_admin', 'Administrador nacional'),
  ('d8972cbb-d540-4cfd-b2e8-c482406f5591', 'institution_editor', 'Editor institucional'),
  ('f55175e4-5825-4aec-bf4f-32392bc0d0e3', 'technical_validator', 'Validador técnico'),
  ('c9b31c7c-1981-4dd2-ac7c-83e9b413fa9f', 'read_consumer', 'Consumidor lectura'),
  ('83933660-d964-450d-8681-2a26589bcb79', 'technical_integration', 'Integración técnica')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.permissions (code, name)
VALUES
  ('users.read', 'Ver usuarios'),
  ('users.create', 'Crear usuarios'),
  ('users.update', 'Editar usuarios'),
  ('users.delete', 'Eliminar usuarios'),
  ('roles.read', 'Ver roles'),
  ('roles.create', 'Crear roles'),
  ('roles.update', 'Editar roles'),
  ('roles.delete', 'Eliminar roles'),
  ('permissions.read', 'Ver permisos'),
  ('permissions.assign', 'Asignar permisos a roles'),
  ('institutions.read', 'Ver instituciones'),
  ('institutions.create', 'Crear instituciones'),
  ('institutions.update', 'Editar instituciones'),
  ('institutions.delete', 'Eliminar instituciones'),
  ('connectors.read', 'Ver conectores'),
  ('connectors.create', 'Crear conectores'),
  ('connectors.update', 'Editar conectores'),
  ('connectors.delete', 'Eliminar conectores'),
  ('connectors.run', 'Ejecutar conectores'),
  ('sources.read', 'Ver fuentes'),
  ('sources.create', 'Crear fuentes'),
  ('sources.update', 'Editar fuentes'),
  ('sources.delete', 'Eliminar fuentes'),
  ('projects.read', 'Ver proyectos'),
  ('projects.create', 'Crear proyectos'),
  ('projects.update', 'Editar proyectos'),
  ('projects.polygon.update', 'Editar poligonos de proyecto'),
  ('validations.read', 'Ver validaciones'),
  ('validations.assign', 'Asignar validaciones'),
  ('publications.read', 'Ver publicaciones'),
  ('publications.publish', 'Publicar salidas'),
  ('incidents.read', 'Ver incidentes'),
  ('audit.read', 'Ver auditoria'),
  ('imports.read', 'Ver cargas'),
  ('imports.upload', 'Subir cargas'),
  ('roles.grant.superadmin', 'Heredar acceso de superadmin'),
  ('roles.grant.national_admin', 'Heredar acceso de administrador nacional'),
  ('roles.grant.institution_editor', 'Heredar acceso de editor institucional'),
  ('roles.grant.technical_validator', 'Heredar acceso de validador tecnico'),
  ('roles.grant.read_consumer', 'Heredar acceso de consumidor lectura'),
  ('roles.grant.technical_integration', 'Heredar acceso de integracion tecnica'),
  ('system.reset_database', 'Resetear base de datos')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES core.institutions(id),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.users (id, institution_id, email, display_name, status)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'superadmin@sigi.local',
    'Superadministrador SIGI',
    'active'
  ),
  (
    '11111111-1111-4111-8111-111111111112',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'national-admin@sigi.local',
    'Administrador Nacional SIGI',
    'active'
  ),
  (
    '222b8042-3399-4941-b96d-8b5e93d35347',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'admin@sigi.local',
    'Administrador SIGI',
    'active'
  ),
  (
    'b7a2bf36-251e-45c4-ac0c-f1c72ae5b6df',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'editor@sigi.local',
    'Editor Institucional',
    'active'
  ),
  (
    '11111111-1111-4111-8111-111111111113',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'validator@sigi.local',
    'Validador Tecnico SIGI',
    'active'
  ),
  (
    '11111111-1111-4111-8111-111111111114',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'reader@sigi.local',
    'Consumidor Lectura SIGI',
    'active'
  ),
  (
    '11111111-1111-4111-8111-111111111115',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'integration@sigi.local',
    'Integracion Tecnica SIGI',
    'active'
  )
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.user_roles (
  user_id UUID NOT NULL REFERENCES core.users(id),
  role_id UUID NOT NULL REFERENCES core.roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

INSERT INTO core.user_roles (user_id, role_id)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'd712912f-37eb-45aa-94e7-17352f1eb17e'),
  ('11111111-1111-4111-8111-111111111112', '0f750dac-c4db-4e34-8445-bbc3f2cdb3c5'),
  ('222b8042-3399-4941-b96d-8b5e93d35347', 'd712912f-37eb-45aa-94e7-17352f1eb17e'),
  ('b7a2bf36-251e-45c4-ac0c-f1c72ae5b6df', 'd8972cbb-d540-4cfd-b2e8-c482406f5591'),
  ('11111111-1111-4111-8111-111111111113', 'f55175e4-5825-4aec-bf4f-32392bc0d0e3'),
  ('11111111-1111-4111-8111-111111111114', 'c9b31c7c-1981-4dd2-ac7c-83e9b413fa9f'),
  ('11111111-1111-4111-8111-111111111115', '83933660-d964-450d-8681-2a26589bcb79')
ON CONFLICT (user_id, role_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.role_permissions (
  role_id UUID NOT NULL REFERENCES core.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES core.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
INNER JOIN (
  VALUES
    ('superadmin', 'users.read'),
    ('superadmin', 'users.create'),
    ('superadmin', 'users.update'),
    ('superadmin', 'users.delete'),
    ('superadmin', 'roles.read'),
    ('superadmin', 'roles.create'),
    ('superadmin', 'roles.update'),
    ('superadmin', 'roles.delete'),
    ('superadmin', 'permissions.read'),
    ('superadmin', 'permissions.assign'),
    ('superadmin', 'institutions.read'),
    ('superadmin', 'institutions.create'),
    ('superadmin', 'institutions.update'),
    ('superadmin', 'institutions.delete'),
    ('superadmin', 'connectors.read'),
    ('superadmin', 'connectors.create'),
    ('superadmin', 'connectors.update'),
    ('superadmin', 'connectors.delete'),
    ('superadmin', 'connectors.run'),
    ('superadmin', 'sources.read'),
    ('superadmin', 'sources.create'),
    ('superadmin', 'sources.update'),
    ('superadmin', 'sources.delete'),
    ('superadmin', 'projects.read'),
    ('superadmin', 'projects.create'),
    ('superadmin', 'projects.update'),
    ('superadmin', 'projects.polygon.update'),
    ('superadmin', 'validations.read'),
    ('superadmin', 'validations.assign'),
    ('superadmin', 'publications.read'),
    ('superadmin', 'publications.publish'),
    ('superadmin', 'incidents.read'),
    ('superadmin', 'audit.read'),
    ('superadmin', 'imports.read'),
    ('superadmin', 'imports.upload'),
    ('superadmin', 'roles.grant.superadmin'),
    ('superadmin', 'roles.grant.national_admin'),
    ('superadmin', 'roles.grant.institution_editor'),
    ('superadmin', 'roles.grant.technical_validator'),
    ('superadmin', 'roles.grant.read_consumer'),
    ('superadmin', 'roles.grant.technical_integration'),
    ('superadmin', 'system.reset_database'),
    ('national_admin', 'users.read'),
    ('national_admin', 'users.create'),
    ('national_admin', 'users.update'),
    ('national_admin', 'users.delete'),
    ('national_admin', 'roles.read'),
    ('national_admin', 'roles.create'),
    ('national_admin', 'roles.update'),
    ('national_admin', 'roles.delete'),
    ('national_admin', 'permissions.read'),
    ('national_admin', 'permissions.assign'),
    ('national_admin', 'institutions.read'),
    ('national_admin', 'institutions.create'),
    ('national_admin', 'institutions.update'),
    ('national_admin', 'institutions.delete'),
    ('national_admin', 'connectors.read'),
    ('national_admin', 'connectors.create'),
    ('national_admin', 'connectors.update'),
    ('national_admin', 'connectors.delete'),
    ('national_admin', 'connectors.run'),
    ('national_admin', 'sources.read'),
    ('national_admin', 'sources.create'),
    ('national_admin', 'sources.update'),
    ('national_admin', 'sources.delete'),
    ('national_admin', 'projects.read'),
    ('national_admin', 'projects.create'),
    ('national_admin', 'projects.update'),
    ('national_admin', 'projects.polygon.update'),
    ('national_admin', 'validations.read'),
    ('national_admin', 'validations.assign'),
    ('national_admin', 'publications.read'),
    ('national_admin', 'publications.publish'),
    ('national_admin', 'incidents.read'),
    ('national_admin', 'audit.read'),
    ('national_admin', 'imports.read'),
    ('national_admin', 'imports.upload'),
    ('national_admin', 'roles.grant.national_admin'),
    ('national_admin', 'roles.grant.institution_editor'),
    ('national_admin', 'roles.grant.technical_validator'),
    ('national_admin', 'roles.grant.technical_integration'),
    ('institution_editor', 'connectors.read'),
    ('institution_editor', 'connectors.create'),
    ('institution_editor', 'connectors.update'),
    ('institution_editor', 'connectors.delete'),
    ('institution_editor', 'connectors.run'),
    ('institution_editor', 'sources.read'),
    ('institution_editor', 'sources.create'),
    ('institution_editor', 'sources.update'),
    ('institution_editor', 'sources.delete'),
    ('institution_editor', 'projects.read'),
    ('institution_editor', 'projects.create'),
    ('institution_editor', 'projects.update'),
    ('institution_editor', 'projects.polygon.update'),
    ('institution_editor', 'imports.read'),
    ('institution_editor', 'imports.upload'),
    ('institution_editor', 'roles.grant.institution_editor'),
    ('technical_validator', 'validations.read'),
    ('technical_validator', 'validations.assign'),
    ('technical_validator', 'roles.grant.technical_validator'),
    ('read_consumer', 'projects.read'),
    ('read_consumer', 'publications.read'),
    ('read_consumer', 'incidents.read'),
    ('read_consumer', 'roles.grant.read_consumer'),
    ('technical_integration', 'connectors.read'),
    ('technical_integration', 'connectors.create'),
    ('technical_integration', 'connectors.update'),
    ('technical_integration', 'connectors.delete'),
    ('technical_integration', 'connectors.run'),
    ('technical_integration', 'sources.read'),
    ('technical_integration', 'sources.create'),
    ('technical_integration', 'sources.update'),
    ('technical_integration', 'sources.delete'),
    ('technical_integration', 'projects.read'),
    ('technical_integration', 'projects.create'),
    ('technical_integration', 'projects.update'),
    ('technical_integration', 'projects.polygon.update'),
    ('technical_integration', 'imports.read'),
    ('technical_integration', 'imports.upload'),
    ('technical_integration', 'roles.grant.technical_integration')
) AS grants(role_code, permission_code) ON grants.role_code = r.code
INNER JOIN core.permissions p ON p.code = grants.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.auth_token_bindings (
  token_code TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES core.users(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.auth_token_bindings (token_code, user_id, status)
VALUES
  ('superadmin', '11111111-1111-4111-8111-111111111111', 'active'),
  ('national_admin', '11111111-1111-4111-8111-111111111112', 'active'),
  ('institution_editor', 'b7a2bf36-251e-45c4-ac0c-f1c72ae5b6df', 'active'),
  ('technical_validator', '11111111-1111-4111-8111-111111111113', 'active'),
  ('read_consumer', '11111111-1111-4111-8111-111111111114', 'active'),
  ('technical_integration', '11111111-1111-4111-8111-111111111115', 'active')
ON CONFLICT (token_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES core.institutions(id),
  connector_id UUID REFERENCES core.connectors(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_ingested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.data_sources (
  id,
  institution_id,
  connector_id,
  code,
  name,
  source_type,
  status,
  config_json
)
VALUES (
  '372ff96a-1969-40a7-bafe-37a96875b1fc',
  '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
  'f2d8678f-bb0c-4e15-b8ca-135fd6053e16',
  'kobo-primary',
  'Kobo Primary Source',
  'kobo',
  'active',
  '{}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES core.institutions(id),
  source_id UUID NOT NULL REFERENCES core.data_sources(id),
  schema_code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES core.datasets(id),
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  submitted_by_user_id UUID REFERENCES core.users(id),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dataset_id, version_number)
);

CREATE TABLE IF NOT EXISTS core.validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id UUID NOT NULL REFERENCES core.dataset_versions(id),
  rule_code TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  assigned_to_user_id UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  schema_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES core.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  source TEXT NOT NULL,
  result TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.audit_events (
  id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  source,
  result,
  details_json
)
VALUES (
  '6b6814f6-f998-41a2-adfe-5921daf0f3e9',
  '222b8042-3399-4941-b96d-8b5e93d35347',
  'bootstrap.seeded',
  'institution',
  '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
  'system',
  'success',
  '{"seed": true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES core.datasets(id),
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES core.report_templates(id),
  publication_id UUID REFERENCES core.publications(id),
  status TEXT NOT NULL,
  output_url TEXT,
  created_by_user_id UUID REFERENCES core.users(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.export_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  dataset_id UUID REFERENCES core.datasets(id),
  report_run_id UUID REFERENCES core.report_runs(id),
  requested_by_user_id UUID REFERENCES core.users(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES core.datasets(id),
  institution_id UUID NOT NULL REFERENCES core.institutions(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  area_ha NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  current_value NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  parent_territory_id UUID REFERENCES core.territories(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.incidents (id, title, severity, status)
VALUES (
  '30ed8b87-584b-495d-a45d-716b05af9297',
  'Acumulado pendiente de validación',
  'medium',
  'open'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.validation_rules (id, code, schema_code, name, description, severity)
VALUES
  (
    'bf9755de-9eb8-4c53-aaf7-887dd2f17dd7',
    'required_title',
    'project',
    'Título requerido',
    'El payload del dataset debe incluir un título no vacío.',
    'error'
  ),
  (
    '97c8d4e2-05e5-4adb-a74d-dcf8920f4fd8',
    'payload_not_empty',
    'project',
    'Payload no vacío',
    'El payload del dataset debe contener al menos un campo.',
    'error'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.datasets (
  id,
  institution_id,
  source_id,
  schema_code,
  title,
  status
)
VALUES (
  '50466f73-e69c-4ec6-849a-86eb42604e3f',
  '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
  '372ff96a-1969-40a7-bafe-37a96875b1fc',
  'project',
  'National Restoration Baseline',
  'validated'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.dataset_versions (
  id,
  dataset_id,
  version_number,
  status,
  submitted_by_user_id,
  payload_json
)
VALUES (
  '71f587af-22aa-4067-afb0-0dfc92958df0',
  '50466f73-e69c-4ec6-849a-86eb42604e3f',
  1,
  'validated',
  '222b8042-3399-4941-b96d-8b5e93d35347',
  '{"title":"National Restoration Baseline","records":18}'::jsonb
)
ON CONFLICT (dataset_id, version_number) DO NOTHING;

INSERT INTO core.validation_results (
  id,
  dataset_version_id,
  rule_code,
  status,
  message,
  assigned_to_user_id
)
VALUES
  (
    '1ec2fa57-fc7c-4e65-b6d5-988ebddca2ce',
    '71f587af-22aa-4067-afb0-0dfc92958df0',
    'required_title',
    'passed',
    'Título principal validado.',
    '222b8042-3399-4941-b96d-8b5e93d35347'
  ),
  (
    '55f43858-f46b-49fe-bad8-01f65c45ecda',
    '71f587af-22aa-4067-afb0-0dfc92958df0',
    'payload_not_empty',
    'passed',
    'El payload contiene campos para validación.',
    '222b8042-3399-4941-b96d-8b5e93d35347'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.publications (id, dataset_id, target, status)
VALUES (
  '255338fc-2f25-46e5-8b55-79722b7d4f05',
  '50466f73-e69c-4ec6-849a-86eb42604e3f',
  'public_portal',
  'published'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.report_templates (
  id,
  code,
  name,
  target,
  description,
  status
)
VALUES
  (
    'd1d365bd-c8f0-4ef3-96f5-c8af8fd7d5a7',
    'national-summary',
    'Resumen nacional',
    'public_portal',
    'Resumen ejecutivo para el portal país.',
    'active'
  ),
  (
    '5070b75e-cfdf-4be9-91bd-38d1c06de499',
    'ferm-export',
    'FERM Export Package',
    'ferm',
    'Structured export package for FERM interoperability.',
    'active'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.report_runs (
  id,
  template_id,
  publication_id,
  status,
  output_url,
  created_by_user_id,
  started_at,
  finished_at
)
VALUES (
  '8d0c8b76-2905-4ef0-bbec-fb215b6c7d4e',
  'd1d365bd-c8f0-4ef3-96f5-c8af8fd7d5a7',
  '255338fc-2f25-46e5-8b55-79722b7d4f05',
  'completed',
  '/reports/national-summary-2026-04.pdf',
  '222b8042-3399-4941-b96d-8b5e93d35347',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '90 minutes'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.export_runs (
  id,
  target,
  status,
  dataset_id,
  report_run_id,
  requested_by_user_id,
  started_at,
  finished_at,
  details_json
)
VALUES (
  '619bc2e1-9ced-477b-9f4e-9f7bf48eefb4',
  'ferm',
  'completed',
  '50466f73-e69c-4ec6-849a-86eb42604e3f',
  '8d0c8b76-2905-4ef0-bbec-fb215b6c7d4e',
  '222b8042-3399-4941-b96d-8b5e93d35347',
  NOW() - INTERVAL '70 minutes',
  NOW() - INTERVAL '60 minutes',
  '{"records": 18, "target":"ferm"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.projects (
  id,
  dataset_id,
  institution_id,
  title,
  status,
  area_ha
)
VALUES
  (
    '2374a510-2684-453c-ad42-d57aa5bd524a',
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'Programa de restauración de manglares',
    'active',
    1280.50
  ),
  (
    '6db4c674-6662-4a2d-ac75-bd490ba56230',
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'Iniciativa de recuperación de cuencas',
    'published',
    3420.00
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.indicators (
  id,
  code,
  name,
  unit,
  category,
  current_value
)
VALUES
  (
    '1ac7d41f-3317-4b4f-9d80-b23407c5938c',
    'restored_area_ha',
    'Restored area',
    'ha',
    'restoration',
    48320.00
  ),
  (
    '9bbd20fe-f5ee-4e33-87d3-f97127944b65',
    'co2e_captured',
    'Estimated CO2e captured',
    'tCO2e',
    'climate',
    34900.00
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.territories (
  id,
  code,
  name,
  level,
  parent_territory_id,
  status
)
VALUES
  (
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'sv',
    'El Salvador',
    'country',
    NULL,
    'active'
  ),
  (
    '4f786af8-36f6-45bd-b0a4-732b87c49359',
    'sv-occidente',
    'Región Occidente',
    'region',
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'active'
  ),
  (
    '257c9d74-d4a1-4b5f-b61f-6a6367fb2c7f',
    'sv-centro',
    'Región Central',
    'region',
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'active'
  )
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS gis.geo_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  layer_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gis.territory_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID NOT NULL REFERENCES core.territories(id),
  layer_id UUID NOT NULL REFERENCES gis.geo_layers(id),
  area_ha NUMERIC(12,2),
  geometry geometry(Geometry, 4326) NOT NULL,
  properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gis.geo_layers (id, code, name, layer_type, visibility, status)
VALUES (
  'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
  'territories',
  'Capas públicas de El Salvador',
  'boundary',
  'public',
  'published'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO gis.territory_features (
  id,
  territory_id,
  layer_id,
  area_ha,
  geometry,
  properties_json
)
VALUES
  (
    'ecbfc481-f77c-4d1e-a7f7-cce3879a4aa2',
    '4f786af8-36f6-45bd-b0a4-732b87c49359',
    'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
    12840.00,
    ST_Multi(ST_GeomFromText('POLYGON((-90.10 14.45,-89.75 14.48,-89.35 14.40,-89.20 14.20,-89.28 13.98,-89.55 13.92,-89.92 14.02,-90.14 14.22,-90.10 14.45))', 4326)),
    '{"code":"sv-occidente","name":"Región Occidente","level":"region"}'::jsonb
  ),
  (
    '1547212d-62e8-4dab-a0cb-f1f14e82f072',
    '257c9d74-d4a1-4b5f-b61f-6a6367fb2c7f',
    'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
    11620.00,
    ST_Multi(ST_GeomFromText('POLYGON((-89.58 14.18,-89.22 14.28,-88.92 14.18,-88.78 13.98,-88.88 13.76,-89.10 13.68,-89.40 13.74,-89.62 13.92,-89.58 14.18))', 4326)),
    '{"code":"sv-centro","name":"Región Central","level":"region"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES core.institutions(id),
  connector_id UUID NOT NULL REFERENCES core.connectors(id),
  integration_job_id UUID,
  status TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'incremental',
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_json JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_connectors_institution_id
  ON core.connectors (institution_id);

CREATE INDEX IF NOT EXISTS idx_core_data_sources_institution_id
  ON core.data_sources (institution_id);

CREATE INDEX IF NOT EXISTS idx_core_data_sources_connector_id
  ON core.data_sources (connector_id);

CREATE INDEX IF NOT EXISTS idx_core_datasets_institution_id
  ON core.datasets (institution_id);

CREATE INDEX IF NOT EXISTS idx_core_datasets_source_id
  ON core.datasets (source_id);

CREATE INDEX IF NOT EXISTS idx_core_dataset_versions_dataset_id
  ON core.dataset_versions (dataset_id);

CREATE INDEX IF NOT EXISTS idx_core_validation_results_dataset_version_id
  ON core.validation_results (dataset_version_id);

CREATE INDEX IF NOT EXISTS idx_core_projects_institution_id
  ON core.projects (institution_id);

CREATE INDEX IF NOT EXISTS idx_core_indicators_code
  ON core.indicators (code);

CREATE INDEX IF NOT EXISTS idx_core_territories_parent_territory_id
  ON core.territories (parent_territory_id);

CREATE INDEX IF NOT EXISTS idx_core_report_runs_template_id
  ON core.report_runs (template_id);

CREATE INDEX IF NOT EXISTS idx_core_export_runs_target
  ON core.export_runs (target);

CREATE INDEX IF NOT EXISTS idx_gis_territory_features_territory_id
  ON gis.territory_features (territory_id);

CREATE INDEX IF NOT EXISTS idx_core_audit_events_actor_user_id
  ON core.audit_events (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_core_sync_jobs_institution_id
  ON core.sync_jobs (institution_id);

CREATE INDEX IF NOT EXISTS idx_core_sync_jobs_connector_id
  ON core.sync_jobs (connector_id);

CREATE TABLE IF NOT EXISTS integration.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  connector_id UUID NOT NULL,
  platform_sync_job_id UUID NOT NULL,
  connector_type TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  checkpoint_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_json JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration.raw_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  connector_id UUID NOT NULL,
  sync_job_id UUID NOT NULL REFERENCES integration.sync_jobs(id),
  source_record_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration.sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  connector_id UUID NOT NULL,
  sync_job_id UUID NOT NULL REFERENCES integration.sync_jobs(id),
  checkpoint_type TEXT NOT NULL,
  checkpoint_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration.transform_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  connector_id UUID NOT NULL,
  sync_job_id UUID NOT NULL REFERENCES integration.sync_jobs(id),
  source_record_key TEXT,
  failure_stage TEXT NOT NULL,
  error_json JSONB NOT NULL,
  raw_payload_id UUID REFERENCES integration.raw_payloads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_platform_sync_job_id
  ON integration.sync_jobs (platform_sync_job_id);

CREATE INDEX IF NOT EXISTS idx_integration_raw_payloads_sync_job_id
  ON integration.raw_payloads (sync_job_id);
