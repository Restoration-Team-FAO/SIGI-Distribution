-- V2.0.2: bloqueo por intentos fallidos de inicio de sesión (antes inexistente en la línea v2).
-- El contador se incrementa atómicamente en cada contraseña errónea y la cuenta se bloquea
-- AUTH_LOCKOUT_SECONDS al alcanzar AUTH_MAX_FAILED_ATTEMPTS; un login correcto lo reinicia.
ALTER TABLE core.user_credentials
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
