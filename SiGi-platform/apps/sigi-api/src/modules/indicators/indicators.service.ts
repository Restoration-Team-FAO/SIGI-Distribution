import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';

@Injectable()
export class IndicatorsService {
  constructor(private readonly postgresService: PostgresService) {}

  async list() {
    const result = await this.postgresService.query<IndicatorRow>(`
      SELECT id, code, name, unit, category, current_value, created_at, updated_at
      FROM core.indicators ORDER BY code ASC
    `);
    return result.rows.map(mapPublicIndicator);
  }

  async listWorkspace(egiId?: string | null) {
    const result = await this.postgresService.query<WorkspaceIndicatorRow>(`
      WITH scoped AS (
        SELECT pi.* FROM core.project_indicators pi
        INNER JOIN core.projects p ON p.id = pi.project_id
        WHERE ($1::uuid IS NULL OR p.egi_id = $1::uuid)
      ), codes AS (
        SELECT code FROM core.indicators UNION SELECT indicator_code FROM scoped
      )
      SELECT COALESCE(i.id, MIN(s.id::text)::uuid) AS id, c.code,
        COALESCE(i.name, MAX(s.indicator_name), c.code) AS name,
        COALESCE(i.unit, MAX(s.unit), 'n/d') AS unit,
        COALESCE(i.category, MAX(s.category), 'project') AS category,
        i.current_value, COALESCE(i.created_at, MIN(s.created_at)) AS created_at,
        GREATEST(i.updated_at, MAX(s.updated_at)) AS updated_at,
        COUNT(DISTINCT s.project_id)::int AS project_count,
        COUNT(s.id)::int AS observation_count, MAX(s.observed_at) AS latest_observed_at,
        (ARRAY_AGG(s.value_numeric ORDER BY s.observed_at DESC, s.updated_at DESC)
          FILTER (WHERE s.value_numeric IS NOT NULL))[1] AS latest_value,
        (ARRAY_AGG(s.baseline_value ORDER BY s.observed_at DESC, s.updated_at DESC)
          FILTER (WHERE s.baseline_value IS NOT NULL))[1] AS baseline_value,
        (ARRAY_AGG(s.target_value ORDER BY s.observed_at DESC, s.updated_at DESC)
          FILTER (WHERE s.target_value IS NOT NULL))[1] AS target_value
      FROM codes c LEFT JOIN core.indicators i ON i.code = c.code
      LEFT JOIN scoped s ON s.indicator_code = c.code
      GROUP BY c.code, i.id, i.name, i.unit, i.category, i.current_value, i.created_at, i.updated_at
      ORDER BY COALESCE(i.name, MAX(s.indicator_name), c.code), c.code
    `, [egiId ?? null]);
    return result.rows.map(mapWorkspaceIndicator);
  }

  async findWorkspaceOne(code: string, egiId?: string | null) {
    const indicator = (await this.listWorkspace(egiId))
      .find((item) => item.code.toLowerCase() === code.toLowerCase());
    if (!indicator) return null;
    const [observations, territories, evidence, audit] = await Promise.all([
      this.postgresService.query<ObservationRow>(`
        SELECT pi.id, pi.indicator_code, pi.project_id, p.code AS project_code,
          p.title AS project_title, pi.value_numeric, pi.value_text, pi.unit,
          pi.baseline_value, pi.target_value, pi.observed_at, pi.updated_at
        FROM core.project_indicators pi INNER JOIN core.projects p ON p.id = pi.project_id
        WHERE LOWER(pi.indicator_code) = LOWER($1) AND ($2::uuid IS NULL OR p.egi_id = $2::uuid)
        ORDER BY pi.observed_at DESC, p.title
      `, [code, egiId ?? null]),
      this.postgresService.query<TerritoryRow>(`
        SELECT DISTINCT p.id AS project_id, p.code AS project_code, p.title AS project_title,
          pt.territory_id, pt.territory_code, COALESCE(t.name, pt.territory_name) AS territory_name,
          pt.country, pt.area_ha
        FROM core.project_indicators pi INNER JOIN core.projects p ON p.id = pi.project_id
        INNER JOIN core.project_territories pt ON pt.project_id = p.id
        LEFT JOIN core.territories t ON t.id = pt.territory_id
        WHERE LOWER(pi.indicator_code) = LOWER($1) AND ($2::uuid IS NULL OR p.egi_id = $2::uuid)
        ORDER BY p.title, pt.territory_code
      `, [code, egiId ?? null]),
      this.postgresService.query<EvidenceRow>(`
        SELECT DISTINCT p.id AS project_id, p.code AS project_code, p.title AS project_title,
          pd.dataset_id, d.title AS dataset_title, pd.relationship_type,
          pd.validation_status, pd.evidence_note
        FROM core.project_indicators pi INNER JOIN core.projects p ON p.id = pi.project_id
        INNER JOIN core.project_datasets pd ON pd.project_id = p.id
        LEFT JOIN core.datasets d ON d.id = pd.dataset_id
        WHERE LOWER(pi.indicator_code) = LOWER($1) AND ($2::uuid IS NULL OR p.egi_id = $2::uuid)
        ORDER BY p.title, d.title
      `, [code, egiId ?? null]),
      this.postgresService.query<AuditRow>(`
        SELECT ae.id, ae.egi_id, ae.actor_user_id, u.email AS actor_email, ae.action,
          ae.entity_type, ae.entity_id, ae.source, ae.result, ae.details_json, ae.created_at
        FROM core.audit_events ae LEFT JOIN core.users u ON u.id = ae.actor_user_id
        WHERE EXISTS (
          SELECT 1 FROM core.project_indicators pi INNER JOIN core.projects p ON p.id = pi.project_id
          WHERE LOWER(pi.indicator_code) = LOWER($1) AND ($2::uuid IS NULL OR p.egi_id = $2::uuid)
            AND ((ae.entity_type = 'project_indicator' AND ae.entity_id = pi.id)
              OR (ae.entity_type = 'project' AND ae.entity_id = p.id))
        ) ORDER BY ae.created_at DESC LIMIT 100
      `, [code, egiId ?? null]),
    ]);
    return {
      indicator,
      observations: observations.rows.map((row) => {
        const value = numberOrNull(row.value_numeric);
        const target = numberOrNull(row.target_value);
        return { id: row.id, indicatorCode: row.indicator_code, projectId: row.project_id,
          projectCode: row.project_code, projectTitle: row.project_title, valueNumeric: value,
          valueText: row.value_text, unit: row.unit, baselineValue: numberOrNull(row.baseline_value),
          targetValue: target, progressPct: progress(value, target),
          observedAt: row.observed_at?.toISOString().slice(0, 10) ?? null,
          updatedAt: row.updated_at.toISOString() };
      }),
      territories: territories.rows.map((row) => ({ projectId: row.project_id,
        projectCode: row.project_code, projectTitle: row.project_title, territoryId: row.territory_id,
        territoryCode: row.territory_code, territoryName: row.territory_name,
        country: row.country, areaHa: Number(row.area_ha) })),
      evidence: evidence.rows.map((row) => ({ projectId: row.project_id,
        projectCode: row.project_code, projectTitle: row.project_title, datasetId: row.dataset_id,
        datasetTitle: row.dataset_title, relationshipType: row.relationship_type,
        validationStatus: row.validation_status, evidenceNote: row.evidence_note })),
      audit: audit.rows.map((row) => ({ id: row.id, egiId: row.egi_id,
        actorUserId: row.actor_user_id, actorEmail: row.actor_email, action: row.action,
        entityType: row.entity_type, entityId: row.entity_id, source: row.source,
        result: row.result, details: row.details_json, createdAt: row.created_at.toISOString() })),
    };
  }
}

function mapPublicIndicator(row: IndicatorRow) {
  return { id: row.id, code: row.code, name: row.name, unit: row.unit,
    category: row.category, currentValue: numberOrNull(row.current_value),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

function mapWorkspaceIndicator(row: WorkspaceIndicatorRow) {
  const latestValue = numberOrNull(row.latest_value) ?? numberOrNull(row.current_value);
  const targetValue = numberOrNull(row.target_value);
  const progressPct = progress(latestValue, targetValue);
  return { ...mapPublicIndicator(row), latestValue,
    baselineValue: numberOrNull(row.baseline_value), targetValue, progressPct,
    projectCount: row.project_count, observationCount: row.observation_count,
    latestObservedAt: row.latest_observed_at?.toISOString().slice(0, 10) ?? null,
    status: latestValue === null ? 'without_data' as const : targetValue === null
      ? 'without_target' as const : (progressPct ?? 0) >= 75 ? 'on_track' as const : 'attention' as const };
}
function numberOrNull(value: string | null | undefined) { return value == null ? null : Number(value); }
function progress(value: number | null, target: number | null) {
  return target && target > 0 && value !== null ? Math.min(100, Math.round((value / target) * 100)) : null;
}

type IndicatorRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  current_value: string | null;
  created_at: Date;
  updated_at: Date;
};
type WorkspaceIndicatorRow = IndicatorRow & { project_count: number; observation_count: number; latest_observed_at: Date | null; latest_value: string | null; baseline_value: string | null; target_value: string | null };
type ObservationRow = { id: string; indicator_code: string; project_id: string; project_code: string | null; project_title: string; value_numeric: string | null; value_text: string | null; unit: string; baseline_value: string | null; target_value: string | null; observed_at: Date | null; updated_at: Date };
type TerritoryRow = { project_id: string; project_code: string | null; project_title: string; territory_id: string | null; territory_code: string; territory_name: string | null; country: string; area_ha: string };
type EvidenceRow = { project_id: string; project_code: string | null; project_title: string; dataset_id: string; dataset_title: string | null; relationship_type: string; validation_status: string | null; evidence_note: string | null };
type AuditRow = { id: string; egi_id: string | null; actor_user_id: string | null; actor_email: string | null; action: string; entity_type: string; entity_id: string | null; source: string; result: string; details_json: Record<string, unknown>; created_at: Date };
