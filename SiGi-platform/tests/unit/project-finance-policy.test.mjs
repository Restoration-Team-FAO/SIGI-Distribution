import assert from 'node:assert/strict';
import test from 'node:test';

const { calculateProjectFinancialSummary, percentage } = await import('../../apps/sigi-api/dist/modules/projects/project-finance-policy.js');

const settings = (mode, overrides = {}) => ({ mode, baseCurrency: 'USD', externalBudgetAmount: null, externalCommittedAmount: null, externalExecutedAmount: null, externalAvailableAmount: null, dataCutoffDate: null, ...overrides });

test('none represents no gestionado with nulls rather than zero', () => {
  const summary = calculateProjectFinancialSummary(settings('none'));
  assert.equal(summary.applicable, false);
  assert.equal(summary.currentBudget, null);
  assert.equal(summary.executed, null);
  assert.equal(summary.executionPct, null);
});

test('planning calculates versions and adjustments without inventing execution', () => {
  const summary = calculateProjectFinancialSummary(settings('planning'), { initialBudget: 1000, lineBudget: 1000, adjustments: 200, committed: 300, executed: 100 });
  assert.equal(summary.initialBudget, 1000);
  assert.equal(summary.currentBudget, 1200);
  assert.equal(summary.variance, 200);
  assert.equal(summary.committed, null);
  assert.equal(summary.executed, null);
});

test('execution derives available, variance and percentages from approved totals', () => {
  const summary = calculateProjectFinancialSummary(settings('execution'), { initialBudget: 1590000, lineBudget: 1750000, adjustments: 160000, committed: 890000, executed: 640000 });
  assert.equal(summary.currentBudget, 1750000);
  assert.equal(summary.available, 860000);
  assert.equal(summary.variance, 160000);
  assert.equal(summary.commitmentPct, 50.86);
  assert.equal(summary.executionPct, 36.57);
});

test('external preserves reported values and guards invalid denominators', () => {
  const summary = calculateProjectFinancialSummary(settings('external', { externalBudgetAmount: 2850000, externalCommittedAmount: 1120000, externalExecutedAmount: 735000, externalAvailableAmount: 1730000, dataCutoffDate: '2026-09-24' }));
  assert.equal(summary.source, 'external');
  assert.equal(summary.executionPct, 25.79);
  assert.equal(summary.cutoffDate, '2026-09-24');
  assert.equal(percentage(10, 0), null);
  assert.equal(percentage(null, 100), null);
});
