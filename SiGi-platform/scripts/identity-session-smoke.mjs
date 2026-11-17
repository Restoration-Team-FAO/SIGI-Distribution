const API_BASE_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
const EMAIL = process.env.SIGI_SMOKE_SUPERADMIN_EMAIL ?? 'superadmin@sigi.local';
const PASSWORD = process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token';

async function request(method, path, { token, body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A 204 response intentionally has no body.
  }
  return { status: response.status, payload };
}

function check(checks, name, actual, expected) {
  checks.push({ name, ok: actual === expected, actual, expected });
}

const checks = [];
const login = await request('POST', '/auth/login', {
  body: { email: EMAIL, password: PASSWORD },
});
check(checks, 'identity.login', login.status, 200);
const original = login.payload?.data;

const me = await request('GET', '/auth/me', { token: original?.accessToken });
check(checks, 'identity.session_active', me.status, 200);

const refresh = await request('POST', '/auth/refresh', {
  body: { refreshToken: original?.refreshToken },
});
check(checks, 'identity.refresh_rotation', refresh.status, 200);
const rotated = refresh.payload?.data;

check(
  checks,
  'identity.rotated_access_rejected',
  (await request('GET', '/auth/me', { token: original?.accessToken })).status,
  401,
);
check(
  checks,
  'identity.refresh_replay_rejected',
  (await request('POST', '/auth/refresh', { body: { refreshToken: original?.refreshToken } })).status,
  401,
);
check(
  checks,
  'identity.rotated_session_active',
  (await request('GET', '/auth/me', { token: rotated?.accessToken })).status,
  200,
);
check(
  checks,
  'identity.logout',
  (await request('POST', '/auth/logout', { token: rotated?.accessToken })).status,
  204,
);
check(
  checks,
  'identity.logged_out_access_rejected',
  (await request('GET', '/auth/me', { token: rotated?.accessToken })).status,
  401,
);
check(checks, 'identity.public_audit_closed', (await request('GET', '/audit')).status, 404);

const passedChecks = checks.filter((item) => item.ok).length;
console.log(JSON.stringify({
  gate: 'sigi.identity-session',
  apiBaseUrl: API_BASE_URL,
  passedChecks,
  totalChecks: checks.length,
  checks,
}, null, 2));

if (passedChecks !== checks.length) process.exitCode = 1;
