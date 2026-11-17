import { Injectable } from '@nestjs/common';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';
import { ServiceUnavailableException } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';
import { getValidatedEnv } from '../../common/config/env';
import { buildGeoLayerVisibilitySql } from '../../common/geo/geo-visibility';

@Injectable()
export class GeoBiService {
  constructor(private readonly postgresService: PostgresService) {}

  async getModule(includeInternal: boolean, egiId: string | null = null) {
    // core.projects.visibility is a distinct domain (currently only
    // 'public'/'internal') from gis.geo_layers.visibility — left as an
    // inline check here, out of scope for the geo layer visibility
    // consolidation. See docs/geo/permissions.md.
    const visibilitySql = includeInternal ? 'TRUE' : "p.visibility = 'public'";
    const layerVisibilitySql = buildGeoLayerVisibilitySql('gl', includeInternal);
    // Cuando el llamador no tiene alcance global (resuelto previamente en el
    // controller vía AdminService.resolveAdminScopeEgiId), cada conteo/desglose
    // de proyectos y los paneles de auditoría/incidentes se acotan a su EGI.
    const projectEgiSql = egiId ? 'AND p.egi_id = $1::uuid' : '';
    const egiParams = egiId ? [egiId] : [];

    const [
      layersResult,
      datasetsResult,
      territoriesResult,
      visibleProjectsResult,
      coveredTerritoriesResult,
      coverageLevelsResult,
      validationResult,
      publicationsCountResult,
      publicationsResult,
      reportsResult,
      alertsCountResult,
      alertsResult,
      auditResult,
      themeBreakdownResult,
      institutionBreakdownResult,
      linkedDataResult,
    ] = await Promise.all([
      this.postgresService.query<LayerRow>(
        `
          SELECT
            gl.id,
            gl.code,
            gl.name,
            gl.layer_type,
            gl.visibility,
            gl.status,
            COUNT(tf.id)::int AS feature_count,
            COALESCE(SUM(tf.area_ha), 0)::numeric AS total_area_ha,
            MAX(tf.updated_at) AS last_updated_at
          FROM gis.geo_layers gl
          LEFT JOIN gis.territory_features tf ON tf.layer_id = gl.id
          WHERE ${layerVisibilitySql}
          GROUP BY gl.id, gl.code, gl.name, gl.layer_type, gl.visibility, gl.status
          ORDER BY gl.visibility ASC, gl.name ASC
        `,
      ),
      this.postgresService.query<DatasetCatalogRow>(
        `
          SELECT
            ds.id AS source_id,
            ds.code AS source_code,
            ds.name AS source_name,
            ds.source_type,
            ds.status,
            ds.last_ingested_at,
            i.name AS institution_name,
            COUNT(d.id)::int AS dataset_count
          FROM core.data_sources ds
          JOIN core.institutions i ON i.id = ds.institution_id
          LEFT JOIN core.datasets d ON d.source_id = ds.id
          GROUP BY
            ds.id,
            ds.code,
            ds.name,
            ds.source_type,
            ds.status,
            ds.last_ingested_at,
            i.name
          ORDER BY ds.name ASC
        `,
      ),
      this.postgresService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM core.territories
          WHERE status = 'active'
        `,
      ),
      this.postgresService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM core.projects p
          WHERE ${visibilitySql} ${projectEgiSql}
        `,
        egiParams,
      ),
      this.postgresService.query<{ territories: string; total_area_ha: string }>(
        `
          SELECT
            COUNT(DISTINCT pt.territory_code)::text AS territories,
            COALESCE(SUM(pt.area_ha), 0)::text AS total_area_ha
          FROM core.project_territories pt
          JOIN core.projects p ON p.id = pt.project_id
          WHERE ${visibilitySql} ${projectEgiSql}
        `,
        egiParams,
      ),
      this.postgresService.query<CoverageLevelRow>(
        `
          WITH territory_stats AS (
            SELECT
              level,
              COUNT(*)::int AS territory_count
            FROM core.territories
            WHERE status = 'active'
            GROUP BY level
          ),
          feature_stats AS (
            SELECT
              t.level,
              COUNT(tf.id)::int AS feature_count
            FROM core.territories t
            LEFT JOIN gis.territory_features tf ON tf.territory_id = t.id
            LEFT JOIN gis.geo_layers gl ON gl.id = tf.layer_id
            WHERE t.status = 'active'
              AND (tf.id IS NULL OR ${layerVisibilitySql})
            GROUP BY t.level
          ),
          project_stats AS (
            SELECT
              COALESCE(t.level, 'custom') AS level,
              COUNT(DISTINCT pt.project_id)::int AS project_count,
              COALESCE(SUM(pt.area_ha), 0)::numeric AS total_area_ha
            FROM core.project_territories pt
            JOIN core.projects p ON p.id = pt.project_id
            LEFT JOIN core.territories t ON t.id = pt.territory_id
            WHERE ${visibilitySql} ${projectEgiSql}
            GROUP BY COALESCE(t.level, 'custom')
          )
          SELECT
            COALESCE(ts.level, fs.level, ps.level) AS level,
            COALESCE(ts.territory_count, 0) AS territory_count,
            COALESCE(fs.feature_count, 0) AS feature_count,
            COALESCE(ps.project_count, 0) AS project_count,
            COALESCE(ps.total_area_ha, 0)::numeric AS total_area_ha
          FROM territory_stats ts
          FULL OUTER JOIN feature_stats fs ON fs.level = ts.level
          FULL OUTER JOIN project_stats ps ON ps.level = COALESCE(ts.level, fs.level)
          ORDER BY COALESCE(ts.level, fs.level, ps.level) ASC
        `,
        egiParams,
      ),
      this.postgresService.query<ValidationSummaryRow>(
        `
          SELECT
            COUNT(*) FILTER (WHERE vr.status = 'passed')::int AS passed,
            COUNT(*) FILTER (WHERE vr.status = 'warning')::int AS warning,
            COUNT(*) FILTER (WHERE vr.status = 'failed')::int AS failed,
            (
              SELECT COUNT(*)::int
              FROM core.validation_rules
              WHERE active = TRUE
            ) AS active_rules
          FROM core.validation_results vr
        `,
      ),
      this.postgresService.query<PublicationCountsRow>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status = 'published')::int AS published,
            COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
          FROM core.publications
        `,
      ),
      this.postgresService.query<PublicationRow>(
        `
          SELECT id, dataset_id, target, status, created_at, updated_at
          FROM core.publications
          ${includeInternal ? '' : "WHERE status = 'published'"}
          ORDER BY created_at DESC
          LIMIT 6
        `,
      ),
      this.postgresService.query<ReportRow>(
        `
          SELECT
            rt.id AS template_id,
            rt.code,
            rt.name,
            rt.target,
            rt.description,
            rt.status AS template_status,
            rr.id AS report_run_id,
            rr.status AS report_status,
            rr.output_url,
            rr.started_at,
            rr.finished_at,
            rr.created_at AS report_created_at
          FROM core.report_templates rt
          LEFT JOIN LATERAL (
            SELECT *
            FROM core.report_runs rr
            WHERE rr.template_id = rt.id
            ORDER BY rr.created_at DESC
            LIMIT 1
          ) rr ON TRUE
          ORDER BY rt.name ASC
          LIMIT 6
        `,
      ),
      this.postgresService.query<AlertCountsRow>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status = 'open')::int AS open,
            COUNT(*) FILTER (WHERE status = 'investigating')::int AS investigating,
            COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved
          FROM core.incidents i
          WHERE (
            $1::uuid IS NULL
            OR i.project_id IN (SELECT id FROM core.projects WHERE egi_id = $1::uuid)
          )
        `,
        [egiId],
      ),
      this.postgresService.query<IncidentRow>(
        `
          SELECT id, title, severity, status, created_at, updated_at
          FROM core.incidents i
          WHERE (
            $1::uuid IS NULL
            OR i.project_id IN (SELECT id FROM core.projects WHERE egi_id = $1::uuid)
          )
          ORDER BY updated_at DESC
          LIMIT 6
        `,
        [egiId],
      ),
      includeInternal
        ? this.postgresService.query<AuditRow>(
            `
              SELECT
                ae.id,
                ae.actor_user_id,
                u.email AS actor_email,
                ae.action,
                ae.entity_type,
                ae.entity_id,
                ae.source,
                ae.result,
                ae.details_json,
                ae.created_at
              FROM core.audit_events ae
              LEFT JOIN core.users u ON u.id = ae.actor_user_id
              WHERE (
                $1::uuid IS NULL
                OR (
                  ae.entity_type = 'project'
                  AND ae.entity_id IN (SELECT id FROM core.projects WHERE egi_id = $1::uuid)
                )
              )
              ORDER BY ae.created_at DESC
              LIMIT 6
            `,
            [egiId],
          )
        : Promise.resolve({
            rows: [] as AuditRow[],
          }),
      this.postgresService.query<BreakdownRow>(
        `
          SELECT
            COALESCE(NULLIF(TRIM(p.theme), ''), 'Sin temática declarada') AS label,
            COUNT(*)::int AS value
          FROM core.projects p
          WHERE ${visibilitySql} ${projectEgiSql}
          GROUP BY COALESCE(NULLIF(TRIM(p.theme), ''), 'Sin temática declarada')
          ORDER BY value DESC, label ASC
          LIMIT 6
        `,
        egiParams,
      ),
      this.postgresService.query<BreakdownRow>(
        `
          SELECT
            i.name AS label,
            COUNT(*)::int AS value
          FROM core.projects p
          JOIN core.institutions i ON i.id = p.institution_id
          WHERE ${visibilitySql} ${projectEgiSql}
          GROUP BY i.name
          ORDER BY value DESC, label ASC
          LIMIT 6
        `,
        egiParams,
      ),
      this.postgresService.query<LinkedDataRow>(
        `
          SELECT
            (SELECT COUNT(*)::int FROM core.data_sources) AS sources,
            (SELECT COUNT(*)::int FROM core.datasets) AS datasets,
            (SELECT COUNT(*)::int FROM core.dataset_versions) AS dataset_versions,
            (SELECT COUNT(*)::int FROM core.validation_results) AS validations,
            (SELECT COUNT(*)::int FROM core.export_runs) AS exports
        `,
      ),
    ]);

    const layers = layersResult.rows.map(mapLayerRow);
    const datasetCatalog = datasetsResult.rows.map(mapDatasetCatalogRow);
    const territories = Number(territoriesResult.rows[0]?.total ?? '0');
    const visibleProjects = Number(visibleProjectsResult.rows[0]?.total ?? '0');
    const coveredTerritories = Number(coveredTerritoriesResult.rows[0]?.territories ?? '0');
    const totalAreaHa = Number(coveredTerritoriesResult.rows[0]?.total_area_ha ?? '0');
    const validation = validationResult.rows[0];
    const passed = validation?.passed ?? 0;
    const warning = validation?.warning ?? 0;
    const failed = validation?.failed ?? 0;
    const validationTotal = passed + warning + failed;
    const qualityScore =
      validationTotal === 0 ? 0 : Math.round((passed / validationTotal) * 100);
    const publicationCounts = publicationsCountResult.rows[0];
    const alertCounts = alertsCountResult.rows[0];
    const linkedData = linkedDataResult.rows[0];

    const summary = {
      layers: layers.length,
      datasets: datasetCatalog.reduce((sum, item) => sum + item.datasetCount, 0),
      sources: datasetCatalog.length,
      territories,
      features: layers.reduce((sum, item) => sum + item.featureCount, 0),
      visibleProjects,
      totalAreaHa,
      qualityScore,
      publications: publicationCounts?.published ?? 0,
      reports: reportsResult.rows.filter((row) => row.template_status === 'active').length,
      alerts: (alertCounts?.open ?? 0) + (alertCounts?.investigating ?? 0),
    };

    return {
      summary,
      layers,
      datasetCatalog,
      coverage: {
        levels: coverageLevelsResult.rows.map(mapCoverageLevelRow),
        visibleProjects,
        coveredTerritories,
        totalAreaHa,
      },
      dashboards: {
        kpis: [
          {
            label: 'Capas publicables',
            value: String(summary.layers),
            hint: 'Capas disponibles desde Geo/BI para exploración y publicación.',
          },
          {
            label: 'Cobertura territorial',
            value: `${summary.totalAreaHa.toLocaleString('es-CR')} ha`,
            hint: 'Área asociada a proyectos con huella territorial declarada.',
          },
          {
            label: 'Proyectos conectados',
            value: String(summary.visibleProjects),
            hint: 'Proyectos integrados con territorio dentro del módulo Geo/BI.',
          },
          {
            label: 'Calidad activa',
            value: `${summary.qualityScore}%`,
            hint: 'Relación actual entre validaciones aprobadas y validaciones procesadas.',
          },
        ],
        themes: themeBreakdownResult.rows.map(mapBreakdownRow),
        institutions: institutionBreakdownResult.rows.map(mapBreakdownRow),
      },
      quality: {
        score: qualityScore,
        passed,
        warning,
        failed,
        activeRules: validation?.active_rules ?? 0,
      },
      alerts: {
        open: alertCounts?.open ?? 0,
        investigating: alertCounts?.investigating ?? 0,
        resolved: alertCounts?.resolved ?? 0,
        recent: includeInternal ? alertsResult.rows.map(mapIncidentRow) : [],
      },
      publications: {
        published: publicationCounts?.published ?? 0,
        queued: publicationCounts?.queued ?? 0,
        failed: publicationCounts?.failed ?? 0,
        outputs: publicationsResult.rows.map(mapPublicationRow),
      },
      reports: {
        active: reportsResult.rows.filter((row) => row.template_status === 'active').length,
        latest: reportsResult.rows.map(mapReportRow),
      },
      audit: {
        events: includeInternal ? auditResult.rows.length : 0,
        recent: includeInternal ? auditResult.rows.map(mapAuditRow) : [],
      },
      linkedData: {
        sources: linkedData?.sources ?? 0,
        datasets: linkedData?.datasets ?? 0,
        datasetVersions: linkedData?.dataset_versions ?? 0,
        validations: linkedData?.validations ?? 0,
        exports: linkedData?.exports ?? 0,
      },
      ecosystem: buildEcosystemNodes({
        summary,
        activeRules: validation?.active_rules ?? 0,
        alertCounts,
        linkedData,
      }),
    };
  }

  async getGeoServerCapabilities() {
    const env = getValidatedEnv();
    const endpoint = new URL(
      '/geoserver/ows?service=WMS&version=1.1.1&request=GetCapabilities',
      env.geoserverInternalUrl,
    );
    const xml = await requestText(endpoint, 8000);
    const layers = Array.from(
      xml.matchAll(/<Layer\b[\s\S]*?<Name>\s*([^<]+)\s*<\/Name>[\s\S]*?<Title>\s*([^<]+)\s*<\/Title>/gi),
    )
      .map((match) => ({
        name: match[1]?.trim() ?? '',
        title: match[2]?.trim() ?? '',
      }))
      .filter((layer) => layer.name.includes(':'))
      .filter((layer, index, collection) => collection.findIndex((item) => item.name === layer.name) === index)
      .map((layer) => ({
        ...layer,
        workspace: layer.name.split(':')[0],
      }));

    return {
      ok: true,
      workspace: env.geoserverWorkspace,
      serviceUrl: `${env.geoserverInternalUrl.replace(/\/$/, '')}/wms`,
      wfsServiceUrl: `${env.geoserverInternalUrl.replace(/\/$/, '')}/ows`,
      capabilitiesUrl: endpoint.toString(),
      publishedLayers: layers,
    };
  }
}

async function requestText(endpoint: URL, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const transport = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(
      endpoint,
      {
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        let rawResponse = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          rawResponse += chunk;
        });
        res.on('end', () => {
          const statusCode = res.statusCode ?? 500;
          if (statusCode >= 400) {
            reject(
              new ServiceUnavailableException(
                `GeoServer capabilities returned ${statusCode}`,
              ),
            );
            return;
          }
          resolve(rawResponse);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('GeoServer capabilities request timed out'));
    });
    req.on('error', (error) => {
      reject(
        new ServiceUnavailableException(
          `GeoServer capabilities request failed: ${error.message}`,
        ),
      );
    });
    req.end();
  });
}

function mapLayerRow(row: LayerRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    layerType: row.layer_type,
    visibility: row.visibility,
    status: row.status,
    featureCount: row.feature_count,
    totalAreaHa: Number(row.total_area_ha ?? 0),
    lastUpdatedAt: row.last_updated_at ? row.last_updated_at.toISOString() : null,
  };
}

function mapDatasetCatalogRow(row: DatasetCatalogRow) {
  return {
    sourceId: row.source_id,
    sourceCode: row.source_code,
    sourceName: row.source_name,
    sourceType: row.source_type,
    institutionName: row.institution_name,
    status: row.status,
    datasetCount: row.dataset_count,
    lastIngestedAt: row.last_ingested_at ? row.last_ingested_at.toISOString() : null,
  };
}

function mapCoverageLevelRow(row: CoverageLevelRow) {
  return {
    level: row.level,
    territoryCount: row.territory_count,
    featureCount: row.feature_count,
    projectCount: row.project_count,
    totalAreaHa: Number(row.total_area_ha ?? 0),
  };
}

function mapBreakdownRow(row: BreakdownRow) {
  return {
    label: row.label,
    value: row.value,
  };
}

function mapPublicationRow(row: PublicationRow) {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    target: row.target,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapReportRow(row: ReportRow) {
  return {
    id: row.template_id,
    code: row.code,
    name: row.name,
    target: row.target,
    description: row.description,
    status: row.template_status,
    latestRun: row.report_run_id
      ? {
          id: row.report_run_id,
          status: row.report_status,
          outputUrl: row.output_url,
          startedAt: row.started_at ? row.started_at.toISOString() : null,
          finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
          createdAt: row.report_created_at ? row.report_created_at.toISOString() : null,
        }
      : null,
  };
}

function mapIncidentRow(row: IncidentRow) {
  return {
    id: row.id,
    title: row.title,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAuditRow(row: AuditRow) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    source: row.source,
    result: row.result,
    details: row.details_json,
    createdAt: row.created_at.toISOString(),
  };
}

function buildEcosystemNodes(input: {
  summary: {
    layers: number;
    sources: number;
    datasets: number;
    qualityScore: number;
    publications: number;
    reports: number;
    alerts: number;
    visibleProjects: number;
  };
  activeRules: number;
  alertCounts: AlertCountsRow | undefined;
  linkedData: LinkedDataRow | undefined;
}) {
  const openAlerts =
    (input.alertCounts?.open ?? 0) + (input.alertCounts?.investigating ?? 0);
  const qualityStatus =
    input.summary.qualityScore >= 80
      ? 'Operativo'
      : input.summary.qualityScore >= 60
        ? 'Atencion'
        : 'Programado';

  return [
    {
      id: 'core',
      name: 'SIGI Core',
      status: input.summary.datasets > 0 ? 'Operativo' : 'Programado',
      metric: `${input.summary.datasets} datasets`,
      description: 'Modelo canónico, catálogos y estructura territorial aprovechados por Geo/BI.',
    },
    {
      id: 'quality',
      name: 'Calidad y trazabilidad',
      status: qualityStatus,
      metric: `${input.summary.qualityScore}% de calidad`,
      description: `${input.activeRules} reglas activas y trazabilidad disponible para seguimiento.`,
    },
    {
      id: 'datastore',
      name: 'SIGI Almacén de datos',
      status: input.linkedData && input.linkedData.dataset_versions > 0 ? 'Operativo' : 'Programado',
      metric: `${input.linkedData?.dataset_versions ?? 0} versiones`,
      description: 'Persistencia de datasets, versiones y validaciones aprovechadas por el módulo.',
    },
    {
      id: 'apis',
      name: 'OpenAPI / APIs',
      status: input.summary.layers > 0 ? 'Operativo' : 'Programado',
      metric: `${input.summary.layers} capas expuestas`,
      description: 'Superficie API para consulta, integración y publicación geoespacial.',
    },
    {
      id: 'projects',
      name: 'Gestión de Proyectos',
      status: input.summary.visibleProjects > 0 ? 'Operativo' : 'Programado',
      metric: `${input.summary.visibleProjects} proyectos`,
      description: 'Cobertura, KPIs y cartera conectados con el módulo Geo/BI.',
    },
    {
      id: 'reports',
      name: 'Publicación e informes',
      status: input.summary.publications + input.summary.reports > 0 ? 'Operativo' : 'Programado',
      metric: `${input.summary.publications} publicaciones`,
      description: 'Reportes, boletines y salidas públicas listas para reutilización.',
    },
    {
      id: 'bridge',
      name: 'SIGI Bridge',
      status: openAlerts === 0 ? 'Operativo' : 'Atencion',
      metric: `${input.summary.alerts} alertas`,
      description: 'Interoperabilidad, exportaciones y monitoreo de incidencias del ecosistema.',
    },
  ] as const;
}

type LayerRow = {
  id: string;
  code: string;
  name: string;
  layer_type: string;
  visibility: string;
  status: string;
  feature_count: number;
  total_area_ha: string | number;
  last_updated_at: Date | null;
};

type DatasetCatalogRow = {
  source_id: string;
  source_code: string | null;
  source_name: string;
  source_type: string;
  institution_name: string;
  status: string;
  dataset_count: number;
  last_ingested_at: Date | null;
};

type CoverageLevelRow = {
  level: string;
  territory_count: number;
  feature_count: number;
  project_count: number;
  total_area_ha: string | number;
};

type ValidationSummaryRow = {
  passed: number;
  warning: number;
  failed: number;
  active_rules: number;
};

type PublicationCountsRow = {
  published: number;
  queued: number;
  failed: number;
};

type PublicationRow = {
  id: string;
  dataset_id: string | null;
  target: 'public_portal' | 'geo_bi' | 'ferm' | 'api';
  status: 'draft' | 'queued' | 'published' | 'failed';
  created_at: Date;
  updated_at: Date;
};

type ReportRow = {
  template_id: string;
  code: string;
  name: string;
  target: string;
  description: string;
  template_status: string;
  report_run_id: string | null;
  report_status: string | null;
  output_url: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  report_created_at: Date | null;
};

type AlertCountsRow = {
  open: number;
  investigating: number;
  resolved: number;
};

type IncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  source: string;
  result: string;
  details_json: Record<string, unknown>;
  created_at: Date;
};

type BreakdownRow = {
  label: string;
  value: number;
};

type LinkedDataRow = {
  sources: number;
  datasets: number;
  dataset_versions: number;
  validations: number;
  exports: number;
};
