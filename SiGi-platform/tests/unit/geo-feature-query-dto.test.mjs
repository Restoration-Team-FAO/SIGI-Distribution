import test from 'node:test';
import assert from 'node:assert/strict';

// P0-10 — unit tests for /geo/*'s manual query-param validation (no
// class-validator dependency; every parser throws BadRequestException on a
// malformed value rather than silently coercing or dropping it).
const {
  parseBboxParam,
  parseZoomParam,
  parsePageParam,
  parsePageSizeParam,
  parseFiltersParam,
  parseSortParam,
  parseFormatParam,
  parseIntersectionQueryInput,
  MAX_PAGE_SIZE,
} = await import('../../apps/sigi-api/dist/modules/geo/dto/geo-feature-query.dto.js');

test('parseBboxParam: absent/empty is undefined, not an error', () => {
  assert.equal(parseBboxParam(undefined), undefined);
  assert.equal(parseBboxParam('  '), undefined);
});

test('parseBboxParam: valid "minLon,minLat,maxLon,maxLat" parses to a bbox object', () => {
  assert.deepEqual(parseBboxParam('-70,5,-69,6'), { minLon: -70, minLat: 5, maxLon: -69, maxLat: 6 });
});

test('parseBboxParam: non-numeric or wrong-arity input is rejected', () => {
  assert.throws(() => parseBboxParam('a,b,c,d'));
  assert.throws(() => parseBboxParam('1,2,3'));
});

test('parseBboxParam: out-of-range coordinates are rejected', () => {
  assert.throws(() => parseBboxParam('-200,5,-69,6'));
  assert.throws(() => parseBboxParam('-70,-95,-69,6'));
});

test('parseBboxParam: min must be strictly less than max on each axis', () => {
  assert.throws(() => parseBboxParam('-69,5,-70,6'));
  assert.throws(() => parseBboxParam('-70,6,-69,5'));
});

test('parseZoomParam: valid zoom is floored to an integer within 0..22', () => {
  assert.equal(parseZoomParam('7.9'), 7);
  assert.equal(parseZoomParam('0'), 0);
  assert.equal(parseZoomParam('22'), 22);
});

test('parseZoomParam: out-of-range zoom is rejected', () => {
  assert.throws(() => parseZoomParam('23'));
  assert.throws(() => parseZoomParam('-1'));
});

test('parsePageParam: must be an integer >= 1', () => {
  assert.equal(parsePageParam('1'), 1);
  assert.equal(parsePageParam('42'), 42);
  assert.throws(() => parsePageParam('0'));
  assert.throws(() => parsePageParam('1.5'));
});

test('parsePageSizeParam: clamped to MAX_PAGE_SIZE, never rejected outright for being too large', () => {
  assert.equal(parsePageSizeParam('50'), 50);
  assert.equal(parsePageSizeParam(String(MAX_PAGE_SIZE + 5000)), MAX_PAGE_SIZE);
});

test('parsePageSizeParam: still rejects a non-positive-integer value', () => {
  assert.throws(() => parsePageSizeParam('0'));
  assert.throws(() => parsePageSizeParam('abc'));
});

test('parseFiltersParam: absent/empty is undefined', () => {
  assert.equal(parseFiltersParam(undefined), undefined);
  assert.equal(parseFiltersParam(''), undefined);
});

test('parseFiltersParam: malformed JSON is rejected, not silently ignored', () => {
  assert.throws(() => parseFiltersParam('not-json'));
});

test('parseFiltersParam: a non-array JSON value is rejected', () => {
  assert.throws(() => parseFiltersParam('{}'));
});

test('parseFiltersParam: an entry missing a required key is rejected', () => {
  assert.throws(() => parseFiltersParam(JSON.stringify([{ field: 'level' }])));
  assert.throws(() => parseFiltersParam(JSON.stringify([{ field: 'level', operator: 'not-a-real-operator', value: 'x' }])));
});

test('parseFiltersParam: a valid filter array round-trips, trimming the field name', () => {
  const raw = JSON.stringify([{ field: ' level ', operator: 'eq', value: 'region' }]);
  assert.deepEqual(parseFiltersParam(raw), [{ field: 'level', operator: 'eq', value: 'region' }]);
});

test('parseSortParam: absent sort is undefined; default direction is asc', () => {
  assert.equal(parseSortParam(undefined, undefined), undefined);
  assert.deepEqual(parseSortParam('name', undefined), { field: 'name', direction: 'asc' });
});

test('parseSortParam: explicit desc is honored; an invalid order value is rejected', () => {
  assert.deepEqual(parseSortParam('name', 'desc'), { field: 'name', direction: 'desc' });
  assert.throws(() => parseSortParam('name', 'sideways'));
});

test('parseFormatParam: required, case-insensitive, restricted to csv/xlsx/geojson', () => {
  assert.equal(parseFormatParam('csv'), 'csv');
  assert.equal(parseFormatParam('XLSX'), 'xlsx');
  assert.equal(parseFormatParam('GeoJSON'), 'geojson');
  assert.throws(() => parseFormatParam(undefined));
  assert.throws(() => parseFormatParam('pdf'));
});

test('parseIntersectionQueryInput: accepts two distinct safe layer codes', () => {
  assert.deepEqual(
    parseIntersectionQueryInput({ sourceLayerCode: ' projects.cr ', targetLayerCode: 'protected-areas:2026' }),
    { sourceLayerCode: 'projects.cr', targetLayerCode: 'protected-areas:2026' },
  );
});

test('parseIntersectionQueryInput: rejects missing, unsafe or identical layer codes', () => {
  assert.throws(() => parseIntersectionQueryInput(null));
  assert.throws(() => parseIntersectionQueryInput({ sourceLayerCode: 'a', targetLayerCode: 'a' }));
  assert.throws(() => parseIntersectionQueryInput({ sourceLayerCode: 'a; DROP TABLE x', targetLayerCode: 'b' }));
});
