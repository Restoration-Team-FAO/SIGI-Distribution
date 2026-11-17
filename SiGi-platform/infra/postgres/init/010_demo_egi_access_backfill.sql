WITH target_egi AS (
  SELECT id
  FROM core.egi_spaces
  WHERE code IN ('EGI-MARN-TEST', 'EGI-MARN-OCC', 'EGI-LEGACY')
  ORDER BY
    CASE code
      WHEN 'EGI-MARN-TEST' THEN 1
      WHEN 'EGI-MARN-OCC' THEN 2
      WHEN 'EGI-LEGACY' THEN 3
      ELSE 99
    END
  LIMIT 1
)
INSERT INTO core.egi_memberships (egi_id, user_id, role_code, membership_status, permissions_json)
SELECT
  target_egi.id,
  u.id,
  seed.role_code,
  'active',
  seed.permissions_json
FROM target_egi
JOIN (
  VALUES
    (
      'editor@sigi.local',
      'egi_editor',
      '["egi.read","egi.select","egi.summary.read"]'::jsonb
    ),
    (
      'validator@sigi.local',
      'egi_validator',
      '["egi.read","egi.select","egi.summary.read"]'::jsonb
    ),
    (
      'integration@sigi.local',
      'egi_editor',
      '["egi.read","egi.select","egi.summary.read"]'::jsonb
    ),
    (
      'reader@sigi.local',
      'egi_viewer',
      '["egi.read","egi.select","egi.summary.read"]'::jsonb
    )
) AS seed(email, role_code, permissions_json) ON TRUE
JOIN core.users u ON LOWER(u.email) = LOWER(seed.email)
ON CONFLICT (egi_id, user_id) DO UPDATE
SET
  role_code = EXCLUDED.role_code,
  membership_status = 'active',
  permissions_json = EXCLUDED.permissions_json;

WITH target_egi AS (
  SELECT id
  FROM core.egi_spaces
  WHERE code IN ('EGI-MARN-TEST', 'EGI-MARN-OCC', 'EGI-LEGACY')
  ORDER BY
    CASE code
      WHEN 'EGI-MARN-TEST' THEN 1
      WHEN 'EGI-MARN-OCC' THEN 2
      WHEN 'EGI-LEGACY' THEN 3
      ELSE 99
    END
  LIMIT 1
)
INSERT INTO core.user_preferences (user_id, active_egi_id, preferences_json, last_egi_selected_at)
SELECT
  u.id,
  target_egi.id,
  '{"workspace":"egi"}'::jsonb,
  NOW()
FROM target_egi
JOIN core.users u
  ON LOWER(u.email) IN (
    'editor@sigi.local',
    'validator@sigi.local',
    'integration@sigi.local',
    'reader@sigi.local'
  )
ON CONFLICT (user_id) DO UPDATE
SET
  active_egi_id = EXCLUDED.active_egi_id,
  preferences_json = COALESCE(core.user_preferences.preferences_json, '{}'::jsonb) || EXCLUDED.preferences_json,
  last_egi_selected_at = NOW();
