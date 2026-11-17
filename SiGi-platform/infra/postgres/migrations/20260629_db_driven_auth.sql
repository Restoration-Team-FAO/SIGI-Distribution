-- Migrate bearer auth to a database-driven identity/role model.
-- Raw bearer secrets still come from env, but token binding and effective roles
-- are now resolved through core.auth_token_bindings + core.users + core.user_roles.

CREATE TABLE IF NOT EXISTS core.auth_token_bindings (
  token_code TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES core.users(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH default_institution AS (
  SELECT COALESCE(
    (SELECT id FROM core.institutions WHERE code = 'min-health' LIMIT 1),
    (SELECT id FROM core.institutions ORDER BY created_at ASC LIMIT 1)
  ) AS id
)
INSERT INTO core.users (id, institution_id, email, display_name, status, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', (SELECT id FROM default_institution), 'superadmin@sigi.local', 'Superadministrador SIGI', 'active', NOW()),
  ('11111111-1111-4111-8111-111111111112', (SELECT id FROM default_institution), 'national-admin@sigi.local', 'Administrador Nacional SIGI', 'active', NOW()),
  ('11111111-1111-4111-8111-111111111113', (SELECT id FROM default_institution), 'validator@sigi.local', 'Validador Tecnico SIGI', 'active', NOW()),
  ('11111111-1111-4111-8111-111111111114', (SELECT id FROM default_institution), 'reader@sigi.local', 'Consumidor Lectura SIGI', 'active', NOW()),
  ('11111111-1111-4111-8111-111111111115', (SELECT id FROM default_institution), 'integration@sigi.local', 'Integracion Tecnica SIGI', 'active', NOW())
ON CONFLICT (email) DO UPDATE
SET
  institution_id = COALESCE(core.users.institution_id, EXCLUDED.institution_id),
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  updated_at = NOW();

INSERT INTO core.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM (
  VALUES
    ('superadmin@sigi.local', 'superadmin'),
    ('national-admin@sigi.local', 'national_admin'),
    ('validator@sigi.local', 'technical_validator'),
    ('reader@sigi.local', 'read_consumer'),
    ('integration@sigi.local', 'technical_integration')
) AS seeded(email, role_code)
INNER JOIN core.users u ON LOWER(u.email) = LOWER(seeded.email)
INNER JOIN core.roles r ON r.code = seeded.role_code
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO core.auth_token_bindings (token_code, user_id, status, updated_at)
VALUES
  ('superadmin', (SELECT id FROM core.users WHERE LOWER(email) = LOWER('superadmin@sigi.local') LIMIT 1), 'active', NOW()),
  ('national_admin', (SELECT id FROM core.users WHERE LOWER(email) = LOWER('national-admin@sigi.local') LIMIT 1), 'active', NOW()),
  ('institution_editor', (SELECT id FROM core.users WHERE LOWER(email) = LOWER('editor@sigi.local') LIMIT 1), 'active', NOW()),
  ('technical_validator', (SELECT id FROM core.users WHERE LOWER(email) = LOWER('validator@sigi.local') LIMIT 1), 'active', NOW()),
  ('read_consumer', (SELECT id FROM core.users WHERE LOWER(email) = LOWER('reader@sigi.local') LIMIT 1), 'active', NOW()),
  ('technical_integration', (SELECT id FROM core.users WHERE LOWER(email) = LOWER('integration@sigi.local') LIMIT 1), 'active', NOW())
ON CONFLICT (token_code) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  status = EXCLUDED.status,
  updated_at = NOW();
