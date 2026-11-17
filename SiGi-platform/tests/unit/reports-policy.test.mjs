import test from 'node:test';
import assert from 'node:assert/strict';

const {
  assertMappingConfiguration,
  assertReportTransition,
  calculateCoverage,
  normalizeReportStatus,
  normalizeContributionReviewStatus,
  validateCommitmentInput,
  validateTemplateDefinition,
} = await import('../../apps/sigi-api/dist/modules/reports/report-policy.js');

test('country commitments require contributors and an internal cutoff before the official date', () => {
  assert.deepEqual(validateCommitmentInput({
    title: 'BTR nacional', dueDate: '2028-12-31', internalCutoffDate: '2028-09-30',
    institutionIds: ['one', 'one', 'two'],
  }), { title: 'BTR nacional', dueDate: '2028-12-31', internalCutoffDate: '2028-09-30', institutionIds: ['one', 'two'] });
  assert.throws(() => validateCommitmentInput({ title: 'BTR', dueDate: '2028-01-01', internalCutoffDate: '2028-02-01', institutionIds: ['one'] }), /no puede ser posterior/);
  assert.throws(() => validateCommitmentInput({ title: 'BTR', dueDate: '2028-01-01', institutionIds: [] }), /al menos una institución/);
});

test('institutional contribution review only accepts explicit outcomes', () => {
  assert.equal(normalizeContributionReviewStatus('validated'), 'VALIDATED');
  assert.equal(normalizeContributionReviewStatus('CHANGES_REQUESTED'), 'CHANGES_REQUESTED');
  assert.throws(() => normalizeContributionReviewStatus('APPROVED'), /debe validar/);
});

test('report workflow permits review path and rejects publishing a draft', () => {
  assert.doesNotThrow(() => assertReportTransition('DRAFT', 'READY_FOR_REVIEW'));
  assert.doesNotThrow(() => assertReportTransition('UNDER_REVIEW', 'APPROVED'));
  assert.doesNotThrow(() => assertReportTransition('APPROVED', 'PUBLISHED'));
  assert.throws(() => assertReportTransition('DRAFT', 'PUBLISHED'), /no está permitida/);
});

test('report status normalization is strict and case independent', () => {
  assert.equal(normalizeReportStatus('approved'), 'APPROVED');
  assert.throws(() => normalizeReportStatus('official'), /no válido/);
});

test('coverage excludes not-applicable requirements and gives partial data half weight', () => {
  assert.deepEqual(calculateCoverage([
    { required: true, status: 'AVAILABLE' },
    { required: true, status: 'PARTIAL' },
    { required: true, status: 'MISSING' },
    { required: true, status: 'NOT_APPLICABLE' },
    { required: false, status: 'MISSING' },
  ]), {
    score: 50, total: 5, quantifiable: 3, available: 1,
    partial: 1, pending: 0, missing: 1, notApplicable: 1,
  });
});

test('coverage has no invented percentage without quantifiable requirements', () => {
  assert.equal(calculateCoverage([]).score, null);
  assert.equal(calculateCoverage([{ required: true, status: 'NOT_APPLICABLE' }]).score, null);
});

test('template validation requires unique section codes', () => {
  assert.deepEqual(validateTemplateDefinition({
    frameworkCode: 'ndc', name: 'NDC nacional',
    sections: [{ code: 'general', title: 'General' }],
  }), { frameworkCode: 'NDC', name: 'NDC nacional' });
  assert.throws(() => validateTemplateDefinition({
    frameworkCode: 'NDC', name: 'Duplicada',
    sections: [{ code: 'same', title: 'A' }, { code: 'same', title: 'B' }],
  }), /no pueden repetirse/);
});

test('DIRECT mappings are never accepted without an explicit eligibility rule', () => {
  assert.throws(() => assertMappingConfiguration({ mappingType: 'DIRECT' }), /elegibilidad expresa/);
  assert.equal(assertMappingConfiguration({ mappingType: 'DIRECT', eligibilityRule: 'unit = ha' }), 'DIRECT');
  assert.throws(() => assertMappingConfiguration({ mappingType: 'DERIVED' }), /transformationRule/);
});
