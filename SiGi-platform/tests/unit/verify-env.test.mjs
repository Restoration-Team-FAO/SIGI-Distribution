import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

test('verify-env accepts a production-like env file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigi-verify-env-pass-'));
  const filePath = path.join(tmpDir, 'prod.env');
  fs.writeFileSync(
    filePath,
    [
      'POSTGRES_PASSWORD=ProdDbSecret2026!',
      'SIGI_APP_DB_PASSWORD=ProdAppDbSecret2026!',
      'DATABASE_URL=postgresql://sigi_app:ProdAppDbSecret2026!@postgres:5432/sigi_db',
      'SIGI_SECRETS_KEY=prod-secret-2026',
      'SIGI_INTERNAL_SERVICE_TOKEN=prod-internal-token-2026',
      'SIGI_DB_RESET_PASSPHRASE=prod-reset-passphrase-2026',
      'SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=BootstrapAdmin2026Prod',
      'GEOSERVER_ADMIN_PASSWORD=GeoServerProd2026!',
      'GEOSERVER_DB_PASSWORD=GeoServerReadOnly2026!',
      'GEOSERVER_CORS_ALLOWED_ORIGINS=https://sigi.go.cr,https://admin.sigi.go.cr',
      'SIGI_CORS_ALLOWED_ORIGINS=https://sigi.go.cr,https://admin.sigi.go.cr',
      'AUTH_ACCESS_TOKEN_TTL_SECONDS=1800',
      'AUTH_REFRESH_TOKEN_TTL_SECONDS=604800',
      'SIGI_TRUST_PROXY_HOPS=1',
      'SIGI_ACME_EMAIL=ops@sigi.go.cr',
      'SIGI_PUBLIC_DOMAIN=sigi.go.cr',
      'SIGI_ADMIN_DOMAIN=admin.sigi.go.cr',
      'NODE_ENV=production',
      'APP_ENV=production',
      'VITE_SIGI_PORTAL_MODE=prod',
      'ODOO_MOCK_MODE=false',
      'SIGI_ALLOW_LEGACY_ADMIN_TOKENS=false',
      'ODOO_URL=http://odoo.internal:8069',
    ].join('\n'),
    'utf8',
  );

  const { stdout } = await execFileAsync(
    'node',
    ['scripts/verify-env.mjs', '--mode=production', `--file=${filePath}`],
    { cwd: REPO_ROOT },
  );

  const payload = JSON.parse(stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.results[0].ok, true);
});

test('verify-env rejects production env files with demo placeholders or mock mode', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigi-verify-env-fail-'));
  const filePath = path.join(tmpDir, 'prod-bad.env');
  fs.writeFileSync(
    filePath,
    [
      'POSTGRES_PASSWORD=sigi_password',
      'DATABASE_URL=postgresql://sigi_user:sigi_password@postgres:5432/sigi_db',
      'SIGI_SECRETS_KEY=sigi-dev-secret',
      'SIGI_INTERNAL_SERVICE_TOKEN=sigi-dev-internal-token',
      'SIGI_DB_RESET_PASSPHRASE=reset-sigi-demo-2026',
      'GEOSERVER_ADMIN_PASSWORD=geoserver',
      'NODE_ENV=production',
      'APP_ENV=production',
      'VITE_SIGI_PORTAL_MODE=demo',
      'ODOO_MOCK_MODE=true',
      'SIGI_ALLOW_LEGACY_ADMIN_TOKENS=true',
      'ODOO_URL=http://odoo.demo.local:8069',
    ].join('\n'),
    'utf8',
  );

  let stdout = '';
  try {
    await execFileAsync(
      'node',
      ['scripts/verify-env.mjs', '--mode=production', `--file=${filePath}`],
      { cwd: REPO_ROOT },
    );
    assert.fail('verify-env should have failed for insecure production values');
  } catch (error) {
    stdout = error.stdout ?? '';
    assert.ok(stdout.length > 0);
  }

  const payload = JSON.parse(stdout);
  assert.equal(payload.ok, false);
  const issues = payload.results[0].issues.join('\n');
  assert.match(issues, /VITE_SIGI_PORTAL_MODE/);
  assert.match(issues, /ODOO_MOCK_MODE=true/);
  assert.match(issues, /SIGI_ALLOW_LEGACY_ADMIN_TOKENS=true/);
  assert.match(issues, /odoo\.demo\.local/i);
});

test('verify-env requires a strong bootstrap superadmin password in production (V2-01)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigi-verify-env-bootstrap-'));
  const base = [
    'POSTGRES_PASSWORD=ProdDbSecret2026!',
    'SIGI_APP_DB_PASSWORD=ProdAppDbSecret2026!',
    'DATABASE_URL=postgresql://sigi_app:ProdAppDbSecret2026!@postgres:5432/sigi_db',
    'SIGI_SECRETS_KEY=prod-secret-2026',
    'SIGI_INTERNAL_SERVICE_TOKEN=prod-internal-token-2026',
    'SIGI_DB_RESET_PASSPHRASE=prod-reset-passphrase-2026',
    'GEOSERVER_ADMIN_PASSWORD=GeoServerProd2026!',
    'GEOSERVER_DB_PASSWORD=GeoServerReadOnly2026!',
    'GEOSERVER_CORS_ALLOWED_ORIGINS=https://sigi.go.cr',
    'SIGI_CORS_ALLOWED_ORIGINS=https://sigi.go.cr',
    'AUTH_ACCESS_TOKEN_TTL_SECONDS=1800',
    'AUTH_REFRESH_TOKEN_TTL_SECONDS=604800',
    'SIGI_TRUST_PROXY_HOPS=1',
    'SIGI_ACME_EMAIL=ops@sigi.go.cr',
    'SIGI_PUBLIC_DOMAIN=sigi.go.cr',
    'SIGI_ADMIN_DOMAIN=admin.sigi.go.cr',
    'NODE_ENV=production',
    'APP_ENV=production',
    'VITE_SIGI_PORTAL_MODE=prod',
  ];
  for (const [name, extra] of [['missing', []], ['weak', ['SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=short1']]]) {
    const filePath = path.join(tmpDir, `${name}.env`);
    fs.writeFileSync(filePath, [...base, ...extra].join('\n'), 'utf8');
    await assert.rejects(
      execFileAsync('node', ['scripts/verify-env.mjs', '--mode=production', `--file=${filePath}`], { cwd: REPO_ROOT }),
      (error) => /SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN/.test(error.stdout ?? ''),
      name,
    );
  }
});

test('verify-env forbids the destructive DB reset in production and no longer requires its passphrase', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigi-verify-env-dbreset-'));
  const base = [
    'POSTGRES_PASSWORD=ProdDbSecret2026!',
    'SIGI_APP_DB_PASSWORD=ProdAppDbSecret2026!',
    'DATABASE_URL=postgresql://sigi_app:ProdAppDbSecret2026!@postgres:5432/sigi_db',
    'SIGI_SECRETS_KEY=prod-secret-2026',
    'SIGI_INTERNAL_SERVICE_TOKEN=prod-internal-token-2026',
    'SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=BootstrapProd2026Secret',
    'GEOSERVER_ADMIN_PASSWORD=GeoServerProd2026!',
    'GEOSERVER_DB_PASSWORD=GeoServerReadOnly2026!',
    'GEOSERVER_CORS_ALLOWED_ORIGINS=https://sigi.go.cr',
    'SIGI_CORS_ALLOWED_ORIGINS=https://sigi.go.cr',
    'AUTH_ACCESS_TOKEN_TTL_SECONDS=1800',
    'AUTH_REFRESH_TOKEN_TTL_SECONDS=604800',
    'SIGI_TRUST_PROXY_HOPS=1',
    'SIGI_ACME_EMAIL=ops@sigi.go.cr',
    'SIGI_PUBLIC_DOMAIN=sigi.go.cr',
    'SIGI_ADMIN_DOMAIN=admin.sigi.go.cr',
    'NODE_ENV=production',
    'APP_ENV=production',
    'VITE_SIGI_PORTAL_MODE=prod',
  ];
  const okPath = path.join(tmpDir, 'ok.env');
  fs.writeFileSync(okPath, base.join('\n'), 'utf8');
  await execFileAsync('node', ['scripts/verify-env.mjs', '--mode=production', `--file=${okPath}`], { cwd: REPO_ROOT });

  const enabledPath = path.join(tmpDir, 'enabled.env');
  fs.writeFileSync(enabledPath, [...base, 'SIGI_ENABLE_DB_RESET=true'].join('\n'), 'utf8');
  await assert.rejects(
    execFileAsync('node', ['scripts/verify-env.mjs', '--mode=production', `--file=${enabledPath}`], { cwd: REPO_ROOT }),
    (error) => /SIGI_ENABLE_DB_RESET=true/.test(error.stdout ?? ''),
  );
});
