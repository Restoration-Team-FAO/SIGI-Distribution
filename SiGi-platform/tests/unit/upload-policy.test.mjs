import test from 'node:test';
import assert from 'node:assert/strict';

const { assertSafeUpload } = await import(
  '../../apps/sigi-api/dist/common/http/upload-policy.js'
);

test('upload policy accepts a real CSV payload', () => {
  assert.doesNotThrow(() =>
    assertSafeUpload({ originalname: 'datos.csv', buffer: Buffer.from('code,name\n1,Uno\n') }, ['csv']),
  );
});

test('upload policy rejects extension spoofing and unsafe names', () => {
  assert.throws(() =>
    assertSafeUpload({ originalname: 'reporte.pdf', buffer: Buffer.from('not a pdf') }, ['pdf']),
  );
  assert.throws(() =>
    assertSafeUpload({ originalname: '../datos.csv', buffer: Buffer.from('a,b\n') }, ['csv']),
  );
});

test('upload policy validates JSON and ZIP signatures', () => {
  assert.doesNotThrow(() =>
    assertSafeUpload({ originalname: 'capa.geojson', buffer: Buffer.from('{"type":"FeatureCollection","features":[]}') }, ['geojson']),
  );
  assert.throws(() =>
    assertSafeUpload({ originalname: 'shape.zip', buffer: Buffer.from('plain text') }, ['zip']),
  );
});
