import { execFileSync } from 'node:child_process';

const API_BASE_URL =
  process.env.SIGI_SMOKE_API_URL ?? 'http://127.0.0.1:3000/api';
const RATE_LIMIT_RETRY_MS = Number(
  process.env.SIGI_SMOKE_RATE_LIMIT_RETRY_MS ?? 61000,
);
const MAX_REQUEST_ATTEMPTS = Number(process.env.SIGI_SMOKE_MAX_ATTEMPTS ?? 2);
const SUPERADMIN_PASSWORD =
  process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token';

async function main() {
  const token = await login('superadmin@sigi.local', SUPERADMIN_PASSWORD);
  const workspace = await getWorkspace(token);
  const egi = resolveWorkspace(workspace, process.env.SIGI_SMOKE_EGI_CODE);
  const stamp = Date.now();
  const checks = [];
  let datasetId = null;
  let scopedSourceId = null;
  let bootstrapSourceId = null;
  let patchedProjectId = null;

  try {
    const sourceList = await apiRequest(
      'GET',
      '/admin/sources',
      token,
      undefined,
      egi.id,
    );
    assertOk(sourceList, 'No se pudo listar fuentes del EGI de prueba');
    let source = sourceList.payload?.data?.sources?.[0] ?? null;
    if (!source) {
      const bootstrapSource = await apiRequest(
        'POST',
        '/admin/sources',
        token,
        {
          institutionId: egi.institutionId,
          code: `step2-bootstrap-${stamp}`,
          name: `Fuente bootstrap Step 2 ${stamp}`,
          sourceType: 'excel',
          country: 'El Salvador',
          allowedCountries: ['El Salvador'],
          territorialScope: 'Validación Step 2',
          status: 'active',
        },
        egi.id,
      );
      assertOk(bootstrapSource, 'No se pudo crear la fuente bootstrap de Step 2');
      source = bootstrapSource.payload?.data?.source ?? null;
      bootstrapSourceId = source?.id ?? null;
    }
    if (!source) {
      throw new Error(`No se pudo resolver una fuente en ${egi.code} para validar datasets.`);
    }

    const created = await apiRequest(
      'POST',
      '/datasets',
      token,
      {
        institutionId: source.institutionId,
        sourceId: source.id,
        schemaCode: 'project',
        payload: {
          title: `Dataset step2 ${stamp}`,
          source: 'step2-smoke',
          rows: [{ project: 'Demo' }],
        },
      },
      egi.id,
    );
    assertOk(created, 'No se pudo crear dataset de step 2');
    datasetId = created.payload?.data?.dataset?.id ?? null;
    pushCheck(checks, 'dataset.create', Boolean(datasetId), {
      datasetId,
      egiId: created.payload?.data?.dataset?.egiId ?? null,
      status: created.payload?.data?.dataset?.status ?? null,
    });

    const datasets = await apiRequest(
      'GET',
      '/datasets',
      token,
      undefined,
      egi.id,
    );
    assertOk(datasets, 'No se pudo listar datasets del EGI');
    const datasetRows = datasets.payload?.data?.datasets ?? [];
    pushCheck(
      checks,
      'dataset.list.filtered',
      datasetRows.every((item) => item.egiId === egi.id),
      {
        count: datasetRows.length,
        expectedEgiId: egi.id,
      },
    );
    pushCheck(
      checks,
      'dataset.list.contains_created',
      datasetRows.some((item) => item.id === datasetId),
      { datasetId },
    );

    const datasetDetail = await apiRequest(
      'GET',
      `/datasets/${datasetId}`,
      token,
      undefined,
      egi.id,
    );
    assertOk(datasetDetail, 'No se pudo leer detalle del dataset');
    pushCheck(
      checks,
      'dataset.detail.egi',
      datasetDetail.payload?.data?.dataset?.egiId === egi.id,
      {
        datasetId,
        egiId: datasetDetail.payload?.data?.dataset?.egiId ?? null,
      },
    );

    const validation = await apiRequest(
      'GET',
      `/datasets/${datasetId}/validation`,
      token,
      undefined,
      egi.id,
    );
    assertOk(validation, 'No se pudo consultar validación del dataset');
    pushCheck(
      checks,
      'validation.dataset.passed',
      ['passed', 'warning'].includes(validation.payload?.data?.status ?? ''),
      {
        datasetId,
        status: validation.payload?.data?.status ?? null,
        results: validation.payload?.data?.results?.length ?? 0,
      },
    );

    const projectList = await apiRequest(
      'GET',
      '/admin/projects',
      token,
      undefined,
      egi.id,
    );
    assertOk(projectList, 'No se pudo consultar proyectos del EGI');
    const projects = projectList.payload?.data?.projects ?? [];
    pushCheck(
      checks,
      'projects.filtered',
      projects.every((item) => item.egiId === egi.id),
      {
        count: projects.length,
        egiId: egi.id,
      },
    );
    let project = projects.find((item) => Boolean(item.code)) ?? null;
    if (!project && projects[0]?.id) {
      const fixtureCode = `STEP2-R7-${stamp}`;
      runSql(
        `UPDATE core.projects SET code = '${escapeSql(fixtureCode)}', updated_at = NOW() ` +
          `WHERE id = '${escapeSql(projects[0].id)}'::uuid;`,
      );
      patchedProjectId = projects[0].id;
      project = { ...projects[0], code: fixtureCode };
    }
    if (!project?.code) {
      throw new Error(
        'No hay proyectos disponibles en el EGI para validar imports territoriales.',
      );
    }

    const auditList = await apiRequest(
      'GET',
      '/admin/audit',
      token,
      undefined,
      egi.id,
    );
    assertOk(auditList, 'No se pudo consultar auditoría');
    pushCheck(
      checks,
      'audit.dataset.submitted',
      (auditList.payload?.data?.audit ?? []).some(
        (item) =>
          item.action === 'dataset.submitted' &&
          item.entityId === datasetId &&
          item.egiId === egi.id,
      ),
      {
        datasetId,
        egiId: egi.id,
      },
    );

    const scopedSource = await apiRequest(
      'POST',
      '/admin/sources',
      token,
      {
        institutionId: source.institutionId,
        code: `step2-source-${stamp}`,
        name: `Fuente step2 ${stamp}`,
        sourceType: 'excel',
        country: 'El Salvador',
        allowedCountries: ['El Salvador'],
        territorialScope: 'Validacion de territorio',
        status: 'active',
      },
      egi.id,
    );
    assertOk(scopedSource, 'No se pudo crear fuente con alcance territorial');
    scopedSourceId = scopedSource.payload?.data?.source?.id ?? null;
    pushCheck(checks, 'source.create.scoped', Boolean(scopedSourceId), {
      sourceId: scopedSourceId,
    });

    const importCsv = [
      'project_code,territory_code,territory_name,territory_level,country,area_ha',
      `${project.code},sv,El Salvador,municipio,Costa Rica,12.5`,
    ].join('\n');
    const importResponse = await uploadImportCsv(token, egi.id, {
      sourceId: scopedSourceId,
      entityType: 'project_territories',
      fileName: `territories-step2-${stamp}.csv`,
      csv: importCsv,
    });
    assertOk(
      importResponse,
      'No se pudo ejecutar import territorial controlado',
    );
    const importBatch = importResponse.payload?.data?.batch ?? null;
    if (!importBatch?.id) {
      throw new Error('El import territorial no devolvió batch id.');
    }
    pushCheck(
      checks,
      'imports.batch.completed_with_errors',
      importBatch.status === 'completed_with_errors' &&
        importBatch.invalidRows >= 1,
      {
        batchId: importBatch.id,
        status: importBatch.status,
        invalidRows: importBatch.invalidRows,
      },
    );

    const importErrors = await apiRequest(
      'GET',
      `/admin/imports/batches/${importBatch.id}/errors`,
      token,
      undefined,
      egi.id,
    );
    assertOk(importErrors, 'No se pudo leer errores del import territorial');
    const errorCodes = (importErrors.payload?.data?.errors ?? []).map(
      (item) => item.errorCode,
    );
    pushCheck(
      checks,
      'imports.errors.geographic',
      errorCodes.includes('country_scope_mismatch') &&
        errorCodes.includes('territory_level_invalid'),
      {
        batchId: importBatch.id,
        errorCodes,
      },
    );

    const importRules = await apiRequest(
      'GET',
      `/admin/imports/batches/${importBatch.id}/rules`,
      token,
      undefined,
      egi.id,
    );
    assertOk(importRules, 'No se pudo leer reglas del import territorial');
    const rules = importRules.payload?.data?.rules ?? [];
    pushCheck(
      checks,
      'imports.rules.geographic',
      rules.some(
        (item) =>
          item.ruleCode === 'source_country_scope_alignment' &&
          item.status === 'failed',
      ) &&
        rules.some(
          (item) =>
            item.ruleCode === 'territory_level_catalog_alignment' &&
            item.status === 'failed',
        ),
      {
        batchId: importBatch.id,
        rules: rules.map((item) => ({
          code: item.ruleCode,
          status: item.status,
        })),
      },
    );
  } finally {
    try {
      if (scopedSourceId) {
        const deletedSource = await apiRequest(
          'DELETE',
          `/admin/sources/${scopedSourceId}`,
          token,
          undefined,
          egi.id,
        );
        pushCheck(
          checks,
          'source.delete.blocked_by_batches',
          !deletedSource.ok && deletedSource.status === 400,
          {
            sourceId: scopedSourceId,
            status: deletedSource.status,
            message: deletedSource.payload?.message ?? null,
          },
        );
      }
      if (datasetId) {
        const deleted = await apiRequest(
          'DELETE',
          `/datasets/${datasetId}`,
          token,
          undefined,
          egi.id,
        );
        assertOk(deleted, 'No se pudo eliminar dataset de step 2');
        pushCheck(
          checks,
          'dataset.delete',
          deleted.payload?.data?.deleted === true,
          {
            datasetId,
          },
        );
      }
      if (bootstrapSourceId) {
        const deletedBootstrapSource = await apiRequest(
          'DELETE',
          `/admin/sources/${bootstrapSourceId}`,
          token,
          undefined,
          egi.id,
        );
        assertOk(
          deletedBootstrapSource,
          'No se pudo eliminar la fuente bootstrap de Step 2',
        );
      }
    } finally {
      if (patchedProjectId) {
        runSql(
          `UPDATE core.projects SET code = NULL, updated_at = NOW() ` +
            `WHERE id = '${escapeSql(patchedProjectId)}'::uuid;`,
        );
      }
    }
  }

  const indicators = await apiRequest('GET', '/indicators', null);
  assertOk(indicators, 'No se pudo consultar indicadores');
  pushCheck(
    checks,
    'indicators.public.contract',
    Array.isArray(indicators.payload?.data?.indicators),
    {
      count: indicators.payload?.data?.indicators?.length ?? 0,
    },
  );

  const schemas = await apiRequest('GET', '/schemas', null);
  assertOk(schemas, 'No se pudo consultar schemas');
  const schemaRows = schemas.payload?.data?.schemas ?? [];
  pushCheck(
    checks,
    'schemas.db_backed',
    schemaRows.some(
      (item) =>
        item.code === 'project' &&
        item.totalRules >= 1 &&
        item.version === 'db',
    ) && schemaRows.every((item) => item.version === 'db'),
    {
      count: schemaRows.length,
      codes: schemaRows.map((item) => item.code),
    },
  );

  const catalogs = await apiRequest('GET', '/catalogs', null);
  assertOk(catalogs, 'No se pudo consultar catalogs');
  const catalogRows = catalogs.payload?.data?.catalogs ?? [];
  pushCheck(
    checks,
    'catalogs.db_backed',
    [
      'institutions',
      'roles',
      'permissions',
      'territory-levels',
      'countries',
    ].every((code) =>
      catalogRows.some(
        (item) =>
          item.code === code &&
          item.version === 'db' &&
          Number.isInteger(item.total) &&
          item.total >= (code === 'countries' ? 0 : 1),
      ),
    ),
    {
      count: catalogRows.length,
      codes: catalogRows.map((item) => item.code),
    },
  );

  const passedChecks = checks.filter((check) => check.ok).length;
  const totalChecks = checks.length;

  console.log(
    JSON.stringify(
      {
        apiBaseUrl: API_BASE_URL,
        egiId: egi.id,
        datasetId,
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

function runSql(sql) {
  execFileSync(
    'docker',
    [
      'exec',
      resolvePostgresContainer(),
      'psql',
      '-U',
      process.env.POSTGRES_USER ?? 'sigi_user',
      '-d',
      process.env.POSTGRES_DB ?? 'sigi_db',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}

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

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function pushCheck(checks, name, ok, details) {
  checks.push({ name, ok, details });
}

function assertOk(response, message) {
  if (!response.ok) {
    throw new Error(
      `${message}: ${response.status} ${response.payload?.message ?? 'sin mensaje'}`,
    );
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
    throw new Error(
      `No se pudo iniciar sesión para ${email}: ${payload?.message ?? response.status}`,
    );
  }

  return payload?.data?.accessToken;
}

async function getWorkspace(token) {
  const response = await apiRequest('GET', '/admin/egi', token);
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

async function apiRequest(method, path, token, body, egiId) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(egiId ? { 'X-SIGI-EGI-ID': egiId } : {}),
        ...(body !== null && body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(body !== null && body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
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

async function uploadImportCsv(token, egiId, input) {
  const form = new FormData();
  form.append('entityType', input.entityType);
  form.append('sourceId', input.sourceId);
  form.append(
    'file',
    new Blob([input.csv], { type: 'text/csv' }),
    input.fileName,
  );

  const response = await fetch(`${API_BASE_URL}/admin/imports/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-SIGI-EGI-ID': egiId,
    },
    body: form,
  });

  return {
    ok: response.ok,
    status: response.status,
    payload: await safeJson(response),
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
