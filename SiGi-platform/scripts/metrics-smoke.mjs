const API_BASE_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
import fs from 'node:fs';

const INTERNAL_TOKEN =
  process.env.SIGI_INTERNAL_SERVICE_TOKEN ??
  readEnvFileValue('.env.production', 'SIGI_INTERNAL_SERVICE_TOKEN') ??
  readEnvFileValue('.env', 'SIGI_INTERNAL_SERVICE_TOKEN') ??
  '';
const RATE_LIMIT_RETRY_MS = Number(process.env.SIGI_SMOKE_RATE_LIMIT_RETRY_MS ?? 61000);
const MAX_REQUEST_ATTEMPTS = Number(process.env.SIGI_SMOKE_MAX_ATTEMPTS ?? 2);
const PASSWORDS = {
  superadmin: process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token',
  reader: process.env.SIGI_SMOKE_READER_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_READER ?? 'reader-dev-token',
};

async function main() {
  if (!INTERNAL_TOKEN.trim()) {
    throw new Error('Falta SIGI_INTERNAL_SERVICE_TOKEN para consultar /metrics.');
  }

  const checks = [];

  await requestPublic('/health');

  const superToken = await login('superadmin@sigi.local', PASSWORDS.superadmin);
  const readerToken = await login('reader@sigi.local', PASSWORDS.reader);
  const workspace = await getWorkspace(superToken);
  const egiId = workspace?.activeEgiId ?? workspace?.spaces?.[0]?.id ?? null;

  const adminWorkspace = await request('GET', '/admin/egi', superToken);
  pushCheck(checks, 'metrics.traffic.workspace.ok', adminWorkspace.ok, {
    status: adminWorkspace.status,
  });

  const forbidden = await request('GET', '/admin/users', readerToken, undefined, egiId);
  pushCheck(checks, 'metrics.traffic.forbidden.ok', forbidden.status === 403, {
    status: forbidden.status,
    code: forbidden.payload?.code ?? null,
  });

  const metricsResponse = await fetch(`${API_BASE_URL}/metrics`, {
    headers: {
      Authorization: `Bearer ${INTERNAL_TOKEN}`,
    },
  });
  const metricsText = await metricsResponse.text();
  const parsedMetrics = parsePrometheus(metricsText);

  pushCheck(checks, 'metrics.endpoint.ok', metricsResponse.ok, {
    status: metricsResponse.status,
    contentType: metricsResponse.headers.get('content-type'),
  });
  pushCheck(checks, 'metrics.http_requests_total.present', Number.isFinite(parsedMetrics.http_requests_total), {
    value: parsedMetrics.http_requests_total ?? null,
  });
  pushCheck(checks, 'metrics.http_requests_total.greater_than_zero', (parsedMetrics.http_requests_total ?? 0) > 0, {
    value: parsedMetrics.http_requests_total ?? null,
  });
  pushCheck(checks, 'metrics.client_errors.recorded', (parsedMetrics.http_requests_client_error_total ?? 0) >= 1, {
    value: parsedMetrics.http_requests_client_error_total ?? null,
  });
  pushCheck(checks, 'metrics.failed_total.recorded', (parsedMetrics.http_requests_failed_total ?? 0) >= 1, {
    value: parsedMetrics.http_requests_failed_total ?? null,
  });
  pushCheck(checks, 'metrics.success_total.recorded', (parsedMetrics.http_requests_succeeded_total ?? 0) >= 1, {
    value: parsedMetrics.http_requests_succeeded_total ?? null,
  });
  pushCheck(checks, 'metrics.in_flight.present', (parsedMetrics.http_requests_in_flight ?? -1) >= 0, {
    value: parsedMetrics.http_requests_in_flight ?? null,
  });
  pushCheck(checks, 'metrics.uptime.present', Number.isFinite(parsedMetrics.sigi_process_uptime_seconds), {
    value: parsedMetrics.sigi_process_uptime_seconds ?? null,
  });

  const passedChecks = checks.filter((check) => check.ok).length;
  const totalChecks = checks.length;

  console.log(
    JSON.stringify(
      {
        apiBaseUrl: API_BASE_URL,
        passedChecks,
        totalChecks,
        checks,
        metrics: parsedMetrics,
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

async function requestPublic(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`No se pudo consultar ${path}: ${response.status}`);
  }
  return safeJson(response);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parsePrometheus(input) {
  const result = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.lastIndexOf(' ');
    if (separatorIndex === -1) {
      continue;
    }

    const metricName = line.slice(0, separatorIndex).trim();
    const metricValue = Number(line.slice(separatorIndex + 1).trim());
    if (metricName && Number.isFinite(metricValue)) {
      result[metricName] = metricValue;
    }
  }
  return result;
}

function readEnvFileValue(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const currentKey = line.slice(0, separatorIndex).trim();
    if (currentKey !== key) {
      continue;
    }
    const value = line.slice(separatorIndex + 1).trim();
    return value || null;
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
