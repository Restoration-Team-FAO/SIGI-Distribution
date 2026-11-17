import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

const { ReportsService } = await import('../../apps/sigi-api/dist/modules/reports/reports.service.js');

const egiId = 'a9f8bb74-2750-4858-9276-747955731ed2';
const institutionId = '299f56d7-9f9e-4f07-8962-111111111001';
const context = {
  requestedEgiId: egiId,
  principal: {
    subject: 'test-user',
    userId: '11111111-1111-4111-8111-111111111111',
    institutionId,
    roles: ['national_admin'],
    permissions: ['reports.read', 'reports.export'],
  },
};

function fixture() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'BTR nacional 2028',
    frameworkName: 'Convención Marco de las Naciones Unidas sobre el Cambio Climático',
    countryCode: 'DO',
    dueDate: '2028-12-31',
    internalCutoffDate: '2028-09-30',
    status: 'OPEN',
    coordinatingInstitutionName: 'Ministerio coordinador',
    contributionCount: 1,
    validatedCount: 0,
    contributions: [{
      institutionId,
      institutionName: 'Institución aportante',
      responsibleName: 'Persona responsable',
      responsibleEmail: 'responsable@example.test',
      status: 'IN_PROGRESS',
      documents: [{ id: 'doc' }],
      datasets: [],
      indicators: [{ id: 'indicator' }],
    }],
  };
}

function serviceWith(commitments) {
  const audits = [];
  const db = {
    transaction: async (callback) => callback({
      query: async (_sql, parameters) => {
        audits.push(JSON.parse(parameters[4]));
        return { rows: [], rowCount: 1 };
      },
    }),
  };
  const adminService = { resolveAdminScopeEgiId: async () => egiId };
  const service = new ReportsService(db, adminService);
  service.listCommitments = async () => commitments;
  return { service, audits };
}

test('commitment XLSX export applies filters and writes one institutional row', async () => {
  const { service, audits } = serviceWith([fixture(), { ...fixture(), id: '33333333-3333-4333-8333-333333333333', dueDate: '2029-01-01' }]);
  const exported = await service.exportCommitmentCalendar('xlsx', { year: 2028, institutionId }, context);

  assert.equal(exported.count, 1);
  assert.match(exported.filename, /2028\.xlsx$/);
  assert.equal(exported.body.subarray(0, 2).toString(), 'PK');
  const workbook = XLSX.read(exported.body);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Cronograma);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Compromiso, 'BTR nacional 2028');
  assert.equal(rows[0]['Institución aportante'], 'Institución aportante');
  assert.deepEqual(audits, [{ format: 'xlsx', year: 2028, status: null, institutionId, count: 1 }]);
});

test('commitment iCalendar export creates an all-day event and audits empty results', async () => {
  const { service, audits } = serviceWith([fixture()]);
  const exported = await service.exportCommitmentCalendar('ics', { year: 2028, status: 'OPEN' }, context);
  const calendar = exported.body.toString('utf8');

  assert.match(calendar, /^BEGIN:VCALENDAR\r\n/);
  assert.match(calendar, /BEGIN:VEVENT/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20281231/);
  assert.match(calendar, /DTEND;VALUE=DATE:20290101/);
  assert.match(calendar, /SUMMARY:BTR nacional 2028/);
  assert.deepEqual(audits, [{ format: 'ics', year: 2028, status: 'OPEN', institutionId: null, count: 1 }]);

  const empty = await service.exportCommitmentCalendar('ics', { year: 2033 }, context);
  assert.doesNotMatch(empty.body.toString('utf8'), /BEGIN:VEVENT/);
  assert.equal(empty.count, 0);
});
