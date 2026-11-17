INSERT INTO core.permissions (code, name)
VALUES ('indicators.read', 'Consultar indicadores, metas, resultados y trazabilidad')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
CROSS JOIN core.permissions p
WHERE r.code IN (
  'superadmin',
  'national_admin',
  'institution_editor',
  'technical_validator',
  'read_consumer',
  'technical_integration'
)
  AND p.code = 'indicators.read'
ON CONFLICT DO NOTHING;

