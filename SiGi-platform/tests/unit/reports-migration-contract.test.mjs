import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../infra/postgres/init/013_reports_module.sql', import.meta.url), 'utf8');

test('reports migration seeds every required framework without country demo data', () => {
  for (const code of ['NATIONAL_CHAPTER','REGIONAL_RESTORATION','BTR','NDC','GBF_TARGET_2','LDN','CUSTOM']) {
    assert.match(sql, new RegExp(`'${code}'`));
  }
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+core\.countries/i);
});

test('reports migration defines EGI scope, workflow constraints and permission grants', () => {
  assert.match(sql, /egi_id UUID NOT NULL REFERENCES core\.egi_spaces/);
  assert.match(sql, /'DRAFT'.*'IN_PROGRESS'.*'READY_FOR_REVIEW'/s);
  for (const permission of ['reports.read','reports.generate','reports.approve','reports.publish','reports.templates.manage','reports.mappings.manage']) {
    assert.match(sql, new RegExp(permission.replace('.', '\\.')));
  }
});

test('calendar persists reference milestones, country commitments and one contribution per institution', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core\.report_reference_milestones/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core\.report_commitments/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core\.report_commitment_contributions/);
  assert.match(sql, /UNIQUE \(commitment_id, institution_id\)/);
  for (const relation of ['report_contribution_documents','report_contribution_datasets','report_contribution_indicators']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS core\\.${relation}`));
  }
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core\.report_reminder_rules/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core\.report_notifications/);
  assert.match(sql, /dedup_key TEXT NOT NULL UNIQUE/);
  for (const permission of ['reports.commitments.manage','reports.contributions.submit','reports.contributions.review']) {
    assert.match(sql, new RegExp(permission.replace('.', '\\.')));
  }
});

test('report snapshots and traceability references are persisted, not frontend-only', () => {
  assert.match(sql, /snapshot_json JSONB NOT NULL/);
  assert.match(sql, /checksum_sha256 TEXT/);
  assert.match(sql, /dataset_id UUID REFERENCES core\.datasets/);
  assert.match(sql, /source_id UUID REFERENCES core\.data_sources/);
  assert.match(sql, /transformation_rule TEXT/);
});
