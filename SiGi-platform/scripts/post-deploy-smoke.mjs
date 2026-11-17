const targets = [
  {
    name: 'api',
    url:
      process.env.SIGI_SMOKE_API_HEALTH_URL ??
      'http://127.0.0.1:3000/api/health',
    validate: (response, body) =>
      response.status === 200 && body.includes('"status":"ok"'),
  },
  {
    name: 'frontend',
    url:
      process.env.SIGI_SMOKE_FRONTEND_URL ??
      process.env.SIGI_SMOKE_ADMIN_URL ??
      'http://127.0.0.1:5174/',
    validate: (response, body) =>
      response.status === 200 && body.includes('<div id="root">'),
  },
  {
    name: 'geoserver',
    url:
      process.env.SIGI_SMOKE_GEOSERVER_URL ??
      'http://127.0.0.1:8081/geoserver/wms?service=WMS&request=GetCapabilities',
    validate: (response, body) =>
      response.status === 200 && body.includes('WMS_Capabilities'),
  },
];

const results = [];
for (const target of targets) {
  try {
    const response = await fetchWithRetry(target.url);
    const body = await response.text();
    results.push({
      name: target.name,
      url: target.url,
      status: response.status,
      ok: target.validate(response, body),
    });
  } catch (error) {
    results.push({
      name: target.name,
      url: target.url,
      status: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (response.status < 500 || attempt === 5) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === 5) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw lastError;
}

const ok = results.every((result) => result.ok);
console.log(JSON.stringify({ gate: 'sigi.post-deploy', ok, results }, null, 2));
if (!ok) process.exitCode = 1;
