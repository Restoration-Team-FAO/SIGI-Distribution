import test from 'node:test';
import assert from 'node:assert/strict';

// P0-10 — unit tests for the single visibility-evaluation function shared
// across geo-bi, territories, and /geo/* (P0-2). This is the module whose
// P0-1 gap (anonymous reads of non-public layers) was the security defect
// this whole effort started from — regression here matters more than most.
const {
  GEO_VISIBILITY_LEVELS,
  GEO_NON_PUBLIC_LAYERS_PERMISSION,
  isPublicGeoVisibility,
  principalCanReadNonPublicGeoLayers,
  buildGeoLayerVisibilitySql,
} = await import('../../apps/sigi-api/dist/common/geo/geo-visibility.js');

test('GEO_VISIBILITY_LEVELS: five levels, public ranked lowest, private highest', () => {
  const values = GEO_VISIBILITY_LEVELS.map((level) => level.value);
  assert.deepEqual(values.sort(), ['institutional', 'internal', 'private', 'public', 'restricted'].sort());
  const publicLevel = GEO_VISIBILITY_LEVELS.find((level) => level.value === 'public');
  const privateLevel = GEO_VISIBILITY_LEVELS.find((level) => level.value === 'private');
  assert.equal(publicLevel.rank, 0);
  assert.ok(privateLevel.rank > publicLevel.rank);
});

test('GEO_VISIBILITY_LEVELS: legacy internal/private share a rank with their modern equivalents, per docs/geo/permissions.md', () => {
  const institutional = GEO_VISIBILITY_LEVELS.find((level) => level.value === 'institutional');
  const internal = GEO_VISIBILITY_LEVELS.find((level) => level.value === 'internal');
  assert.equal(institutional.rank, internal.rank);
  assert.equal(internal.legacy, true);
  assert.equal(institutional.legacy, false);
});

test('isPublicGeoVisibility: only the literal "public" value is public', () => {
  assert.equal(isPublicGeoVisibility('public'), true);
  assert.equal(isPublicGeoVisibility('internal'), false);
  assert.equal(isPublicGeoVisibility('institutional'), false);
  assert.equal(isPublicGeoVisibility('restricted'), false);
  assert.equal(isPublicGeoVisibility('private'), false);
  assert.equal(isPublicGeoVisibility(''), false);
});

test('principalCanReadNonPublicGeoLayers: anonymous (null) can never read non-public layers', () => {
  assert.equal(principalCanReadNonPublicGeoLayers(null), false);
  assert.equal(principalCanReadNonPublicGeoLayers(undefined), false);
});

test('principalCanReadNonPublicGeoLayers: a principal without the gating permission cannot read non-public layers', () => {
  const principal = { userId: 'u1', subject: 'reader@sigi.local', permissions: ['files.read'] };
  assert.equal(principalCanReadNonPublicGeoLayers(principal), false);
});

test('principalCanReadNonPublicGeoLayers: a principal holding connectors.read can read non-public layers', () => {
  const principal = { userId: 'u1', subject: 'ops@sigi.local', permissions: [GEO_NON_PUBLIC_LAYERS_PERMISSION] };
  assert.equal(principalCanReadNonPublicGeoLayers(principal), true);
});

test('buildGeoLayerVisibilitySql: authorized callers get an unconditional TRUE, not a weakened filter', () => {
  assert.equal(buildGeoLayerVisibilitySql('gl', true), 'TRUE');
});

test('buildGeoLayerVisibilitySql: unauthorized callers get the real public-only predicate, parameterized by alias', () => {
  assert.equal(buildGeoLayerVisibilitySql('gl', false), 'gis.geo_visibility_is_public(gl.visibility)');
  assert.equal(buildGeoLayerVisibilitySql('geo_layers', false), 'gis.geo_visibility_is_public(geo_layers.visibility)');
});
