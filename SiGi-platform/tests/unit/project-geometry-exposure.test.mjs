import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// V2-02 / H-01 — contrato: toda lectura anónima de features aplica gis.project_geometry_is_public();
// la vista publicada por la API es idéntica a la de la migración; la visibilidad es fail-closed.
// El comportamiento real contra PostgreSQL se prueba en tests/integration/project-geometry-exposure.sql.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();

const { normalizeVisibility } = await import(
  '../../apps/sigi-api/dist/modules/geospatial-catalog/geospatial-catalog.service.js'
);

test('layer visibility is fail-closed: unknown or missing values become internal', () => {
  for (const value of ['public', 'institutional', 'internal', 'restricted', 'private']) {
    assert.equal(normalizeVisibility(value), value);
  }
  assert.equal(normalizeVisibility(' PUBLIC '), 'public');
  for (const value of [undefined, null, '', 'publico', 'everyone']) {
    assert.equal(normalizeVisibility(value), 'internal');
  }
});

test('API-published v_public_territories matches the migration definition', () => {
  const migration = read('infra/postgres/migrations/20261015_project_geometry_exposure.sql');
  const service = read('apps/sigi-api/src/modules/geospatial-catalog/geospatial-catalog.service.ts');
  const migrationView = migration.match(/CREATE OR REPLACE VIEW gis\.v_public_territories AS[\s\S]*?;/)?.[0];
  const serviceView = service.match(/CREATE OR REPLACE VIEW gis\.v_public_territories AS[\s\S]*?`/)?.[0]?.slice(0, -1);
  assert.ok(migrationView && serviceView);
  assert.equal(normalize(serviceView), normalize(migrationView));
});

test('every anonymous feature read in /api/geo and gis-service applies the project exposure rule', () => {
  const geo = read('apps/sigi-api/src/modules/geo/geo.service.ts');
  // búsqueda, consulta base, cercanía, intersección (resumen ×2, features ×2)
  assert.ok((geo.match(/gis\.project_geometry_is_public\(/g) ?? []).length >= 7);
  assert.match(geo, /LIMIT \$6/);
  const gis = read('services/gis-service/app/api/routes/geometry.py');
  assert.match(gis, /gis\.project_geometry_is_public\(gl\.code, tf\.territory_id\)/);
  assert.match(gis, /\(layer, level, level, include_internal, include_internal\)/);
});

test('saving a project polygon no longer forces the project_polygons layer to public', () => {
  const projects = read('apps/sigi-api/src/modules/projects/projects.service.ts');
  const upsert = projects.match(/INSERT INTO gis\.geo_layers \(code, name, layer_type, visibility, status\)[\s\S]*?RETURNING id/)?.[0] ?? '';
  assert.ok(upsert);
  assert.doesNotMatch(upsert, /visibility = EXCLUDED\.visibility/);
});

test('migration is listed in the production manifest', () => {
  assert.match(read('infra/postgres/migrations/manifest.txt'), /20261015_project_geometry_exposure\.sql/);
});
