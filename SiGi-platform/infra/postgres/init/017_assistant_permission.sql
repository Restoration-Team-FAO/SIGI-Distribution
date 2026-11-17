INSERT INTO core.permissions (code, name)
VALUES ('assistant.use', 'Consultar Ask SIGI con fuentes autorizadas')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM core.roles role
CROSS JOIN core.permissions permission
WHERE role.code IN (
  'superadmin',
  'national_admin',
  'institution_editor',
  'technical_validator',
  'read_consumer',
  'technical_integration'
)
  AND permission.code = 'assistant.use'
ON CONFLICT DO NOTHING;
