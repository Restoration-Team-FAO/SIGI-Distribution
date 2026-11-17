import test from 'node:test';
import assert from 'node:assert/strict';

// P0-10 — unit tests for the type-inference/label-humanization logic behind
// the dynamic filters (P0-6) and attribute table columns (P0-7). Nothing
// here is invented: type inference and labels always come from values
// actually observed in a layer's own properties_json.
const { deriveFieldsFromPropertySamples, BUILTIN_FIELD_NAMES, BUILTIN_FIELDS } = await import(
  '../../apps/sigi-api/dist/modules/geo/geo-schema.js'
);

function fieldByName(fields, name) {
  return fields.find((field) => field.name === name);
}

test('BUILTIN_FIELD_NAMES: exactly the four fields injected by gis-service, not more', () => {
  assert.deepEqual([...BUILTIN_FIELD_NAMES].sort(), ['areaHa', 'code', 'level', 'name'].sort());
});

test('deriveFieldsFromPropertySamples: builtin fields (code/name/level/areaHa) are always present, even with no samples', () => {
  const fields = deriveFieldsFromPropertySamples([]);
  for (const name of BUILTIN_FIELD_NAMES) {
    assert.ok(fieldByName(fields, name), `expected builtin field "${name}" to be present`);
  }
  assert.equal(fields.length, BUILTIN_FIELDS.length);
});

test('deriveFieldsFromPropertySamples: builtin keys in the raw properties are never re-derived as a second field', () => {
  const samples = [{ code: 'A', name: 'Alpha', level: 'region', areaHa: 10 }];
  const fields = deriveFieldsFromPropertySamples(samples);
  assert.equal(fields.filter((field) => field.name === 'code').length, 1);
});

test('deriveFieldsFromPropertySamples: an all-boolean field infers type "boolean"', () => {
  const samples = [{ activo: true }, { activo: false }, { activo: true }];
  const fields = deriveFieldsFromPropertySamples(samples);
  assert.equal(fieldByName(fields, 'activo').type, 'boolean');
});

test('deriveFieldsFromPropertySamples: an all-numeric field infers type "number"', () => {
  const samples = [{ poblacion: 100 }, { poblacion: 250 }, { poblacion: 12 }];
  const fields = deriveFieldsFromPropertySamples(samples);
  assert.equal(fieldByName(fields, 'poblacion').type, 'number');
});

test('deriveFieldsFromPropertySamples: an all-ISO-date-string field infers type "date"', () => {
  const samples = [{ fechaCorte: '2026-01-15' }, { fechaCorte: '2025-11-02T08:00:00' }];
  const fields = deriveFieldsFromPropertySamples(samples);
  assert.equal(fieldByName(fields, 'fechaCorte').type, 'date');
});

test('deriveFieldsFromPropertySamples: a low-cardinality repeated string field infers type "enum" with sorted distinct values', () => {
  const samples = [{ categoria: 'PN' }, { categoria: 'RB' }, { categoria: 'PN' }, { categoria: 'RF' }];
  const fields = deriveFieldsFromPropertySamples(samples);
  const field = fieldByName(fields, 'categoria');
  assert.equal(field.type, 'enum');
  assert.deepEqual(field.enumValues, ['PN', 'RB', 'RF']);
});

test('deriveFieldsFromPropertySamples: below ENUM_MIN_SAMPLE, a low-cardinality field still falls back to "string"', () => {
  const samples = [{ categoria: 'PN' }, { categoria: 'RB' }];
  const fields = deriveFieldsFromPropertySamples(samples);
  assert.equal(fieldByName(fields, 'categoria').type, 'string');
});

test('deriveFieldsFromPropertySamples: high-cardinality string values fall back to "string", not "enum"', () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({ observacion: `nota libre número ${i}` }));
  const fields = deriveFieldsFromPropertySamples(samples);
  assert.equal(fieldByName(fields, 'observacion').type, 'string');
});

test('deriveFieldsFromPropertySamples: null/undefined values are ignored when inferring type', () => {
  const samples = [{ poblacion: 10 }, { poblacion: null }, { poblacion: undefined }, { poblacion: 20 }];
  const fields = deriveFieldsFromPropertySamples(samples);
  assert.equal(fieldByName(fields, 'poblacion').type, 'number');
});

test('humanizeFieldName (via label): mechanical humanization only, matching the exact P0-6-documented case', () => {
  // "CATEGORíA" is the real, unnormalized raw key from a source dataset
  // (docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.4) — only the label is humanized,
  // never the filterable key itself.
  const samples = [{ 'CATEGORíA': 'PN' }, { 'CATEGORíA': 'RB' }, { 'CATEGORíA': 'PN' }];
  const fields = deriveFieldsFromPropertySamples(samples);
  const field = fieldByName(fields, 'CATEGORíA');
  assert.equal(field.label, 'Categoría');
});

test('humanizeFieldName (via label): camelCase and snake_case both split into title-cased words', () => {
  const samples = [{ poblacionTotal: 1 }, { poblacionTotal: 2 }, { area_protegida: 1 }, { area_protegida: 2 }];
  const fields = deriveFieldsFromPropertySamples(samples);
  assert.equal(fieldByName(fields, 'poblacionTotal').label, 'Poblacion Total');
  assert.equal(fieldByName(fields, 'area_protegida').label, 'Area Protegida');
});
