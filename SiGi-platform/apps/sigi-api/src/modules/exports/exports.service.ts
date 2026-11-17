import { ForbiddenException, Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';
import { deriveOperationalScopeCapabilities } from '../auth/operational-scope.policy';

@Injectable()
export class ExportsService {
  constructor(private readonly postgresService: PostgresService) {}

  async listTargets(context?: ExportTargetContext) {
    const access = await this.resolveContext(context);
    const result = await this.postgresService.query<ExportTargetRow>(
      `
        WITH targets AS (
          SELECT target FROM core.export_runs
          UNION
          SELECT target FROM core.report_templates
          UNION
          SELECT target FROM core.publications
        ),
        latest_runs AS (
          SELECT DISTINCT ON (target)
            id,
            target,
            status,
            dataset_id,
            report_run_id,
            requested_by_user_id,
            started_at,
            finished_at,
            details_json,
            created_at,
            updated_at
          FROM core.export_runs
          WHERE (
            $1::boolean = TRUE
            OR NULLIF(details_json ->> 'egiId', '') = $2::text
          )
          ORDER BY target, created_at DESC
        )
        SELECT
          targets.target,
          latest_runs.id,
          latest_runs.status,
          latest_runs.dataset_id,
          latest_runs.report_run_id,
          latest_runs.requested_by_user_id,
          latest_runs.started_at,
          latest_runs.finished_at,
          latest_runs.details_json,
          latest_runs.created_at,
          latest_runs.updated_at
        FROM targets
        LEFT JOIN latest_runs ON latest_runs.target = targets.target
        ORDER BY targets.target ASC
      `,
      [access.scope === 'global', access.egiId],
    );

    return result.rows.map((row) => this.toTargetResponse(row));
  }

  async getTarget(target: string, context?: ExportTargetContext) {
    const access = await this.resolveContext(context);
    const result = await this.postgresService.query<ExportTargetRow>(
      `
        SELECT
          id,
          target,
          status,
          dataset_id,
          report_run_id,
          requested_by_user_id,
          started_at,
          finished_at,
          details_json,
          created_at,
          updated_at
        FROM core.export_runs
        WHERE target = $1
          AND (
            $2::boolean = TRUE
            OR NULLIF(details_json ->> 'egiId', '') = $3::text
          )
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [target, access.scope === 'global', access.egiId],
    );

    const row = result.rows[0];

    if (!row) {
      return {
        target,
        status: 'idle',
        latestRun: null,
      };
    }

    return this.toTargetResponse(row);
  }

  async getArtifact(target: string, context?: ExportTargetContext) {
    const current = await this.getTarget(target, context);
    const details = current.latestRun?.details ?? {};
    const artifact =
      typeof details.artifact === 'object' && details.artifact !== null
        ? (details.artifact as { fileName?: string; format?: string })
        : null;

    return {
      fileName: artifact?.fileName?.trim() || `${target}_artifact.json`,
      payload: {
        target: current.target,
        status: current.status,
        latestRun: current.latestRun,
      },
    };
  }

  async run(
    target: string,
    context?: {
      requestedByUserId?: string | null;
      actorEmail?: string | null;
      requestedEgiId?: string | null;
      scope?: 'active' | 'global';
    },
  ) {
    const access = await this.resolveContext({
      actorEmail: context?.actorEmail ?? null,
      requestedEgiId: context?.requestedEgiId ?? null,
      scope: context?.scope ?? 'active',
    });
    const result = await this.postgresService.query<ExportRunRow>(
      `
        INSERT INTO core.export_runs (
          target,
          status,
          requested_by_user_id,
          started_at,
          details_json
        )
        VALUES ($1, 'queued', $2::uuid, NOW(), $3::jsonb)
        RETURNING
          id,
          target,
          status,
          dataset_id,
          report_run_id,
          requested_by_user_id,
          started_at,
          finished_at,
          details_json,
          created_at,
          updated_at
      `,
      [
        target,
        context?.requestedByUserId ?? null,
        JSON.stringify({
          egiId: access.egiId,
          stage: 'queued',
          scope: access.scope,
        }),
      ],
    );

    const row = result.rows[0];
    const details = await this.buildTargetDetails(target, access.egiId, access.scope);

    await this.postgresService.query(
      `
        UPDATE core.export_runs
        SET
          status = 'completed',
          finished_at = NOW(),
          details_json = $2::jsonb,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [row.id, JSON.stringify(details)],
    );

    return {
      target,
      status: 'completed',
      exportRunId: row.id,
    };
  }

  private async buildTargetDetails(
    target: string,
    egiId: string | null,
    scope: 'active' | 'global',
  ) {
    const summary = await this.postgresService.query<{
      projects: number;
      published_projects: number;
      sources: number;
      validations: number;
      publications: number;
      public_documents: number;
      geospatial_layers: number;
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM core.projects
            WHERE ($1::uuid IS NULL OR egi_id = $1::uuid)
          ) AS projects,
          (
            SELECT COUNT(*)::int
            FROM core.projects
            WHERE status = 'published'
              AND ($1::uuid IS NULL OR egi_id = $1::uuid)
          ) AS published_projects,
          (
            SELECT COUNT(*)::int
            FROM core.data_sources
            WHERE ($1::uuid IS NULL OR egi_id = $1::uuid)
          ) AS sources,
          (
            SELECT COUNT(*)::int
            FROM core.validation_results
            WHERE ($1::uuid IS NULL OR egi_id = $1::uuid)
          ) AS validations,
          (
            SELECT COUNT(*)::int
            FROM core.publications p
            LEFT JOIN core.datasets d ON d.id = p.dataset_id
            WHERE p.target = $2
              AND ($1::uuid IS NULL OR d.egi_id = $1::uuid)
          ) AS publications,
          (
            SELECT COUNT(*)::int
            FROM documents.files
            WHERE is_public = true
              AND deleted_at IS NULL
              AND ($1::uuid IS NULL OR egi_id = $1::uuid)
          ) AS public_documents,
          (
            SELECT COUNT(*)::int
            FROM gis.geo_layers
            WHERE status IN ('active', 'published')
          ) AS geospatial_layers
      `,
      [egiId, target],
    );

    const counts = summary.rows[0] ?? {
      projects: 0,
      published_projects: 0,
      sources: 0,
      validations: 0,
      publications: 0,
      public_documents: 0,
      geospatial_layers: 0,
    };

    const targetLabel =
      {
        ferm: 'Exportación formato FERM (manual)',
        geo_bi: 'Salida Geo/BI',
        public_portal: 'Portal público',
        api: 'Servicio API',
        unff: 'Paquete UNFF',
        boletin_nacional: 'Boletín nacional',
      }[target] ?? target;

    return {
      egiId,
      scope,
      target,
      label: targetLabel,
      generatedAt: new Date().toISOString(),
      stage: 'completed',
      summary: counts,
      artifact: {
        fileName: `${target}${egiId ? `_${egiId.slice(0, 8)}` : '_global'}_${new Date().toISOString().slice(0, 10)}.json`,
        format: 'json',
      },
      notes: this.buildTargetNotes(target, counts),
    };
  }

  private async resolveContext(context?: ExportTargetContext) {
    const actorEmail = context?.actorEmail?.trim() ?? null;
    if (!actorEmail) {
      return {
        egiId: context?.requestedEgiId ?? null,
        scope: context?.scope ?? 'active',
      };
    }

    const access = await this.getEgiAccessContext(actorEmail);
    const scope = context?.scope ?? 'active';

    if (scope === 'global') {
      if (!access.canManageAll) {
        throw new ForbiddenException(
          'La vista global consolidada requiere permisos administrativos globales.',
        );
      }

      return {
        egiId: null,
        scope,
      };
    }

    const spaces = await this.listAccessibleEgis(access);
    if (spaces.length === 0) {
      throw new ForbiddenException(
        'Para utilizar exportaciones primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }

    const preferredEgiId =
      context?.requestedEgiId ?? (await this.getActiveEgiPreference(access.userId));
    const matched = preferredEgiId ? spaces.find((space) => space.id === preferredEgiId) : null;
    if (matched) {
      return {
        egiId: matched.id,
        scope,
      };
    }

    if (spaces.length === 1) {
      return {
        egiId: spaces[0].id,
        scope,
      };
    }

    throw new ForbiddenException(
      'Para utilizar exportaciones primero debe crear o seleccionar un Espacio de Gestión de Información.',
    );
  }

  private async getEgiAccessContext(actorEmail: string) {
    const actorUserId = await this.resolveActorUserId(actorEmail);
    if (!actorUserId) {
      throw new ForbiddenException('No se pudo resolver el usuario autenticado.');
    }

    const result = await this.postgresService.query<{
      user_id: string;
      institution_id: string | null;
      global_roles: string[];
      permissions: string[];
    }>(
      `
        SELECT
          u.id AS user_id,
          u.institution_id,
          COALESCE(
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.code), NULL),
            ARRAY[]::text[]
          ) AS global_roles
          , COALESCE(
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.code), NULL),
            ARRAY[]::text[]
          ) AS permissions
        FROM core.users u
        LEFT JOIN core.user_roles ur ON ur.user_id = u.id
        LEFT JOIN core.roles r ON r.id = ur.role_id
        LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
        LEFT JOIN core.permissions p ON p.id = rp.permission_id
        WHERE u.id = $1::uuid
        GROUP BY u.id, u.institution_id
      `,
      [actorUserId],
    );

    const row = result.rows[0];
    const roles = row?.global_roles ?? [];
    const capabilities = deriveOperationalScopeCapabilities({
      roles,
      permissions: row?.permissions ?? [],
    });
    return {
      userId: actorUserId,
      institutionId: row?.institution_id ?? null,
      ...capabilities,
    };
  }

  private async resolveActorUserId(actorEmail: string) {
    const result = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.users
        WHERE email = $1
        LIMIT 1
      `,
      [actorEmail],
    );

    return result.rows[0]?.id ?? null;
  }

  private async getActiveEgiPreference(userId: string) {
    const result = await this.postgresService.query<{ active_egi_id: string | null }>(
      `
        SELECT active_egi_id
        FROM core.user_preferences
        WHERE user_id = $1::uuid
        LIMIT 1
      `,
      [userId],
    );

    return result.rows[0]?.active_egi_id ?? null;
  }

  private async listAccessibleEgis(access: {
    userId: string;
    institutionId: string | null;
    canManageAll: boolean;
    canManageInstitution: boolean;
  }) {
    const result = access.canManageAll
      ? await this.postgresService.query<{ id: string }>(
          `
            SELECT e.id
            FROM core.egi_spaces e
            ORDER BY e.status = 'active' DESC, e.name ASC
          `,
        )
      : await this.postgresService.query<{ id: string }>(
          `
            SELECT DISTINCT e.id
            FROM core.egi_spaces e
            LEFT JOIN core.egi_memberships em
              ON em.egi_id = e.id
             AND em.user_id = $1::uuid
             AND em.membership_status = 'active'
            WHERE em.user_id = $1::uuid
               OR ($2::boolean AND e.institution_id IS NOT DISTINCT FROM $3::uuid)
            ORDER BY e.id ASC
          `,
          [access.userId, access.canManageInstitution, access.institutionId],
        );

    return result.rows;
  }

  private buildTargetNotes(
    target: string,
    counts: {
      projects: number;
      published_projects: number;
      sources: number;
      validations: number;
      publications: number;
      public_documents: number;
      geospatial_layers: number;
    },
  ) {
    if (target === 'ferm') {
      return [
        `Incluye ${counts.published_projects} proyecto(s) publicados para carga manual en FERM (sin envío automático).`,
        `Se identificaron ${counts.public_documents} documento(s) públicos y ${counts.validations} validación(es) como soporte.`,
      ];
    }
    if (target === 'geo_bi') {
      return [
        `Geo/BI dispone de ${counts.geospatial_layers} capa(s) activa(s)/publicada(s).`,
        `El paquete considera ${counts.publications} publicación(es) trazables para visualización.`,
      ];
    }
    if (target === 'public_portal') {
      return [
        `El portal público puede proyectar ${counts.published_projects} proyecto(s) y ${counts.public_documents} documento(s) visibles.`,
      ];
    }
    if (target === 'unff') {
      return [
        `Se consolidaron ${counts.projects} proyecto(s) y ${counts.validations} validación(es) para un corte tipo UNFF.`,
      ];
    }
    if (target === 'boletin_nacional') {
      return [
        `Se encontraron ${counts.published_projects} proyecto(s) publicados y ${counts.sources} fuente(s) activas para el boletín.`,
      ];
    }
    return [
      `Paquete generado con ${counts.projects} proyecto(s), ${counts.sources} fuente(s) y ${counts.validations} validación(es).`,
    ];
  }

  private toTargetResponse(row: ExportTargetRow) {
    return {
      target: row.target,
      status: row.status ?? 'idle',
      latestRun: row.id
        ? {
            id: row.id,
            datasetId: row.dataset_id,
            reportRunId: row.report_run_id,
            requestedByUserId: row.requested_by_user_id,
            startedAt: row.started_at ? row.started_at.toISOString() : null,
            finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
            details: row.details_json ?? {},
            createdAt: row.created_at ? row.created_at.toISOString() : null,
            updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
          }
        : null,
    };
  }
}

type ExportRunRow = {
  id: string;
  target: string;
  status: string;
  dataset_id: string | null;
  report_run_id: string | null;
  requested_by_user_id: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  details_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type ExportTargetRow = {
  id: string | null;
  target: string;
  status: string | null;
  dataset_id: string | null;
  report_run_id: string | null;
  requested_by_user_id: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  details_json: Record<string, unknown> | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type ExportTargetContext = {
  actorEmail?: string | null;
  requestedEgiId?: string | null;
  scope?: 'active' | 'global';
};
