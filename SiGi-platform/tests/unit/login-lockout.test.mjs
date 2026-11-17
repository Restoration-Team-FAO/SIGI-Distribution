import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// V2.0.2 — bloqueo por intentos fallidos: tras N contraseñas erróneas la cuenta queda bloqueada
// AUTH_LOCKOUT_SECONDS, incluso con la contraseña correcta, y la respuesta no revela el bloqueo.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const { AuthService, RECORD_FAILED_LOGIN_SQL, RESET_FAILED_LOGIN_SQL, isLoginLocked } = await import(
  '../../apps/sigi-api/dist/modules/auth/auth.service.js'
);
const { hashPassword } = await import('../../apps/sigi-api/dist/modules/auth/auth.crypto.js');

const PASSWORD = 'Correcta-123456';

// Simula core.user_credentials con la semántica de RECORD_FAILED_LOGIN_SQL / RESET_FAILED_LOGIN_SQL.
// getValidatedEnv() se cachea: entorno mínimo de pruebas (sin secretos reales) antes del primer login.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  GEOSERVER_ADMIN_USER: 'test',
  GEOSERVER_ADMIN_PASSWORD: 'test',
  GEOSERVER_WORKSPACE: 'test',
  GEOSERVER_DATASTORE: 'test',
  GIS_SERVICE_URL: 'http://localhost:1',
  INTEGRATION_SERVICE_URL: 'http://localhost:2',
  GEOSERVER_INTERNAL_URL: 'http://localhost:3',
  AUTH_MAX_FAILED_ATTEMPTS: '3',
  AUTH_LOCKOUT_SECONDS: '900',
});

function fakeService() {
  const credential = { failed_attempts: 0, locked_until: null };
  const audits = [];
  const postgresService = {
    async query(sql, params) {
      if (sql === RECORD_FAILED_LOGIN_SQL) {
        const [, max, seconds] = params;
        if (isLoginLocked(credential.locked_until)) return { rows: [] };
        credential.failed_attempts += 1;
        if (credential.failed_attempts >= max) credential.locked_until = new Date(Date.now() + seconds * 1000);
        return { rows: [{ ...credential }] };
      }
      if (sql === RESET_FAILED_LOGIN_SQL) {
        credential.failed_attempts = 0;
        credential.locked_until = null;
        return { rows: [] };
      }
      if (sql.includes('FROM core.users u')) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              institution_id: null,
              institution_name: null,
              email: 'editor@sigi.local',
              display_name: 'Editor',
              status: 'active',
              active_egi_id: null,
              password_hash: hashPassword(PASSWORD),
              locked_until: credential.locked_until,
            },
          ],
        };
      }
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    },
  };
  const service = Object.create(AuthService.prototype);
  service.postgresService = postgresService;
  service.recordAuditByUserId = async (_id, action, ...rest) => audits.push({ action, details: rest.at(-1) });
  service.createSession = async () => {
    throw new Error('session-created');
  };
  return { service, credential, audits };
}

const rejectsAsInvalid = (promise) =>
  assert.rejects(promise, (error) => error.message === 'Credenciales inválidas.');

test('isLoginLocked only reports future lock timestamps', () => {
  assert.equal(isLoginLocked(null), false);
  assert.equal(isLoginLocked(new Date(Date.now() - 1000)), false);
  assert.equal(isLoginLocked(new Date(Date.now() + 60_000)), true);
});

test('account locks after the configured failures and rejects even the right password', async () => {
  const { service, credential, audits } = fakeService();
  for (let i = 0; i < 3; i += 1) await rejectsAsInvalid(service.login('editor@sigi.local', 'mala-clave-1'));
  assert.equal(credential.failed_attempts, 3);
  assert.ok(isLoginLocked(credential.locked_until));
  assert.ok(audits.some((entry) => entry.action === 'auth.account.locked'));

  await rejectsAsInvalid(service.login('editor@sigi.local', PASSWORD));
  assert.equal(audits.at(-1).details.reason, 'account_locked');
});

test('a successful login before the threshold resets the counter', async () => {
  const { service, credential } = fakeService();
  await rejectsAsInvalid(service.login('editor@sigi.local', 'mala-clave-1'));
  await rejectsAsInvalid(service.login('editor@sigi.local', 'mala-clave-2'));
  await assert.rejects(service.login('editor@sigi.local', PASSWORD), /session-created/);
  assert.equal(credential.failed_attempts, 0);
  assert.equal(credential.locked_until, null);
});

test('lockout columns ship as a manifest migration identical to its init script', () => {
  const migration = read('infra/postgres/migrations/20261016_login_lockout.sql');
  assert.equal(read('infra/postgres/init/021_login_lockout.sql'), migration);
  assert.match(migration, /failed_attempts INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /locked_until TIMESTAMPTZ/);
  assert.match(read('infra/postgres/migrations/manifest.txt'), /20261016_login_lockout\.sql/);
  assert.match(RECORD_FAILED_LOGIN_SQL, /locked_until IS NULL OR locked_until <= NOW\(\)/);
});
