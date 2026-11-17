import test from 'node:test';
import assert from 'node:assert/strict';

// P0-10 — unit tests for /geo/*'s ORDER BY builder (P0-7). See
// geo-filter-sql.test.mjs for why this imports compiled dist output.
const { ParamBuilder } = await import('../../apps/sigi-api/dist/modules/geo/geo-filter-sql.js');
const { buildSortClause } = await import('../../apps/sigi-api/dist/modules/geo/geo-sort-sql.js');

function schemaField(name, overrides = {}) {
  return {
    name,
    label: name,
    type: 'string',
    unit: null,
    enumValues: null,
    filterable: true,
    sortable: true,
    visible: true,
    ...overrides,
  };
}

test('buildSortClause: builtin fields are always sortable, even with an empty schema', () => {
  const params = new ParamBuilder();
  const clause = buildSortClause({ field: 'name', direction: 'asc' }, [], params);
  assert.equal(clause, 't.name ASC NULLS LAST');
});

test('buildSortClause: descending direction flows through, still NULLS LAST', () => {
  const params = new ParamBuilder();
  const clause = buildSortClause({ field: 'areaHa', direction: 'desc' }, [], params);
  assert.equal(clause, '(tf.area_ha)::numeric DESC NULLS LAST');
});

test('buildSortClause: a schema field explicitly marked sortable:false is rejected', () => {
  const params = new ParamBuilder();
  const schema = [schemaField('internalOnly', { sortable: false })];
  assert.throws(
    () => buildSortClause({ field: 'internalOnly', direction: 'asc' }, schema, params),
    (error) => {
      assert.match(error.message, /no admite ordenamiento/);
      return true;
    },
  );
});

test('buildSortClause: a sortable schema field of type date casts to ::date', () => {
  const params = new ParamBuilder();
  const schema = [schemaField('fechaCorte', { type: 'date' })];
  const clause = buildSortClause({ field: 'fechaCorte', direction: 'asc' }, schema, params);
  assert.equal(clause, '((tf.properties_json ->> $1))::date ASC NULLS LAST');
  assert.deepEqual(params.params, ['fechaCorte']);
});

test('buildSortClause: an unknown field is rejected the same way a filter on it would be', () => {
  const params = new ParamBuilder();
  assert.throws(() => buildSortClause({ field: 'nope', direction: 'asc' }, [], params));
});
