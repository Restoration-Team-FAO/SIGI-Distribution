const API_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://127.0.0.1:3000/api';
const PASSWORDS = {
  superadmin: process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token',
};

async function main() {
  const superadmin = await login('superadmin@sigi.local', PASSWORDS.superadmin);

  const workspace = await getJson('/admin/egi', superadmin.accessToken);
  const spaces = workspace.data?.spaces ?? [];
  if (spaces.length < 2) {
    throw new Error('Se requieren al menos 2 EGI para validar aislamiento de exportaciones.');
  }

  const egiA = spaces[0];
  const egiB = spaces.find((space) => space.id !== egiA.id);
  if (!egiB) {
    throw new Error('No se pudo resolver un segundo EGI para la prueba.');
  }

  const runA = await postJson(`/exports/ferm/run`, superadmin.accessToken, {}, {
    'X-SIGI-EGI-ID': egiA.id,
  });
  const runB = await postJson(`/exports/ferm/run`, superadmin.accessToken, {}, {
    'X-SIGI-EGI-ID': egiB.id,
  });

  const targetA = await getJson(`/exports/ferm`, superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiA.id,
  });
  const targetB = await getJson(`/exports/ferm`, superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiB.id,
  });
  const targetGlobal = await getJson(`/exports/ferm?scope=global`, superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiA.id,
  });

  assert(targetA.data.latestRun?.id === runA.data.exportRunId, 'El EGI A debe ver su propia corrida.');
  assert(targetB.data.latestRun?.id === runB.data.exportRunId, 'El EGI B debe ver su propia corrida.');
  assert(
    targetA.data.latestRun?.id !== targetB.data.latestRun?.id,
    'Las corridas de exportación no deben mezclarse entre EGI.',
  );
  assert(
    targetGlobal.data.latestRun?.id === runB.data.exportRunId,
    'La vista global debe exponer la corrida global más reciente del target.',
  );

  const listA = await getJson(`/exports`, superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiA.id,
  });
  const listB = await getJson(`/exports`, superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiB.id,
  });

  const fermA = listA.data.targets.find((target) => target.target === 'ferm');
  const fermB = listB.data.targets.find((target) => target.target === 'ferm');
  assert(fermA?.latestRun?.id === runA.data.exportRunId, 'Listado de EGI A debe quedar aislado.');
  assert(fermB?.latestRun?.id === runB.data.exportRunId, 'Listado de EGI B debe quedar aislado.');

  console.log(
    JSON.stringify(
      {
        gate: 'sigi.export_scope',
        ok: true,
        runs: {
          egiA: runA.data.exportRunId,
          egiB: runB.data.exportRunId,
          global: targetGlobal.data.latestRun?.id ?? null,
        },
      },
      null,
      2,
    ),
  );
}

async function login(email, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Login failed for ${email}: ${response.status}`);
  }
  return response.json().then((payload) => payload.data);
}

async function getJson(path, token, extraHeaders = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  return response.json();
}

async function postJson(path, token, body, extraHeaders = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status}`);
  }
  return response.json();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        gate: 'sigi.export_scope',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
