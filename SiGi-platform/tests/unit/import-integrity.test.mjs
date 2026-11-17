import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// V2.0.2 — defectos de importación: proyectos importados quedan en el EGI del lote (N-01), las
// escrituras multi-sentencia usan una transacción real (N-02) y las fechas inválidas son errores.
const source = readFileSync(new URL('../../apps/sigi-api/src/modules/imports/imports.service.ts', import.meta.url), 'utf8');
const { parseDateOnly } = await import('../../apps/sigi-api/dist/modules/imports/imports.service.js');

test('parseDateOnly rejects impossible calendar dates instead of rolling them over', () => {
  assert.equal(parseDateOnly('2026-02-28'), '2026-02-28');
  assert.equal(parseDateOnly('2024-02-29'), '2024-02-29');
  for (const value of ['2026-02-31', '2026-13-01', 'no-es-fecha', '']) {
    assert.equal(parseDateOnly(value), null, value);
  }
});

test('imported projects carry the batch EGI and never move between EGIs (N-01)', () => {
  const upsert = source.match(/INSERT INTO core\.projects \([\s\S]*?RETURNING id/)?.[0] ?? '';
  assert.match(upsert, /egi_id\s*\)\s*VALUES \(.*\$8::uuid\)/s);
  assert.match(upsert, /core\.projects\.egi_id IS NULL OR core\.projects\.egi_id = EXCLUDED\.egi_id/);
});

test('mapping profile writes use a real transaction, not BEGIN/COMMIT on the pool (N-02)', () => {
  assert.doesNotMatch(source, /postgresService\.query\('(BEGIN|COMMIT|ROLLBACK)'\)/);
});

test('missing or invalid indicator dates are row errors, never 1970-01-01', () => {
  assert.doesNotMatch(source, /'1970-01-01'/);
  assert.match(source, /observed_at_required/);
  assert.match(source, /end_date_invalid/);
});
