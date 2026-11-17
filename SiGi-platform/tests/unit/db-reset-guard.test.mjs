import test from 'node:test';
import assert from 'node:assert/strict';

// V2.0.2 — el reset destructivo de base está apagado por defecto: sin SIGI_ENABLE_DB_RESET=true la ruta
// responde 404 aunque exista passphrase, y la passphrase se compara en tiempo constante.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  GEOSERVER_ADMIN_USER: 'test',
  GEOSERVER_ADMIN_PASSWORD: 'test',
  GEOSERVER_WORKSPACE: 'test',
  GEOSERVER_DATASTORE: 'test',
  GIS_SERVICE_URL: 'http://localhost:1',
  INTEGRATION_SERVICE_URL: 'http://localhost:2',
  GEOSERVER_INTERNAL_URL: 'http://localhost:3',
  SIGI_DB_RESET_PASSPHRASE: 'frase-de-prueba-larga-2026',
});
delete process.env.SIGI_ENABLE_DB_RESET;

const { AdminService, passphraseMatches } = await import('../../apps/sigi-api/dist/modules/admin/admin.service.js');

test('passphraseMatches compares exact values of any length', () => {
  assert.equal(passphraseMatches('frase-de-prueba-larga-2026', 'frase-de-prueba-larga-2026'), true);
  assert.equal(passphraseMatches('frase', 'frase-de-prueba-larga-2026'), false);
  assert.equal(passphraseMatches('', 'frase-de-prueba-larga-2026'), false);
});

test('reset-database is not found unless explicitly enabled, and never touches the database', async () => {
  const service = Object.create(AdminService.prototype);
  service.postgresService = {
    query: async () => {
      throw new Error('database must not be queried');
    },
  };
  await assert.rejects(
    service.resetDatabase({ confirmationText: 'RESET SIGI DATABASE', passphrase: 'frase-de-prueba-larga-2026' }, null),
    (error) => error.getStatus?.() === 404,
  );
});
