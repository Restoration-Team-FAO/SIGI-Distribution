const API_BASE_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
const RATE_LIMIT_RETRY_MS = Number(process.env.SIGI_SMOKE_RATE_LIMIT_RETRY_MS ?? 61000);
const MAX_REQUEST_ATTEMPTS = Number(process.env.SIGI_SMOKE_MAX_ATTEMPTS ?? 2);
const SUPERADMIN_PASSWORD =
  process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token';
const UAT_INSTITUTION_CODE = 'UAT_FIAES';
const UAT_INSTITUTION_NAME = 'Fundación FIAES UAT';
const UAT_EGI_CODE = 'EGI-UAT-FIAES';
const UAT_EGI_NAME = 'EGI UAT FIAES';

async function main() {
  const superToken = await login('superadmin@sigi.local', SUPERADMIN_PASSWORD);
  const workspace = await getWorkspace(superToken);
  const [egiA, egiB] = await ensureUatEgis(superToken, workspace);
  const stamp = Date.now();
  const checks = [];

  const created = {
    userAId: null,
    userBId: null,
    sourceAId: null,
    sourceBId: null,
    folderAId: null,
    folderBId: null,
    fileAId: null,
    fileBId: null,
  };

  let forbiddenARequestId = null;
  let forbiddenBRequestId = null;

  try {
    const projectA = await ensureProject(superToken, egiA, 'UAT-PRJ-MARN', 'Proyecto UAT MARN');
    const projectB = await ensureProject(superToken, egiB, 'UAT-PRJ-FIAES', 'Proyecto UAT FIAES');
    const importsA = await getData(superToken, '/admin/imports/batches', egiA.id);
    const importsB = await getData(superToken, '/admin/imports/batches', egiB.id);

    const userA = await createUser(superToken, {
      institutionId: egiA.institutionId,
      email: `uat.editor.a.${stamp}@sigi.local`,
      displayName: `UAT Editor A ${stamp}`,
      password: 'UatPass1234!',
      status: 'active',
      roles: ['institution_editor'],
    });
    created.userAId = userA.id;

    const userB = await createUser(superToken, {
      institutionId: egiB.institutionId,
      email: `uat.editor.b.${stamp}@sigi.local`,
      displayName: `UAT Editor B ${stamp}`,
      password: 'UatPass1234!',
      status: 'active',
      roles: ['institution_editor'],
    });
    created.userBId = userB.id;

    const sourceA = await postJson(
      superToken,
      '/admin/sources',
      {
        institutionId: egiA.institutionId,
        code: `UAT_SRC_A_${stamp}`,
        name: `UAT Source A ${stamp}`,
        sourceType: 'api',
        description: 'Fuente temporal UAT A',
        userName: 'uat-a',
        status: 'active',
      },
      egiA.id,
    );
    created.sourceAId = sourceA.id;

    const sourceB = await postJson(
      superToken,
      '/admin/sources',
      {
        institutionId: egiB.institutionId,
        code: `UAT_SRC_B_${stamp}`,
        name: `UAT Source B ${stamp}`,
        sourceType: 'api',
        description: 'Fuente temporal UAT B',
        userName: 'uat-b',
        status: 'active',
      },
      egiB.id,
    );
    created.sourceBId = sourceB.id;

    const folderA = await postJson(
      superToken,
      '/admin/files/folders',
      {
        institutionId: egiA.institutionId,
        name: `UATFolderA_${stamp}`,
        description: 'Carpeta temporal UAT A',
        visibility: 'internal',
      },
      egiA.id,
    );
    created.folderAId = folderA.id;

    const folderB = await postJson(
      superToken,
      '/admin/files/folders',
      {
        institutionId: egiB.institutionId,
        name: `UATFolderB_${stamp}`,
        description: 'Carpeta temporal UAT B',
        visibility: 'internal',
      },
      egiB.id,
    );
    created.folderBId = folderB.id;

    const fileA = await uploadTextFile(
      superToken,
      {
        fileName: `uat-a-${stamp}.txt`,
        content: `UAT A ${stamp}`,
        folderId: folderA.id,
        institutionId: egiA.institutionId,
        title: `Documento UAT A ${stamp}`,
      },
      egiA.id,
    );
    created.fileAId = fileA.id;

    const fileB = await uploadTextFile(
      superToken,
      {
        fileName: `uat-b-${stamp}.txt`,
        content: `UAT B ${stamp}`,
        folderId: folderB.id,
        institutionId: egiB.institutionId,
        title: `Documento UAT B ${stamp}`,
      },
      egiB.id,
    );
    created.fileBId = fileB.id;

    const editorAToken = await login(userA.email, 'UatPass1234!');
    const editorBToken = await login(userB.email, 'UatPass1234!');
    const editorAWorkspace = await getWorkspace(editorAToken);
    const editorBWorkspace = await getWorkspace(editorBToken);

    pushCheck(
      checks,
      'workspace.a.no_foreign_egi',
      !editorAWorkspace.spaces.some((space) => space.id === egiB.id),
      { visibleEgis: editorAWorkspace.spaces.map((space) => space.code) },
    );
    pushCheck(
      checks,
      'workspace.b.no_foreign_egi',
      !editorBWorkspace.spaces.some((space) => space.id === egiA.id),
      { visibleEgis: editorBWorkspace.spaces.map((space) => space.code) },
    );

    await postJson(editorAToken, '/admin/egi/active', { egiId: egiA.id });
    await postJson(editorBToken, '/admin/egi/active', { egiId: egiB.id });

    const sourcesA = await getData(editorAToken, '/admin/sources', egiA.id);
    const sourcesB = await getData(editorBToken, '/admin/sources', egiB.id);
    pushCheck(
      checks,
      'sources.a.separated',
      sourcesA.sources.some((item) => item.id === sourceA.id) &&
        !sourcesA.sources.some((item) => item.id === sourceB.id) &&
        sourcesA.sources.every((item) => item.egiId === egiA.id),
      {
        expectedOwnSourceId: sourceA.id,
        foreignSourceId: sourceB.id,
        visibleCount: sourcesA.sources.length,
      },
    );
    pushCheck(
      checks,
      'sources.b.separated',
      sourcesB.sources.some((item) => item.id === sourceB.id) &&
        !sourcesB.sources.some((item) => item.id === sourceA.id) &&
        sourcesB.sources.every((item) => item.egiId === egiB.id),
      {
        expectedOwnSourceId: sourceB.id,
        foreignSourceId: sourceA.id,
        visibleCount: sourcesB.sources.length,
      },
    );

    const projectsA = await getData(editorAToken, '/admin/projects', egiA.id);
    const projectsB = await getData(editorBToken, '/admin/projects', egiB.id);
    pushCheck(
      checks,
      'projects.a.separated',
      projectsA.projects.some((item) => item.id === projectA.id) &&
        !projectsA.projects.some((item) => item.id === projectB.id) &&
        projectsA.projects.every((item) => item.egiId === egiA.id),
      {
        ownProjectId: projectA.id,
        foreignProjectId: projectB.id,
        visibleCount: projectsA.projects.length,
      },
    );
    pushCheck(
      checks,
      'projects.b.separated',
      projectsB.projects.some((item) => item.id === projectB.id) &&
        !projectsB.projects.some((item) => item.id === projectA.id) &&
        projectsB.projects.every((item) => item.egiId === egiB.id),
      {
        ownProjectId: projectB.id,
        foreignProjectId: projectA.id,
        visibleCount: projectsB.projects.length,
      },
    );

    pushCheck(
      checks,
      'imports.a.filtered',
      Array.isArray(importsA.batches) && importsA.batches.every((item) => item.egiId === egiA.id),
      {
        count: importsA.batches.length,
        egiId: egiA.id,
      },
    );
    pushCheck(
      checks,
      'imports.b.filtered',
      Array.isArray(importsB.batches) && importsB.batches.every((item) => item.egiId === egiB.id),
      {
        count: importsB.batches.length,
        egiId: egiB.id,
      },
    );

    const filesA = await getData(editorAToken, '/admin/files/root/items', egiA.id);
    const filesB = await getData(editorBToken, '/admin/files/root/items', egiB.id);
    pushCheck(
      checks,
      'files.a.separated',
      filesA.folders.some((item) => item.id === folderA.id) &&
        !filesA.folders.some((item) => item.id === folderB.id) &&
        filesA.folders.every((item) => item.egiId === egiA.id),
      {
        ownFolderId: folderA.id,
        foreignFolderId: folderB.id,
        visibleFolderCount: filesA.folders.length,
      },
    );
    pushCheck(
      checks,
      'files.b.separated',
      filesB.folders.some((item) => item.id === folderB.id) &&
        !filesB.folders.some((item) => item.id === folderA.id) &&
        filesB.folders.every((item) => item.egiId === egiB.id),
      {
        ownFolderId: folderB.id,
        foreignFolderId: folderA.id,
        visibleFolderCount: filesB.folders.length,
      },
    );

    const fileDetailA = await request('GET', `/admin/files/${fileA.id}`, editorAToken, undefined, egiA.id);
    const fileDetailB = await request('GET', `/admin/files/${fileB.id}`, editorBToken, undefined, egiB.id);
    pushCheck(checks, 'file.detail.a.own', fileDetailA.ok && fileDetailA.payload?.data?.file?.id === fileA.id, {
      status: fileDetailA.status,
      fileId: fileDetailA.payload?.data?.file?.id ?? null,
    });
    pushCheck(checks, 'file.detail.b.own', fileDetailB.ok && fileDetailB.payload?.data?.file?.id === fileB.id, {
      status: fileDetailB.status,
      fileId: fileDetailB.payload?.data?.file?.id ?? null,
    });

    const forbiddenSummaryA = await request('GET', `/admin/egi/${egiB.id}/summary`, editorAToken);
    const forbiddenSummaryB = await request('GET', `/admin/egi/${egiA.id}/summary`, editorBToken);
    forbiddenARequestId = forbiddenSummaryA.payload?.requestId ?? null;
    forbiddenBRequestId = forbiddenSummaryB.payload?.requestId ?? null;
    pushCheck(checks, 'egi.summary.a.foreign.forbidden', forbiddenSummaryA.status === 403, {
      status: forbiddenSummaryA.status,
      requestId: forbiddenARequestId,
    });
    pushCheck(checks, 'egi.summary.b.foreign.forbidden', forbiddenSummaryB.status === 403, {
      status: forbiddenSummaryB.status,
      requestId: forbiddenBRequestId,
    });

    const crossSourceUpdateA = await request(
      'PATCH',
      `/admin/sources/${sourceB.id}`,
      editorAToken,
      { name: `Illegal Edit ${stamp}` },
      egiA.id,
    );
    const crossSourceUpdateB = await request(
      'PATCH',
      `/admin/sources/${sourceA.id}`,
      editorBToken,
      { name: `Illegal Edit ${stamp}` },
      egiB.id,
    );
    pushCheck(
      checks,
      'source.update.a.foreign.blocked',
      [403, 404].includes(crossSourceUpdateA.status),
      { status: crossSourceUpdateA.status, code: crossSourceUpdateA.payload?.code ?? null },
    );
    pushCheck(
      checks,
      'source.update.b.foreign.blocked',
      [403, 404].includes(crossSourceUpdateB.status),
      { status: crossSourceUpdateB.status, code: crossSourceUpdateB.payload?.code ?? null },
    );

    const crossProjectReadA = await request('GET', `/admin/projects/${projectB.id}`, editorAToken, undefined, egiA.id);
    const crossProjectReadB = await request('GET', `/admin/projects/${projectA.id}`, editorBToken, undefined, egiB.id);
    pushCheck(checks, 'project.read.a.foreign.blocked', [403, 404].includes(crossProjectReadA.status), {
      status: crossProjectReadA.status,
      code: crossProjectReadA.payload?.code ?? null,
    });
    pushCheck(checks, 'project.read.b.foreign.blocked', [403, 404].includes(crossProjectReadB.status), {
      status: crossProjectReadB.status,
      code: crossProjectReadB.payload?.code ?? null,
    });
  } finally {
    await safeDelete(superToken, 'DELETE', `/admin/files/${created.fileAId}`, egiA?.id, created.fileAId);
    await safeDelete(superToken, 'DELETE', `/admin/files/${created.fileBId}`, egiB?.id, created.fileBId);
    await safeDelete(superToken, 'DELETE', `/admin/files/folders/${created.folderAId}`, egiA?.id, created.folderAId);
    await safeDelete(superToken, 'DELETE', `/admin/files/folders/${created.folderBId}`, egiB?.id, created.folderBId);
    await safeDelete(superToken, 'DELETE', `/admin/sources/${created.sourceAId}`, egiA?.id, created.sourceAId);
    await safeDelete(superToken, 'DELETE', `/admin/sources/${created.sourceBId}`, egiB?.id, created.sourceBId);
    await safeDelete(superToken, 'DELETE', `/admin/users/${created.userAId}`, undefined, created.userAId);
    await safeDelete(superToken, 'DELETE', `/admin/users/${created.userBId}`, undefined, created.userBId);
  }

  const auditResponse = await request('GET', '/admin/audit', superToken);
  if (!auditResponse.ok) {
    throw new Error(`No se pudo consultar auditoría UAT: ${auditResponse.status}`);
  }
  const audit = auditResponse.payload?.data?.audit ?? [];

  const forbiddenAuditA = audit.find(
    (item) => item.action === 'access.forbidden' && item.details?.requestId === forbiddenARequestId,
  );
  const forbiddenAuditB = audit.find(
    (item) => item.action === 'access.forbidden' && item.details?.requestId === forbiddenBRequestId,
  );
  const sourceAuditA = audit.find(
    (item) => item.action === 'source.created' && item.entityId === created.sourceAId && item.egiId === egiA.id,
  );
  const sourceAuditB = audit.find(
    (item) => item.action === 'source.created' && item.entityId === created.sourceBId && item.egiId === egiB.id,
  );

  pushCheck(checks, 'audit.forbidden.a.exists', Boolean(forbiddenAuditA), {
    requestId: forbiddenARequestId,
    egiId: forbiddenAuditA?.egiId ?? null,
  });
  pushCheck(checks, 'audit.forbidden.b.exists', Boolean(forbiddenAuditB), {
    requestId: forbiddenBRequestId,
    egiId: forbiddenAuditB?.egiId ?? null,
  });
  pushCheck(checks, 'audit.source.a.egi', Boolean(sourceAuditA), {
    sourceId: created.sourceAId,
    egiId: egiA.id,
  });
  pushCheck(checks, 'audit.source.b.egi', Boolean(sourceAuditB), {
    sourceId: created.sourceBId,
    egiId: egiB.id,
  });

  const passedChecks = checks.filter((check) => check.ok).length;
  const totalChecks = checks.length;

  console.log(
    JSON.stringify(
      {
        apiBaseUrl: API_BASE_URL,
        egiA: { id: egiA.id, code: egiA.code, institutionId: egiA.institutionId },
        egiB: { id: egiB.id, code: egiB.code, institutionId: egiB.institutionId },
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

function pickDistinctInstitutionEgis(spaces) {
  const preferredCodes = ['EGI-MARN-TEST', 'EGI-FIAES-COSTA', 'EGI-MARN-OCC', 'EGI-LEGACY'];
  const preferred = preferredCodes
    .map((code) => spaces.find((space) => space.code === code))
    .filter(Boolean);
  const ordered = [...preferred, ...spaces.filter((space) => !preferred.some((item) => item.id === space.id))];

  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      if (
        ordered[i].institutionId &&
        ordered[j].institutionId &&
        ordered[i].institutionId !== ordered[j].institutionId
      ) {
        return [ordered[i], ordered[j]];
      }
    }
  }

  return null;
}

async function ensureUatEgis(token, workspace) {
  const directMatch = pickDistinctInstitutionEgis(workspace?.spaces ?? []);
  if (directMatch) {
    return directMatch;
  }

  const institutionsResponse = await getData(token, '/admin/institutions');
  const institutions = institutionsResponse.institutions ?? [];
  let uatInstitution =
    institutions.find((item) => item.code === UAT_INSTITUTION_CODE) ??
    institutions.find((item) => item.name === UAT_INSTITUTION_NAME) ??
    null;

  if (!uatInstitution) {
    uatInstitution = await postJson(token, '/admin/institutions', {
      code: UAT_INSTITUTION_CODE,
      name: UAT_INSTITUTION_NAME,
      status: 'active',
    });
  }

  let updatedWorkspace = workspace;
  let uatEgi =
    updatedWorkspace?.spaces?.find((space) => space.code === UAT_EGI_CODE) ?? null;

  if (!uatEgi) {
    await postJson(token, '/admin/egi', {
      institutionId: uatInstitution.id,
      code: UAT_EGI_CODE,
      name: UAT_EGI_NAME,
      description: 'Fixture persistente para UAT multi-EGI / multi-institución.',
      responsible: 'SIGI QA',
      territorialScope: 'Cobertura nacional',
      thematicScope: 'UAT operativo',
      visibility: 'institutional',
      status: 'active',
    });
    updatedWorkspace = await getWorkspace(token);
    uatEgi = updatedWorkspace?.spaces?.find((space) => space.code === UAT_EGI_CODE) ?? null;
  }

  if (uatEgi && uatEgi.institutionId !== uatInstitution.id) {
    await patchJson(token, `/admin/egi/${uatEgi.id}`, {
      institutionId: uatInstitution.id,
    });
    updatedWorkspace = await getWorkspace(token);
    uatEgi = updatedWorkspace?.spaces?.find((space) => space.code === UAT_EGI_CODE) ?? null;
  }

  const finalMatch = pickDistinctInstitutionEgis(updatedWorkspace?.spaces ?? []);
  if (finalMatch) {
    return finalMatch;
  }

  const primary = updatedWorkspace?.spaces?.find((space) => space.code === 'EGI-MARN-TEST')
    ?? updatedWorkspace?.spaces?.[0]
    ?? null;
  if (!primary || !uatEgi) {
    throw new Error('No se pudo aprovisionar el contexto UAT multi-EGI.');
  }

  return [primary, uatEgi];
}

async function ensureProject(token, egi, code, title) {
  const response = await getData(token, '/admin/projects', egi.id);
  const existing =
    response.projects?.find((item) => item.code === code) ??
    response.projects?.[0] ??
    null;
  if (existing) {
    return existing;
  }

  return postJson(
    token,
    '/admin/projects',
    {
      code,
      title,
      objective: `${title} para validación controlada de separación multi-EGI.`,
      summary: 'Fixture persistente de UAT',
      description: 'Proyecto semilla para UAT multi-institución.',
      theme: 'governance',
      priority: 'medium',
      visibility: 'internal',
      status: 'active',
      institutionId: egi.institutionId,
    },
    egi.id,
  );
}

async function createUser(token, body) {
  return postJson(token, '/admin/users', body);
}

async function uploadTextFile(token, input, egiId) {
  const form = new FormData();
  form.append('file', new Blob([input.content], { type: 'text/plain' }), input.fileName);
  form.append('folderId', input.folderId);
  form.append('institutionId', input.institutionId);
  form.append('title', input.title);
  form.append('description', input.title);
  form.append('validationStatus', 'draft');
  form.append('sourceType', 'manual');

  const response = await requestMultipart('/admin/files/upload', token, form, egiId);
  if (!response.ok) {
    throw new Error(`Upload UAT falló con ${response.status}: ${response.payload?.message ?? 'sin mensaje'}`);
  }
  return unwrapEntity(response.payload?.data);
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
    throw new Error(`GET ${path} falló con ${response.status}: ${response.payload?.message ?? 'sin mensaje'}`);
  }
  return response.payload?.data ?? {};
}

async function postJson(token, path, body, egiId) {
  const response = await request('POST', path, token, body, egiId);
  if (!response.ok) {
    throw new Error(`POST ${path} falló con ${response.status}: ${response.payload?.message ?? 'sin mensaje'}`);
  }
  return unwrapEntity(response.payload?.data);
}

async function patchJson(token, path, body, egiId) {
  const response = await request('PATCH', path, token, body, egiId);
  if (!response.ok) {
    throw new Error(`PATCH ${path} falló con ${response.status}: ${response.payload?.message ?? 'sin mensaje'}`);
  }
  return unwrapEntity(response.payload?.data);
}

async function safeDelete(token, method, path, egiId, requiredId) {
  if (!requiredId) {
    return;
  }
  try {
    await request(method, path, token, undefined, egiId);
  } catch {
    return;
  }
}

function unwrapEntity(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if ('user' in data) {
    return data.user;
  }
  if ('source' in data) {
    return data.source;
  }
  if ('project' in data) {
    return data.project;
  }
  if ('folder' in data) {
    return data.folder;
  }
  if ('file' in data) {
    return data.file;
  }
  if ('activeEgiId' in data) {
    return data;
  }

  return data;
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

async function requestMultipart(path, token, form, egiId) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(egiId ? { 'X-SIGI-EGI-ID': egiId } : {}),
      },
      body: form,
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
