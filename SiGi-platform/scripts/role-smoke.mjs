const API_BASE_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
const RATE_LIMIT_RETRY_MS = Number(process.env.SIGI_SMOKE_RATE_LIMIT_RETRY_MS ?? 61000);
const MAX_REQUEST_ATTEMPTS = Number(process.env.SIGI_SMOKE_MAX_ATTEMPTS ?? 2);

const PASSWORDS = {
  superadmin: process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token',
  nationalAdmin: process.env.SIGI_SMOKE_NATIONAL_ADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_NATIONAL_ADMIN ?? 'national-admin-dev-token',
  editor: process.env.SIGI_SMOKE_EDITOR_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_EDITOR ?? 'editor-dev-token',
  integration: process.env.SIGI_SMOKE_INTEGRATION_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_INTEGRATION ?? 'integration-dev-token',
  validator: process.env.SIGI_SMOKE_VALIDATOR_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_VALIDATOR ?? 'validator-dev-token',
  reader: process.env.SIGI_SMOKE_READER_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_READER ?? 'reader-dev-token',
};

const roleSpecs = [
  {
    key: 'superadmin',
    email: 'superadmin@sigi.local',
    password: PASSWORDS.superadmin,
    checks: [
      ['GET', '/admin/users', 200],
      ['GET', '/admin/roles', 200],
      ['GET', '/admin/audit', 200],
      ['GET', '/admin/geo-bi', 200],
      ['GET', '/admin/indicators', 200],
      ['GET', '/exports', 200],
      ['POST', '/admin/publications/:publicationId/publish', [201, 404], null],
    ],
  },
  {
    key: 'national_admin',
    email: 'national-admin@sigi.local',
    password: PASSWORDS.nationalAdmin,
    checks: [
      ['GET', '/admin/users', 200],
      ['GET', '/admin/roles', 200],
      ['GET', '/admin/geo-bi', 200],
      ['GET', '/admin/indicators', 200],
      ['GET', '/exports', 200],
      ['POST', '/admin/publications/:publicationId/publish', [201, 404], null],
    ],
  },
  {
    key: 'institution_editor',
    email: 'editor@sigi.local',
    password: PASSWORDS.editor,
    checks: [
      ['GET', '/admin/users', 403],
      ['GET', '/admin/roles', 403],
      ['GET', '/admin/projects', 200],
      ['GET', '/admin/indicators', 200],
      ['GET', '/admin/kobo-sources', 200],
      ['GET', '/admin/geospatial-catalog', 200],
      ['POST', '/admin/geospatial-catalog/publish', 403, { code: 'territories' }],
      ['POST', '/admin/reports/templates', 403, {}],
    ],
  },
  {
    key: 'technical_integration',
    email: 'integration@sigi.local',
    password: PASSWORDS.integration,
    checks: [
      ['GET', '/admin/connectors', 200],
      ['GET', '/admin/geo-bi', 200],
      ['GET', '/admin/indicators', 200],
      ['GET', '/exports', 403],
      ['POST', '/exports/public_portal/run', 403, {}],
      ['POST', '/admin/publications/:publicationId/publish', 403, null],
      ['POST', '/admin/reports/mappings', 403, {}],
    ],
  },
  {
    key: 'technical_validator',
    email: 'validator@sigi.local',
    password: PASSWORDS.validator,
    checks: [
      ['GET', '/admin/validations', 200],
      ['GET', '/admin/indicators', 200],
      ['GET', '/admin/geo-bi', 200],
      ['GET', '/admin/users', 403],
      ['GET', '/admin/kobo-sources', 403],
      ['GET', '/exports', 403],
    ],
  },
  {
    key: 'read_consumer',
    email: 'reader@sigi.local',
    password: PASSWORDS.reader,
    checks: [
      ['GET', '/admin/publications', 200],
      ['GET', '/admin/incidents', 200],
      ['GET', '/admin/indicators', 200],
      ['GET', '/admin/geo-bi', 403],
      ['GET', '/admin/kobo-sources', 403],
      ['GET', '/admin/users', 403],
      ['GET', '/exports', 403],
      ['POST', '/admin/reports/templates', 403, {}],
    ],
  },
];

async function main() {
  const bootstrapToken = await login('superadmin@sigi.local', PASSWORDS.superadmin);
  const bootstrapWorkspace = await getWorkspace(bootstrapToken);
  const bootstrapContext = await resolveRuntimeContext(bootstrapToken, bootstrapWorkspace);
  const results = [];

  for (const spec of roleSpecs) {
    const token = await login(spec.email, spec.password);
    const workspace = await getWorkspace(token);
    const context = await resolveRuntimeContext(token, workspace, bootstrapContext);
    const roleResults = [];

    for (const [method, rawPath, expectedStatus, body] of spec.checks) {
      const path = materializePath(rawPath, context);

      if (!path) {
        roleResults.push({
          method,
          path: rawPath,
          expectedStatus,
          actualStatus: null,
          ok: false,
          code: 'smoke.missing_context',
          requestId: null,
          note: 'No se encontró recurso válido para materializar la ruta dinámica.',
        });
        continue;
      }

      const response = await request(method, path, token, body, context.egiId);
      const acceptedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      const ok = acceptedStatuses.includes(response.status);
      roleResults.push({
        method,
        path,
        expectedStatus,
        actualStatus: response.status,
        ok,
        code: response.payload?.code ?? null,
        requestId: response.payload?.requestId ?? response.requestId ?? null,
      });
    }

    results.push({
      role: spec.key,
      email: spec.email,
      egiId: context.egiId,
      publicationId: context.publicationId,
      passed: roleResults.every((item) => item.ok),
      checks: roleResults,
    });
  }

  const totalChecks = results.reduce((sum, role) => sum + role.checks.length, 0);
  const passedChecks = results.reduce(
    (sum, role) => sum + role.checks.filter((item) => item.ok).length,
    0,
  );

  console.log(JSON.stringify({ apiBaseUrl: API_BASE_URL, passedChecks, totalChecks, results }, null, 2));

  if (passedChecks !== totalChecks) {
    process.exitCode = 1;
  }
}

async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(`No se pudo iniciar sesión para ${email}: ${payload?.message ?? response.status}`);
  }

  return payload?.data?.accessToken;
}

async function getWorkspace(token) {
  const response = await request('GET', '/admin/egi', token);
  return response.payload?.data ?? null;
}

async function resolveRuntimeContext(token, workspace, fallbackContext = {}) {
  let egiId = workspace?.activeEgiId ?? workspace?.spaces?.[0]?.id ?? null;
  let publicationId = null;

  if (egiId) {
    const publicationsResponse = await request('GET', '/admin/publications', token, undefined, egiId);
    publicationId = publicationsResponse.payload?.data?.publications?.[0]?.id ?? null;
  }

  if (!publicationId && Array.isArray(workspace?.spaces)) {
    for (const space of workspace.spaces) {
      const candidateEgiId = space?.id ?? null;
      if (!candidateEgiId) {
        continue;
      }

      const publicationsResponse = await request(
        'GET',
        '/admin/publications',
        token,
        undefined,
        candidateEgiId,
      );
      const candidatePublicationId =
        publicationsResponse.payload?.data?.publications?.[0]?.id ?? null;
      if (candidatePublicationId) {
        egiId = candidateEgiId;
        publicationId = candidatePublicationId;
        break;
      }
    }
  }

  if (!publicationId && fallbackContext.publicationId && fallbackContext.egiId) {
    publicationId = fallbackContext.publicationId;
    egiId = fallbackContext.egiId;
  }

  return {
    egiId,
    publicationId,
  };
}

function materializePath(path, context) {
  if (path.includes(':publicationId')) {
    return path.replace(
      ':publicationId',
      context.publicationId ?? '00000000-0000-4000-8000-000000000000',
    );
  }

  return path;
}

async function request(method, path, token, body, egiId) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(egiId ? { 'X-SIGI-EGI-ID': egiId } : {}),
        ...(body !== null && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== null && body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await safeJson(response);
    if (response.status !== 429 || attempt >= MAX_REQUEST_ATTEMPTS) {
      return {
        status: response.status,
        requestId: response.headers.get('x-request-id'),
        payload,
      };
    }

    await delay(RATE_LIMIT_RETRY_MS);
  }

  return {
    status: 500,
    requestId: null,
    payload: { code: 'smoke.retry_exhausted' },
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
