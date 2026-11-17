const candidateUrl = (process.env.SIGI_UNIFIED_FRONTEND_URL ?? 'http://127.0.0.1:5374').replace(/\/$/, '');

const legacyRoutes = [
  '/dashboard',
  '/territory',
  '/restoration',
  '/projects',
  '/geo-bi',
  '/integrations',
  '/indicators',
  '/incidents',
  '/quality',
  '/reports',
  '/documents',
];

const accessRoutes = ['/', '/administration'];

let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) {
    throw new Error(message);
  }
}

async function get(url) {
  const response = await fetch(url, { redirect: 'manual' });
  const body = await response.text();
  return { response, body };
}

for (const route of legacyRoutes) {
  const candidate = await get(`${candidateUrl}${route}`);
  assert(candidate.response.status === 200, `Candidate ${route} returned ${candidate.response.status}`);
  assert(candidate.body.includes('<div id="root">'), `Candidate ${route} did not return the SPA document`);
}

for (const route of accessRoutes) {
  const candidate = await get(`${candidateUrl}${route}`);
  assert(candidate.response.status === 200, `Candidate access route ${route} returned ${candidate.response.status}`);
  assert(candidate.body.includes('<div id="root">'), `Candidate access route ${route} did not return the SPA document`);
}

for (const route of ['/admin/projects', '/admin/geobi', '/route-that-must-use-spa-fallback']) {
  const deepLink = await get(`${candidateUrl}${route}`);
  assert(deepLink.response.status === 200, `Deep link ${route} returned ${deepLink.response.status}`);
  assert(deepLink.body.includes('<div id="root">'), `Deep link ${route} did not use the SPA fallback`);
}

const root = await get(`${candidateUrl}/`);
const requiredHeaders = {
  'content-security-policy': "default-src 'self'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
};

for (const [header, expected] of Object.entries(requiredHeaders)) {
  const actual = root.response.headers.get(header) ?? '';
  assert(actual.includes(expected), `Header ${header} is missing or invalid: ${actual}`);
}

const assetPath = root.body.match(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/)?.[1];
assert(Boolean(assetPath), 'Could not locate a versioned JS/CSS asset');
const asset = await get(`${candidateUrl}${assetPath}`);
assert(asset.response.status === 200, `Versioned asset ${assetPath} returned ${asset.response.status}`);
assert((asset.response.headers.get('cache-control') ?? '').includes('max-age=31536000'), 'Versioned asset is not cached for one year');

console.log(JSON.stringify({
  status: 'PASS',
  checks,
  candidateUrl,
  legacyRoutes: legacyRoutes.length,
  accessRoutes: accessRoutes.length,
}, null, 2));
