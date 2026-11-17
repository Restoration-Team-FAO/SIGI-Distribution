\set ON_ERROR_STOP on

-- Phase 5 demo seed: coherent institutional demo data for country + admin views.
-- Idempotent by design (UPSERTs over deterministic IDs/codes).

-- Institutions
INSERT INTO core.institutions (id, code, name, status)
VALUES
  ('8d5d4d5c-24b3-4b93-9c4e-c8be38d70431', 'min-health', 'Ministerio de Salud', 'active'),
  ('299f56d7-9f9e-4f07-8962-111111111001', 'marn', 'Ministerio de Medio Ambiente y Recursos Naturales (MARN)', 'active'),
  ('299f56d7-9f9e-4f07-8962-111111111002', 'fiaes', 'Fondo de Inversión Ambiental de El Salvador (FIAES)', 'active'),
  ('299f56d7-9f9e-4f07-8962-111111111003', 'deforest', 'Dirección General de Ordenamiento Forestal', 'active'),
  ('299f56d7-9f9e-4f07-8962-111111111004', 'obs-ambiental', 'Observatorio Ambiental MARN', 'active'),
  ('299f56d7-9f9e-4f07-8962-111111111005', 'mag', 'Ministerio de Agricultura y Ganadería (MAG)', 'active'),
  ('299f56d7-9f9e-4f07-8962-111111111006', 'anda', 'Administración Nacional de Acueductos y Alcantarillados (ANDA)', 'active')
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Connectors
INSERT INTO core.connectors (
  id,
  institution_id,
  connector_type,
  display_name,
  status,
  config_json,
  last_sync_at,
  updated_at
)
VALUES
  (
    'f2d8678f-bb0c-4e15-b8ca-135fd6053e16',
    '299f56d7-9f9e-4f07-8962-111111111001',
    'kobo',
    'Kobo Restauración Campo',
    'active',
    '{"workspace":"minae-restauracion","project":"campo-q2"}'::jsonb,
    NOW() - INTERVAL '4 hours',
    NOW()
  ),
  (
    '3bd88fa5-8a9a-4f5c-981e-222222220002',
    '299f56d7-9f9e-4f07-8962-111111111002',
    'postgis',
    'PostGIS Cobertura FIAES',
    'active',
    '{"schema":"fiaes_geo","layer":"restauracion_prioritaria"}'::jsonb,
    NOW() - INTERVAL '6 hours',
    NOW()
  ),
  (
    '3bd88fa5-8a9a-4f5c-981e-222222220003',
    '299f56d7-9f9e-4f07-8962-111111111003',
    'excel',
    'Excel Incentivos Forestales',
    'active',
    '{"template":"incentivos_forestales_q2.xlsx"}'::jsonb,
    NOW() - INTERVAL '9 hours',
    NOW()
  ),
  (
    '3bd88fa5-8a9a-4f5c-981e-222222220004',
    '299f56d7-9f9e-4f07-8962-111111111004',
    'api',
    'API Estaciones Climáticas MARN',
    'active',
    '{"endpoint":"/stations/daily","format":"json"}'::jsonb,
    NOW() - INTERVAL '2 hours',
    NOW()
  ),
  (
    '3bd88fa5-8a9a-4f5c-981e-222222220005',
    '299f56d7-9f9e-4f07-8962-111111111005',
    'odoo',
    'Odoo Cartera MAG El Salvador',
    'active',
    '{"module":"projects","syncWindow":"daily"}'::jsonb,
    NOW() - INTERVAL '11 hours',
    NOW()
  ),
  (
    '3bd88fa5-8a9a-4f5c-981e-222222220006',
    '299f56d7-9f9e-4f07-8962-111111111006',
    'api',
    'API Calidad de Agua ANDA',
    'active',
    '{"endpoint":"/water-quality/monthly","format":"json"}'::jsonb,
    NOW() - INTERVAL '5 hours',
    NOW()
  ),
  (
    '3bd88fa5-8a9a-4f5c-981e-222222220007',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    'excel',
    'Excel Alertas Salud Ambiental',
    'active',
    '{"template":"alertas_salud_ambiental_q2.xlsx"}'::jsonb,
    NOW() - INTERVAL '13 hours',
    NOW()
  )
ON CONFLICT (id) DO UPDATE
SET
  institution_id = EXCLUDED.institution_id,
  connector_type = EXCLUDED.connector_type,
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  config_json = EXCLUDED.config_json,
  last_sync_at = EXCLUDED.last_sync_at,
  updated_at = NOW();

-- Data sources
INSERT INTO core.data_sources (
  id,
  institution_id,
  connector_id,
  code,
  name,
  source_type,
  status,
  config_json,
  last_ingested_at,
  updated_at
)
VALUES
  (
    '372ff96a-1969-40a7-bafe-37a96875b1fc',
    '299f56d7-9f9e-4f07-8962-111111111001',
    'f2d8678f-bb0c-4e15-b8ca-135fd6053e16',
    'kobo-primary',
    'Formularios de restauración territorial',
    'kobo',
    'active',
    '{"owner":"marn","frequency":"weekly"}'::jsonb,
    NOW() - INTERVAL '4 hours',
    NOW()
  ),
  (
    '7d5b96d1-2f2c-43ac-8d8a-333333330002',
    '299f56d7-9f9e-4f07-8962-111111111002',
    '3bd88fa5-8a9a-4f5c-981e-222222220002',
    'postgis-restauracion-prioritaria',
    'Capas de restauración prioritaria y paisaje productivo',
    'postgis',
    'active',
    '{"layer":"restauracion_prioritaria","srid":4326}'::jsonb,
    NOW() - INTERVAL '7 hours',
    NOW()
  ),
  (
    '7d5b96d1-2f2c-43ac-8d8a-333333330003',
    '299f56d7-9f9e-4f07-8962-111111111003',
    '3bd88fa5-8a9a-4f5c-981e-222222220003',
    'excel-incentivos-forestales',
    'Incentivos forestales vigentes por territorio',
    'excel',
    'active',
    '{"sheet":"contratos_q2"}'::jsonb,
    NOW() - INTERVAL '10 hours',
    NOW()
  ),
  (
    '7d5b96d1-2f2c-43ac-8d8a-333333330004',
    '299f56d7-9f9e-4f07-8962-111111111004',
    '3bd88fa5-8a9a-4f5c-981e-222222220004',
    'api-estaciones-clima',
    'Series diarias de precipitación y temperatura',
    'api',
    'active',
    '{"provider":"marn","window":"daily"}'::jsonb,
    NOW() - INTERVAL '2 hours',
    NOW()
  ),
  (
    '7d5b96d1-2f2c-43ac-8d8a-333333330005',
    '299f56d7-9f9e-4f07-8962-111111111005',
    '3bd88fa5-8a9a-4f5c-981e-222222220005',
    'odoo-cartera-mag-sv',
    'Cartera presupuestaria de proyectos MAG El Salvador',
    'odoo',
    'active',
    '{"module":"project.project"}'::jsonb,
    NOW() - INTERVAL '12 hours',
    NOW()
  ),
  (
    '7d5b96d1-2f2c-43ac-8d8a-333333330006',
    '299f56d7-9f9e-4f07-8962-111111111006',
    '3bd88fa5-8a9a-4f5c-981e-222222220006',
    'api-calidad-agua',
    'Monitoreo mensual de calidad de agua',
    'api',
    'active',
    '{"provider":"anda","window":"monthly"}'::jsonb,
    NOW() - INTERVAL '5 hours',
    NOW()
  ),
  (
    '7d5b96d1-2f2c-43ac-8d8a-333333330007',
    '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431',
    '3bd88fa5-8a9a-4f5c-981e-222222220007',
    'excel-alertas-salud-ambiental',
    'Alertas de salud ambiental por territorio',
    'excel',
    'active',
    '{"sheet":"alertas_q2"}'::jsonb,
    NOW() - INTERVAL '14 hours',
    NOW()
  ),
  (
    '7d5b96d1-2f2c-43ac-8d8a-333333330008',
    '299f56d7-9f9e-4f07-8962-111111111001',
    'f2d8678f-bb0c-4e15-b8ca-135fd6053e16',
    'kobo-monitoreo-comunitario',
    'Monitoreo comunitario de restauración',
    'kobo',
    'active',
    '{"project":"comunitario-q2"}'::jsonb,
    NOW() - INTERVAL '8 hours',
    NOW()
  )
ON CONFLICT (code) DO UPDATE
SET
  institution_id = EXCLUDED.institution_id,
  connector_id = EXCLUDED.connector_id,
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  status = EXCLUDED.status,
  config_json = EXCLUDED.config_json,
  last_ingested_at = EXCLUDED.last_ingested_at,
  updated_at = NOW();

-- Roles required by the demo users below. This keeps the seed runnable on
-- existing volumes that predate the role bootstrap in 002_core_schema.sql.
INSERT INTO core.roles (id, code, name)
VALUES
  ('d712912f-37eb-45aa-94e7-17352f1eb17e', 'superadmin', 'Superadministrador SIGI'),
  ('0f750dac-c4db-4e34-8445-bbc3f2cdb3c5', 'national_admin', 'Administrador nacional'),
  ('d8972cbb-d540-4cfd-b2e8-c482406f5591', 'institution_editor', 'Editor institucional'),
  ('f55175e4-5825-4aec-bf4f-32392bc0d0e3', 'technical_validator', 'Validador técnico'),
  ('c9b31c7c-1981-4dd2-ac7c-83e9b413fa9f', 'read_consumer', 'Consumidor lectura'),
  ('83933660-d964-450d-8681-2a26589bcb79', 'technical_integration', 'Integración técnica')
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name;

-- Users
INSERT INTO core.users (id, institution_id, email, display_name, status, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', '299f56d7-9f9e-4f07-8962-111111111001', 'superadmin@sigi.local', 'Superadministrador SIGI', 'active', NOW()),
  ('11111111-1111-4111-8111-111111111112', '299f56d7-9f9e-4f07-8962-111111111001', 'national-admin@sigi.local', 'Coordinación Nacional SIGI', 'active', NOW()),
  ('222b8042-3399-4941-b96d-8b5e93d35347', '299f56d7-9f9e-4f07-8962-111111111001', 'admin@sigi.local', 'Paula Rojas', 'active', NOW()),
  ('b7a2bf36-251e-45c4-ac0c-f1c72ae5b6df', '299f56d7-9f9e-4f07-8962-111111111001', 'editor@sigi.local', 'Carlos Méndez', 'active', NOW()),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440003', '299f56d7-9f9e-4f07-8962-111111111001', 'validator.demo@sigi.local', 'Andrea Solano', 'active', NOW()),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440004', '299f56d7-9f9e-4f07-8962-111111111004', 'integration.demo@sigi.local', 'Luis Arce', 'active', NOW()),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440005', '299f56d7-9f9e-4f07-8962-111111111002', 'fiaes.editor@sigi.local', 'María Mora', 'active', NOW()),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440006', '299f56d7-9f9e-4f07-8962-111111111003', 'forestal.editor@sigi.local', 'Jorge Chaves', 'active', NOW()),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440007', '299f56d7-9f9e-4f07-8962-111111111005', 'mag.editor@sigi.local', 'Natalia Ramírez', 'active', NOW()),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440008', '299f56d7-9f9e-4f07-8962-111111111006', 'anda.editor@sigi.local', 'Daniela Quesada', 'active', NOW()),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440009', '299f56d7-9f9e-4f07-8962-111111111001', 'reader.demo@sigi.local', 'Ricardo Céspedes', 'active', NOW())
ON CONFLICT (email) DO UPDATE
SET
  institution_id = EXCLUDED.institution_id,
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  updated_at = NOW();

-- User role grants
INSERT INTO core.user_roles (user_id, role_id)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'd712912f-37eb-45aa-94e7-17352f1eb17e'),
  ('11111111-1111-4111-8111-111111111112', '0f750dac-c4db-4e34-8445-bbc3f2cdb3c5'),
  ('222b8042-3399-4941-b96d-8b5e93d35347', 'd712912f-37eb-45aa-94e7-17352f1eb17e'),
  ('222b8042-3399-4941-b96d-8b5e93d35347', '0f750dac-c4db-4e34-8445-bbc3f2cdb3c5'),
  ('b7a2bf36-251e-45c4-ac0c-f1c72ae5b6df', 'd8972cbb-d540-4cfd-b2e8-c482406f5591'),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440003', 'f55175e4-5825-4aec-bf4f-32392bc0d0e3'),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440004', '83933660-d964-450d-8681-2a26589bcb79'),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440005', 'd8972cbb-d540-4cfd-b2e8-c482406f5591'),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440006', 'd8972cbb-d540-4cfd-b2e8-c482406f5591'),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440007', 'd8972cbb-d540-4cfd-b2e8-c482406f5591'),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440008', 'd8972cbb-d540-4cfd-b2e8-c482406f5591'),
  ('4b9cc5ab-a911-4e6f-8f2d-444444440009', 'c9b31c7c-1981-4dd2-ac7c-83e9b413fa9f')
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO core.auth_token_bindings (token_code, user_id, status, updated_at)
VALUES
  ('superadmin', '11111111-1111-4111-8111-111111111111', 'active', NOW()),
  ('national_admin', '11111111-1111-4111-8111-111111111112', 'active', NOW()),
  ('institution_editor', 'b7a2bf36-251e-45c4-ac0c-f1c72ae5b6df', 'active', NOW()),
  ('technical_validator', '4b9cc5ab-a911-4e6f-8f2d-444444440003', 'active', NOW()),
  ('read_consumer', '4b9cc5ab-a911-4e6f-8f2d-444444440009', 'active', NOW()),
  ('technical_integration', '4b9cc5ab-a911-4e6f-8f2d-444444440004', 'active', NOW())
ON CONFLICT (token_code) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Datasets
INSERT INTO core.datasets (
  id,
  institution_id,
  source_id,
  schema_code,
  title,
  status,
  updated_at
)
VALUES
  (
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    '299f56d7-9f9e-4f07-8962-111111111001',
    '372ff96a-1969-40a7-bafe-37a96875b1fc',
    'project',
    'Corte Nacional de Restauración 2026-Q2',
    'validated',
    NOW()
  ),
  (
    '50466f73-e69c-4ec6-849a-86eb42604e40',
    '299f56d7-9f9e-4f07-8962-111111111002',
    '7d5b96d1-2f2c-43ac-8d8a-333333330002',
    'territory',
    'Cobertura FIAES y restauración prioritaria 2026-Q2',
    'validated',
    NOW()
  ),
  (
    '50466f73-e69c-4ec6-849a-86eb42604e41',
    '299f56d7-9f9e-4f07-8962-111111111003',
    '7d5b96d1-2f2c-43ac-8d8a-333333330003',
    'contract',
    'Incentivos forestales vigentes por territorio',
    'validated',
    NOW()
  ),
  (
    '50466f73-e69c-4ec6-849a-86eb42604e42',
    '299f56d7-9f9e-4f07-8962-111111111004',
    '7d5b96d1-2f2c-43ac-8d8a-333333330004',
    'climate',
    'Serie climática para seguimiento territorial',
    'validated',
    NOW()
  )
ON CONFLICT (id) DO UPDATE
SET
  institution_id = EXCLUDED.institution_id,
  source_id = EXCLUDED.source_id,
  schema_code = EXCLUDED.schema_code,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Dataset versions
INSERT INTO core.dataset_versions (
  id,
  dataset_id,
  version_number,
  status,
  submitted_by_user_id,
  payload_json,
  submitted_at,
  updated_at
)
VALUES
  (
    '71f587af-22aa-4067-afb0-0dfc92958df0',
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    1,
    'validated',
    '222b8042-3399-4941-b96d-8b5e93d35347',
    '{"title":"Corte Nacional de Restauración 2026-Q2","records":248}'::jsonb,
    NOW() - INTERVAL '3 days',
    NOW()
  ),
  (
    '71f587af-22aa-4067-afb0-0dfc92958e40',
    '50466f73-e69c-4ec6-849a-86eb42604e40',
    1,
    'validated',
    '4b9cc5ab-a911-4e6f-8f2d-444444440005',
    '{"title":"Cobertura FIAES y restauración prioritaria 2026-Q2","records":96}'::jsonb,
    NOW() - INTERVAL '2 days',
    NOW()
  ),
  (
    '71f587af-22aa-4067-afb0-0dfc92958e41',
    '50466f73-e69c-4ec6-849a-86eb42604e41',
    1,
    'validated',
    '4b9cc5ab-a911-4e6f-8f2d-444444440006',
    '{"title":"Incentivos forestales vigentes por territorio","records":134}'::jsonb,
    NOW() - INTERVAL '2 days',
    NOW()
  ),
  (
    '71f587af-22aa-4067-afb0-0dfc92958e42',
    '50466f73-e69c-4ec6-849a-86eb42604e42',
    1,
    'validated',
    '4b9cc5ab-a911-4e6f-8f2d-444444440004',
    '{"title":"Serie climática para seguimiento territorial","records":365}'::jsonb,
    NOW() - INTERVAL '1 day',
    NOW()
  )
ON CONFLICT (dataset_id, version_number) DO UPDATE
SET
  status = EXCLUDED.status,
  submitted_by_user_id = EXCLUDED.submitted_by_user_id,
  payload_json = EXCLUDED.payload_json,
  submitted_at = EXCLUDED.submitted_at,
  updated_at = NOW();

-- Validation rules
INSERT INTO core.validation_rules (id, code, schema_code, name, description, severity, active, updated_at)
VALUES
  (
    'bf9755de-9eb8-4c53-aaf7-887dd2f17dd7',
    'required_title',
    'project',
    'Required title',
    'El payload debe incluir un título no vacío.',
    'error',
    TRUE,
    NOW()
  ),
  (
    '97c8d4e2-05e5-4adb-a74d-dcf8920f4fd8',
    'payload_not_empty',
    'project',
    'Payload not empty',
    'El payload debe incluir al menos un campo.',
    'error',
    TRUE,
    NOW()
  ),
  (
    'f6e3cc03-95f0-4577-a6f3-555555550001',
    'territory_code_valid',
    'territory',
    'Territory code is valid',
    'Cada registro debe mapearse a un código territorial canónico.',
    'warning',
    TRUE,
    NOW()
  ),
  (
    'f6e3cc03-95f0-4577-a6f3-555555550002',
    'area_positive',
    'project',
    'Area must be positive',
    'El área reportada debe ser mayor a cero.',
    'error',
    TRUE,
    NOW()
  )
ON CONFLICT (code) DO UPDATE
SET
  schema_code = EXCLUDED.schema_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  severity = EXCLUDED.severity,
  active = EXCLUDED.active,
  updated_at = NOW();

-- Validation results (8 passed, 1 warning, 1 failed => quality 80%)
INSERT INTO core.validation_results (
  id,
  dataset_version_id,
  rule_code,
  status,
  message,
  assigned_to_user_id,
  created_at,
  updated_at
)
VALUES
  (
    '1ec2fa57-fc7c-4e65-b6d5-988ebddca2ce',
    '71f587af-22aa-4067-afb0-0dfc92958df0',
    'required_title',
    'passed',
    'Título principal validado.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '30 hours',
    NOW() - INTERVAL '24 hours'
  ),
  (
    '55f43858-f46b-49fe-bad8-01f65c45ecda',
    '71f587af-22aa-4067-afb0-0dfc92958df0',
    'payload_not_empty',
    'passed',
    'Carga con campos obligatorios completos.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '30 hours',
    NOW() - INTERVAL '24 hours'
  ),
  (
    '8ee8fd2a-6fef-4cf9-8da6-666666660001',
    '71f587af-22aa-4067-afb0-0dfc92958df0',
    'area_positive',
    'passed',
    'Todas las áreas son positivas.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '29 hours',
    NOW() - INTERVAL '23 hours'
  ),
  (
    '8ee8fd2a-6fef-4cf9-8da6-666666660002',
    '71f587af-22aa-4067-afb0-0dfc92958e40',
    'required_title',
    'passed',
    'Título FIAES válido para publicación.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '26 hours',
    NOW() - INTERVAL '22 hours'
  ),
  (
    '8ee8fd2a-6fef-4cf9-8da6-666666660003',
    '71f587af-22aa-4067-afb0-0dfc92958e40',
    'territory_code_valid',
    'warning',
    '3 registros requieren homologación territorial.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '26 hours',
    NOW() - INTERVAL '21 hours'
  ),
  (
    '8ee8fd2a-6fef-4cf9-8da6-666666660004',
    '71f587af-22aa-4067-afb0-0dfc92958e41',
    'required_title',
    'passed',
    'Título de incentivos forestales validado.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '22 hours',
    NOW() - INTERVAL '19 hours'
  ),
  (
    '8ee8fd2a-6fef-4cf9-8da6-666666660005',
    '71f587af-22aa-4067-afb0-0dfc92958e41',
    'payload_not_empty',
    'failed',
    'Falta detalle de metadatos en 1 lote de incentivos.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '22 hours',
    NOW() - INTERVAL '18 hours'
  ),
  (
    '8ee8fd2a-6fef-4cf9-8da6-666666660006',
    '71f587af-22aa-4067-afb0-0dfc92958e42',
    'required_title',
    'passed',
    'Título de serie climática válido.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '18 hours',
    NOW() - INTERVAL '16 hours'
  ),
  (
    '8ee8fd2a-6fef-4cf9-8da6-666666660007',
    '71f587af-22aa-4067-afb0-0dfc92958e42',
    'payload_not_empty',
    'passed',
    'Serie climática con estructura completa.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '18 hours',
    NOW() - INTERVAL '16 hours'
  ),
  (
    '8ee8fd2a-6fef-4cf9-8da6-666666660008',
    '71f587af-22aa-4067-afb0-0dfc92958e42',
    'territory_code_valid',
    'passed',
    'Todos los registros climáticos mapeados al catálogo territorial.',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '17 hours',
    NOW() - INTERVAL '15 hours'
  )
ON CONFLICT (id) DO UPDATE
SET
  dataset_version_id = EXCLUDED.dataset_version_id,
  rule_code = EXCLUDED.rule_code,
  status = EXCLUDED.status,
  message = EXCLUDED.message,
  assigned_to_user_id = EXCLUDED.assigned_to_user_id,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

-- Projects (8)
INSERT INTO core.projects (
  id,
  dataset_id,
  institution_id,
  title,
  status,
  area_ha,
  created_at,
  updated_at
)
VALUES
  (
    '2374a510-2684-453c-ad42-d57aa5bd524a',
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    '299f56d7-9f9e-4f07-8962-111111111001',
    'Restauración de manglares en Bahía de Jiquilisco',
    'active',
    1850.50,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    '6db4c674-6662-4a2d-ac75-bd490ba56230',
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    '299f56d7-9f9e-4f07-8962-111111111001',
    'Corredor biológico Apaneca-Ilamatepec',
    'active',
    2640.00,
    NOW() - INTERVAL '19 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    '8b40ea8e-46f4-4be1-9550-777777770001',
    '50466f73-e69c-4ec6-849a-86eb42604e40',
    '299f56d7-9f9e-4f07-8962-111111111002',
    'Recuperación de microcuencas del Alto Lempa',
    'published',
    3120.00,
    NOW() - INTERVAL '18 days',
    NOW() - INTERVAL '1 day'
  ),
  (
    '8b40ea8e-46f4-4be1-9550-777777770002',
    '50466f73-e69c-4ec6-849a-86eb42604e41',
    '299f56d7-9f9e-4f07-8962-111111111003',
    'Incentivos forestales en la cordillera del Bálsamo',
    'published',
    1980.00,
    NOW() - INTERVAL '17 days',
    NOW() - INTERVAL '1 day'
  ),
  (
    '8b40ea8e-46f4-4be1-9550-777777770003',
    '50466f73-e69c-4ec6-849a-86eb42604e41',
    '299f56d7-9f9e-4f07-8962-111111111005',
    'Reforestación productiva en Chalatenango',
    'active',
    1450.00,
    NOW() - INTERVAL '16 days',
    NOW() - INTERVAL '8 hours'
  ),
  (
    '8b40ea8e-46f4-4be1-9550-777777770004',
    '50466f73-e69c-4ec6-849a-86eb42604e42',
    '299f56d7-9f9e-4f07-8962-111111111006',
    'Protección de nacimientos en el AMSS',
    'completed',
    620.00,
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '10 hours'
  ),
  (
    '8b40ea8e-46f4-4be1-9550-777777770005',
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    '299f56d7-9f9e-4f07-8962-111111111001',
    'Control de incendios forestales en Morazán',
    'active',
    890.00,
    NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '7 hours'
  ),
  (
    '8b40ea8e-46f4-4be1-9550-777777770006',
    '50466f73-e69c-4ec6-849a-86eb42604e40',
    '299f56d7-9f9e-4f07-8962-111111111002',
    'Restauración de bosque seco en el Bajo Lempa',
    'completed',
    1110.00,
    NOW() - INTERVAL '13 days',
    NOW() - INTERVAL '6 hours'
  )
ON CONFLICT (id) DO UPDATE
SET
  dataset_id = EXCLUDED.dataset_id,
  institution_id = EXCLUDED.institution_id,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  area_ha = EXCLUDED.area_ha,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

-- Indicators
INSERT INTO core.indicators (
  id,
  code,
  name,
  unit,
  category,
  current_value,
  updated_at
)
VALUES
  (
    '1ac7d41f-3317-4b4f-9d80-b23407c5938c',
    'restored_area_ha',
    'Área restaurada reportada',
    'ha',
    'restoration',
    13660.50,
    NOW()
  ),
  (
    '9bbd20fe-f5ee-4e33-87d3-f97127944b65',
    'co2e_captured',
    'CO2e estimado capturado',
    'tCO2e',
    'climate',
    84500.00,
    NOW()
  ),
  (
    'c451de86-e995-44ef-87e7-888888880001',
    'active_projects_count',
    'Proyectos activos en ejecución',
    'proyectos',
    'governance',
    4.00,
    NOW()
  ),
  (
    'c451de86-e995-44ef-87e7-888888880002',
    'watersheds_monitored_pct',
    'Cuencas con monitoreo activo',
    '%',
    'water',
    68.00,
    NOW()
  ),
  (
    'c451de86-e995-44ef-87e7-888888880003',
    'households_benefited',
    'Hogares beneficiados',
    'hogares',
    'social',
    12450.00,
    NOW()
  ),
  (
    'c451de86-e995-44ef-87e7-888888880004',
    'qaqc_pass_rate',
    'Cumplimiento QA/QC',
    '%',
    'quality',
    80.00,
    NOW()
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  unit = EXCLUDED.unit,
  category = EXCLUDED.category,
  current_value = EXCLUDED.current_value,
  updated_at = NOW();

-- Territories
INSERT INTO core.territories (
  id,
  code,
  name,
  level,
  parent_territory_id,
  status,
  updated_at
)
VALUES
  (
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'sv',
    'El Salvador',
    'country',
    NULL,
    'active',
    NOW()
  ),
  (
    '4f786af8-36f6-45bd-b0a4-732b87c49359',
    'sv-occidente',
    'Región Occidente',
    'region',
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'active',
    NOW()
  ),
  (
    '257c9d74-d4a1-4b5f-b61f-6a6367fb2c7f',
    'sv-centro',
    'Región Central',
    'region',
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'active',
    NOW()
  ),
  (
    '20f6f6d9-6d7e-4cc0-81f5-999999990003',
    'sv-paracentral',
    'Región Paracentral',
    'region',
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'active',
    NOW()
  ),
  (
    '20f6f6d9-6d7e-4cc0-81f5-999999990004',
    'sv-oriente',
    'Región Oriente',
    'region',
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'active',
    NOW()
  ),
  (
    '20f6f6d9-6d7e-4cc0-81f5-999999990005',
    'sv-costera',
    'Franja Costero-Marina',
    'region',
    'f35f29fa-86bd-4f41-b09e-cd20ca99f63d',
    'active',
    NOW()
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  parent_territory_id = EXCLUDED.parent_territory_id,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Geo layer
INSERT INTO gis.geo_layers (id, code, name, layer_type, visibility, status, updated_at)
VALUES
  (
    'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
    'territories',
    'Capas públicas de El Salvador',
    'boundary',
    'public',
    'published',
    NOW()
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  layer_type = EXCLUDED.layer_type,
  visibility = EXCLUDED.visibility,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Territory features (5 macroregiones El Salvador)
INSERT INTO gis.territory_features (
  id,
  territory_id,
  layer_id,
  area_ha,
  geometry,
  properties_json,
  updated_at
)
VALUES
  (
    'ecbfc481-f77c-4d1e-a7f7-cce3879a4aa2',
    '4f786af8-36f6-45bd-b0a4-732b87c49359',
    'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
    12840.00,
    ST_Multi(ST_GeomFromText('POLYGON((-90.10 14.45,-89.75 14.48,-89.35 14.40,-89.20 14.20,-89.28 13.98,-89.55 13.92,-89.92 14.02,-90.14 14.22,-90.10 14.45))', 4326)),
    '{"code":"sv-occidente","name":"Región Occidente","level":"region"}'::jsonb,
    NOW()
  ),
  (
    '1547212d-62e8-4dab-a0cb-f1f14e82f072',
    '257c9d74-d4a1-4b5f-b61f-6a6367fb2c7f',
    'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
    11620.00,
    ST_Multi(ST_GeomFromText('POLYGON((-89.58 14.18,-89.22 14.28,-88.92 14.18,-88.78 13.98,-88.88 13.76,-89.10 13.68,-89.40 13.74,-89.62 13.92,-89.58 14.18))', 4326)),
    '{"code":"sv-centro","name":"Región Central","level":"region"}'::jsonb,
    NOW()
  ),
  (
    '9b5b8c92-cb73-4ca8-8a44-101010100003',
    '20f6f6d9-6d7e-4cc0-81f5-999999990003',
    'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
    9780.00,
    ST_Multi(ST_GeomFromText('POLYGON((-89.28 13.88,-88.98 13.98,-88.72 13.90,-88.62 13.68,-88.74 13.46,-88.96 13.38,-89.20 13.46,-89.34 13.66,-89.28 13.88))', 4326)),
    '{"code":"sv-paracentral","name":"Región Paracentral","level":"region"}'::jsonb,
    NOW()
  ),
  (
    '9b5b8c92-cb73-4ca8-8a44-101010100004',
    '20f6f6d9-6d7e-4cc0-81f5-999999990004',
    'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
    15110.00,
    ST_Multi(ST_GeomFromText('POLYGON((-88.98 14.08,-88.62 14.12,-88.18 14.06,-87.88 13.92,-87.82 13.58,-88.00 13.36,-88.34 13.32,-88.72 13.48,-89.00 13.72,-88.98 14.08))', 4326)),
    '{"code":"sv-oriente","name":"Región Oriente","level":"region"}'::jsonb,
    NOW()
  ),
  (
    '9b5b8c92-cb73-4ca8-8a44-101010100005',
    '20f6f6d9-6d7e-4cc0-81f5-999999990005',
    'ea0f06b8-cad1-468c-baa4-5d3a9f863b12',
    8420.00,
    ST_Multi(ST_GeomFromText('POLYGON((-89.88 13.72,-89.42 13.78,-88.96 13.74,-88.46 13.54,-88.12 13.24,-88.20 13.04,-88.62 12.98,-89.10 13.06,-89.58 13.20,-89.92 13.42,-89.88 13.72))', 4326)),
    '{"code":"sv-costera","name":"Franja Costero-Marina","level":"region"}'::jsonb,
    NOW()
  )
ON CONFLICT (id) DO UPDATE
SET
  territory_id = EXCLUDED.territory_id,
  layer_id = EXCLUDED.layer_id,
  area_ha = EXCLUDED.area_ha,
  geometry = EXCLUDED.geometry,
  properties_json = EXCLUDED.properties_json,
  updated_at = NOW();

-- Incidents (4)
INSERT INTO core.incidents (id, title, severity, status, created_at, updated_at)
VALUES
  (
    '30ed8b87-584b-495d-a45d-716b05af9297',
    'Retraso de carga Kobo en Región Oriente',
    'medium',
    'open',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '6 hours'
  ),
  (
    '30ed8b87-584b-495d-a45d-716b05af9298',
    'Inconsistencia de área en incentivos forestales Q2',
    'high',
    'in_progress',
    NOW() - INTERVAL '36 hours',
    NOW() - INTERVAL '4 hours'
  ),
  (
    '30ed8b87-584b-495d-a45d-716b05af9299',
    'Falla temporal en API de estaciones MARN',
    'medium',
    'resolved',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '20 hours'
  ),
  (
    '30ed8b87-584b-495d-a45d-716b05af9300',
    'Registro sin código territorial en lote MARN',
    'low',
    'resolved',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '2 days'
  )
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  severity = EXCLUDED.severity,
  status = EXCLUDED.status,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

-- Publications
INSERT INTO core.publications (id, dataset_id, target, status, created_at, updated_at)
VALUES
  (
    '255338fc-2f25-46e5-8b55-79722b7d4f05',
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    'public_portal',
    'published',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '12 hours'
  ),
  (
    '255338fc-2f25-46e5-8b55-79722b7d4f06',
    '50466f73-e69c-4ec6-849a-86eb42604e40',
    'geo_bi',
    'published',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '16 hours'
  ),
  (
    '255338fc-2f25-46e5-8b55-79722b7d4f07',
    '50466f73-e69c-4ec6-849a-86eb42604e41',
    'boletin_nacional',
    'queued',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '3 hours'
  )
ON CONFLICT (id) DO UPDATE
SET
  dataset_id = EXCLUDED.dataset_id,
  target = EXCLUDED.target,
  status = EXCLUDED.status,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

-- Report templates
INSERT INTO core.report_templates (
  id,
  code,
  name,
  target,
  description,
  status,
  updated_at
)
VALUES
  (
    'd1d365bd-c8f0-4ef3-96f5-c8af8fd7d5a7',
    'national-summary',
    'Resumen Ejecutivo País',
    'public_portal',
    'Informe ejecutivo nacional para presentación institucional.',
    'active',
    NOW()
  ),
  (
    '5070b75e-cfdf-4be9-91bd-38d1c06de499',
    'ferm-export',
    'Paquete de Exportación FERM',
    'ferm',
    'Paquete estructurado para interoperabilidad internacional FERM.',
    'active',
    NOW()
  ),
  (
    'ccc1b8b3-2f11-4f16-9f36-444444440003',
    'quality-bulletin',
    'Boletín de Calidad y Trazabilidad',
    'boletin_nacional',
    'Boletín técnico para validación, incidencias y trazabilidad.',
    'active',
    NOW()
  ),
  (
    'ccc1b8b3-2f11-4f16-9f36-444444440004',
    'portfolio-quarterly',
    'Cartera Trimestral de Proyectos',
    'public_portal',
    'Cartera de proyectos con cobertura, estado y avance trimestral.',
    'active',
    NOW()
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  target = EXCLUDED.target,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Report runs
INSERT INTO core.report_runs (
  id,
  template_id,
  publication_id,
  status,
  output_url,
  created_by_user_id,
  started_at,
  finished_at,
  created_at,
  updated_at
)
VALUES
  (
    '8d0c8b76-2905-4ef0-bbec-fb215b6c7d4e',
    'd1d365bd-c8f0-4ef3-96f5-c8af8fd7d5a7',
    '255338fc-2f25-46e5-8b55-79722b7d4f05',
    'completed',
    '/reports/resumen-ejecutivo-pais-2026-q2.pdf',
    '222b8042-3399-4941-b96d-8b5e93d35347',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '4 hours'
  ),
  (
    '8d0c8b76-2905-4ef0-bbec-fb215b6c7d4f',
    '5070b75e-cfdf-4be9-91bd-38d1c06de499',
    NULL,
    'completed',
    '/exports/ferm/sigi-ferm-package-2026-q2.zip',
    '4b9cc5ab-a911-4e6f-8f2d-444444440004',
    NOW() - INTERVAL '7 hours',
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '7 hours',
    NOW() - INTERVAL '6 hours'
  ),
  (
    '8d0c8b76-2905-4ef0-bbec-fb215b6c7d50',
    'ccc1b8b3-2f11-4f16-9f36-444444440003',
    '255338fc-2f25-46e5-8b55-79722b7d4f07',
    'running',
    NULL,
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    NOW() - INTERVAL '2 hours',
    NULL,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hours'
  ),
  (
    '8d0c8b76-2905-4ef0-bbec-fb215b6c7d51',
    'ccc1b8b3-2f11-4f16-9f36-444444440004',
    '255338fc-2f25-46e5-8b55-79722b7d4f05',
    'completed',
    '/reports/cartera-trimestral-2026-q2.pdf',
    'b7a2bf36-251e-45c4-ac0c-f1c72ae5b6df',
    NOW() - INTERVAL '9 hours',
    NOW() - INTERVAL '8 hours',
    NOW() - INTERVAL '9 hours',
    NOW() - INTERVAL '8 hours'
  )
ON CONFLICT (id) DO UPDATE
SET
  template_id = EXCLUDED.template_id,
  publication_id = EXCLUDED.publication_id,
  status = EXCLUDED.status,
  output_url = EXCLUDED.output_url,
  created_by_user_id = EXCLUDED.created_by_user_id,
  started_at = EXCLUDED.started_at,
  finished_at = EXCLUDED.finished_at,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

-- Export runs
INSERT INTO core.export_runs (
  id,
  target,
  status,
  dataset_id,
  report_run_id,
  requested_by_user_id,
  started_at,
  finished_at,
  details_json,
  created_at,
  updated_at
)
VALUES
  (
    '619bc2e1-9ced-477b-9f4e-9f7bf48eefb4',
    'ferm',
    'completed',
    '50466f73-e69c-4ec6-849a-86eb42604e3f',
    '8d0c8b76-2905-4ef0-bbec-fb215b6c7d4f',
    '4b9cc5ab-a911-4e6f-8f2d-444444440004',
    NOW() - INTERVAL '7 hours',
    NOW() - INTERVAL '6 hours',
    '{"records":248,"target":"ferm","version":"2026-q2"}'::jsonb,
    NOW() - INTERVAL '7 hours',
    NOW() - INTERVAL '6 hours'
  ),
  (
    '619bc2e1-9ced-477b-9f4e-9f7bf48eefb5',
    'unff',
    'queued',
    '50466f73-e69c-4ec6-849a-86eb42604e41',
    NULL,
    '4b9cc5ab-a911-4e6f-8f2d-444444440004',
    NOW() - INTERVAL '90 minutes',
    NULL,
    '{"records":134,"target":"unff","window":"2026-q2"}'::jsonb,
    NOW() - INTERVAL '90 minutes',
    NOW() - INTERVAL '90 minutes'
  ),
  (
    '619bc2e1-9ced-477b-9f4e-9f7bf48eefb6',
    'geo_bi',
    'completed',
    '50466f73-e69c-4ec6-849a-86eb42604e40',
    NULL,
    '222b8042-3399-4941-b96d-8b5e93d35347',
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '11 hours',
    '{"features":5,"target":"geo_bi","layer":"territories"}'::jsonb,
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '11 hours'
  )
ON CONFLICT (id) DO UPDATE
SET
  target = EXCLUDED.target,
  status = EXCLUDED.status,
  dataset_id = EXCLUDED.dataset_id,
  report_run_id = EXCLUDED.report_run_id,
  requested_by_user_id = EXCLUDED.requested_by_user_id,
  started_at = EXCLUDED.started_at,
  finished_at = EXCLUDED.finished_at,
  details_json = EXCLUDED.details_json,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

-- Audit events
INSERT INTO core.audit_events (
  id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  source,
  result,
  details_json,
  created_at
)
VALUES
  (
    '6b6814f6-f998-41a2-adfe-5921daf0f3e9',
    '222b8042-3399-4941-b96d-8b5e93d35347',
    'demo.seeded',
    'platform',
    NULL,
    'system',
    'success',
    '{"phase":"phase-5","scope":"country-admin-demo"}'::jsonb,
    NOW() - INTERVAL '12 hours'
  ),
  (
    '6b6814f6-f998-41a2-adfe-5921daf0f3ea',
    '4b9cc5ab-a911-4e6f-8f2d-444444440004',
    'connector.sync',
    'connector',
    '3bd88fa5-8a9a-4f5c-981e-222222220004',
    'api',
    'success',
    '{"records":365,"connector":"imn-climate"}'::jsonb,
    NOW() - INTERVAL '8 hours'
  ),
  (
    '6b6814f6-f998-41a2-adfe-5921daf0f3eb',
    '4b9cc5ab-a911-4e6f-8f2d-444444440003',
    'validation.review',
    'validation_result',
    '8ee8fd2a-6fef-4cf9-8da6-666666660005',
    'admin',
    'warning',
    '{"status":"failed","ruleCode":"payload_not_empty"}'::jsonb,
    NOW() - INTERVAL '6 hours'
  ),
  (
    '6b6814f6-f998-41a2-adfe-5921daf0f3ec',
    '222b8042-3399-4941-b96d-8b5e93d35347',
    'publication.promoted',
    'publication',
    '255338fc-2f25-46e5-8b55-79722b7d4f05',
    'admin',
    'success',
    '{"target":"public_portal"}'::jsonb,
    NOW() - INTERVAL '5 hours'
  ),
  (
    '6b6814f6-f998-41a2-adfe-5921daf0f3ed',
    '4b9cc5ab-a911-4e6f-8f2d-444444440004',
    'export.run',
    'export_run',
    '619bc2e1-9ced-477b-9f4e-9f7bf48eefb4',
    'bridge',
    'success',
    '{"target":"ferm","status":"completed"}'::jsonb,
    NOW() - INTERVAL '4 hours'
  )
ON CONFLICT (id) DO UPDATE
SET
  actor_user_id = EXCLUDED.actor_user_id,
  action = EXCLUDED.action,
  entity_type = EXCLUDED.entity_type,
  entity_id = EXCLUDED.entity_id,
  source = EXCLUDED.source,
  result = EXCLUDED.result,
  details_json = EXCLUDED.details_json,
  created_at = EXCLUDED.created_at;

INSERT INTO core.egi_spaces (
  id,
  institution_id,
  code,
  name,
  description,
  responsible,
  territorial_scope,
  thematic_scope,
  visibility,
  status,
  created_by,
  updated_by
)
VALUES
  (
    '7d15c665-eaf6-4cb2-b3d8-90f4e42f0001',
    '299f56d7-9f9e-4f07-8962-111111111001',
    'EGI-MARN-OCC',
    'Restauración MARN Occidente',
    'Espacio operativo para fuentes, cargas, capas y documentos del frente occidental.',
    'Coordinación MARN Occidente',
    'Región Occidente',
    'Restauración, cobertura y monitoreo',
    'institutional',
    'active',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    '7d15c665-eaf6-4cb2-b3d8-90f4e42f0002',
    '299f56d7-9f9e-4f07-8962-111111111002',
    'EGI-FIAES-COSTA',
    'FIAES Costero Marina',
    'Espacio de gestión para restauración costero-marina y documentación asociada.',
    'Mesa FIAES Costera',
    'Franja Costero-Marina',
    'Manglares, cuencas y biodiversidad',
    'institutional',
    'active',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    '7d15c665-eaf6-4cb2-b3d8-90f4e42f0003',
    '299f56d7-9f9e-4f07-8962-111111111001',
    'EGI-LEGACY',
    'Información histórica SIGI',
    'Contenedor transitorio para registros previos a la adopción total de EGI.',
    'Administración SIGI',
    'Cobertura nacional',
    'Histórico y continuidad operativa',
    'institutional',
    'active',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.egi_memberships (egi_id, user_id, role_code, membership_status, permissions_json)
VALUES
  ('7d15c665-eaf6-4cb2-b3d8-90f4e42f0001', '11111111-1111-4111-8111-111111111111', 'egi_owner', 'active', '["egi.read","egi.select","egi.update","egi.memberships.manage","egi.summary.read"]'::jsonb),
  ('7d15c665-eaf6-4cb2-b3d8-90f4e42f0001', '11111111-1111-4111-8111-111111111112', 'egi_admin', 'active', '["egi.read","egi.select","egi.update","egi.memberships.manage","egi.summary.read"]'::jsonb),
  ('7d15c665-eaf6-4cb2-b3d8-90f4e42f0001', '11111111-1111-4111-8111-111111111113', 'egi_validator', 'active', '["egi.read","egi.select","egi.summary.read"]'::jsonb),
  ('7d15c665-eaf6-4cb2-b3d8-90f4e42f0001', '11111111-1111-4111-8111-111111111115', 'egi_editor', 'active', '["egi.read","egi.select","egi.summary.read"]'::jsonb),
  ('7d15c665-eaf6-4cb2-b3d8-90f4e42f0002', '11111111-1111-4111-8111-111111111111', 'egi_owner', 'active', '["egi.read","egi.select","egi.update","egi.memberships.manage","egi.summary.read"]'::jsonb),
  ('7d15c665-eaf6-4cb2-b3d8-90f4e42f0002', '11111111-1111-4111-8111-111111111114', 'egi_viewer', 'active', '["egi.read","egi.select","egi.summary.read"]'::jsonb),
  ('7d15c665-eaf6-4cb2-b3d8-90f4e42f0003', '11111111-1111-4111-8111-111111111111', 'egi_owner', 'active', '["egi.read","egi.select","egi.update","egi.memberships.manage","egi.summary.read"]'::jsonb)
ON CONFLICT (egi_id, user_id) DO NOTHING;

INSERT INTO core.user_preferences (user_id, active_egi_id, preferences_json, last_egi_selected_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', '7d15c665-eaf6-4cb2-b3d8-90f4e42f0001', '{"workspace":"egi"}'::jsonb, NOW()),
  ('11111111-1111-4111-8111-111111111112', '7d15c665-eaf6-4cb2-b3d8-90f4e42f0001', '{"workspace":"egi"}'::jsonb, NOW()),
  ('11111111-1111-4111-8111-111111111113', '7d15c665-eaf6-4cb2-b3d8-90f4e42f0001', '{"workspace":"egi"}'::jsonb, NOW())
ON CONFLICT (user_id) DO NOTHING;

UPDATE core.data_sources
SET egi_id = '7d15c665-eaf6-4cb2-b3d8-90f4e42f0001'::uuid
WHERE egi_id IS NULL;

UPDATE core.datasets
SET egi_id = '7d15c665-eaf6-4cb2-b3d8-90f4e42f0001'::uuid
WHERE egi_id IS NULL;

UPDATE core.projects
SET egi_id = '7d15c665-eaf6-4cb2-b3d8-90f4e42f0001'::uuid
WHERE egi_id IS NULL;

UPDATE integration.import_batches
SET egi_id = '7d15c665-eaf6-4cb2-b3d8-90f4e42f0001'::uuid
WHERE egi_id IS NULL;
