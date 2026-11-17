const API_BASE_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
const RATE_LIMIT_RETRY_MS = Number(process.env.SIGI_SMOKE_RATE_LIMIT_RETRY_MS ?? 61000);
const MAX_REQUEST_ATTEMPTS = Number(process.env.SIGI_SMOKE_MAX_ATTEMPTS ?? 2);
const SUPERADMIN_PASSWORD =
  process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token';

async function main() {
  const token = await login('superadmin@sigi.local', SUPERADMIN_PASSWORD);
  const workspace = await getWorkspace(token);
  const egi = resolveWorkspace(workspace, process.env.SIGI_SMOKE_EGI_CODE);
  const stamp = Date.now();

  const created = {
    roleId: null,
    roleCode: `zsmoke${stamp}`,
    userId: null,
    sourceId: null,
    folderId: null,
  };

  const checks = [];

  try {
    const role = await createRole(token, {
      code: created.roleCode,
      name: `Rol smoke ${stamp}`,
      permissions: ['projects.read'],
    });
    created.roleId = role.id;
    pushCheck(checks, 'role.create', role.code === created.roleCode, {
      roleId: role.id,
      code: role.code,
    });

    const updatedRole = await patchJson(token, `/admin/roles/${role.id}`, {
      name: `Rol smoke actualizado ${stamp}`,
      permissions: ['projects.read', 'incidents.read'],
    });
    pushCheck(
      checks,
      'role.update',
      updatedRole.name.includes('actualizado') &&
        updatedRole.permissions.some((permission) => permission.code === 'incidents.read'),
      {
        roleId: updatedRole.id,
        permissions: updatedRole.permissions.map((permission) => permission.code),
      },
    );

    const user = await createUser(token, {
      institutionId: egi.institutionId ?? null,
      email: `smoke.user.${stamp}@sigi.local`,
      displayName: `Usuario Smoke ${stamp}`,
      password: 'SmokePass123!',
      status: 'active',
      roles: [created.roleCode],
    });
    created.userId = user.id;
    pushCheck(
      checks,
      'user.create',
      user.email === `smoke.user.${stamp}@sigi.local` && user.roles.includes(created.roleCode),
      {
        userId: user.id,
        roles: user.roles,
      },
    );

    const updatedUser = await patchJson(token, `/admin/users/${user.id}`, {
      displayName: `Usuario Smoke Editado ${stamp}`,
      status: 'inactive',
      roles: [created.roleCode],
    });
    pushCheck(
      checks,
      'user.update',
      updatedUser.displayName.includes('Editado') && updatedUser.status === 'inactive',
      {
        userId: updatedUser.id,
        status: updatedUser.status,
      },
    );

    const source = await postJson(
      token,
      '/admin/sources',
      {
        institutionId: egi.institutionId,
        code: `SMOKE_SRC_${stamp}`,
        name: `Fuente Smoke ${stamp}`,
        sourceType: 'api',
        description: 'Fuente temporal para smoke CRUD',
        userName: 'smoke-user',
        status: 'active',
      },
      egi.id,
    );
    created.sourceId = source.id;
    pushCheck(checks, 'source.create', source.egiId === egi.id && source.code === `SMOKE_SRC_${stamp}`, {
      sourceId: source.id,
      egiId: source.egiId,
    });

    const updatedSource = await patchJson(
      token,
      `/admin/sources/${source.id}`,
      {
        name: `Fuente Smoke Editada ${stamp}`,
        status: 'inactive',
        description: 'Fuente temporal actualizada para smoke CRUD',
      },
      egi.id,
    );
    pushCheck(
      checks,
      'source.update',
      updatedSource.name.includes('Editada') && updatedSource.status === 'inactive',
      {
        sourceId: updatedSource.id,
        status: updatedSource.status,
      },
    );

    const folder = await postJson(
      token,
      '/admin/files/folders',
      {
        institutionId: egi.institutionId,
        name: `SmokeFolder_${stamp}`,
        description: 'Carpeta temporal para smoke CRUD',
        visibility: 'internal',
      },
      egi.id,
    );
    created.folderId = folder.id;
    pushCheck(checks, 'folder.create', folder.egiId === egi.id && folder.name === `SmokeFolder_${stamp}`, {
      folderId: folder.id,
      path: folder.path,
    });

    const updatedFolder = await patchJson(
      token,
      `/admin/files/folders/${folder.id}`,
      {
        name: `SmokeFolderEdit_${stamp}`,
        description: 'Carpeta temporal actualizada',
        visibility: 'internal',
      },
      egi.id,
    );
    pushCheck(
      checks,
      'folder.update',
      updatedFolder.name === `SmokeFolderEdit_${stamp}`,
      {
        folderId: updatedFolder.id,
        path: updatedFolder.path,
      },
    );
  } finally {
    if (created.folderId) {
      const deletedFolder = await deletePath(token, `/admin/files/folders/${created.folderId}`, egi.id);
      pushCheck(checks, 'folder.delete', deletedFolder.deleted === true, {
        folderId: created.folderId,
      });
    }

    if (created.sourceId) {
      const deletedSource = await deletePath(token, `/admin/sources/${created.sourceId}`, egi.id);
      pushCheck(checks, 'source.delete', deletedSource.deleted === true, {
        sourceId: created.sourceId,
      });
    }

    if (created.userId) {
      const deletedUser = await deletePath(token, `/admin/users/${created.userId}`);
      pushCheck(checks, 'user.delete', deletedUser.deleted === true, {
        userId: created.userId,
      });
    }

    if (created.roleId) {
      const deletedRole = await deletePath(token, `/admin/roles/${created.roleId}`);
      pushCheck(checks, 'role.delete', deletedRole.deleted === true, {
        roleId: created.roleId,
      });
    }
  }

  const passedChecks = checks.filter((check) => check.ok).length;
  const totalChecks = checks.length;

  console.log(
    JSON.stringify(
      {
        apiBaseUrl: API_BASE_URL,
        egiId: egi.id,
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

async function createRole(token, body) {
  return postJson(token, '/admin/roles', body);
}

async function createUser(token, body) {
  return postJson(token, '/admin/users', body);
}

async function getWorkspace(token) {
  const response = await request('GET', '/admin/egi', token);
  if (!response.ok) {
    throw new Error(`No se pudo consultar el workspace EGI: ${response.status}`);
  }
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

async function deletePath(token, path, egiId) {
  const response = await request('DELETE', path, token, undefined, egiId);
  if (!response.ok) {
    throw new Error(`DELETE ${path} falló con ${response.status}: ${response.payload?.message ?? 'sin mensaje'}`);
  }

  return response.payload?.data ?? {};
}

function unwrapEntity(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if ('role' in data) {
    return data.role;
  }
  if ('user' in data) {
    return data.user;
  }
  if ('source' in data) {
    return data.source;
  }
  if ('folder' in data) {
    return data.folder;
  }

  return data;
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
