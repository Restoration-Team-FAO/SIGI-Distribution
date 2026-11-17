import test from 'node:test';
import assert from 'node:assert/strict';

// P0-10 — unit tests for the three export builders (P0-8, spec §17). The
// live endpoint's format/audit/response-header behavior is already covered
// end-to-end by scripts/geo-api-smoke.mjs (registered in the release gate);
// these exercise the pure row/metadata-shaping logic in isolation.
const { buildCsvExport, buildXlsxExport, buildGeoJsonExport } = await import(
  '../../apps/sigi-api/dist/modules/geo/geo-export.js'
);

const layer = {
  id: 'layer-1',
  code: 'areas_protegidas_ref',
  name: 'Áreas Protegidas de Referencia',
  description: null,
  category: null,
  groupName: null,
  layerType: 'reference',
  geometryType: 'MultiPolygon',
  crs: 'EPSG:4326',
  visibility: 'public',
  status: 'active',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const features = [
  {
    id: 'f1',
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-84.1, 9.9] },
    properties: { code: 'PA-01', name: 'Parque Uno', level: 'protected_area', areaHa: 120.5, updatedAt: '2026-01-01', CATEGORíA: 'PN' },
  },
  {
    id: 'f2',
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-84.2, 10.0] },
    properties: { code: 'PA-02', name: 'Parque Dos', level: 'protected_area', areaHa: 45, updatedAt: '2026-01-02', CATEGORíA: 'RB' },
  },
];

function baseMeta(overrides = {}) {
  return {
    layer,
    generatedAt: '2026-09-03T12:00:00.000Z',
    actorLabel: 'ops@sigi.local',
    filters: [{ field: 'CATEGORíA', operator: 'in', value: ['PN'] }],
    sort: { field: 'name', direction: 'asc' },
    totalFeatures: 2,
    exportedCount: 2,
    truncated: false,
    ...overrides,
  };
}

test('buildCsvExport: leading comment block carries layer/date/user/filters/sort/count, per spec §17', () => {
  const csv = buildCsvExport(features, baseMeta());
  assert.match(csv, /# Capa: Áreas Protegidas de Referencia \(areas_protegidas_ref\)/);
  assert.match(csv, /# Fecha: 2026-09-03T12:00:00\.000Z/);
  assert.match(csv, /# Usuario: ops@sigi\.local/);
  assert.match(csv, /# Filtros: CATEGORíA in \["PN"\]/);
  assert.match(csv, /# Orden: name \(asc\)/);
  assert.match(csv, /# Registros exportados: 2 de 2/);
});

test('buildCsvExport: data rows carry the builtin columns plus the extra raw property key, unsorted-alphabetically-after-builtins', () => {
  const csv = buildCsvExport(features, baseMeta());
  const bodyStart = csv.indexOf('code,');
  assert.ok(bodyStart >= 0, 'expected a header row starting with the builtin "code" column');
  const header = csv.slice(bodyStart).split('\n')[0];
  assert.equal(header, 'code,name,level,areaHa,updatedAt,CATEGORíA');
  assert.match(csv, /PA-01,Parque Uno,protected_area,120\.5,2026-01-01,PN/);
});

test('buildCsvExport: a truncated export says so in the comment block, never silently', () => {
  const csv = buildCsvExport(features, baseMeta({ truncated: true, exportedCount: 2, totalFeatures: 5000 }));
  assert.match(csv, /# Registros exportados: 2 de 5000 \(resultado truncado/);
});

test('buildCsvExport: an empty feature set still produces a valid metadata header, not an error', () => {
  const csv = buildCsvExport([], baseMeta({ exportedCount: 0, totalFeatures: 0 }));
  assert.match(csv, /# Registros exportados: 0 de 0/);
});

test('buildXlsxExport: returns a real XLSX (zip) buffer, not a stub', () => {
  const buffer = buildXlsxExport(features, baseMeta());
  assert.ok(Buffer.isBuffer(buffer));
  // XLSX files are zip archives — "PK" magic bytes at the start.
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  assert.ok(buffer.length > 0);
});

test('buildGeoJsonExport: valid FeatureCollection with metadata as a foreign member (RFC 7946 §6.1)', () => {
  const geojson = buildGeoJsonExport(features, baseMeta());
  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.features, features);
  assert.equal(geojson.metadata.capa.codigo, 'areas_protegidas_ref');
  assert.equal(geojson.metadata.capa.nombre, 'Áreas Protegidas de Referencia');
  assert.equal(geojson.metadata.usuario, 'ops@sigi.local');
  assert.equal(geojson.metadata.totalExportado, 2);
  assert.equal(geojson.metadata.totalDisponible, 2);
  assert.equal(geojson.metadata.truncado, false);
  assert.deepEqual(geojson.metadata.filtrosAplicados, baseMeta().filters);
});

test('buildGeoJsonExport: a sort-less export records the "orden por defecto" fallback, not null silently', () => {
  const geojson = buildGeoJsonExport(features, baseMeta({ sort: null }));
  assert.equal(geojson.metadata.orden, null);
});
