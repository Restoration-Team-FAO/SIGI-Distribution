import test from 'node:test';
import assert from 'node:assert/strict';

// V2-06 — GET /api/projects/:id (anónimo) devuelve una proyección por lista blanca: nunca presupuesto,
// movimientos financieros, fuentes de financiamiento, riesgos, registros de gestión ni actores.
const { ProjectsService } = await import('../../apps/sigi-api/dist/modules/projects/projects.service.js');

const SENSITIVE = ['SECRET-BUDGET-991', 'SECRET-SUPPLIER-ACME', 'SECRET-RISK', 'SECRET-PERSON', 'SECRET-FUNDER', 'SECRET-NOTE'];

test('public project detail strips financial, risk, actor and lifecycle data', async () => {
  const service = Object.create(ProjectsService.prototype);
  service.findOne = async () => ({
    project: { id: 'p1', title: 'Restauración', visibility: 'public' },
    portfolio: null,
    actors: [{ id: 'a1', displayName: SENSITIVE[3] }],
    milestones: [{ id: 'm1', title: 'Hito', status: 'done', dueDate: '2026-01-01', completedAt: null, progressPct: 100, description: SENSITIVE[5] }],
    tasks: [{ id: 't1', title: 'Tarea', description: SENSITIVE[5] }],
    budgetItems: [{ id: 'b1', name: SENSITIVE[0], plannedAmount: 1000 }],
    risks: [{ id: 'r1', title: SENSITIVE[2] }],
    indicators: [{ id: 'i1', name: 'Hectáreas' }],
    territories: [{ id: 'te1', name: 'Provincia' }],
    deliverables: [],
    documents: [{ id: 'd1', status: 'published' }, { id: 'd2', status: 'draft' }],
    incidents: [{ id: 'n1', title: 'Incidente', notes: SENSITIVE[5] }],
    datasets: [{ id: 'ds1' }],
    audit: [{ id: 'au1' }],
    financialSettings: { externalBudgetAmount: 5 },
    fundingSources: [{ funder: SENSITIVE[4] }],
    budgetVersions: [{ name: SENSITIVE[0] }],
    financialMovements: [{ supplierOrBeneficiary: SENSITIVE[1], amount: 50 }],
    managementRecords: [{ title: SENSITIVE[2] }],
    statusUpdates: [{ issues: SENSITIVE[5] }],
    financialSummary: { executed: 10 },
    alerts: [{ code: 'x' }],
  });
  const detail = await service.findPublicOne('p1');
  const text = JSON.stringify(detail);
  for (const secret of SENSITIVE) assert.ok(!text.includes(secret), `leaked ${secret}`);
  for (const key of ['financialSettings', 'fundingSources', 'budgetVersions', 'financialMovements', 'managementRecords', 'statusUpdates', 'financialSummary', 'alerts']) {
    assert.ok(!(key in detail), `unexpected key ${key}`);
  }
  assert.deepEqual(detail.documents.map((document) => document.id), ['d1']);
  assert.equal(detail.indicators.length, 1);
  assert.equal(detail.milestones[0].title, 'Hito');
});
