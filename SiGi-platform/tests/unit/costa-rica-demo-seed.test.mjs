import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const seed = await readFile(new URL('../../infra/postgres/demo/costa-rica-demo.sql', import.meta.url), 'utf8');

test('Costa Rica demo seed is opt-in, transactional and idempotent', () => {
  assert.match(seed, /BEGIN;[\s\S]*COMMIT;/);
  assert.ok((seed.match(/ON CONFLICT/g) ?? []).length >= 20);
  assert.match(seed, /SIGI Costa Rica — Demo Nacional/);
  assert.match(seed, /demo geometries, not official boundaries/);
});

test('all demo polygon coordinates stay inside the Costa Rica review envelope', () => {
  const polygons = [...seed.matchAll(/POLYGON\(\(([^']+)\)\)/g)].map((match) => match[1]);
  assert.equal(new Set(polygons).size, 13);
  for (const polygon of polygons) {
    for (const pair of polygon.split(',')) {
      const [longitude, latitude] = pair.trim().split(/\s+/).map(Number);
      assert.ok(longitude >= -86.2 && longitude <= -82.5, `longitude ${longitude} outside Costa Rica demo envelope`);
      assert.ok(latitude >= 8.0 && latitude <= 11.3, `latitude ${latitude} outside Costa Rica demo envelope`);
    }
  }
});

test('seed removes only the known Salvadoran demo geography and creates map layers', () => {
  assert.match(seed, /code IN \('sv-centro', 'sv-occidente'\)/);
  assert.match(seed, /'territories', 'Regiones de planificación — Costa Rica'/);
  assert.match(seed, /'project_polygons', 'Polígonos de proyectos — Costa Rica'/);
  assert.match(seed, /'corredor_seco', 'Corredor Seco de Costa Rica — Demo'/);
});

test('seed covers operational projects, data, indicators, publications and reports', () => {
  for (const table of [
    'core.projects',
    'core.data_sources',
    'core.datasets',
    'core.project_indicators',
    'core.publications',
    'core.incidents',
    'core.report_instances',
    'core.report_commitments',
  ]) {
    assert.match(seed, new RegExp(`INSERT INTO ${table.replace('.', '\\.')}`));
  }
});

test('seed includes one internal project to exercise confidentiality (V2-02/V2-06)', () => {
  assert.match(seed, /'CR-PSA-005'[^\n]*'internal'/);
  assert.match(seed, /project-CR-PSA-005-polygon/);
  assert.match(seed, /AS internal_polygons_public/);
  assert.match(seed, /INSERT INTO core\.egi_spaces[\s\S]*ON CONFLICT \(id\) DO UPDATE/);
});
