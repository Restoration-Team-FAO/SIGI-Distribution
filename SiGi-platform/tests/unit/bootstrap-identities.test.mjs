import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// V2-01 — las identidades *@sigi.local creadas por initdb con hashes versionados nunca quedan
// utilizables en producción: se rotan con SIGI_BOOTSTRAP_PASSWORD_* o se deshabilitan.
const { BOOTSTRAP_IDENTITIES, BootstrapIdentitiesService, planBootstrapIdentityAction } = await import(
  '../../apps/sigi-api/dist/modules/auth/bootstrap-identities.service.js'
);
const { verifyPassword, hashPassword } = await import('../../apps/sigi-api/dist/modules/auth/auth.crypto.js');

const superadmin = BOOTSTRAP_IDENTITIES.find((item) => item.email === 'superadmin@sigi.local');

test('embedded versioned hashes match infra/postgres/init/009_auth_identity.sql exactly', () => {
  const sql = readFileSync(new URL('../../infra/postgres/init/009_auth_identity.sql', import.meta.url), 'utf8');
  assert.equal(BOOTSTRAP_IDENTITIES.length, 7);
  for (const identity of BOOTSTRAP_IDENTITIES) {
    assert.ok(sql.includes(`WHEN '${identity.email}' THEN '${identity.versionedHash}'`), identity.email);
  }
});

test('versioned credential is rotated when a strong password is configured', () => {
  assert.equal(
    planBootstrapIdentityAction({
      currentHash: superadmin.versionedHash,
      versionedHash: superadmin.versionedHash,
      configuredPassword: 'Rotated-Admin-2026',
      production: true,
    }),
    'rotate',
  );
});

test('versioned credential is disabled in production without a usable configured password', () => {
  for (const configuredPassword of [undefined, '', 'short1', 'superadmin-dev-token']) {
    assert.equal(
      planBootstrapIdentityAction({
        currentHash: superadmin.versionedHash,
        versionedHash: superadmin.versionedHash,
        configuredPassword,
        production: true,
      }),
      'disable',
      String(configuredPassword),
    );
  }
});

test('operator-changed or empty credentials are never touched; development keeps defaults', () => {
  assert.equal(
    planBootstrapIdentityAction({
      currentHash: hashPassword('Operator-Chosen-2026'),
      versionedHash: superadmin.versionedHash,
      configuredPassword: 'Rotated-Admin-2026',
      production: true,
    }),
    'keep',
  );
  assert.equal(
    planBootstrapIdentityAction({ currentHash: null, versionedHash: superadmin.versionedHash, configuredPassword: undefined, production: true }),
    'keep',
  );
  assert.equal(
    planBootstrapIdentityAction({
      currentHash: superadmin.versionedHash,
      versionedHash: superadmin.versionedHash,
      configuredPassword: undefined,
      production: false,
    }),
    'keep',
  );
});

test('service rotates superadmin, disables the rest and revokes their sessions in production', async () => {
  const calls = [];
  const rows = BOOTSTRAP_IDENTITIES.map((identity, index) => ({
    user_id: `00000000-0000-0000-0000-00000000000${index}`,
    email: identity.email,
    password_hash: identity.versionedHash,
  }));
  const postgres = {
    async query(text, params) {
      calls.push({ text, params });
      return text.includes('FROM core.user_credentials') ? { rows } : { rows: [] };
    },
  };
  const service = new BootstrapIdentitiesService(postgres);
  const actions = await service.secureBootstrapIdentities({
    NODE_ENV: 'production',
    SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN: 'Rotated-Admin-2026',
  });
  assert.equal(actions['superadmin@sigi.local'], 'rotate');
  for (const identity of BOOTSTRAP_IDENTITIES.filter((item) => item.email !== 'superadmin@sigi.local')) {
    assert.equal(actions[identity.email], 'disable', identity.email);
  }
  const updates = calls.filter((call) => call.text.includes('UPDATE core.user_credentials'));
  assert.equal(updates.length, 7);
  const superUpdate = updates.find((call) => call.params[0] === rows[0].user_id);
  assert.ok(verifyPassword('Rotated-Admin-2026', superUpdate.params[1]));
  assert.ok(updates.filter((call) => call.params[0] !== rows[0].user_id).every((call) => call.params[1] === null));
  assert.equal(calls.filter((call) => call.text.includes('DELETE FROM core.user_sessions')).length, 7);
});
