import test from 'node:test';
import assert from 'node:assert/strict';

// P0-10 — unit tests for the pure SQL-building logic behind /geo/*'s
// filters (spec §27: "nunca concatenar filtros del usuario en SQL"). These
// import the compiled output (apps/sigi-api/dist), not the TS source —
// sigi-api has no ts-node/tsx/jest configured, so this is the only way to
// exercise these functions without a live Postgres + HTTP round trip (that
// coverage already exists as scripts/geo-api-smoke.mjs, registered in the
// release gate). Run `npm run build:api` before this file if you've edited
// apps/sigi-api/src/modules/geo/geo-filter-sql.ts — npm run test:unit does
// this automatically.
const { ParamBuilder, resolveFieldExpression, buildFilterClause } = await import(
  '../../apps/sigi-api/dist/modules/geo/geo-filter-sql.js'
);

function enumSchemaField(name) {
  return {
    name,
    label: name,
    type: 'enum',
    unit: null,
    enumValues: ['PN', 'RB'],
    filterable: true,
    sortable: true,
    visible: true,
  };
}

function numberSchemaField(name) {
  return { name, label: name, type: 'number', unit: 'ha', enumValues: null, filterable: true, sortable: true, visible: true };
}

function dateSchemaField(name) {
  return { name, label: name, type: 'date', unit: null, enumValues: null, filterable: true, sortable: true, visible: true };
}

test('resolveFieldExpression: builtin fields resolve without consuming a param', () => {
  const params = new ParamBuilder();
  const result = resolveFieldExpression('code', [], params);
  assert.equal(result.expr, 't.code');
  assert.equal(result.type, 'string');
  assert.equal(result.fieldSchema, null);
  assert.deepEqual(params.params, []);
});

test('resolveFieldExpression: areaHa builtin resolves as a numeric column', () => {
  const params = new ParamBuilder();
  const result = resolveFieldExpression('areaHa', [], params);
  assert.equal(result.expr, 'tf.area_ha');
  assert.equal(result.type, 'number');
});

test('resolveFieldExpression: schema field binds its name as a parameter, never interpolated', () => {
  const params = new ParamBuilder();
  const result = resolveFieldExpression('CATEGORíA', [enumSchemaField('CATEGORíA')], params);
  assert.equal(result.expr, '(tf.properties_json ->> $1)');
  assert.deepEqual(params.params, ['CATEGORíA']);
  assert.equal(result.type, 'enum');
});

test('resolveFieldExpression: unknown field is rejected, matching the schema field-name validation the frontend relies on', () => {
  const params = new ParamBuilder();
  assert.throws(() => resolveFieldExpression('categoria', [enumSchemaField('CATEGORíA')], params), (error) => {
    assert.match(error.message, /Campo desconocido/);
    return true;
  });
});

test('buildFilterClause: eq on a string builtin binds the raw value as a param', () => {
  const params = new ParamBuilder();
  const clause = buildFilterClause({ field: 'code', operator: 'eq', value: 'CR-01' }, [], params);
  assert.equal(clause, 't.code = $1');
  assert.deepEqual(params.params, ['CR-01']);
});

test('buildFilterClause: eq on a number field casts and coerces the bound value to a number', () => {
  const params = new ParamBuilder();
  const clause = buildFilterClause({ field: 'areaHa', operator: 'eq', value: '12.5' }, [], params);
  assert.equal(clause, '(tf.area_ha)::numeric = $1');
  assert.deepEqual(params.params, [12.5]);
});

test('buildFilterClause: eq on a number field rejects a non-finite value', () => {
  const params = new ParamBuilder();
  assert.throws(() => buildFilterClause({ field: 'areaHa', operator: 'eq', value: 'not-a-number' }, [], params));
});

test('buildFilterClause: contains lowercases both sides via POSITION/LOWER', () => {
  const params = new ParamBuilder();
  const clause = buildFilterClause({ field: 'name', operator: 'contains', value: 'Refugio' }, [], params);
  assert.equal(clause, "POSITION(LOWER($1) IN LOWER(COALESCE(t.name, ''))) > 0");
  assert.deepEqual(params.params, ['Refugio']);
});

test('buildFilterClause: in on a string field binds an ANY(text[]) array, coercing each element', () => {
  const params = new ParamBuilder();
  const clause = buildFilterClause({ field: 'code', operator: 'in', value: ['A', 'B'] }, [], params);
  assert.equal(clause, 't.code = ANY($1::text[])');
  assert.deepEqual(params.params, [['A', 'B']]);
});

test('buildFilterClause: in on a number field binds an ANY(numeric[]) array', () => {
  const params = new ParamBuilder();
  const clause = buildFilterClause({ field: 'areaHa', operator: 'in', value: [1, 2, 3] }, [], params);
  assert.equal(clause, '(tf.area_ha)::numeric = ANY($1::numeric[])');
  assert.deepEqual(params.params, [[1, 2, 3]]);
});

test('buildFilterClause: in requires a non-empty array', () => {
  const params = new ParamBuilder();
  assert.throws(() => buildFilterClause({ field: 'code', operator: 'in', value: [] }, [], params));
  assert.throws(() => buildFilterClause({ field: 'code', operator: 'in', value: 'not-an-array' }, [], params));
});

test('buildFilterClause: gt/gte/lt/lte are rejected on a string field', () => {
  const params = new ParamBuilder();
  assert.throws(
    () => buildFilterClause({ field: 'code', operator: 'gt', value: '5' }, [], params),
    (error) => {
      assert.match(error.message, /solo aplica a campos numéricos o de fecha/);
      return true;
    },
  );
});

test('buildFilterClause: gte on a number field casts numeric on both sides', () => {
  const params = new ParamBuilder();
  const clause = buildFilterClause({ field: 'areaHa', operator: 'gte', value: 10 }, [], params);
  assert.equal(clause, '(tf.area_ha)::numeric >= $1');
  assert.deepEqual(params.params, [10]);
});

test('buildFilterClause: lte on a date-typed schema field casts to ::date', () => {
  const params = new ParamBuilder();
  const schema = [dateSchemaField('dataDate')];
  const clause = buildFilterClause({ field: 'dataDate', operator: 'lte', value: '2026-01-01' }, schema, params);
  assert.equal(clause, '((tf.properties_json ->> $1))::date <= $2');
  assert.deepEqual(params.params, ['dataDate', '2026-01-01']);
});

test('buildFilterClause: schema field type flows through to the operator restrictions (number field from geo-schema.ts, not just builtins)', () => {
  const params = new ParamBuilder();
  const schema = [numberSchemaField('poblacion')];
  const clause = buildFilterClause({ field: 'poblacion', operator: 'gt', value: 100 }, schema, params);
  assert.match(clause, /::numeric > \$2$/);
});
