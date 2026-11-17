\set ON_ERROR_STOP on

-- Leave a usable but operationally empty SIGI instance.
--
-- The regular initialization scripts create the complete schema and load the
-- development dataset. This script runs last only in the empty-demo compose
-- profile. It keeps authentication/RBAC and reusable technical catalogs, while
-- removing projects, datasets, integrations, GIS features and activity data.

DO $$
DECLARE
  table_list TEXT;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY schemaname, tablename)
  INTO table_list
  FROM pg_tables
  WHERE schemaname IN ('core', 'integration', 'gis')
    AND (schemaname, tablename) NOT IN (
      ('core', 'institutions'),
      ('core', 'permissions'),
      ('core', 'role_permissions'),
      ('core', 'roles'),
      ('core', 'users'),
      ('core', 'user_roles'),
      ('core', 'user_credentials'),
      ('core', 'auth_token_bindings'),
      ('core', 'validation_rules'),
      ('core', 'report_frameworks'),
      ('core', 'report_templates'),
      ('core', 'report_template_versions'),
      ('core', 'report_template_sections'),
      ('core', 'report_template_components'),
      ('core', 'report_data_requirements'),
      ('core', 'report_reference_milestones'),
      ('integration', 'canonical_fields')
    );

  IF table_list IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
  END IF;
END
$$;

-- Retain only the account required to administer and demonstrate the empty
-- instance. Its password remains the documented local development password.
DELETE FROM core.auth_token_bindings
WHERE token_code <> 'superadmin';

DELETE FROM core.user_roles
WHERE user_id <> '11111111-1111-4111-8111-111111111111'::uuid;

DELETE FROM core.user_credentials
WHERE user_id <> '11111111-1111-4111-8111-111111111111'::uuid;

DELETE FROM core.users
WHERE id <> '11111111-1111-4111-8111-111111111111'::uuid;

UPDATE core.users
SET institution_id = NULL, updated_at = NOW()
WHERE id = '11111111-1111-4111-8111-111111111111'::uuid;

DELETE FROM core.institutions;
