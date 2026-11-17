const API_BASE_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
const RATE_LIMIT_RETRY_MS = Number(process.env.SIGI_SMOKE_RATE_LIMIT_RETRY_MS ?? 61000);
const MAX_REQUEST_ATTEMPTS = Number(process.env.SIGI_SMOKE_MAX_ATTEMPTS ?? 2);
const PASSWORDS = {
  superadmin: process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token',
  editor: process.env.SIGI_SMOKE_EDITOR_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_EDITOR ?? 'editor-dev-token',
  validator: process.env.SIGI_SMOKE_VALIDATOR_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_VALIDATOR ?? 'validator-dev-token',
};

async function main() {
  const superadmin = await createSession('superadmin@sigi.local', PASSWORDS.superadmin);
  const editor = await createSession('editor@sigi.local', PASSWORDS.editor);
  const validator = await createSession('validator@sigi.local', PASSWORDS.validator);

  const [egiTest, egiLegacy] = selectIsolationSpaces(superadmin.workspace);

  const checks = [];

  await runSuperadminIsolationChecks(superadmin.token, egiTest.id, egiLegacy.id, checks);
  await runEditorOperationalChecks(editor, checks);
  await runValidatorOperationalChecks(validator, checks);

  const passedChecks = checks.filter((check) => check.ok).length;
  const totalChecks = checks.length;

  console.log(
    JSON.stringify(
      {
        apiBaseUrl: API_BASE_URL,
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

async function runSuperadminIsolationChecks(token, egiTestId, egiLegacyId, checks) {
  const testSources = await getData(token, '/admin/sources', egiTestId);
  const legacySources = await getData(token, '/admin/sources', egiLegacyId);
  pushCheck(checks, 'sources.test.filtered', matchesOnlyEgi(testSources.sources, egiTestId), {
    count: testSources.sources.length,
    egiId: egiTestId,
  });
  pushCheck(checks, 'sources.legacy.filtered', matchesOnlyEgi(legacySources.sources, egiLegacyId), {
    count: legacySources.sources.length,
    egiId: egiLegacyId,
  });
  pushCheck(checks, 'sources.egi.scopes_valid', matchesOnlyEgi(testSources.sources, egiTestId) && matchesOnlyEgi(legacySources.sources, egiLegacyId), {
    testCount: testSources.sources.length,
    legacyCount: legacySources.sources.length,
  });

  const testProjects = await getData(token, '/admin/projects', egiTestId);
  const legacyProjects = await getData(token, '/admin/projects', egiLegacyId);
  pushCheck(checks, 'projects.test.filtered', matchesOnlyEgi(testProjects.projects, egiTestId), {
    count: testProjects.projects.length,
    egiId: egiTestId,
  });
  pushCheck(checks, 'projects.legacy.filtered', matchesOnlyEgi(legacyProjects.projects, egiLegacyId), {
    count: legacyProjects.projects.length,
    egiId: egiLegacyId,
  });
  pushCheck(checks, 'projects.egi.scopes_valid', matchesOnlyEgi(testProjects.projects, egiTestId) && matchesOnlyEgi(legacyProjects.projects, egiLegacyId), {
    testCount: testProjects.projects.length,
    legacyCount: legacyProjects.projects.length,
  });

  const testImports = await getData(token, '/admin/imports/batches', egiTestId);
  const legacyImports = await getData(token, '/admin/imports/batches', egiLegacyId);
  pushCheck(checks, 'imports.test.filtered', matchesOnlyEgi(testImports.batches, egiTestId), {
    count: testImports.batches.length,
    egiId: egiTestId,
  });
  pushCheck(checks, 'imports.legacy.filtered', matchesOnlyEgi(legacyImports.batches, egiLegacyId), {
    count: legacyImports.batches.length,
    egiId: egiLegacyId,
  });
  pushCheck(checks, 'imports.egi.scopes_valid', matchesOnlyEgi(testImports.batches, egiTestId) && matchesOnlyEgi(legacyImports.batches, egiLegacyId), {
    testCount: testImports.batches.length,
    legacyCount: legacyImports.batches.length,
  });

  const testFiles = await getData(token, '/admin/files/root/items', egiTestId);
  const legacyFiles = await getData(token, '/admin/files/root/items', egiLegacyId);
  pushCheck(
    checks,
    'files.test.filtered',
    matchesOnlyEgi([...(testFiles.folders ?? []), ...(testFiles.files ?? [])], egiTestId),
    {
      folderCount: testFiles.folders?.length ?? 0,
      fileCount: testFiles.files?.length ?? 0,
      egiId: egiTestId,
    },
  );
  pushCheck(
    checks,
    'files.legacy.filtered',
    matchesOnlyEgi([...(legacyFiles.folders ?? []), ...(legacyFiles.files ?? [])], egiLegacyId),
    {
      folderCount: legacyFiles.folders?.length ?? 0,
      fileCount: legacyFiles.files?.length ?? 0,
      egiId: egiLegacyId,
    },
  );
  pushCheck(
    checks,
    'files.egi.scopes_valid',
    matchesOnlyEgi([...(testFiles.folders ?? []), ...(testFiles.files ?? [])], egiTestId) &&
      matchesOnlyEgi([...(legacyFiles.folders ?? []), ...(legacyFiles.files ?? [])], egiLegacyId),
    {
      testFolders: testFiles.folders?.length ?? 0,
      legacyFolders: legacyFiles.folders?.length ?? 0,
      testFiles: testFiles.files?.length ?? 0,
      legacyFiles: legacyFiles.files?.length ?? 0,
    },
  );

  const testValidations = await getData(token, '/admin/validations', egiTestId);
  const legacyValidations = await getData(token, '/admin/validations', egiLegacyId);
  pushCheck(
    checks,
    'validations.test.filtered',
    matchesOnlyEgi(testValidations.validations, egiTestId),
    {
      count: testValidations.validations.length,
      egiId: egiTestId,
    },
  );
  pushCheck(
    checks,
    'validations.legacy.filtered',
    matchesOnlyEgi(legacyValidations.validations, egiLegacyId),
    {
      count: legacyValidations.validations.length,
      egiId: egiLegacyId,
    },
  );
  pushCheck(checks, 'validations.egi.scopes_valid', matchesOnlyEgi(testValidations.validations, egiTestId) && matchesOnlyEgi(legacyValidations.validations, egiLegacyId), {
    testCount: testValidations.validations.length,
    legacyCount: legacyValidations.validations.length,
  });
}

async function runEditorOperationalChecks(session, checks) {
  pushCheck(checks, 'editor.active_egi.present', Boolean(session.egiId), {
    egiId: session.egiId,
  });

  const projects = await getData(session.token, '/admin/projects', session.egiId);
  pushCheck(checks, 'editor.projects.access', Array.isArray(projects.projects), {
    count: projects.projects?.length ?? 0,
  });
  pushCheck(checks, 'editor.projects.filtered', matchesOnlyEgi(projects.projects, session.egiId), {
    egiId: session.egiId,
  });

  const sources = await getData(session.token, '/admin/sources', session.egiId);
  pushCheck(checks, 'editor.sources.filtered', matchesOnlyEgi(sources.sources, session.egiId), {
    count: sources.sources.length,
    egiId: session.egiId,
  });

  const files = await getData(session.token, '/admin/files/root/items', session.egiId);
  pushCheck(
    checks,
    'editor.files.filtered',
    matchesOnlyEgi([...(files.folders ?? []), ...(files.files ?? [])], session.egiId),
    {
      folderCount: files.folders?.length ?? 0,
      fileCount: files.files?.length ?? 0,
      egiId: session.egiId,
    },
  );
}

async function runValidatorOperationalChecks(session, checks) {
  pushCheck(checks, 'validator.active_egi.present', Boolean(session.egiId), {
    egiId: session.egiId,
  });

  const validations = await getData(session.token, '/admin/validations', session.egiId);
  pushCheck(checks, 'validator.validations.access', Array.isArray(validations.validations), {
    count: validations.validations?.length ?? 0,
  });
  pushCheck(
    checks,
    'validator.validations.filtered',
    matchesOnlyEgi(validations.validations, session.egiId),
    {
      count: validations.validations.length,
      egiId: session.egiId,
    },
  );
}

async function createSession(email, password) {
  const token = await login(email, password);
  const workspace = await getWorkspace(token);
  return {
    token,
    workspace,
    egiId: workspace?.activeEgiId ?? workspace?.spaces?.[0]?.id ?? null,
  };
}

function selectIsolationSpaces(workspace) {
  const spaces = workspace?.spaces ?? [];
  const preferredCodes = ['EGI-MARN-OCC', 'EGI-LEGACY'];
  const preferred = preferredCodes
    .map((code) => spaces.find((item) => item.code === code))
    .filter(Boolean);
  const ordered = [
    ...preferred,
    ...spaces.filter((space) => !preferred.some((item) => item.id === space.id)),
  ];
  if (ordered.length < 2) {
    throw new Error('Se requieren al menos dos EGI para validar el aislamiento operacional.');
  }
  return [ordered[0], ordered[1]];
}

function matchesOnlyEgi(items, egiId) {
  return Array.isArray(items) && items.every((item) => item?.egiId === egiId);
}

function pushCheck(checks, name, ok, details) {
  checks.push({ name, ok, details });
}

async function login(email, password) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const payload = await safeJson(response);
    if (response.ok) {
      return payload?.data?.accessToken;
    }

    if (response.status === 429 && attempt < MAX_REQUEST_ATTEMPTS) {
      await delay(RATE_LIMIT_RETRY_MS);
      continue;
    }

    throw new Error(`No se pudo iniciar sesión para ${email}: ${payload?.message ?? response.status}`);
  }

  throw new Error(`No se pudo iniciar sesión para ${email}: retries agotados.`);
}

async function getWorkspace(token) {
  const response = await request('GET', '/admin/egi', token);
  if (!response.ok) {
    throw new Error(`No se pudo consultar el workspace EGI: ${response.status}`);
  }
  return response.payload?.data ?? null;
}

async function getData(token, path, egiId) {
  const response = await request('GET', path, token, undefined, egiId);
  if (!response.ok) {
    throw new Error(`Fallo operativo en ${path}: ${response.status} (${response.payload?.code ?? 'sin_codigo'})`);
  }
  return response.payload?.data ?? {};
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
        payload,
      };
    }

    await delay(RATE_LIMIT_RETRY_MS);
  }

  return {
    ok: false,
    status: 500,
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
