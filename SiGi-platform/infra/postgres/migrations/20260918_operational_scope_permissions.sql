INSERT INTO core.permissions (code, name)
VALUES ('scope.global.read', 'Consultar la vista consolidada de todos los EGI')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
CROSS JOIN core.permissions p
WHERE r.code IN ('superadmin', 'national_admin')
  AND p.code = 'scope.global.read'
ON CONFLICT DO NOTHING;
