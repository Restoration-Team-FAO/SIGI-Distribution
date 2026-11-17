CREATE TABLE IF NOT EXISTS core.user_credentials (
  user_id UUID PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  password_hash TEXT,
  password_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_user_sessions_user_id
  ON core.user_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_core_user_sessions_access_expires_at
  ON core.user_sessions (access_expires_at);

CREATE INDEX IF NOT EXISTS idx_core_user_sessions_refresh_expires_at
  ON core.user_sessions (refresh_expires_at);

INSERT INTO core.user_credentials (
  user_id,
  password_hash,
  password_updated_at
)
SELECT
  u.id,
  CASE LOWER(u.email)
    WHEN 'superadmin@sigi.local' THEN 'scrypt$16384$8$1$uvLq6652BUvBzZzj7RLarg==$6E0mMUbWcUXMqF0mrmS1TdTN2aYckoHlmIecVnCl/eiiI5VBktvvS+9Lqjgj0STlW9eNsSO0uOISOxOGqOagqQ=='
    WHEN 'admin@sigi.local' THEN 'scrypt$16384$8$1$nfhrm7zfA4rbN0upJ6s5Jg==$iY8XsNRUTO9PcrApP9waDcXVhnNy4BRLT//ylJHzCS2utxXohCNBNrBNEXW9B3/AJg0IzrTDtEOfRY25ZsevRg=='
    WHEN 'national-admin@sigi.local' THEN 'scrypt$16384$8$1$mJ6LNjykSpTSm9BlW1+l7w==$kwfaToAHc9+KQc//FAzuvVxEQ1eUDiy5TRhDgVZTFrvRezlEaEmsl8VwtRTK0frZJt+5OU7BLM4Av2WraNbqRw=='
    WHEN 'editor@sigi.local' THEN 'scrypt$16384$8$1$wui1BMWkKozd7LIXNZ0BWA==$weLFEnh3913TiKp8ZF1ybzFyVYOwohnyMKv3dGKySoTz2Wl5DFgkPjDfianj/ozGbF53RISCILYCohI75bcUAw=='
    WHEN 'validator@sigi.local' THEN 'scrypt$16384$8$1$ICl4lqH1x0X6dj8CMPhaYA==$/lU3fGG9Z7SpHMrradkKGrgpDl4zGuR/qCwqnvTONwZOrqC2OspprS4TKG+MM5uPjInBzAJUNyEjDjjJ1N6Vlw=='
    WHEN 'reader@sigi.local' THEN 'scrypt$16384$8$1$RtK5uuXO4vZSdQC9Aj0ZrA==$Ws8O9LFwlaRB/+S9zTFScCCR4Dp8SSSSGJ9BXdCtjy67bb96cb4SYtV0xxNitjQaDeE04AhXMk35Jz2nAaQ/4w=='
    WHEN 'integration@sigi.local' THEN 'scrypt$16384$8$1$1DZKkEE1iU3i+di9F+a0YQ==$3+wbxyQdpArb0zA9A8zI4KkOiyjxjI3Cou4M+mX8yp95CewYLyr5/wvLtUFTQV6kllUKfAHHtxL2KC+3jSFtFg=='
    ELSE NULL
  END,
  NOW()
FROM core.users u
WHERE LOWER(u.email) IN (
  'superadmin@sigi.local',
  'admin@sigi.local',
  'national-admin@sigi.local',
  'editor@sigi.local',
  'validator@sigi.local',
  'reader@sigi.local',
  'integration@sigi.local'
)
ON CONFLICT (user_id) DO NOTHING;
