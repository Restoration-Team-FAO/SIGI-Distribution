import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const API_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://127.0.0.1:3000/api';
const PASSWORDS = {
  superadmin:
    process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token',
};
const POSTGRES_CONTAINER = resolvePostgresContainer();
const POSTGRES_DB = process.env.POSTGRES_DB ?? 'sigi_db';
const POSTGRES_USER = process.env.POSTGRES_USER ?? 'sigi_user';

function resolvePostgresContainer() {
  if (process.env.SIGI_SMOKE_POSTGRES_CONTAINER) {
    return process.env.SIGI_SMOKE_POSTGRES_CONTAINER;
  }
  const project = process.env.SIGI_COMPOSE_PROJECT_NAME?.trim();
  const args = ['ps', '--filter', 'label=com.docker.compose.service=postgres'];
  if (project) {
    args.push('--filter', `label=com.docker.compose.project=${project}`);
  }
  args.push('--format', '{{.Names}}');
  const names = execFileSync('docker', args, { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length !== 1) {
    throw new Error(
      `No se pudo resolver un único PostgreSQL activo; define SIGI_SMOKE_POSTGRES_CONTAINER (${names.length} encontrados).`,
    );
  }
  return names[0];
}

async function main() {
  const superadmin = await login('superadmin@sigi.local', PASSWORDS.superadmin);
  const workspace = await getJson('/admin/egi', superadmin.accessToken);
  const spaces = workspace.data?.spaces ?? [];

  const spacesWithProjects = spaces
    .map((space) => ({ ...space, projectId: resolveProjectId(space.id) }))
    .filter((space) => Boolean(space.projectId));
  if (spacesWithProjects.length < 2) {
    throw new Error(
      'Se requieren al menos 2 EGI con proyectos para validar incidentes por alcance.',
    );
  }

  const [egiA, egiB] = spacesWithProjects;
  if (!egiB) {
    throw new Error('No se pudo resolver un segundo EGI para la prueba.');
  }

  const tag = `UAT_SCOPE_${Date.now()}`;
  const cleanupIds = [];

  try {
    const projectA = egiA.projectId;
    const projectB = egiB.projectId;

    const incidentA = insertIncident(projectA, `${tag}_A`);
    const incidentB = insertIncident(projectB, `${tag}_B`);
    cleanupIds.push(incidentA.id, incidentB.id);

    const incidentsA = await getJson(
      '/admin/incidents',
      superadmin.accessToken,
      {
        'X-SIGI-EGI-ID': egiA.id,
      },
    );
    const incidentsB = await getJson(
      '/admin/incidents',
      superadmin.accessToken,
      {
        'X-SIGI-EGI-ID': egiB.id,
      },
    );
    const incidentsGlobal = await getJson(
      '/admin/incidents?scope=global',
      superadmin.accessToken,
      {
        'X-SIGI-EGI-ID': egiA.id,
      },
    );

    const idsA = new Set(
      (incidentsA.data?.incidents ?? []).map((incident) => incident.id),
    );
    const idsB = new Set(
      (incidentsB.data?.incidents ?? []).map((incident) => incident.id),
    );
    const idsGlobal = new Set(
      (incidentsGlobal.data?.incidents ?? []).map((incident) => incident.id),
    );

    assert(idsA.has(incidentA.id), 'El EGI A debe ver su incidente.');
    assert(
      !idsA.has(incidentB.id),
      'El EGI A no debe ver incidentes del EGI B.',
    );
    assert(idsB.has(incidentB.id), 'El EGI B debe ver su incidente.');
    assert(
      !idsB.has(incidentA.id),
      'El EGI B no debe ver incidentes del EGI A.',
    );
    assert(
      idsGlobal.has(incidentA.id) && idsGlobal.has(incidentB.id),
      'La vista global debe consolidar ambos incidentes.',
    );

    console.log(
      JSON.stringify(
        {
          gate: 'sigi.incident_scope',
          ok: true,
          incidents: {
            egiA: incidentA.id,
            egiB: incidentB.id,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    if (cleanupIds.length > 0) {
      runSql(
        `DELETE FROM core.incidents WHERE id IN (${cleanupIds.map((id) => `'${id}'::uuid`).join(', ')});`,
      );
    }
  }
}

function resolveProjectId(egiId) {
  const id = runSqlValue(`
    SELECT id
    FROM core.projects
    WHERE egi_id = '${escapeSql(egiId)}'::uuid
    ORDER BY created_at ASC
    LIMIT 1;
  `);
  return id || null;
}

function insertIncident(projectId, title) {
  const id = crypto.randomUUID();
  runSql(`
    INSERT INTO core.incidents (
      id,
      title,
      severity,
      status,
      project_id,
      notes,
      created_at,
      updated_at
    )
    VALUES (
      '${escapeSql(id)}'::uuid,
      '${escapeSql(title)}',
      'medium',
      'open',
      '${escapeSql(projectId)}'::uuid,
      'scope smoke',
      NOW(),
      NOW()
    );
  `);
  return { id };
}

function runSqlValue(sql) {
  const output = execFileSync(
    'docker',
    [
      'exec',
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      POSTGRES_DB,
      '-t',
      '-A',
      '-c',
      sql,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return output.trim() || null;
}

function runSql(sql) {
  execFileSync(
    'docker',
    [
      'exec',
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      POSTGRES_DB,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
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
        gate: 'sigi.incident_scope',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
