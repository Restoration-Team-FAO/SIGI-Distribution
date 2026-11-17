const API_BASE_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
const RATE_LIMIT_RETRY_MS = Number(process.env.SIGI_SMOKE_RATE_LIMIT_RETRY_MS ?? 61000);
const MAX_REQUEST_ATTEMPTS = Number(process.env.SIGI_SMOKE_MAX_ATTEMPTS ?? 2);
const PASSWORDS = {
  superadmin: process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token',
  reader: process.env.SIGI_SMOKE_READER_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_READER ?? 'reader-dev-token',
};

async function main() {
  const superToken = await login('superadmin@sigi.local', PASSWORDS.superadmin);
  const readerToken = await login('reader@sigi.local', PASSWORDS.reader);
  const workspace = await getWorkspace(superToken);
  const egi = resolveWorkspace(workspace, process.env.SIGI_SMOKE_EGI_CODE);
  const stamp = Date.now();

  let sourceId = null;
  let forbiddenRequestId = null;
  const checks = [];

  try {
    const created = await request(
      'POST',
      '/admin/sources',
      superToken,
      {
        institutionId: egi.institutionId,
        code: `AUDIT_SRC_${stamp}`,
        name: `Audit Source ${stamp}`,
        sourceType: 'api',
        description: 'Fuente temporal para smoke de auditoria',
        userName: 'audit-user',
        status: 'active',
      },
      egi.id,
    );
    assertOk(created, 'No se pudo crear la fuente de auditoría');
    sourceId = created.payload?.data?.source?.id ?? null;

    const updated = await request(
      'PATCH',
      `/admin/sources/${sourceId}`,
      superToken,
      {
        name: `Audit Source Updated ${stamp}`,
        status: 'inactive',
      },
      egi.id,
    );
    assertOk(updated, 'No se pudo actualizar la fuente de auditoría');

    const forbidden = await request('GET', '/admin/users', readerToken, undefined, egi.id);
    pushCheck(checks, 'forbidden.response.status', forbidden.status === 403, {
      status: forbidden.status,
      code: forbidden.payload?.code ?? null,
    });
    pushCheck(checks, 'forbidden.response.request_id', Boolean(forbidden.payload?.requestId), {
      requestId: forbidden.payload?.requestId ?? null,
    });
    forbiddenRequestId = forbidden.payload?.requestId ?? null;
  } finally {
    if (sourceId) {
      const deleted = await request('DELETE', `/admin/sources/${sourceId}`, superToken, undefined, egi.id);
      assertOk(deleted, 'No se pudo eliminar la fuente de auditoría');
    }
  }

  const auditResponse = await request('GET', '/admin/audit', superToken);
  assertOk(auditResponse, 'No se pudo consultar auditoría');
  const audit = auditResponse.payload?.data?.audit ?? [];

  const sourceCreated = audit.find((item) => item.action === 'source.created' && item.entityId === sourceId);
  const sourceUpdated = audit.find((item) => item.action === 'source.updated' && item.entityId === sourceId);
  const sourceDeleted = audit.find((item) => item.action === 'source.deleted' && item.entityId === sourceId);
  const forbiddenAudit = audit.find(
    (item) =>
      item.action === 'access.forbidden' &&
      item.details?.requestId === forbiddenRequestId,
  );

  pushCheck(checks, 'audit.source.created.exists', Boolean(sourceCreated), {
    sourceId,
    egiId: sourceCreated?.egiId ?? null,
  });
  pushCheck(checks, 'audit.source.updated.exists', Boolean(sourceUpdated), {
    sourceId,
    egiId: sourceUpdated?.egiId ?? null,
  });
  pushCheck(checks, 'audit.source.deleted.exists', Boolean(sourceDeleted), {
    sourceId,
    egiId: sourceDeleted?.egiId ?? null,
  });
  pushCheck(
    checks,
    'audit.source.egi_propagated',
    [sourceCreated, sourceUpdated, sourceDeleted].every((item) => item?.egiId === egi.id),
    {
      expectedEgiId: egi.id,
      actual: [sourceCreated?.egiId ?? null, sourceUpdated?.egiId ?? null, sourceDeleted?.egiId ?? null],
    },
  );
  pushCheck(checks, 'audit.forbidden.exists', Boolean(forbiddenAudit), {
    requestId: forbiddenRequestId,
    egiId: forbiddenAudit?.egiId ?? null,
  });
  pushCheck(
    checks,
    'audit.forbidden.details',
    forbiddenAudit?.details?.code === 'auth.forbidden' &&
      forbiddenAudit?.details?.requestId === forbiddenRequestId,
    {
      requestId: forbiddenRequestId,
      code: forbiddenAudit?.details?.code ?? null,
      egiId: forbiddenAudit?.egiId ?? null,
    },
  );

  const passedChecks = checks.filter((check) => check.ok).length;
  const totalChecks = checks.length;

  console.log(
    JSON.stringify(
      {
        apiBaseUrl: API_BASE_URL,
        egiId: egi.id,
        sourceId,
        forbiddenRequestId,
        passedChecks,
        totalChecks,
        checks,
      },
      null,
      2,
    ),
  );

  if (passedChecks !== totalChecks) {
    process.exitCode = 1;
  }
}

function pushCheck(checks, name, ok, details) {
  checks.push({ name, ok, details });
}

function assertOk(response, message) {
  if (!response.ok) {
    throw new Error(`${message}: ${response.status} ${response.payload?.message ?? 'sin mensaje'}`);
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
  assertOk(response, 'No se pudo consultar el workspace EGI');
  return response.payload?.data ?? null;
}

function requireWorkspaceByCode(workspace, code) {
  const match = workspace?.spaces?.find((item) => item.code === code);
  if (!match) {
    throw new Error(`No se encontró el EGI requerido: ${code}`);
  }
  return match;
}

function resolveWorkspace(workspace, requestedCode) {
  if (requestedCode) return requireWorkspaceByCode(workspace, requestedCode);
  const egi =
    workspace.spaces?.find((item) => item.code === 'EGI-MARN-OCC') ??
    workspace.spaces?.[0];
  if (!egi) throw new Error('No se encontró ningún EGI disponible para el smoke.');
  return egi;
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
        ok: response.ok,
        status: response.status,
        requestId: response.headers.get('x-request-id'),
        payload,
      };
    }

    await delay(RATE_LIMIT_RETRY_MS);
  }

  return {
    ok: false,
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
