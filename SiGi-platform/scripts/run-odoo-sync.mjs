const DEFAULT_API_URL = process.env.SIGI_IMPORT_API_URL ?? 'http://localhost:3000/api';
const DEFAULT_TOKEN = process.env.SIGI_IMPORT_ADMIN_TOKEN ?? 'superadmin-dev-token';
const DEFAULT_CONNECTOR_ID =
  process.env.SIGI_ODOO_CONNECTOR_ID ?? '3bd88fa5-8a9a-4f5c-981e-222222220005';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const apiUrl = stripTrailingSlash(args.apiUrl ?? DEFAULT_API_URL);
  const token = args.token ?? DEFAULT_TOKEN;
  const connectorId = args.connectorId ?? DEFAULT_CONNECTOR_ID;
  const resolvedApiUrl = await resolveApiUrl(apiUrl, token);

  const runResponse = await requestJson({
    method: 'POST',
    url: `${resolvedApiUrl}/admin/connectors/${connectorId}/run`,
    token,
    body: {},
  });
  const runPayload = runResponse?.data ?? {};
  const jobId = runPayload.jobId;
  if (!jobId) {
    throw new Error('No se recibió jobId al ejecutar el conector.');
  }

  console.log(
    `Conector ${connectorId} lanzado -> job ${jobId} (status inicial: ${runPayload.status})`,
  );

  const terminal = new Set(['completed', 'partial_failed', 'failed']);
  let latest = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await requestJson({
      method: 'GET',
      url: `${resolvedApiUrl}/sync-jobs/${jobId}`,
      token,
    });
    console.log(`  intento ${attempt + 1}: status=${latest.status}`);
    if (terminal.has(latest.status)) {
      break;
    }
    await sleep(1200);
  }

  if (!latest) {
    throw new Error('No se pudo consultar el estado final del sync job.');
  }

  console.log('Resultado final:');
  console.log(
    JSON.stringify(
      {
        jobId: latest.jobId,
        status: latest.status,
        startedAt: latest.startedAt,
        finishedAt: latest.finishedAt,
        summary: latest.summary,
        error: latest.error,
      },
      null,
      2,
    ),
  );
}

async function requestJson({ method, url, token, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    throw new Error(
      `Request falló (${response.status}) ${method} ${url}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      result.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      result[key] = true;
      continue;
    }
    result[key] = value;
    i += 1;
  }
  return {
    help: Boolean(result.help),
    apiUrl: typeof result['api-url'] === 'string' ? result['api-url'] : undefined,
    token: typeof result.token === 'string' ? result.token : undefined,
    connectorId:
      typeof result['connector-id'] === 'string' ? result['connector-id'] : undefined,
  };
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function resolveApiUrl(apiUrl, token) {
  try {
    await requestJson({
      method: 'GET',
      url: `${apiUrl}/health`,
      token,
    });
    return apiUrl;
  } catch (error) {
    if (!apiUrl.includes('://sigi-api')) {
      throw error;
    }
    const fallback = apiUrl.replace('://sigi-api', '://localhost');
    await requestJson({
      method: 'GET',
      url: `${fallback}/health`,
      token,
    });
    console.log(`API host no resolvía en host local. Usando fallback: ${fallback}`);
    return fallback;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function printHelp() {
  console.log(`Uso:
  npm run sync:odoo
  npm run sync:odoo -- --connector-id 3bd88fa5-8a9a-4f5c-981e-222222220005

Opciones:
  --connector-id   id del conector (default: ${DEFAULT_CONNECTOR_ID})
  --api-url        base API (default: ${DEFAULT_API_URL})
  --token          bearer token admin/integration (default: SIGI_IMPORT_ADMIN_TOKEN)
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
