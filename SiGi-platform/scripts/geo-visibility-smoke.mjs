#!/usr/bin/env node
/**
 * Regression smoke for geo layer visibility (Mapa SIGI — P0-1).
 *
 * Guards the defect documented in docs/geo/MAPA_SIGI_DIAGNOSTICO.md §5: an
 * anonymous caller could read the geometries and full properties of any layer,
 * including layers marked `visibility = 'internal'`, by passing its code to
 * GET /territories/features.
 *
 * The script provisions a throwaway internal layer, asserts that it is
 * invisible anonymously but visible to an authorised principal, verifies that
 * public layers still resolve anonymously (no regression for the country
 * portal), and then removes the layer.
 */

const API_BASE_URL = process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
const SUPERADMIN_EMAIL = process.env.SIGI_SMOKE_SUPERADMIN_EMAIL ?? 'superadmin@sigi.local';
const SUPERADMIN_PASSWORD =
  process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token';

const INTERNAL_LAYER_CODE = 'smoke_internal_visibility';
const PUBLIC_LAYER_CODE = 'smoke_public_visibility';

const INTERNAL_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        code: 'smoke-internal-1',
        name: 'Parcela reservada de prueba',
        // Stand-in for the sensitive attributes the specification calls out.
        owner: 'DATO-SENSIBLE-NO-DEBE-FILTRARSE',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-89.6, 13.8],
            [-89.5, 13.8],
            [-89.5, 13.9],
            [-89.6, 13.9],
            [-89.6, 13.8],
          ],
        ],
      },
    },
  ],
};

async function main() {
  const checks = [];
  const token = await login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
  const createdLayers = [];

  try {
    await importLayer(token, INTERNAL_LAYER_CODE, 'internal');
    createdLayers.push(INTERNAL_LAYER_CODE);
    await importLayer(token, PUBLIC_LAYER_CODE, 'public');
    createdLayers.push(PUBLIC_LAYER_CODE);

    // 1. The internal layer must not leak to anonymous callers.
    const anonymousInternal = await getFeatures(INTERNAL_LAYER_CODE, null);
    checks.push({
      check: 'anonymous_cannot_read_internal_layer',
      expected: 'sin features',
      actual: `${anonymousInternal.featureCount} features (HTTP ${anonymousInternal.status})`,
      ok: anonymousInternal.status === 200 && anonymousInternal.featureCount === 0,
    });

    // 2. Sensitive properties must not appear in the anonymous payload at all.
    checks.push({
      check: 'anonymous_payload_carries_no_sensitive_properties',
      expected: 'sin marcador sensible',
      actual: anonymousInternal.leaked ? 'MARCADOR FILTRADO' : 'sin marcador sensible',
      ok: !anonymousInternal.leaked,
    });

    // 3. An authorised principal still sees the layer.
    const authorizedInternal = await getFeatures(INTERNAL_LAYER_CODE, token);
    checks.push({
      check: 'authorized_can_read_internal_layer',
      expected: 'al menos 1 feature',
      actual: `${authorizedInternal.featureCount} features (HTTP ${authorizedInternal.status})`,
      ok: authorizedInternal.status === 200 && authorizedInternal.featureCount > 0,
    });

    // 4. No regression: public layers remain anonymously readable.
    const anonymousPublic = await getFeatures(PUBLIC_LAYER_CODE, null);
    checks.push({
      check: 'anonymous_can_still_read_public_layer',
      expected: 'al menos 1 feature',
      actual: `${anonymousPublic.featureCount} features (HTTP ${anonymousPublic.status})`,
      ok: anonymousPublic.status === 200 && anonymousPublic.featureCount > 0,
    });
  } finally {
    for (const layerCode of createdLayers.reverse()) {
      await deleteLayer(token, layerCode).catch((error) => {
        console.error(`Advertencia: no se pudo eliminar la capa ${layerCode}: ${error.message}`);
      });
    }
  }

  const passedChecks = checks.filter((item) => item.ok).length;
  console.log(
    JSON.stringify(
      { gate: 'sigi.geo.visibility', apiBaseUrl: API_BASE_URL, passedChecks, totalChecks: checks.length, checks },
      null,
      2,
    ),
  );

  if (passedChecks !== checks.length) {
    process.exitCode = 1;
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

async function importLayer(token, code, visibility) {
  const form = new FormData();
  form.set(
    'file',
    new Blob([JSON.stringify(INTERNAL_FEATURE_COLLECTION)], { type: 'application/geo+json' }),
    `${code}.geojson`,
  );
  form.set('code', code);
  form.set('name', `Capa ${visibility} de prueba de visibilidad`);
  form.set('layerType', 'polygon');
  form.set('visibility', visibility);
  form.set('status', 'published');

  const response = await fetch(`${API_BASE_URL}/admin/geospatial-catalog/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    throw new Error(
      `No se pudo crear la capa interna de prueba: ${payload?.message ?? response.status}`,
    );
  }
}

async function deleteLayer(token, code) {
  const response = await fetch(
    `${API_BASE_URL}/admin/geospatial-catalog/${code}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    const payload = await safeJson(response);
    throw new Error(payload?.message ?? `HTTP ${response.status}`);
  }
}

async function getFeatures(layer, token) {
  const response = await fetch(
    `${API_BASE_URL}/territories/features?layer=${encodeURIComponent(layer)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );

  const bodyText = await response.text();
  let features = [];
  try {
    features = JSON.parse(bodyText)?.data?.features ?? [];
  } catch {
    features = [];
  }

  return {
    status: response.status,
    featureCount: Array.isArray(features) ? features.length : 0,
    leaked: bodyText.includes('DATO-SENSIBLE-NO-DEBE-FILTRARSE'),
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
