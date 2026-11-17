const API_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://127.0.0.1:3000/api';
const PASSWORDS = {
  superadmin: process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token',
};

async function main() {
  const superadmin = await login('superadmin@sigi.local', PASSWORDS.superadmin);
  const workspace = await getJson('/admin/egi', superadmin.accessToken);
  const spaces = workspace.data?.spaces ?? [];

  if (spaces.length < 2) {
    throw new Error('Se requieren al menos 2 EGI para validar publicaciones por alcance.');
  }

  const egiA = spaces[0];
  const egiB = spaces.find((space) => space.id !== egiA.id);
  if (!egiB) {
    throw new Error('No se pudo resolver un segundo EGI para la prueba.');
  }

  const summaryA = await getJson(`/admin/egi/${egiA.id}/summary`, superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiA.id,
  });
  const summaryB = await getJson(`/admin/egi/${egiB.id}/summary`, superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiB.id,
  });

  const publicationsA = await getJson('/admin/publications', superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiA.id,
  });
  const publicationsB = await getJson('/admin/publications', superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiB.id,
  });
  const publicationsGlobal = await getJson('/admin/publications?scope=global', superadmin.accessToken, {
    'X-SIGI-EGI-ID': egiA.id,
  });

  const expectedA = summaryA.data?.summary?.publications ?? 0;
  const expectedB = summaryB.data?.summary?.publications ?? 0;
  const countA = publicationsA.data?.publications?.length ?? 0;
  const countB = publicationsB.data?.publications?.length ?? 0;
  const globalCount = publicationsGlobal.data?.publications?.length ?? 0;

  assert(countA === expectedA, 'Publications de EGI A debe coincidir con su resumen.');
  assert(countB === expectedB, 'Publications de EGI B debe coincidir con su resumen.');
  assert(globalCount >= Math.max(countA, countB), 'Vista global debe ser al menos tan amplia como un EGI individual.');

  console.log(
    JSON.stringify(
      {
        gate: 'sigi.publication_scope',
        ok: true,
        counts: {
          egiA: countA,
          egiB: countB,
          global: globalCount,
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        gate: 'sigi.publication_scope',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
