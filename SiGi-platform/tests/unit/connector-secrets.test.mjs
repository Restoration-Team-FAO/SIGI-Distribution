import test from 'node:test';
import assert from 'node:assert/strict';

// V2-03 — ninguna respuesta de conectores o fuentes serializa credenciales, y los roles sin alcance
// global solo listan conectores de las instituciones de sus EGI.
const { REDACTED_VALUE, redactSecrets } = await import('../../apps/sigi-api/dist/common/security/redact-secrets.js');
const { mapConnectorRow: mapPublicConnectorRow } = await import(
  '../../apps/sigi-api/dist/modules/connectors/connectors.service.js'
);
const admin = await import('../../apps/sigi-api/dist/modules/admin/admin.service.js');

const SECRETS = ['kobo-token-123', 'odoo-pass-456', 'api-key-789', 'nested-secret-000'];
const config = {
  endpointUrl: 'https://kf.kobotoolbox.org',
  userName: 'svc-reader',
  credentialSecret: SECRETS[0],
  password: SECRETS[1],
  apiKey: SECRETS[2],
  headers: { Authorization: `Token ${SECRETS[3]}`, Accept: 'application/json' },
  assetUid: 'aXyZ',
};
const assertNoSecrets = (payload) => {
  const text = JSON.stringify(payload);
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `secret leaked: ${secret}`);
};

test('redactSecrets masks nested secret keys without mutating the input', () => {
  const redacted = redactSecrets(config);
  assertNoSecrets(redacted);
  assert.equal(redacted.credentialSecret, REDACTED_VALUE);
  assert.equal(redacted.headers.Accept, 'application/json');
  assert.equal(redacted.assetUid, 'aXyZ');
  assert.equal(config.credentialSecret, SECRETS[0]);
});

test('connector and source mappers never serialize credentials', () => {
  const row = {
    id: '00000000-0000-4000-8000-000000000001',
    institution_id: '00000000-0000-4000-8000-000000000002',
    egi_id: null,
    connector_type: 'kobo',
    display_name: 'Kobo',
    status: 'active',
    config_json: config,
    last_sync_at: null,
  };
  const source = {
    ...row,
    connector_id: row.id,
    code: 'SRC',
    name: 'Source',
    source_type: 'kobo',
    last_ingested_at: null,
    created_at: new Date(0),
    updated_at: new Date(0),
  };
  const payloads = [mapPublicConnectorRow(row), admin.mapConnectorRow(row), admin.mapSourceRow(source)];
  payloads.forEach(assertNoSecrets);
  assert.equal(payloads[0].credentialsConfigured, true);
  assert.equal(payloads[1].credentialsConfigured, true);
});

function serviceWith({ canManageAll, institutionId, spaces }) {
  const service = Object.create(admin.AdminService.prototype);
  service.connectorsService = {
    listAll: async () => [
      { id: 'c1', institutionId: 'inst-a' },
      { id: 'c2', institutionId: 'inst-b' },
      { id: 'c3', institutionId: 'inst-c' },
    ],
  };
  service.getEgiAccessContext = async () => ({ userId: 'u1', institutionId, canManageAll, canManageInstitution: false });
  service.listAccessibleEgis = async () => spaces;
  return service;
}

test('non-global roles only list connectors of their EGI institutions', async () => {
  const scoped = serviceWith({ canManageAll: false, institutionId: 'inst-a', spaces: [{ institutionId: 'inst-b' }] });
  assert.deepEqual((await scoped.listConnectors('editor@sigi.local')).map((item) => item.id), ['c1', 'c2']);
  const global = serviceWith({ canManageAll: true, institutionId: null, spaces: [] });
  assert.equal((await global.listConnectors('superadmin@sigi.local')).length, 3);
});
