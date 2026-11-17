import fs from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const configPath = path.resolve(args.config || '');
const apiBaseUrl = process.env.SIGI_PROVISION_API_URL ?? 'http://127.0.0.1:3000/api';
const email = process.env.SIGI_PROVISION_ADMIN_EMAIL ?? 'superadmin@sigi.local';
const password = process.env.SIGI_PROVISION_ADMIN_PASSWORD;

if (!args.config || !path.isAbsolute(configPath)) {
  fail('Pass --config=ABSOLUTE_JSON_PATH.');
}
if (!fs.existsSync(configPath)) fail(`Institutional configuration not found: ${configPath}`);
if (!password) fail('Set SIGI_PROVISION_ADMIN_PASSWORD.');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
validateConfig(config);

const token = await login(email, password);
const created = { institutions: [], egiSpaces: [] };
const reused = { institutions: [], egiSpaces: [] };
const memberships = [];

let institutions = await getEntities('/admin/institutions', token, 'institutions');
for (const input of config.institutions) {
  let institution = institutions.find((item) => item.code === input.code);
  if (!institution) {
    institution = await createEntity('/admin/institutions', token, input);
    institutions = [...institutions, institution];
    created.institutions.push(input.code);
  } else {
    reused.institutions.push(input.code);
  }

  let workspace = await getWorkspace(token);
  for (const egiInput of input.egiSpaces) {
    let egi = workspace.spaces.find((space) => space.code === egiInput.code);
    if (egi) {
      if (egi.institutionId !== institution.id) {
        fail(`EGI ${egiInput.code} already belongs to a different institution.`);
      }
      reused.egiSpaces.push(egiInput.code);
    } else {
      await createEntity('/admin/egi', token, {
        ...egiInput,
        memberships: undefined,
        institutionId: institution.id,
        visibility: egiInput.visibility ?? 'institutional',
        status: egiInput.status ?? 'active',
      });
      created.egiSpaces.push(egiInput.code);
      workspace = await getWorkspace(token);
      egi = workspace.spaces.find((space) => space.code === egiInput.code);
    }
    if (!egi) fail(`Unable to resolve provisioned EGI ${egiInput.code}.`);

    for (const membership of egiInput.memberships ?? []) {
      await createEntity(`/admin/egi/${egi.id}/memberships`, token, membership);
      memberships.push({ egiCode: egiInput.code, ...membership });
    }
  }
}

const finalWorkspace = await getWorkspace(token);
const expectedEgiCodes = config.institutions.flatMap((institution) =>
  institution.egiSpaces.map((egi) => egi.code),
);
const missing = expectedEgiCodes.filter(
  (code) => !finalWorkspace.spaces.some((space) => space.code === code),
);
if (missing.length > 0) fail(`Provisioning verification failed for EGI: ${missing.join(', ')}`);

console.log(
  JSON.stringify(
    {
      gate: 'sigi.institutional-provisioning',
      ok: true,
      apiBaseUrl,
      created,
      reused,
      memberships,
      verifiedEgiCodes: expectedEgiCodes,
    },
    null,
    2,
  ),
);

function validateConfig(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.institutions) || value.institutions.length < 1) {
    fail('Configuration must use version 1 and contain at least one institution.');
  }
  const institutionCodes = new Set();
  const egiCodes = new Set();
  for (const institution of value.institutions) {
    requireCode(institution.code, 'institution code');
    requireText(institution.name, 'institution name');
    if (institutionCodes.has(institution.code)) fail(`Duplicate institution code: ${institution.code}`);
    institutionCodes.add(institution.code);
    if (!Array.isArray(institution.egiSpaces) || institution.egiSpaces.length < 1) {
      fail(`Institution ${institution.code} must contain at least one EGI.`);
    }
    for (const egi of institution.egiSpaces) {
      requireCode(egi.code, 'EGI code');
      requireText(egi.name, 'EGI name');
      requireText(egi.responsible, 'EGI responsible');
      requireText(egi.territorialScope, 'EGI territorialScope');
      requireText(egi.thematicScope, 'EGI thematicScope');
      if (egiCodes.has(egi.code)) fail(`Duplicate EGI code: ${egi.code}`);
      egiCodes.add(egi.code);
      if (egi.memberships !== undefined && !Array.isArray(egi.memberships)) {
        fail(`EGI ${egi.code} memberships must be an array.`);
      }
      for (const membership of egi.memberships ?? []) {
        if (typeof membership.userEmail !== 'string' || !membership.userEmail.includes('@')) {
          fail(`Invalid membership userEmail in ${egi.code}.`);
        }
        if (!['egi_owner', 'egi_admin', 'egi_editor', 'egi_validator', 'egi_viewer'].includes(membership.roleCode)) {
          fail(`Invalid membership roleCode in ${egi.code}.`);
        }
      }
    }
  }
}

function requireCode(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(value)) {
    fail(`Invalid ${label}: ${String(value)}`);
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 250) {
    fail(`Invalid ${label}.`);
  }
}

async function login(loginEmail, loginPassword) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: loginEmail, password: loginPassword }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.data?.accessToken) {
    fail(`Provisioning login failed: ${response.status} ${payload?.message ?? ''}`.trim());
  }
  return payload.data.accessToken;
}

async function getEntities(route, tokenValue, key) {
  const response = await request(route, tokenValue);
  const entities = response?.data?.[key];
  if (!Array.isArray(entities)) fail(`Unexpected response contract from ${route}.`);
  return entities;
}

async function getWorkspace(tokenValue) {
  const response = await request('/admin/egi', tokenValue);
  if (!Array.isArray(response?.data?.spaces)) fail('Unexpected EGI workspace response contract.');
  return response.data;
}

async function createEntity(route, tokenValue, body) {
  const response = await request(route, tokenValue, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrapEntity(response.data);
}

async function request(route, tokenValue, options = {}) {
  const response = await fetch(`${apiBaseUrl}${route}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokenValue}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const payload = await readJson(response);
  if (!response.ok) fail(`${options.method ?? 'GET'} ${route} failed: ${response.status} ${payload?.message ?? ''}`.trim());
  return payload;
}

function unwrapEntity(value) {
  if (!value || typeof value !== 'object') fail('Provisioning endpoint returned no entity.');
  return value.institution ?? value.egi ?? value.space ?? value;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseArgs(values) {
  return Object.fromEntries(
    values.map((value) => {
      const [key, ...rest] = value.replace(/^--/, '').split('=');
      return [key, rest.join('=') || 'true'];
    }),
  );
}

function fail(message) {
  throw new Error(message);
}
