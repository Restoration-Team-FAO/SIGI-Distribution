import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';
import { calculateProjectFinancialSummary } from './project-finance-policy';

type ProjectListFilters = {
  egiId?: string | null;
  statuses?: string[];
  institutionId?: string;
  portfolioId?: string;
  featured?: boolean;
  visibility?: string;
  includeInternal?: boolean;
};

type ProjectWriteInput = {
  code?: string | null;
  title?: string;
  objective?: string | null;
  summary?: string | null;
  description?: string | null;
  theme?: string | null;
  priority?: string | null;
  visibility?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  progressPct?: number | null;
  featured?: boolean;
  areaHa?: number | null;
  institutionId?: string;
  portfolioId?: string | null;
  datasetId?: string | null;
};

type ProjectPolygonWriteInput = {
  territoryName?: string | null;
  country?: string | null;
  geojson?: Record<string, unknown> | null;
};

type ProjectMilestoneWriteInput = {
  activityCode?: string | null;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  status?: string;
  progressPct?: number | null;
};

type ProjectDeliverableWriteInput = {
  code?: string | null;
  title?: string;
  deliverableType?: string | null;
  description?: string | null;
  status?: string;
  dueDate?: string | null;
  publishedAt?: string | null;
  outputUrl?: string | null;
};

type ProjectActorWriteInput = {
  actorType?: string;
  institutionId?: string | null;
  displayName?: string;
  roleLabel?: string | null;
  status?: string;
};

type ProjectTaskWriteInput = {
  parentTaskId?: string | null;
  ownerActorId?: string | null;
  taskType?: string;
  code?: string;
  title?: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
  progressPct?: number | null;
  weight?: number | null;
  sortOrder?: number | null;
  predecessorIds?: string[];
};

type ProjectBudgetItemWriteInput = {
  taskId?: string | null;
  code?: string;
  category?: string;
  name?: string;
  fundingSource?: string | null;
  currency?: string;
  plannedAmount?: number | null;
  committedAmount?: number | null;
  actualAmount?: number | null;
  notes?: string | null;
};

type ProjectRiskWriteInput = {
  ownerActorId?: string | null;
  code?: string;
  title?: string;
  description?: string | null;
  category?: string | null;
  probability?: number | null;
  impact?: number | null;
  status?: string;
  responseStrategy?: string;
  mitigation?: string | null;
  reviewDate?: string | null;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly postgresService: PostgresService) {}

  async list(filters: ProjectListFilters = {}) {
    const { whereSql, params } = buildProjectListWhere(filters);
    const result = await this.postgresService.query<ProjectRow>(
      `
        SELECT
          p.id,
          p.egi_id,
          p.dataset_id,
          p.institution_id,
          p.portfolio_id,
          p.code,
          p.title,
          p.objective,
          p.summary,
          p.description,
          p.theme,
          p.priority,
          p.visibility,
          p.status,
          p.start_date,
          p.end_date,
          p.progress_pct,
          p.featured,
          p.financial_management_mode,
          p.financial_base_currency,
          p.actual_end_date,
          p.area_ha,
          p.created_at,
          p.updated_at,
          i.name AS institution_name,
          pf.name AS portfolio_name,
          (
            SELECT COUNT(*)::int
            FROM core.project_indicators pi
            WHERE pi.project_id = p.id
          ) AS indicator_count,
          (
            SELECT COUNT(*)::int
            FROM core.project_territories pt
            WHERE pt.project_id = p.id
          ) AS territory_count,
          (
            SELECT COUNT(*)::int
            FROM core.project_deliverables pd
            WHERE pd.project_id = p.id
          ) AS deliverable_count,
          (
            SELECT COUNT(*)::int
            FROM core.incidents ci
            WHERE ci.project_id = p.id
          ) AS incident_count
        FROM core.projects p
        LEFT JOIN core.institutions i ON i.id = p.institution_id
        LEFT JOIN core.project_portfolios pf ON pf.id = p.portfolio_id
        ${whereSql}
        ORDER BY
          p.featured DESC,
          CASE p.priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END,
          p.updated_at DESC
      `,
      params,
    );

    return result.rows.map(mapProjectRow);
  }

  async findOne(id: string, includeInternal = false, egiId?: string | null) {
    const project = await this.findProjectRecord(id, includeInternal, egiId);
    if (!project) {
      return null;
    }

    const [
      portfolio,
      actors,
      milestones,
      tasks,
      budgetItems,
      risks,
      indicators,
      territories,
      deliverables,
      documents,
      incidents,
      datasets,
      audit,
    ] = await Promise.all([
      this.getProjectPortfolio(project.portfolioId ?? null, includeInternal),
      this.listActorsByProject(id),
      this.listMilestonesByProject(id),
      this.listTasksByProject(id),
      this.listBudgetItemsByProject(id),
      this.listRisksByProject(id),
      this.listIndicatorsByProject(id),
      this.listTerritoriesByProject(id),
      this.listDeliverablesByProject(id),
      this.listDocumentsByProject(id),
      this.listIncidentsByProject(id),
      this.listDatasetsByProject(id),
      this.listAuditByProject(id),
    ]);
    const lifecycle = await this.getProjectLifecycleWorkspace(id);

    return {
      project,
      portfolio,
      actors,
      milestones,
      tasks,
      budgetItems,
      risks,
      indicators,
      territories,
      deliverables,
      documents,
      incidents,
      datasets,
      audit,
      ...lifecycle,
    };
  }

  async findPublicOne(id: string) {
    const detail = await this.findOne(id, false);
    if (!detail) {
      return null;
    }

    // V2-06: proyección pública por lista blanca. Presupuesto, movimientos financieros, fuentes de
    // financiamiento, riesgos, registros de gestión, actores (nombres), tareas, datasets y auditoría
    // son información interna y no se exponen a lectores anónimos.
    return {
      project: detail.project,
      portfolio: detail.portfolio,
      milestones: detail.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        status: milestone.status,
        dueDate: milestone.dueDate,
        completedAt: milestone.completedAt,
        progressPct: milestone.progressPct,
      })),
      indicators: detail.indicators,
      territories: detail.territories,
      deliverables: detail.deliverables,
      documents: detail.documents.filter((document) => document.status === 'published'),
      incidents: detail.incidents.map((incident) => ({
        ...incident,
        notes: null,
      })),
      actors: [],
      tasks: [],
      budgetItems: [],
      risks: [],
      datasets: [],
      audit: [],
    };
  }

  async listPortfolioSummary(includeInternal = false, egiId?: string | null) {
    const portfolioJoinFilter = [
      includeInternal ? '' : "AND p.visibility = 'public'",
      egiId ? `AND p.egi_id = $1::uuid` : '',
    ]
      .filter((clause) => clause.length > 0)
      .join('\n          ');
    const portfolioWhereClauses = [
      includeInternal ? '' : "pf.visibility = 'public'",
      egiId ? `EXISTS (
            SELECT 1
            FROM core.projects px
            WHERE px.portfolio_id = pf.id
              AND px.egi_id = $1::uuid
          )` : '',
    ].filter((clause) => clause.length > 0);
    const portfolioWhereSql =
      portfolioWhereClauses.length > 0
        ? `WHERE ${portfolioWhereClauses.join('\n          AND ')}`
        : '';
    const portfolioResult = await this.postgresService.query<ProjectPortfolioRow>(
      `
        SELECT
          pf.id,
          pf.code,
          pf.name,
          pf.description,
          pf.objective,
          pf.status,
          pf.visibility,
          pf.priority_label,
          pf.created_at,
          pf.updated_at,
          COUNT(p.id)::int AS project_count,
          COUNT(*) FILTER (WHERE p.status = 'active')::int AS active_project_count,
          COUNT(*) FILTER (WHERE p.status = 'published')::int AS published_project_count,
          COALESCE(SUM(p.area_ha), 0)::numeric AS total_area_ha
        FROM core.project_portfolios pf
        LEFT JOIN core.projects p
          ON p.portfolio_id = pf.id
          ${portfolioJoinFilter}
        ${portfolioWhereSql}
        GROUP BY pf.id
        ORDER BY pf.name ASC
      `,
      egiId ? [egiId] : [],
    );

    const summaryWhereClauses = [
      includeInternal ? '' : "visibility = 'public'",
      egiId ? 'egi_id = $1::uuid' : '',
    ].filter((clause) => clause.length > 0);
    const summaryWhereSql =
      summaryWhereClauses.length > 0
        ? `WHERE ${summaryWhereClauses.join(' AND ')}`
        : '';
    const summaryResult = await this.postgresService.query<PortfolioSummaryRow>(
      `
        SELECT
          COUNT(*)::int AS total_projects,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_projects,
          COUNT(*) FILTER (WHERE status = 'published')::int AS published_projects,
          COUNT(*) FILTER (WHERE featured = TRUE)::int AS featured_projects,
          COALESCE(SUM(area_ha), 0)::numeric AS total_area_ha
        FROM core.projects
        ${summaryWhereSql}
      `,
      egiId ? [egiId] : [],
    );

    const summary = summaryResult.rows[0];
    return {
      portfolios: portfolioResult.rows.map(mapPortfolioRow),
      summary: {
        totalProjects: summary?.total_projects ?? 0,
        activeProjects: summary?.active_projects ?? 0,
        publishedProjects: summary?.published_projects ?? 0,
        totalAreaHa: summary?.total_area_ha ? Number(summary.total_area_ha) : 0,
        featuredProjects: summary?.featured_projects ?? 0,
      },
    };
  }

  async create(input: ProjectWriteInput, actorEmail: string | null, egiId?: string | null) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }
    const title = input.title?.trim();
    const institutionId = input.institutionId?.trim();
    if (!title) {
      throw new BadRequestException('title es requerido');
    }
    if (!institutionId) {
      throw new BadRequestException('institutionId es requerido');
    }

    const code = normalizeOptionalText(input.code);
    await this.ensureProjectCodeAvailable(code, null);
    await this.validateProjectWriteInput({
      egiId: normalizedEgiId,
      institutionId,
      portfolioId: input.portfolioId ?? null,
      datasetId: input.datasetId ?? null,
      priority: input.priority,
      visibility: input.visibility,
      status: input.status,
      progressPct: input.progressPct,
      featured: input.featured,
    });

    const result = await this.postgresService.query<ProjectRow>(
      `
        INSERT INTO core.projects (
          egi_id,
          dataset_id,
          institution_id,
          portfolio_id,
          code,
          title,
          objective,
          summary,
          description,
          theme,
          priority,
          visibility,
          status,
          start_date,
          end_date,
          progress_pct,
          featured,
          area_ha
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14::date,
          $15::date,
          $16,
          $17,
          $18
        )
        RETURNING
          id,
          egi_id,
          dataset_id,
          institution_id,
          portfolio_id,
          code,
          title,
          objective,
          summary,
          description,
          theme,
          priority,
          visibility,
          status,
          start_date,
          end_date,
          progress_pct,
          featured,
          area_ha,
          created_at,
          updated_at,
          NULL::text AS institution_name,
          NULL::text AS portfolio_name,
          0::int AS indicator_count,
          0::int AS territory_count,
          0::int AS deliverable_count,
          0::int AS incident_count
      `,
      [
        normalizedEgiId,
        input.datasetId ?? null,
        institutionId,
        input.portfolioId ?? null,
        code,
        title,
        normalizeOptionalText(input.objective),
        normalizeOptionalText(input.summary),
        normalizeOptionalText(input.description),
        normalizeOptionalText(input.theme),
        normalizeProjectPriority(input.priority),
        normalizeProjectVisibility(input.visibility),
        normalizeProjectStatus(input.status),
        normalizeOptionalText(input.startDate),
        normalizeOptionalText(input.endDate),
        normalizeProgress(input.progressPct),
        Boolean(input.featured),
        normalizeArea(input.areaHa),
      ],
    );

    await this.recordAudit(actorEmail, 'project.created', result.rows[0].id, {
      code,
      title,
      institutionId,
    }, normalizedEgiId);

    return this.findOne(result.rows[0].id, true);
  }

  async update(id: string, input: ProjectWriteInput, actorEmail: string | null, egiId?: string | null) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }
    const existing = await this.findProjectRecord(id, true);
    if (!existing) {
      throw new NotFoundException('Project not found');
    }
    if (existing.egiId !== normalizedEgiId) {
      throw new NotFoundException('Project not found');
    }

    const code = input.code === undefined ? undefined : normalizeOptionalText(input.code);
    await this.ensureProjectCodeAvailable(code, id);

    const nextInstitutionId =
      input.institutionId === undefined ? existing.institutionId : input.institutionId;
    const nextPortfolioId =
      input.portfolioId === undefined ? existing.portfolioId ?? null : input.portfolioId;
    const nextDatasetId =
      input.datasetId === undefined ? existing.datasetId ?? null : input.datasetId;
    const nextPriority = input.priority === undefined ? existing.priority ?? undefined : input.priority;
    const nextVisibility =
      input.visibility === undefined ? existing.visibility ?? undefined : input.visibility;
    const nextStatus = input.status === undefined ? existing.status : input.status;
    const nextProgress =
      input.progressPct === undefined ? existing.progressPct ?? undefined : input.progressPct;
    const nextFeatured =
      input.featured === undefined ? existing.featured ?? false : input.featured;

    await this.validateProjectWriteInput({
      egiId: normalizedEgiId,
      institutionId: nextInstitutionId,
      portfolioId: nextPortfolioId,
      datasetId: nextDatasetId,
      priority: nextPriority,
      visibility: nextVisibility,
      status: nextStatus,
      progressPct: nextProgress,
      featured: nextFeatured,
    });

    const result = await this.postgresService.query<ProjectRow>(
      `
        UPDATE core.projects
        SET
          dataset_id = CASE WHEN $2 THEN $3::uuid ELSE dataset_id END,
          institution_id = CASE WHEN $4 THEN $5::uuid ELSE institution_id END,
          portfolio_id = CASE WHEN $6 THEN $7::uuid ELSE portfolio_id END,
          code = CASE WHEN $8 THEN $9 ELSE code END,
          title = CASE WHEN $10 THEN $11 ELSE title END,
          objective = CASE WHEN $12 THEN $13 ELSE objective END,
          summary = CASE WHEN $14 THEN $15 ELSE summary END,
          description = CASE WHEN $16 THEN $17 ELSE description END,
          theme = CASE WHEN $18 THEN $19 ELSE theme END,
          priority = CASE WHEN $20 THEN $21 ELSE priority END,
          visibility = CASE WHEN $22 THEN $23 ELSE visibility END,
          status = CASE WHEN $24 THEN $25 ELSE status END,
          start_date = CASE WHEN $26 THEN $27::date ELSE start_date END,
          end_date = CASE WHEN $28 THEN $29::date ELSE end_date END,
          progress_pct = CASE WHEN $30 THEN $31 ELSE progress_pct END,
          featured = CASE WHEN $32 THEN $33 ELSE featured END,
          area_ha = CASE WHEN $34 THEN $35 ELSE area_ha END,
          updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING
          id,
          dataset_id,
          institution_id,
          portfolio_id,
          code,
          title,
          objective,
          summary,
          description,
          theme,
          priority,
          visibility,
          status,
          start_date,
          end_date,
          progress_pct,
          featured,
          area_ha,
          created_at,
          updated_at,
          NULL::text AS institution_name,
          NULL::text AS portfolio_name,
          0::int AS indicator_count,
          0::int AS territory_count,
          0::int AS deliverable_count,
          0::int AS incident_count
      `,
      [
        id,
        input.datasetId !== undefined,
        input.datasetId ?? null,
        input.institutionId !== undefined,
        input.institutionId ?? null,
        input.portfolioId !== undefined,
        input.portfolioId ?? null,
        input.code !== undefined,
        code ?? null,
        input.title !== undefined,
        input.title?.trim() ?? null,
        input.objective !== undefined,
        normalizeOptionalText(input.objective),
        input.summary !== undefined,
        normalizeOptionalText(input.summary),
        input.description !== undefined,
        normalizeOptionalText(input.description),
        input.theme !== undefined,
        normalizeOptionalText(input.theme),
        input.priority !== undefined,
        input.priority === undefined ? null : normalizeProjectPriority(input.priority),
        input.visibility !== undefined,
        input.visibility === undefined ? null : normalizeProjectVisibility(input.visibility),
        input.status !== undefined,
        input.status === undefined ? null : normalizeProjectStatus(input.status),
        input.startDate !== undefined,
        normalizeOptionalText(input.startDate),
        input.endDate !== undefined,
        normalizeOptionalText(input.endDate),
        input.progressPct !== undefined,
        input.progressPct === undefined ? null : normalizeProgress(input.progressPct),
        input.featured !== undefined,
        input.featured === undefined ? null : Boolean(input.featured),
        input.areaHa !== undefined,
        input.areaHa === undefined ? null : normalizeArea(input.areaHa),
      ],
    );

    await this.recordAudit(actorEmail, 'project.updated', id, {
      previousStatus: existing.status,
      nextStatus: input.status ?? existing.status,
      previousVisibility: existing.visibility ?? null,
      nextVisibility: input.visibility ?? existing.visibility ?? null,
    }, normalizedEgiId);

    return this.findOne(result.rows[0].id, true);
  }

  async listTasksByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectTaskRow>(
      `
        SELECT
          t.id, t.project_id, t.parent_task_id, t.owner_actor_id,
          owner.display_name AS owner_name,
          t.task_type, t.code, t.title, t.description, t.start_date, t.end_date,
          t.status, t.progress_pct, t.weight, t.sort_order, t.created_at, t.updated_at,
          COALESCE(array_agg(d.predecessor_task_id) FILTER (WHERE d.predecessor_task_id IS NOT NULL), '{}')::uuid[] AS predecessor_ids
        FROM core.project_tasks t
        LEFT JOIN core.project_actors owner ON owner.id = t.owner_actor_id
        LEFT JOIN core.project_task_dependencies d ON d.task_id = t.id
        WHERE t.project_id = $1::uuid
        GROUP BY t.id, owner.display_name
        ORDER BY t.sort_order, t.start_date NULLS LAST, t.code
      `,
      [projectId],
    );
    return result.rows.map(mapProjectTaskRow);
  }

  async createTask(projectId: string, input: ProjectTaskWriteInput, actorEmail: string | null, egiId?: string | null) {
    return this.saveTask(projectId, null, input, actorEmail, egiId);
  }

  async updateTask(projectId: string, taskId: string, input: ProjectTaskWriteInput, actorEmail: string | null, egiId?: string | null) {
    return this.saveTask(projectId, taskId, input, actorEmail, egiId);
  }

  private async saveTask(projectId: string, taskId: string | null, input: ProjectTaskWriteInput, actorEmail: string | null, egiId?: string | null) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) throw new NotFoundException('Project not found');
    const current = taskId ? (await this.listTasksByProject(projectId)).find((item) => item.id === taskId) : null;
    if (taskId && !current) throw new NotFoundException('Task not found');
    const title = input.title === undefined ? current?.title : input.title.trim();
    const code = input.code === undefined ? current?.code : input.code.trim();
    if (!title) throw new BadRequestException('title es requerido');
    if (!code) throw new BadRequestException('code es requerido');
    const predecessorIds = input.predecessorIds ?? current?.predecessorIds ?? [];
    if (predecessorIds.includes(taskId ?? '')) throw new BadRequestException('Una tarea no puede depender de sí misma.');
    await this.ensureProjectPlanningReferences(projectId, input.parentTaskId, input.ownerActorId, predecessorIds);
    if (taskId) {
      const tasks = await this.listTasksByProject(projectId);
      const dependencyMap = new Map(tasks.map((task) => [task.id, task.id === taskId ? predecessorIds : task.predecessorIds]));
      const reachesTask = (candidate: string, visited = new Set<string>()): boolean => {
        if (candidate === taskId) return true;
        if (visited.has(candidate)) return false;
        visited.add(candidate);
        return (dependencyMap.get(candidate) ?? []).some((next) => reachesTask(next, visited));
      };
      if (predecessorIds.some((predecessorId) => reachesTask(predecessorId))) throw new BadRequestException('La dependencia propuesta crea un ciclo en el cronograma.');
    }

    const saved = await this.postgresService.transaction(async (client) => {
      const result = taskId
        ? await client.query<{ id: string }>(
          `UPDATE core.project_tasks SET
            parent_task_id = CASE WHEN $3 THEN $4::uuid ELSE parent_task_id END,
            owner_actor_id = CASE WHEN $5 THEN $6::uuid ELSE owner_actor_id END,
            task_type = CASE WHEN $7 THEN $8 ELSE task_type END,
            code = CASE WHEN $9 THEN $10 ELSE code END,
            title = CASE WHEN $11 THEN $12 ELSE title END,
            description = CASE WHEN $13 THEN $14 ELSE description END,
            start_date = CASE WHEN $15 THEN $16::date ELSE start_date END,
            end_date = CASE WHEN $17 THEN $18::date ELSE end_date END,
            status = CASE WHEN $19 THEN $20 ELSE status END,
            progress_pct = CASE WHEN $21 THEN $22 ELSE progress_pct END,
            weight = CASE WHEN $23 THEN $24 ELSE weight END,
            sort_order = CASE WHEN $25 THEN $26 ELSE sort_order END,
            updated_at = NOW()
          WHERE id = $1::uuid AND project_id = $2::uuid RETURNING id`,
          [taskId, projectId, input.parentTaskId !== undefined, input.parentTaskId ?? null, input.ownerActorId !== undefined, input.ownerActorId ?? null, input.taskType !== undefined, normalizeTaskType(input.taskType), input.code !== undefined, code, input.title !== undefined, title, input.description !== undefined, normalizeOptionalText(input.description), input.startDate !== undefined, normalizeOptionalText(input.startDate), input.endDate !== undefined, normalizeOptionalText(input.endDate), input.status !== undefined, normalizePlanningStatus(input.status), input.progressPct !== undefined, normalizeProgress(input.progressPct), input.weight !== undefined, normalizeNonNegative(input.weight, 'weight'), input.sortOrder !== undefined, Math.trunc(input.sortOrder ?? 0)],
        )
        : await client.query<{ id: string }>(
          `INSERT INTO core.project_tasks (project_id, parent_task_id, owner_actor_id, task_type, code, title, description, start_date, end_date, status, progress_pct, weight, sort_order)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::date,$9::date,$10,$11,$12,$13) RETURNING id`,
          [projectId, input.parentTaskId ?? null, input.ownerActorId ?? null, normalizeTaskType(input.taskType), code, title, normalizeOptionalText(input.description), normalizeOptionalText(input.startDate), normalizeOptionalText(input.endDate), normalizePlanningStatus(input.status), normalizeProgress(input.progressPct), normalizeNonNegative(input.weight ?? 1, 'weight'), Math.trunc(input.sortOrder ?? 0)],
        );
      const savedId = result.rows[0].id;
      if (input.predecessorIds !== undefined || !taskId) {
        await client.query('DELETE FROM core.project_task_dependencies WHERE task_id = $1::uuid', [savedId]);
        for (const predecessorId of predecessorIds) {
          await client.query(
            `INSERT INTO core.project_task_dependencies (task_id, predecessor_task_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
            [savedId, predecessorId],
          );
        }
      }
      return savedId;
    });
    await this.recordAudit(actorEmail, taskId ? 'project.task.updated' : 'project.task.created', projectId, { taskId: saved, title, code }, project.egiId ?? null);
    return (await this.listTasksByProject(projectId)).find((item) => item.id === saved)!;
  }

  async deleteTask(projectId: string, taskId: string, actorEmail: string | null, egiId?: string | null) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) throw new NotFoundException('Project not found');
    const result = await this.postgresService.query<{ title: string }>('DELETE FROM core.project_tasks WHERE id=$1::uuid AND project_id=$2::uuid RETURNING title', [taskId, projectId]);
    if (!result.rows[0]) throw new NotFoundException('Task not found');
    await this.recordAudit(actorEmail, 'project.task.deleted', projectId, { taskId, title: result.rows[0].title }, project.egiId ?? null);
    return { deleted: true, id: taskId };
  }

  async listBudgetItemsByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectBudgetItemRow>(
      `SELECT id, project_id, task_id, code, category, name, funding_source, currency, planned_amount, committed_amount, actual_amount, notes, created_at, updated_at
       FROM core.project_budget_items WHERE project_id=$1::uuid ORDER BY category, code`, [projectId],
    );
    return result.rows.map(mapProjectBudgetItemRow);
  }

  async createBudgetItem(projectId: string, input: ProjectBudgetItemWriteInput, actorEmail: string | null, egiId?: string | null) {
    return this.saveBudgetItem(projectId, null, input, actorEmail, egiId);
  }

  async updateBudgetItem(projectId: string, itemId: string, input: ProjectBudgetItemWriteInput, actorEmail: string | null, egiId?: string | null) {
    return this.saveBudgetItem(projectId, itemId, input, actorEmail, egiId);
  }

  private async saveBudgetItem(projectId: string, itemId: string | null, input: ProjectBudgetItemWriteInput, actorEmail: string | null, egiId?: string | null) {
    const project = await this.requireFinancialProject(projectId, ['planning','execution'], egiId);
    const current = itemId ? (await this.listBudgetItemsByProject(projectId)).find((item) => item.id === itemId) : null;
    if (itemId && !current) throw new NotFoundException('Budget item not found');
    const code = input.code === undefined ? current?.code : input.code.trim();
    const name = input.name === undefined ? current?.name : input.name.trim();
    const category = input.category === undefined ? current?.category : input.category.trim();
    if (!code || !name || !category) throw new BadRequestException('code, category y name son requeridos');
    if (input.taskId) await this.ensureProjectPlanningReferences(projectId, input.taskId, undefined, []);
    const values = [projectId, input.taskId ?? current?.taskId ?? null, code, category, name, normalizeOptionalText(input.fundingSource ?? current?.fundingSource), normalizeCurrency(input.currency ?? current?.currency), normalizeNonNegative(input.plannedAmount ?? current?.plannedAmount ?? 0, 'plannedAmount'), normalizeNonNegative(current?.committedAmount ?? 0, 'committedAmount'), normalizeNonNegative(current?.actualAmount ?? 0, 'actualAmount'), normalizeOptionalText(input.notes ?? current?.notes)];
    const result = itemId
      ? await this.postgresService.query<{ id: string }>(`UPDATE core.project_budget_items SET task_id=$2::uuid, code=$3, category=$4, name=$5, funding_source=$6, currency=$7, planned_amount=$8, committed_amount=$9, actual_amount=$10, notes=$11, updated_at=NOW() WHERE project_id=$1::uuid AND id=$12::uuid RETURNING id`, [...values, itemId])
      : await this.postgresService.query<{ id: string }>(`INSERT INTO core.project_budget_items (project_id,task_id,code,category,name,funding_source,currency,planned_amount,committed_amount,actual_amount,notes) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, values);
    if (!result.rows[0]) throw new NotFoundException('Budget item not found');
    await this.recordAudit(actorEmail, itemId ? 'project.budget.updated' : 'project.budget.created', projectId, { budgetItemId: result.rows[0].id, code, name }, project.egiId ?? null);
    return (await this.listBudgetItemsByProject(projectId)).find((item) => item.id === result.rows[0].id)!;
  }

  async deleteBudgetItem(projectId: string, itemId: string, actorEmail: string | null, egiId?: string | null) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) throw new NotFoundException('Project not found');
    const result = await this.postgresService.query<{ name: string }>('DELETE FROM core.project_budget_items WHERE id=$1::uuid AND project_id=$2::uuid RETURNING name', [itemId, projectId]);
    if (!result.rows[0]) throw new NotFoundException('Budget item not found');
    await this.recordAudit(actorEmail, 'project.budget.deleted', projectId, { budgetItemId: itemId, name: result.rows[0].name }, project.egiId ?? null);
    return { deleted: true, id: itemId };
  }

  async listRisksByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectRiskRow>(
      `SELECT r.id,r.project_id,r.owner_actor_id,owner.display_name AS owner_name,r.code,r.title,r.description,r.category,r.probability,r.impact,r.status,r.response_strategy,r.mitigation,r.review_date,r.created_at,r.updated_at
       FROM core.project_risks r LEFT JOIN core.project_actors owner ON owner.id=r.owner_actor_id WHERE r.project_id=$1::uuid ORDER BY (r.probability*r.impact) DESC,r.code`, [projectId],
    );
    return result.rows.map(mapProjectRiskRow);
  }

  async createRisk(projectId: string, input: ProjectRiskWriteInput, actorEmail: string | null, egiId?: string | null) { return this.saveRisk(projectId, null, input, actorEmail, egiId); }
  async updateRisk(projectId: string, riskId: string, input: ProjectRiskWriteInput, actorEmail: string | null, egiId?: string | null) { return this.saveRisk(projectId, riskId, input, actorEmail, egiId); }

  private async saveRisk(projectId: string, riskId: string | null, input: ProjectRiskWriteInput, actorEmail: string | null, egiId?: string | null) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) throw new NotFoundException('Project not found');
    const current = riskId ? (await this.listRisksByProject(projectId)).find((item) => item.id === riskId) : null;
    if (riskId && !current) throw new NotFoundException('Risk not found');
    const code = input.code === undefined ? current?.code : input.code.trim();
    const title = input.title === undefined ? current?.title : input.title.trim();
    if (!code || !title) throw new BadRequestException('code y title son requeridos');
    if (input.ownerActorId) await this.ensureProjectPlanningReferences(projectId, undefined, input.ownerActorId, []);
    const values = [projectId, input.ownerActorId ?? current?.ownerActorId ?? null, code, title, normalizeOptionalText(input.description ?? current?.description), normalizeOptionalText(input.category ?? current?.category), normalizeRiskFactor(input.probability ?? current?.probability, 'probability'), normalizeRiskFactor(input.impact ?? current?.impact, 'impact'), normalizeRiskStatus(input.status ?? current?.status), normalizeRiskStrategy(input.responseStrategy ?? current?.responseStrategy), normalizeOptionalText(input.mitigation ?? current?.mitigation), normalizeOptionalText(input.reviewDate ?? current?.reviewDate)];
    const result = riskId
      ? await this.postgresService.query<{ id: string }>(`UPDATE core.project_risks SET owner_actor_id=$2::uuid,code=$3,title=$4,description=$5,category=$6,probability=$7,impact=$8,status=$9,response_strategy=$10,mitigation=$11,review_date=$12::date,updated_at=NOW() WHERE project_id=$1::uuid AND id=$13::uuid RETURNING id`, [...values, riskId])
      : await this.postgresService.query<{ id: string }>(`INSERT INTO core.project_risks (project_id,owner_actor_id,code,title,description,category,probability,impact,status,response_strategy,mitigation,review_date) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date) RETURNING id`, values);
    if (!result.rows[0]) throw new NotFoundException('Risk not found');
    await this.recordAudit(actorEmail, riskId ? 'project.risk.updated' : 'project.risk.created', projectId, { riskId: result.rows[0].id, code, title }, project.egiId ?? null);
    return (await this.listRisksByProject(projectId)).find((item) => item.id === result.rows[0].id)!;
  }

  async deleteRisk(projectId: string, riskId: string, actorEmail: string | null, egiId?: string | null) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) throw new NotFoundException('Project not found');
    const result = await this.postgresService.query<{ title: string }>('DELETE FROM core.project_risks WHERE id=$1::uuid AND project_id=$2::uuid RETURNING title', [riskId, projectId]);
    if (!result.rows[0]) throw new NotFoundException('Risk not found');
    await this.recordAudit(actorEmail, 'project.risk.deleted', projectId, { riskId, title: result.rows[0].title }, project.egiId ?? null);
    return { deleted: true, id: riskId };
  }

  private async ensureProjectPlanningReferences(projectId: string, taskId?: string | null, actorId?: string | null, predecessorIds: string[] = []) {
    if (taskId) {
      const task = await this.postgresService.query<{ id: string }>('SELECT id FROM core.project_tasks WHERE id=$1::uuid AND project_id=$2::uuid', [taskId, projectId]);
      if (!task.rows[0]) throw new BadRequestException('La tarea o fase seleccionada no pertenece al proyecto.');
    }
    if (actorId) {
      const actor = await this.postgresService.query<{ id: string }>('SELECT id FROM core.project_actors WHERE id=$1::uuid AND project_id=$2::uuid', [actorId, projectId]);
      if (!actor.rows[0]) throw new BadRequestException('El responsable seleccionado no pertenece al proyecto.');
    }
    if (predecessorIds.length > 0) {
      const predecessors = await this.postgresService.query<{ id: string }>('SELECT id FROM core.project_tasks WHERE id=ANY($1::uuid[]) AND project_id=$2::uuid', [predecessorIds, projectId]);
      if (predecessors.rows.length !== new Set(predecessorIds).size) throw new BadRequestException('Una o más dependencias no pertenecen al proyecto.');
    }
  }

  async getProjectLifecycleWorkspace(projectId: string) {
    const [settingsResult, fundingResult, versionsResult, movementsResult, recordsResult, updatesResult, alertFactsResult] = await Promise.all([
      this.postgresService.query<ProjectFinancialSettingsRow>(
        `SELECT financial_management_mode,financial_base_currency,financial_source_system,external_project_code,external_financial_url,financial_data_source,financial_update_method,financial_sync_status,financial_data_cutoff_date,financial_data_last_updated_at,external_budget_amount,external_committed_amount,external_executed_amount,external_available_amount,actual_end_date,closure_summary,lessons_learned
         FROM core.projects WHERE id=$1::uuid`, [projectId],
      ),
      this.postgresService.query<ProjectFundingSourceRow>(
        `SELECT id,project_id,code,name,source_type,funder,currency,approved_amount,received_amount,valid_from,valid_to,restrictions,observations,status,created_at,updated_at FROM core.project_funding_sources WHERE project_id=$1::uuid ORDER BY code`, [projectId],
      ),
      this.postgresService.query<ProjectBudgetVersionRow>(
        `SELECT id,project_id,version_number,name,reason,status,effective_date,total_amount,change_amount,approval_notes,approved_at,created_at,updated_at FROM core.project_budget_versions WHERE project_id=$1::uuid ORDER BY version_number DESC`, [projectId],
      ),
      this.postgresService.query<ProjectFinancialMovementRow>(
        `SELECT id,project_id,budget_item_id,destination_budget_item_id,funding_source_id,task_id,movement_type,budget_effect,movement_date,amount,currency,exchange_rate,base_amount,supplier_or_beneficiary,concept,external_reference,document_number,support_file_id,status,approved_at,created_at,updated_at FROM core.project_financial_movements WHERE project_id=$1::uuid ORDER BY movement_date DESC,created_at DESC`, [projectId],
      ),
      this.postgresService.query<ProjectManagementRecordRow>(
        `SELECT r.id,r.project_id,r.record_type,r.code,r.title,r.description,r.status,r.priority,r.requester_actor_id,r.owner_actor_id,owner.display_name AS owner_name,r.approver_actor_id,r.requested_at,r.decided_at,r.due_date,r.impact_scope,r.impact_schedule_days,r.impact_amount,r.previous_value_json,r.proposed_value_json,r.resolution,r.support_file_id,r.created_at,r.updated_at FROM core.project_management_records r LEFT JOIN core.project_actors owner ON owner.id=r.owner_actor_id WHERE r.project_id=$1::uuid ORDER BY r.created_at DESC`, [projectId],
      ),
      this.postgresService.query<ProjectStatusUpdateRow>(
        `SELECT s.id,s.project_id,s.cutoff_date,s.period_label,s.physical_progress_pct,s.financial_progress_pct,s.financial_data_mode,s.executive_summary,s.achievements,s.delays,s.main_risks,s.issues,s.decisions_required,s.next_steps,s.status,s.responsible_actor_id,a.display_name AS responsible_name,s.approved_at,s.created_at,s.updated_at FROM core.project_status_updates s LEFT JOIN core.project_actors a ON a.id=s.responsible_actor_id WHERE s.project_id=$1::uuid ORDER BY s.cutoff_date DESC`, [projectId],
      ),
      this.postgresService.query<ProjectAlertFactsRow>(
        `SELECT
          (SELECT COUNT(*)::int FROM core.project_milestones WHERE project_id=$1::uuid AND due_date<CURRENT_DATE AND status NOT IN ('done','completed','closed')) AS overdue_milestones,
          (SELECT COUNT(*)::int FROM core.project_documents WHERE project_id=$1::uuid AND status='draft') AS pending_documents,
          p.end_date,p.progress_pct
         FROM core.projects p WHERE p.id=$1::uuid`, [projectId],
      ),
    ]);
    const settings = settingsResult.rows[0] ? mapFinancialSettings(settingsResult.rows[0]) : defaultFinancialSettings();
    const fundingSources = fundingResult.rows.map(mapFundingSourceRow);
    const budgetVersions = versionsResult.rows.map(mapBudgetVersionRow);
    const financialMovements = movementsResult.rows.map(mapFinancialMovementRow);
    const managementRecords = recordsResult.rows.map(mapManagementRecordRow);
    const statusUpdates = updatesResult.rows.map(mapStatusUpdateRow);
    const financialSummary = await this.calculateFinancialSummary(projectId, settings);
    const alerts = await this.calculateProjectAlerts(projectId, settings, financialSummary, alertFactsResult.rows[0]);
    return { financialSettings: settings, fundingSources, budgetVersions, financialMovements, managementRecords, statusUpdates, financialSummary, alerts };
  }

  private async calculateFinancialSummary(projectId: string, settings: ReturnType<typeof mapFinancialSettings>) {
    if (settings.mode === 'none' || settings.mode === 'external') return calculateProjectFinancialSummary(settings);
    const result = await this.postgresService.query<FinancialTotalsRow>(
      `SELECT
        COALESCE(SUM(b.initial_amount),0)::numeric AS initial_budget,
        COALESCE(SUM(b.planned_amount),0)::numeric AS line_budget,
        COALESCE((SELECT SUM(CASE m.budget_effect WHEN 'decrease' THEN -m.base_amount WHEN 'increase' THEN m.base_amount ELSE 0 END) FROM core.project_financial_movements m WHERE m.project_id=$1::uuid AND m.movement_type='adjustment' AND m.status='approved'),0)::numeric AS adjustments,
        COALESCE((SELECT SUM(m.base_amount) FROM core.project_financial_movements m WHERE m.project_id=$1::uuid AND m.movement_type='commitment' AND m.status='approved'),0)::numeric AS committed,
        COALESCE((SELECT SUM(m.base_amount) FROM core.project_financial_movements m WHERE m.project_id=$1::uuid AND m.movement_type='payment' AND m.status='approved'),0)::numeric AS executed
       FROM core.project_budget_items b WHERE b.project_id=$1::uuid`, [projectId],
    );
    const totals = result.rows[0];
    return calculateProjectFinancialSummary(settings, {
      initialBudget: Number(totals?.initial_budget ?? 0),
      lineBudget: Number(totals?.line_budget ?? 0),
      adjustments: Number(totals?.adjustments ?? 0),
      committed: Number(totals?.committed ?? 0),
      executed: Number(totals?.executed ?? 0),
    });
  }

  private async calculateProjectAlerts(projectId: string, settings: ReturnType<typeof mapFinancialSettings>, financialSummary: { currentBudget: number | null; committed: number | null; executed: number | null }, facts?: ProjectAlertFactsRow) {
    const [tasks, risks] = await Promise.all([this.listTasksByProject(projectId), this.listRisksByProject(projectId)]);
    const today = new Date().toISOString().slice(0, 10);
    const alerts: Array<{ code: string; severity: 'low'|'medium'|'high'|'critical'; title: string; detail: string; targetView: string }> = [];
    const overdue = tasks.filter((task) => task.endDate && task.endDate < today && !['done','cancelled'].includes(task.status));
    if (overdue.length) alerts.push({ code:'tasks.overdue',severity:'high',title:`${overdue.length} tarea(s) vencida(s)`,detail:'La fecha planificada terminó y la tarea continúa abierta.',targetView:'schedule' });
    const unassigned = tasks.filter((task) => !task.ownerActorId && task.status !== 'done');
    if (unassigned.length) alerts.push({ code:'tasks.unassigned',severity:'medium',title:`${unassigned.length} actividad(es) sin responsable`,detail:'Asigna responsables para asegurar seguimiento.',targetView:'planning' });
    const incomplete = new Set(tasks.filter((task) => task.status !== 'done').map((task) => task.id));
    const blockedByDependency = tasks.filter((task) => task.status !== 'done' && task.predecessorIds.some((id) => incomplete.has(id)));
    if (blockedByDependency.length) alerts.push({ code:'tasks.dependencies',severity:'medium',title:`${blockedByDependency.length} tarea(s) esperan dependencias`,detail:'Existen predecesoras todavía incompletas.',targetView:'schedule' });
    const criticalRisks = risks.filter((risk) => risk.score >= 15 && !['closed','mitigated'].includes(risk.status));
    if (criticalRisks.length) alerts.push({ code:'risks.critical',severity:'critical',title:`${criticalRisks.length} riesgo(s) crítico(s)`,detail:'Revisa probabilidad, impacto y respuesta.',targetView:'governance' });
    const unmitigated = criticalRisks.filter((risk) => !risk.mitigation);
    if (unmitigated.length) alerts.push({ code:'risks.unmitigated',severity:'critical',title:`${unmitigated.length} riesgo(s) crítico(s) sin mitigación`,detail:'La respuesta al riesgo no está documentada.',targetView:'governance' });
    if ((facts?.overdue_milestones ?? 0) > 0) alerts.push({ code:'milestones.overdue',severity:'high',title:`${facts!.overdue_milestones} hito(s) vencido(s)`,detail:'Hay hitos sin cierre después de su fecha prevista.',targetView:'monitoring' });
    if ((facts?.pending_documents ?? 0) > 0) alerts.push({ code:'documents.pending',severity:'low',title:`${facts!.pending_documents} documento(s) en borrador`,detail:'Revisa los documentos pendientes de aprobación.',targetView:'documents' });
    if (settings.mode === 'execution' && financialSummary.currentBudget !== null && financialSummary.committed !== null && financialSummary.committed > financialSummary.currentBudget) alerts.push({ code:'finance.overcommitted',severity:'critical',title:'Compromisos sobre el presupuesto vigente',detail:'Los compromisos aprobados exceden el presupuesto vigente.',targetView:'budget' });
    if (settings.mode === 'execution' && financialSummary.currentBudget !== null && financialSummary.executed !== null && financialSummary.executed > financialSummary.currentBudget) alerts.push({ code:'finance.overexecuted',severity:'critical',title:'Ejecución sobre el presupuesto vigente',detail:'Los pagos aprobados exceden el presupuesto vigente.',targetView:'budget' });
    if (facts?.end_date) { const days=Math.ceil((facts.end_date.getTime()-Date.now())/86400000); if(days>=0&&days<=60&&Number(facts.progress_pct)<80) alerts.push({code:'project.low_progress_near_end',severity:'high',title:'Proyecto próximo a finalizar con bajo avance',detail:`Restan ${days} días y el avance físico es ${Number(facts.progress_pct)}%.`,targetView:'monitoring'}); }
    return alerts;
  }

  async updateFinancialSettings(projectId: string, input: Record<string, unknown>, actorEmail: string | null, egiId?: string | null) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) throw new NotFoundException('Project not found');
    const current = (await this.getProjectLifecycleWorkspace(projectId)).financialSettings;
    const mode = normalizeFinancialMode(String(input.mode ?? current.mode));
    const financialCount = await this.postgresService.query<{ total: number }>(`SELECT ((SELECT COUNT(*) FROM core.project_budget_items WHERE project_id=$1::uuid)+(SELECT COUNT(*) FROM core.project_financial_movements WHERE project_id=$1::uuid)+(SELECT COUNT(*) FROM core.project_budget_versions WHERE project_id=$1::uuid))::int AS total`, [projectId]);
    if (mode !== current.mode && financialCount.rows[0].total > 0 && (mode === 'none' || mode === 'external') && input.acknowledgeExistingData !== true) throw new BadRequestException('El proyecto tiene información financiera local. Confirma explícitamente que se conservará como historial fuera del flujo operativo.');
    const sourceSystem = optionalString(input.sourceSystem);
    const cutoffDate = optionalString(input.dataCutoffDate);
    if (mode === 'external' && (!sourceSystem || !cutoffDate)) throw new BadRequestException('Los proyectos con finanzas externas requieren sistema fuente y fecha de corte.');
    await this.postgresService.query(
      `UPDATE core.projects SET financial_management_mode=$2,financial_base_currency=$3,financial_source_system=$4,external_project_code=$5,external_financial_url=$6,financial_data_source=$7,financial_update_method=$8,financial_sync_status=$9,financial_data_cutoff_date=$10::date,financial_data_last_updated_at=CASE WHEN $11::text IS NULL THEN financial_data_last_updated_at ELSE $11::timestamptz END,external_budget_amount=$12,external_committed_amount=$13,external_executed_amount=$14,external_available_amount=$15,updated_at=NOW() WHERE id=$1::uuid`,
      [projectId,mode,normalizeNullableCurrency(input.baseCurrency),sourceSystem,optionalString(input.externalProjectCode),optionalString(input.externalUrl),optionalString(input.dataSource),normalizeUpdateMethod(input.updateMethod),optionalString(input.syncStatus),cutoffDate,optionalString(input.dataLastUpdatedAt),nullableNonNegative(input.externalBudgetAmount,'externalBudgetAmount'),nullableNonNegative(input.externalCommittedAmount,'externalCommittedAmount'),nullableNonNegative(input.externalExecutedAmount,'externalExecutedAmount'),nullableNonNegative(input.externalAvailableAmount,'externalAvailableAmount')],
    );
    await this.recordAudit(actorEmail,'project.financial_settings.updated',projectId,{previousMode:current.mode,nextMode:mode,sourceSystem},project.egiId ?? null);
    return (await this.getProjectLifecycleWorkspace(projectId)).financialSettings;
  }

  async createFundingSource(projectId: string, input: Record<string, unknown>, actorEmail: string | null, egiId?: string | null) {
    const project=await this.requireFinancialProject(projectId,['planning','execution'],egiId); const actor=await this.resolveActorUserId(actorEmail); const code=requiredString(input.code,'code'); const name=requiredString(input.name,'name');
    const result=await this.postgresService.query<{id:string}>(`INSERT INTO core.project_funding_sources(project_id,code,name,source_type,funder,currency,approved_amount,received_amount,valid_from,valid_to,restrictions,observations,status,created_by_user_id,updated_by_user_id) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12,$13,$14::uuid,$14::uuid) RETURNING id`,[projectId,code,name,optionalString(input.sourceType)??'institutional',optionalString(input.funder),normalizeCurrency(String(input.currency??project.financialBaseCurrency??'USD')),nullableNonNegative(input.approvedAmount,'approvedAmount'),nullableNonNegative(input.receivedAmount,'receivedAmount'),optionalString(input.validFrom),optionalString(input.validTo),optionalString(input.restrictions),optionalString(input.observations),optionalString(input.status)??'active',actor]);
    await this.recordAudit(actorEmail,'project.funding_source.created',projectId,{fundingSourceId:result.rows[0].id,code,name},project.egiId??null); return (await this.getProjectLifecycleWorkspace(projectId)).fundingSources.find((item)=>item.id===result.rows[0].id)!;
  }

  async createBudgetVersion(projectId:string,input:Record<string,unknown>,actorEmail:string|null,egiId?:string|null){ const project=await this.requireFinancialProject(projectId,['planning','execution'],egiId); const actor=await this.resolveActorUserId(actorEmail); const result=await this.postgresService.query<{id:string}>(`INSERT INTO core.project_budget_versions(project_id,version_number,name,reason,status,effective_date,total_amount,change_amount,approval_notes,approved_at,approved_by_user_id,created_by_user_id) VALUES($1::uuid,$2,$3,$4,$5,$6::date,$7,$8,$9,CASE WHEN $5='approved' THEN NOW() ELSE NULL END,CASE WHEN $5='approved' THEN $10::uuid ELSE NULL END,$10::uuid) RETURNING id`,[projectId,Math.trunc(Number(input.versionNumber)),requiredString(input.name,'name'),optionalString(input.reason),normalizeApprovalStatus(input.status),requiredString(input.effectiveDate,'effectiveDate'),normalizeNonNegative(Number(input.totalAmount??0),'totalAmount'),Number(input.changeAmount??0),optionalString(input.approvalNotes),actor]); await this.recordAudit(actorEmail,'project.budget_version.created',projectId,{budgetVersionId:result.rows[0].id,status:input.status},project.egiId??null); return (await this.getProjectLifecycleWorkspace(projectId)).budgetVersions.find((item)=>item.id===result.rows[0].id)!; }

  async approveBudgetVersion(projectId:string,versionId:string,actorEmail:string|null,egiId?:string|null){const project=await this.requireFinancialProject(projectId,['planning','execution'],egiId);const actor=await this.resolveActorUserId(actorEmail);const result=await this.postgresService.query<{id:string}>(`UPDATE core.project_budget_versions SET status='approved',approved_at=NOW(),approved_by_user_id=$3::uuid,updated_at=NOW() WHERE id=$1::uuid AND project_id=$2::uuid AND status IN ('draft','under_review') RETURNING id`,[versionId,projectId,actor]);if(!result.rows[0])throw new BadRequestException('La versión no existe o no puede aprobarse en su estado actual.');await this.recordAudit(actorEmail,'project.budget_version.approved',projectId,{budgetVersionId:versionId},project.egiId??null);return (await this.getProjectLifecycleWorkspace(projectId)).budgetVersions.find((item)=>item.id===versionId)!;}

  async createFinancialMovement(projectId:string,input:Record<string,unknown>,actorEmail:string|null,egiId?:string|null){ const project=await this.requireFinancialProject(projectId,['execution'],egiId); const actor=await this.resolveActorUserId(actorEmail); const movementType=normalizeMovementType(input.movementType); const status=normalizeApprovalStatus(input.status); const amount=normalizeNonNegative(Number(input.amount??0),'amount'); const rate=Number(input.exchangeRate??1); if(!Number.isFinite(rate)||rate<=0) throw new BadRequestException('exchangeRate debe ser mayor que cero'); const baseAmount=Number((amount*rate).toFixed(2)); const budgetItemId=optionalString(input.budgetItemId); if(['commitment','accrual','payment','adjustment','transfer'].includes(movementType)&&!budgetItemId) throw new BadRequestException('budgetItemId es requerido para este movimiento'); if(budgetItemId){const item=await this.postgresService.query<{id:string}>('SELECT id FROM core.project_budget_items WHERE id=$1::uuid AND project_id=$2::uuid',[budgetItemId,projectId]);if(!item.rows[0])throw new BadRequestException('La partida no pertenece al proyecto.');} if(status==='approved'&&(movementType==='commitment'||movementType==='payment')){const summary=await this.calculateFinancialSummary(projectId,mapFinancialSettingsFromProject(project));const next=(movementType==='commitment'?summary.committed:summary.executed)??0;if(summary.currentBudget!==null&&next+baseAmount>summary.currentBudget)throw new BadRequestException(movementType==='commitment'?'El compromiso supera el presupuesto disponible.':'El pago supera el saldo por ejecutar.');const line=await this.postgresService.query<{current_budget:string|number;committed:string|number;executed:string|number}>(`SELECT (b.planned_amount+COALESCE(SUM(CASE WHEN m.movement_type='adjustment' AND m.status='approved' THEN CASE m.budget_effect WHEN 'decrease' THEN -m.base_amount WHEN 'increase' THEN m.base_amount ELSE 0 END ELSE 0 END),0))::numeric AS current_budget,COALESCE(SUM(CASE WHEN m.movement_type='commitment' AND m.status='approved' THEN m.base_amount ELSE 0 END),0)::numeric AS committed,COALESCE(SUM(CASE WHEN m.movement_type='payment' AND m.status='approved' THEN m.base_amount ELSE 0 END),0)::numeric AS executed FROM core.project_budget_items b LEFT JOIN core.project_financial_movements m ON m.budget_item_id=b.id WHERE b.id=$1::uuid AND b.project_id=$2::uuid GROUP BY b.id,b.planned_amount`,[budgetItemId,projectId]);const lineTotals=line.rows[0];const lineCurrent=Number(lineTotals.current_budget);const lineNext=movementType==='commitment'?Number(lineTotals.committed):Number(lineTotals.executed);if(lineNext+baseAmount>lineCurrent)throw new BadRequestException(movementType==='commitment'?'El compromiso supera el disponible de la partida.':'El pago supera el saldo por ejecutar de la partida.');}
    const result=await this.postgresService.query<{id:string}>(`INSERT INTO core.project_financial_movements(project_id,budget_item_id,destination_budget_item_id,funding_source_id,task_id,movement_type,budget_effect,movement_date,amount,currency,exchange_rate,base_amount,supplier_or_beneficiary,concept,external_reference,document_number,support_file_id,status,approved_at,approved_by_user_id,created_by_user_id) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8::date,$9,$10,$11,$12,$13,$14,$15,$16,$17::uuid,$18,CASE WHEN $18='approved' THEN NOW() ELSE NULL END,CASE WHEN $18='approved' THEN $19::uuid ELSE NULL END,$19::uuid) RETURNING id`,[projectId,budgetItemId,optionalString(input.destinationBudgetItemId),optionalString(input.fundingSourceId),optionalString(input.taskId),movementType,normalizeBudgetEffect(input.budgetEffect),requiredString(input.movementDate,'movementDate'),amount,normalizeCurrency(String(input.currency??project.financialBaseCurrency??'USD')),rate,baseAmount,optionalString(input.supplierOrBeneficiary),requiredString(input.concept,'concept'),optionalString(input.externalReference),optionalString(input.documentNumber),optionalString(input.supportFileId),status,actor]); await this.recordAudit(actorEmail,'project.financial_movement.created',projectId,{movementId:result.rows[0].id,movementType,baseAmount,status},project.egiId??null); return (await this.getProjectLifecycleWorkspace(projectId)).financialMovements.find((item)=>item.id===result.rows[0].id)!; }

  async createManagementRecord(projectId:string,input:Record<string,unknown>,actorEmail:string|null,egiId?:string|null){const project=await this.findProjectRecord(projectId,true,egiId);if(!project)throw new NotFoundException('Project not found');const actor=await this.resolveActorUserId(actorEmail);const recordType=normalizeManagementRecordType(input.recordType);const code=requiredString(input.code,'code');const title=requiredString(input.title,'title');const result=await this.postgresService.query<{id:string}>(`INSERT INTO core.project_management_records(project_id,record_type,code,title,description,status,priority,requester_actor_id,owner_actor_id,approver_actor_id,requested_at,decided_at,due_date,impact_scope,impact_schedule_days,impact_amount,previous_value_json,proposed_value_json,resolution,support_file_id,created_by_user_id,updated_by_user_id) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid,$9::uuid,$10::uuid,$11::date,$12::date,$13::date,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20::uuid,$21::uuid,$21::uuid) RETURNING id`,[projectId,recordType,code,title,optionalString(input.description),optionalString(input.status)??'open',optionalString(input.priority)??'medium',optionalString(input.requesterActorId),optionalString(input.ownerActorId),optionalString(input.approverActorId),optionalString(input.requestedAt),optionalString(input.decidedAt),optionalString(input.dueDate),optionalString(input.impactScope),input.impactScheduleDays===undefined?null:Math.trunc(Number(input.impactScheduleDays)),nullableNumber(input.impactAmount,'impactAmount'),JSON.stringify(input.previousValue??null),JSON.stringify(input.proposedValue??null),optionalString(input.resolution),optionalString(input.supportFileId),actor]);await this.recordAudit(actorEmail,`project.${recordType}.created`,projectId,{recordId:result.rows[0].id,code,title},project.egiId??null);return (await this.getProjectLifecycleWorkspace(projectId)).managementRecords.find((item)=>item.id===result.rows[0].id)!;}

  async createStatusUpdate(projectId:string,input:Record<string,unknown>,actorEmail:string|null,egiId?:string|null){const project=await this.findProjectRecord(projectId,true,egiId);if(!project)throw new NotFoundException('Project not found');const actor=await this.resolveActorUserId(actorEmail);const mode=project.financialManagementMode??'none';if(mode==='none'&&input.financialProgressPct!==undefined&&input.financialProgressPct!==null)throw new BadRequestException('Un proyecto sin gestión financiera no admite avance financiero.');if(mode==='planning'&&input.financialProgressPct!==undefined&&input.financialProgressPct!==null)throw new BadRequestException('El modo planning no admite ejecución financiera.');const result=await this.postgresService.query<{id:string}>(`INSERT INTO core.project_status_updates(project_id,cutoff_date,period_label,physical_progress_pct,financial_progress_pct,financial_data_mode,executive_summary,achievements,delays,main_risks,issues,decisions_required,next_steps,status,responsible_actor_id,created_by_user_id,updated_by_user_id) VALUES($1::uuid,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::uuid,$16::uuid,$16::uuid) RETURNING id`,[projectId,requiredString(input.cutoffDate,'cutoffDate'),requiredString(input.periodLabel,'periodLabel'),nullableProgress(input.physicalProgressPct),nullableProgress(input.financialProgressPct),mode,requiredString(input.executiveSummary,'executiveSummary'),optionalString(input.achievements),optionalString(input.delays),optionalString(input.mainRisks),optionalString(input.issues),optionalString(input.decisionsRequired),optionalString(input.nextSteps),optionalString(input.status)??'draft',optionalString(input.responsibleActorId),actor]);await this.recordAudit(actorEmail,'project.status_update.created',projectId,{statusUpdateId:result.rows[0].id,cutoffDate:input.cutoffDate},project.egiId??null);return (await this.getProjectLifecycleWorkspace(projectId)).statusUpdates.find((item)=>item.id===result.rows[0].id)!;}

  async closeProject(projectId:string,input:Record<string,unknown>,actorEmail:string|null,egiId?:string|null){
    const project=await this.findProjectRecord(projectId,true,egiId);
    if(!project)throw new NotFoundException('Project not found');
    if(project.status==='completed')throw new BadRequestException('El proyecto ya se encuentra cerrado.');
    const actualEndDate=requiredString(input.actualEndDate,'actualEndDate');
    const closureSummary=requiredString(input.closureSummary,'closureSummary');
    const lessonsLearned=requiredString(input.lessonsLearned,'lessonsLearned');
    if(actualEndDate>new Date().toISOString().slice(0,10))throw new BadRequestException('La fecha real de cierre no puede estar en el futuro.');
    const result=await this.postgresService.query<{open_tasks:number;open_milestones:number;open_deliverables:number;open_risks:number;open_issues:number}>(`SELECT
      (SELECT COUNT(*)::int FROM core.project_tasks WHERE project_id=$1::uuid AND status NOT IN ('done','completed','closed')) AS open_tasks,
      (SELECT COUNT(*)::int FROM core.project_milestones WHERE project_id=$1::uuid AND status NOT IN ('done','completed','closed')) AS open_milestones,
      (SELECT COUNT(*)::int FROM core.project_deliverables WHERE project_id=$1::uuid AND status NOT IN ('approved','completed','closed','published')) AS open_deliverables,
      (SELECT COUNT(*)::int FROM core.project_risks WHERE project_id=$1::uuid AND status NOT IN ('closed','mitigated','accepted')) AS open_risks,
      (SELECT COUNT(*)::int FROM core.project_management_records WHERE project_id=$1::uuid AND record_type='issue' AND status NOT IN ('closed','rejected')) AS open_issues`,[projectId]);
    const checklist=result.rows[0];
    const pending=Object.values(checklist).reduce((sum,value)=>sum+Number(value),0);
    if(pending>0&&input.acknowledgePending!==true)throw new BadRequestException(`El cierre tiene ${pending} elemento(s) pendiente(s). Revisa el checklist o confirma el cierre con pendientes.`);
    const actor=await this.resolveActorUserId(actorEmail);
    await this.postgresService.query(`UPDATE core.projects SET status='completed',progress_pct=100,actual_end_date=$2::date,closure_summary=$3,lessons_learned=$4,closed_by_user_id=$5::uuid,updated_at=NOW() WHERE id=$1::uuid`,[projectId,actualEndDate,closureSummary,lessonsLearned,actor]);
    await this.recordAudit(actorEmail,'project.closed',projectId,{actualEndDate,checklist,closedWithPending:pending>0},project.egiId??null);
    return {project:await this.findOne(projectId,true,egiId),checklist,closedWithPending:pending>0};
  }

  async deleteLifecycleResource(projectId:string,resource:'funding-source'|'budget-version'|'financial-movement'|'management-record'|'status-update',id:string,actorEmail:string|null,egiId?:string|null){const project=await this.findProjectRecord(projectId,true,egiId);if(!project)throw new NotFoundException('Project not found');const tables={ 'funding-source':'core.project_funding_sources','budget-version':'core.project_budget_versions','financial-movement':'core.project_financial_movements','management-record':'core.project_management_records','status-update':'core.project_status_updates'} as const;const result=await this.postgresService.query<{id:string}>(`DELETE FROM ${tables[resource]} WHERE id=$1::uuid AND project_id=$2::uuid RETURNING id`,[id,projectId]);if(!result.rows[0])throw new NotFoundException('Resource not found');await this.recordAudit(actorEmail,`project.${resource}.deleted`,projectId,{id},project.egiId??null);return{deleted:true,id};}

  private async requireFinancialProject(projectId:string,allowed:string[],egiId?:string|null){const project=await this.findProjectRecord(projectId,true,egiId);if(!project)throw new NotFoundException('Project not found');if(!allowed.includes(project.financialManagementMode??'none'))throw new BadRequestException(`La operación no está habilitada para el modo financiero ${project.financialManagementMode??'none'}.`);return project;}

  async createActor(
    projectId: string,
    input: ProjectActorWriteInput,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const displayName = input.displayName?.trim();
    if (!displayName) {
      throw new BadRequestException('displayName es requerido');
    }

    if (input.institutionId) {
      await this.ensureRecordExists(
        'core.institutions',
        input.institutionId,
        'La institución no existe.',
      );
    }

    const result = await this.postgresService.query<ProjectActorRow>(
      `
        INSERT INTO core.project_actors (
          project_id,
          actor_type,
          institution_id,
          display_name,
          role_label,
          status
        )
        VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6)
        RETURNING
          id,
          project_id,
          actor_type,
          institution_id,
          NULL::text AS institution_name,
          display_name,
          role_label,
          status,
          created_at,
          updated_at
      `,
      [
        projectId,
        normalizeActorType(input.actorType),
        input.institutionId ?? null,
        displayName,
        normalizeOptionalText(input.roleLabel),
        normalizeActiveStatus(input.status),
      ],
    );

    await this.recordAudit(
      actorEmail,
      'project.actor.created',
      projectId,
      {
        actorId: result.rows[0].id,
        displayName,
        actorType: result.rows[0].actor_type,
      },
      project.egiId ?? null,
    );

    return this.listActorsByProject(projectId).then((actors) =>
      actors.find((item) => item.id === result.rows[0].id) ?? mapProjectActorRow(result.rows[0]),
    );
  }

  async updateActor(
    projectId: string,
    actorId: string,
    input: ProjectActorWriteInput,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const current = await this.findActorRecord(projectId, actorId);
    if (!current) {
      throw new NotFoundException('Actor not found');
    }

    const nextDisplayName =
      input.displayName === undefined ? current.display_name : input.displayName.trim();
    if (!nextDisplayName) {
      throw new BadRequestException('displayName es requerido');
    }

    if (input.institutionId) {
      await this.ensureRecordExists(
        'core.institutions',
        input.institutionId,
        'La institución no existe.',
      );
    }

    await this.postgresService.query(
      `
        UPDATE core.project_actors
        SET
          actor_type = CASE WHEN $3 THEN $4 ELSE actor_type END,
          institution_id = CASE WHEN $5 THEN $6::uuid ELSE institution_id END,
          display_name = CASE WHEN $7 THEN $8 ELSE display_name END,
          role_label = CASE WHEN $9 THEN $10 ELSE role_label END,
          status = CASE WHEN $11 THEN $12 ELSE status END,
          updated_at = NOW()
        WHERE id = $1::uuid
          AND project_id = $2::uuid
      `,
      [
        actorId,
        projectId,
        input.actorType !== undefined,
        normalizeActorType(input.actorType),
        input.institutionId !== undefined,
        input.institutionId ?? null,
        input.displayName !== undefined,
        nextDisplayName,
        input.roleLabel !== undefined,
        normalizeOptionalText(input.roleLabel),
        input.status !== undefined,
        normalizeActiveStatus(input.status),
      ],
    );

    await this.recordAudit(
      actorEmail,
      'project.actor.updated',
      projectId,
      {
        actorId,
        previousActorType: current.actor_type,
        nextActorType: input.actorType ?? current.actor_type,
        displayName: nextDisplayName,
      },
      project.egiId ?? null,
    );

    return this.listActorsByProject(projectId).then((actors) => {
      const updated = actors.find((item) => item.id === actorId);
      if (!updated) {
        throw new NotFoundException('Actor not found');
      }
      return updated;
    });
  }

  async deleteActor(
    projectId: string,
    actorId: string,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const current = await this.findActorRecord(projectId, actorId);
    if (!current) {
      throw new NotFoundException('Actor not found');
    }

    await this.postgresService.query(
      `
        DELETE FROM core.project_actors
        WHERE id = $1::uuid
          AND project_id = $2::uuid
      `,
      [actorId, projectId],
    );

    await this.recordAudit(
      actorEmail,
      'project.actor.deleted',
      projectId,
      {
        actorId,
        displayName: current.display_name,
        actorType: current.actor_type,
      },
      project.egiId ?? null,
    );

    return { deleted: true, id: actorId };
  }

  async createMilestone(
    projectId: string,
    input: ProjectMilestoneWriteInput,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException('title es requerido');
    }

    const result = await this.postgresService.query<ProjectMilestoneRow>(
      `
        INSERT INTO core.project_milestones (
          project_id,
          activity_code,
          title,
          description,
          due_date,
          completed_at,
          status,
          progress_pct
        )
        VALUES ($1::uuid, $2, $3, $4, $5::date, $6::date, $7, $8)
        RETURNING
          id,
          project_id,
          activity_code,
          title,
          description,
          due_date,
          completed_at,
          status,
          progress_pct,
          created_at,
          updated_at
      `,
      [
        projectId,
        normalizeOptionalText(input.activityCode),
        title,
        normalizeOptionalText(input.description),
        normalizeOptionalText(input.dueDate),
        normalizeOptionalText(input.completedAt),
        normalizeMilestoneStatus(input.status),
        normalizeProgress(input.progressPct),
      ],
    );

    await this.recordAudit(
      actorEmail,
      'project.milestone.created',
      projectId,
      {
        milestoneId: result.rows[0].id,
        title,
        status: result.rows[0].status,
      },
      project.egiId ?? null,
    );

    return mapProjectMilestoneRow(result.rows[0]);
  }

  async updateMilestone(
    projectId: string,
    milestoneId: string,
    input: ProjectMilestoneWriteInput,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const current = await this.findMilestoneRecord(projectId, milestoneId);
    if (!current) {
      throw new NotFoundException('Milestone not found');
    }

    const nextTitle = input.title === undefined ? current.title : input.title.trim();
    if (!nextTitle) {
      throw new BadRequestException('title es requerido');
    }

    const result = await this.postgresService.query<ProjectMilestoneRow>(
      `
        UPDATE core.project_milestones
        SET
          activity_code = CASE WHEN $3 THEN $4 ELSE activity_code END,
          title = CASE WHEN $5 THEN $6 ELSE title END,
          description = CASE WHEN $7 THEN $8 ELSE description END,
          due_date = CASE WHEN $9 THEN $10::date ELSE due_date END,
          completed_at = CASE WHEN $11 THEN $12::date ELSE completed_at END,
          status = CASE WHEN $13 THEN $14 ELSE status END,
          progress_pct = CASE WHEN $15 THEN $16 ELSE progress_pct END,
          updated_at = NOW()
        WHERE id = $1::uuid
          AND project_id = $2::uuid
        RETURNING
          id,
          project_id,
          activity_code,
          title,
          description,
          due_date,
          completed_at,
          status,
          progress_pct,
          created_at,
          updated_at
      `,
      [
        milestoneId,
        projectId,
        input.activityCode !== undefined,
        normalizeOptionalText(input.activityCode),
        input.title !== undefined,
        nextTitle,
        input.description !== undefined,
        normalizeOptionalText(input.description),
        input.dueDate !== undefined,
        normalizeOptionalText(input.dueDate),
        input.completedAt !== undefined,
        normalizeOptionalText(input.completedAt),
        input.status !== undefined,
        normalizeMilestoneStatus(input.status),
        input.progressPct !== undefined,
        normalizeProgress(input.progressPct),
      ],
    );

    await this.recordAudit(
      actorEmail,
      'project.milestone.updated',
      projectId,
      {
        milestoneId,
        previousStatus: current.status,
        nextStatus: result.rows[0].status,
        title: result.rows[0].title,
      },
      project.egiId ?? null,
    );

    return mapProjectMilestoneRow(result.rows[0]);
  }

  async deleteMilestone(
    projectId: string,
    milestoneId: string,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const current = await this.findMilestoneRecord(projectId, milestoneId);
    if (!current) {
      throw new NotFoundException('Milestone not found');
    }

    await this.postgresService.query(
      `
        DELETE FROM core.project_milestones
        WHERE id = $1::uuid
          AND project_id = $2::uuid
      `,
      [milestoneId, projectId],
    );

    await this.recordAudit(
      actorEmail,
      'project.milestone.deleted',
      projectId,
      {
        milestoneId,
        title: current.title,
      },
      project.egiId ?? null,
    );

    return { deleted: true, id: milestoneId };
  }

  async createDeliverable(
    projectId: string,
    input: ProjectDeliverableWriteInput,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException('title es requerido');
    }

    const code = normalizeOptionalText(input.code) ?? buildProjectScopedCode(project.code ?? project.id, title);
    const deliverableType = normalizeOptionalText(input.deliverableType) ?? 'report';

    const result = await this.postgresService.query<ProjectDeliverableRow>(
      `
        INSERT INTO core.project_deliverables (
          project_id,
          code,
          title,
          deliverable_type,
          description,
          status,
          due_date,
          published_at,
          output_url
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::date, $8::date, $9)
        RETURNING
          id,
          project_id,
          code,
          title,
          deliverable_type,
          description,
          status,
          due_date,
          published_at,
          output_url,
          created_at,
          updated_at
      `,
      [
        projectId,
        code,
        title,
        deliverableType,
        normalizeOptionalText(input.description),
        normalizeDeliverableStatus(input.status),
        normalizeOptionalText(input.dueDate),
        normalizeOptionalText(input.publishedAt),
        normalizeOptionalText(input.outputUrl),
      ],
    );

    await this.recordAudit(
      actorEmail,
      'project.deliverable.created',
      projectId,
      {
        deliverableId: result.rows[0].id,
        code,
        title,
        status: result.rows[0].status,
      },
      project.egiId ?? null,
    );

    return mapProjectDeliverableRow(result.rows[0]);
  }

  async updateDeliverable(
    projectId: string,
    deliverableId: string,
    input: ProjectDeliverableWriteInput,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const current = await this.findDeliverableRecord(projectId, deliverableId);
    if (!current) {
      throw new NotFoundException('Deliverable not found');
    }

    const nextTitle = input.title === undefined ? current.title : input.title.trim();
    if (!nextTitle) {
      throw new BadRequestException('title es requerido');
    }

    const result = await this.postgresService.query<ProjectDeliverableRow>(
      `
        UPDATE core.project_deliverables
        SET
          code = CASE WHEN $3 THEN $4 ELSE code END,
          title = CASE WHEN $5 THEN $6 ELSE title END,
          deliverable_type = CASE WHEN $7 THEN $8 ELSE deliverable_type END,
          description = CASE WHEN $9 THEN $10 ELSE description END,
          status = CASE WHEN $11 THEN $12 ELSE status END,
          due_date = CASE WHEN $13 THEN $14::date ELSE due_date END,
          published_at = CASE WHEN $15 THEN $16::date ELSE published_at END,
          output_url = CASE WHEN $17 THEN $18 ELSE output_url END,
          updated_at = NOW()
        WHERE id = $1::uuid
          AND project_id = $2::uuid
        RETURNING
          id,
          project_id,
          code,
          title,
          deliverable_type,
          description,
          status,
          due_date,
          published_at,
          output_url,
          created_at,
          updated_at
      `,
      [
        deliverableId,
        projectId,
        input.code !== undefined,
        normalizeOptionalText(input.code),
        input.title !== undefined,
        nextTitle,
        input.deliverableType !== undefined,
        normalizeOptionalText(input.deliverableType),
        input.description !== undefined,
        normalizeOptionalText(input.description),
        input.status !== undefined,
        normalizeDeliverableStatus(input.status),
        input.dueDate !== undefined,
        normalizeOptionalText(input.dueDate),
        input.publishedAt !== undefined,
        normalizeOptionalText(input.publishedAt),
        input.outputUrl !== undefined,
        normalizeOptionalText(input.outputUrl),
      ],
    );

    await this.recordAudit(
      actorEmail,
      'project.deliverable.updated',
      projectId,
      {
        deliverableId,
        previousStatus: current.status,
        nextStatus: result.rows[0].status,
        title: result.rows[0].title,
      },
      project.egiId ?? null,
    );

    return mapProjectDeliverableRow(result.rows[0]);
  }

  async deleteDeliverable(
    projectId: string,
    deliverableId: string,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const current = await this.findDeliverableRecord(projectId, deliverableId);
    if (!current) {
      throw new NotFoundException('Deliverable not found');
    }

    await this.postgresService.query(
      `
        DELETE FROM core.project_deliverables
        WHERE id = $1::uuid
          AND project_id = $2::uuid
      `,
      [deliverableId, projectId],
    );

    await this.recordAudit(
      actorEmail,
      'project.deliverable.deleted',
      projectId,
      {
        deliverableId,
        code: current.code,
        title: current.title,
      },
      project.egiId ?? null,
    );

    return { deleted: true, id: deliverableId };
  }

  async listActorsByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectActorRow>(
      `
        SELECT
          pa.id,
          pa.project_id,
          pa.actor_type,
          pa.institution_id,
          i.name AS institution_name,
          pa.display_name,
          pa.role_label,
          pa.status,
          pa.created_at,
          pa.updated_at
        FROM core.project_actors pa
        LEFT JOIN core.institutions i ON i.id = pa.institution_id
        WHERE pa.project_id = $1::uuid
        ORDER BY
          CASE pa.actor_type
            WHEN 'leader' THEN 1
            WHEN 'responsible' THEN 2
            WHEN 'partner' THEN 3
            WHEN 'approver' THEN 4
            ELSE 5
          END,
          pa.display_name ASC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      actorType: row.actor_type,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      displayName: row.display_name,
      roleLabel: row.role_label,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async listMilestonesByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectMilestoneRow>(
      `
        SELECT
          id,
          project_id,
          activity_code,
          title,
          description,
          due_date,
          completed_at,
          status,
          progress_pct,
          created_at,
          updated_at
        FROM core.project_milestones
        WHERE project_id = $1::uuid
        ORDER BY due_date NULLS LAST, created_at ASC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      activityCode: row.activity_code,
      title: row.title,
      description: row.description,
      dueDate: row.due_date ? row.due_date.toISOString().slice(0, 10) : null,
      completedAt: row.completed_at ? row.completed_at.toISOString().slice(0, 10) : null,
      status: row.status,
      progressPct: row.progress_pct ? Number(row.progress_pct) : 0,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async listIndicatorsByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectIndicatorRow>(
      `
        SELECT
          id,
          project_id,
          indicator_code,
          indicator_name,
          unit,
          value_numeric,
          value_text,
          category,
          observed_at,
          baseline_value,
          target_value,
          created_at,
          updated_at
        FROM core.project_indicators
        WHERE project_id = $1::uuid
        ORDER BY observed_at DESC, indicator_code ASC
      `,
      [projectId],
    );

    return result.rows.map((row) => {
      const value = row.value_numeric ? Number(row.value_numeric) : null;
      const baseline = row.baseline_value ? Number(row.baseline_value) : null;
      const target = row.target_value ? Number(row.target_value) : null;
      const progressPct =
        target && target > 0 && value !== null ? Math.min(100, Math.round((value / target) * 100)) : null;

      return {
        id: row.id,
        projectId: row.project_id,
        indicatorCode: row.indicator_code,
        indicatorName: row.indicator_name,
        unit: row.unit,
        valueNumeric: value,
        valueText: row.value_text,
        category: row.category,
        observedAt: row.observed_at ? row.observed_at.toISOString().slice(0, 10) : null,
        baselineValue: baseline,
        targetValue: target,
        progressPct,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  async listTerritoriesByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectTerritoryRow>(
      `
        SELECT
          pt.id,
          pt.project_id,
          pt.territory_id,
          pt.territory_code,
          COALESCE(t.name, pt.territory_name) AS territory_name,
          COALESCE(t.level, 'custom') AS territory_level,
          pt.country,
          pt.area_ha,
          pt.created_at,
          pt.updated_at
        FROM core.project_territories pt
        LEFT JOIN core.territories t ON t.id = pt.territory_id
        WHERE pt.project_id = $1::uuid
        ORDER BY pt.area_ha DESC, territory_name ASC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      territoryId: row.territory_id,
      territoryCode: row.territory_code,
      territoryName: row.territory_name,
      level: row.territory_level,
      country: row.country,
      areaHa: Number(row.area_ha),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async getEditablePolygon(projectId: string, egiId?: string | null) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      return null;
    }

    const result = await this.postgresService.query<ProjectPolygonRow>(
      `
        SELECT
          pt.id AS project_territory_id,
          pt.territory_id,
          pt.territory_code,
          COALESCE(t.name, pt.territory_name) AS territory_name,
          pt.country,
          pt.area_ha,
          ST_AsGeoJSON(tf.geometry)::jsonb AS geojson
        FROM core.project_territories pt
        JOIN core.territories t ON t.id = pt.territory_id
        JOIN gis.territory_features tf ON tf.territory_id = t.id
        JOIN gis.geo_layers gl ON gl.id = tf.layer_id
        WHERE pt.project_id = $1::uuid
          AND gl.code = 'project_polygons'
        ORDER BY pt.updated_at DESC, pt.created_at DESC
        LIMIT 1
      `,
      [projectId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      projectTerritoryId: row.project_territory_id,
      territoryId: row.territory_id,
      territoryCode: row.territory_code,
      territoryName: row.territory_name,
      country: row.country,
      areaHa: Number(row.area_ha),
      geojson: row.geojson,
    };
  }

  async upsertEditablePolygon(
    projectId: string,
    input: ProjectPolygonWriteInput,
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const project = await this.findProjectRecord(projectId, true, egiId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const geojson = input.geojson;
    if (!geojson || typeof geojson !== 'object') {
      throw new BadRequestException('geojson es requerido.');
    }

    const geometryType = String((geojson as { type?: unknown }).type ?? '').trim();
    if (!['Polygon', 'MultiPolygon'].includes(geometryType)) {
      throw new BadRequestException('El polígono debe ser GeoJSON tipo Polygon o MultiPolygon.');
    }

    const layerResult = await this.postgresService.query<{ id: string }>(
      `
        INSERT INTO gis.geo_layers (code, name, layer_type, visibility, status)
        VALUES ('project_polygons', 'Project Polygons', 'project-polygon', 'public', 'published')
        ON CONFLICT (code)
        DO UPDATE SET
          -- V2-02: no se re-fuerza visibility/status; la exposición de cada polígono la decide
          -- gis.project_geometry_is_public() según la visibilidad del proyecto.
          name = EXCLUDED.name,
          layer_type = EXCLUDED.layer_type,
          updated_at = NOW()
        RETURNING id
      `,
    );
    const layerId = layerResult.rows[0].id;

    const polygonText = JSON.stringify(geojson);
    const areaResult = await this.postgresService.query<{ area_ha: string }>(
      `
        SELECT
          COALESCE(
            ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) / 10000,
            0
          )::text AS area_ha
      `,
      [polygonText],
    );
    const areaHa = Number(areaResult.rows[0]?.area_ha ?? 0);
    const territoryName =
      normalizeOptionalText(input.territoryName) ??
      project.title;
    const country = normalizeOptionalText(input.country) ?? 'Costa Rica';
    const territoryCode = `project-${project.code ?? project.id}-polygon`;
    const existing = await this.getEditablePolygon(projectId);

    if (existing) {
      await this.postgresService.query(
        `
          UPDATE core.territories
          SET
            code = $2,
            name = $3,
            level = 'custom',
            status = 'inactive',
            updated_at = NOW()
          WHERE id = $1::uuid
        `,
        [existing.territoryId, territoryCode, territoryName],
      );
      await this.postgresService.query(
        `
          UPDATE core.project_territories
          SET
            territory_code = $2,
            territory_name = $3,
            country = $4,
            area_ha = $5,
            updated_at = NOW()
          WHERE id = $1::uuid
        `,
        [existing.projectTerritoryId, territoryCode, territoryName, country, areaHa],
      );
      await this.postgresService.query(
        `
          UPDATE gis.territory_features
          SET
            layer_id = $2::uuid,
            area_ha = $3,
            geometry = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)),
            properties_json = $5::jsonb,
            updated_at = NOW()
          WHERE territory_id = $1::uuid
        `,
        [
          existing.territoryId,
          layerId,
          areaHa,
          polygonText,
          JSON.stringify({
            projectId,
            projectCode: project.code,
            projectTitle: project.title,
            territoryCode,
            territoryName,
            country,
          }),
        ],
      );
    } else {
      const territoryResult = await this.postgresService.query<{ id: string }>(
        `
          INSERT INTO core.territories (code, name, level, status)
          VALUES ($1, $2, 'custom', 'inactive')
          RETURNING id
        `,
        [territoryCode, territoryName],
      );
      const territoryId = territoryResult.rows[0].id;
      await this.postgresService.query(
        `
          INSERT INTO core.project_territories (
            project_id,
            territory_id,
            territory_code,
            territory_name,
            country,
            area_ha
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
        `,
        [projectId, territoryId, territoryCode, territoryName, country, areaHa],
      );
      await this.postgresService.query(
        `
          INSERT INTO gis.territory_features (
            territory_id,
            layer_id,
            area_ha,
            geometry,
            properties_json
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)),
            $5::jsonb
          )
        `,
        [
          territoryId,
          layerId,
          areaHa,
          polygonText,
          JSON.stringify({
            projectId,
            projectCode: project.code,
            projectTitle: project.title,
            territoryCode,
            territoryName,
            country,
          }),
        ],
      );
    }

    await this.recordAudit(actorEmail, 'project.polygon.updated', projectId, {
      territoryCode,
      territoryName,
      country,
      areaHa,
      geometryType,
    }, project.egiId ?? null);

    return this.getEditablePolygon(projectId, project.egiId ?? null);
  }

  async listDeliverablesByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectDeliverableRow>(
      `
        SELECT
          id,
          project_id,
          code,
          title,
          deliverable_type,
          description,
          status,
          due_date,
          published_at,
          output_url,
          created_at,
          updated_at
        FROM core.project_deliverables
        WHERE project_id = $1::uuid
        ORDER BY due_date NULLS LAST, created_at ASC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      code: row.code,
      title: row.title,
      deliverableType: row.deliverable_type,
      description: row.description,
      status: row.status,
      dueDate: row.due_date ? row.due_date.toISOString().slice(0, 10) : null,
      publishedAt: row.published_at ? row.published_at.toISOString().slice(0, 10) : null,
      outputUrl: row.output_url,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async listDocumentsByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectDocumentRow>(
      `
        SELECT
          id,
          project_id,
          code,
          title,
          document_type,
          file_url,
          status,
          created_at,
          updated_at
        FROM core.project_documents
        WHERE project_id = $1::uuid
        ORDER BY created_at DESC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      code: row.code,
      title: row.title,
      documentType: row.document_type,
      fileUrl: row.file_url,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async listDatasetsByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectDatasetRow>(
      `
        SELECT
          pd.id,
          pd.project_id,
          pd.dataset_id,
          d.title AS dataset_title,
          d.status AS dataset_status,
          dv.id AS latest_version_id,
          pd.relationship_type,
          pd.validation_status,
          pd.evidence_note,
          pd.created_at,
          pd.updated_at
        FROM core.project_datasets pd
        JOIN core.datasets d ON d.id = pd.dataset_id
        LEFT JOIN LATERAL (
          SELECT id
          FROM core.dataset_versions
          WHERE dataset_id = d.id
          ORDER BY version_number DESC, created_at DESC
          LIMIT 1
        ) dv ON TRUE
        WHERE pd.project_id = $1::uuid
        ORDER BY pd.created_at DESC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      datasetId: row.dataset_id,
      datasetTitle: row.dataset_title,
      datasetStatus: row.dataset_status,
      latestVersionId: row.latest_version_id,
      relationshipType: row.relationship_type,
      validationStatus: row.validation_status,
      evidenceNote: row.evidence_note,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async listIncidentsByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectIncidentRow>(
      `
        SELECT
          id,
          title,
          severity,
          status,
          notes,
          created_at,
          updated_at
        FROM core.incidents
        WHERE project_id = $1::uuid
        ORDER BY created_at DESC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      severity: row.severity,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async listAuditByProject(projectId: string) {
    const result = await this.postgresService.query<ProjectAuditRow>(
      `
        SELECT *
        FROM (
          SELECT
          ae.id,
          ae.egi_id,
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
          WHERE ae.entity_type = 'project'
            AND ae.entity_id = $1::uuid

          UNION ALL

          SELECT
            fa.id,
            fa.egi_id,
            fa.user_id AS actor_user_id,
            u.email AS actor_email,
            CASE fa.event_type
              WHEN 'FILE_UPLOADED' THEN 'file.uploaded'
              WHEN 'FILE_METADATA_UPDATED' THEN 'file.metadata.updated'
              WHEN 'FILE_VERSION_CREATED' THEN 'file.version.created'
              WHEN 'FILE_LINKED' THEN 'file.linked'
              WHEN 'FILE_UNLINKED' THEN 'file.unlinked'
              WHEN 'FILE_DELETED' THEN 'file.deleted'
              ELSE LOWER(fa.event_type)
            END AS action,
            'document' AS entity_type,
            fa.file_id AS entity_id,
            'files' AS source,
            'success' AS result,
            jsonb_build_object(
              'fileId', fa.file_id,
              'folderId', fa.folder_id,
              'documentEvent', fa.event_type,
              'fileName', COALESCE(df.title, df.name)
            ) || COALESCE(fa.details, '{}'::jsonb) AS details_json,
            fa.created_at
          FROM documents.file_audit_events fa
          LEFT JOIN core.users u ON u.id = fa.user_id
          LEFT JOIN documents.files df ON df.id = fa.file_id
          WHERE fa.file_id IS NOT NULL
            AND fa.event_type IN (
              'FILE_UPLOADED',
              'FILE_METADATA_UPDATED',
              'FILE_VERSION_CREATED',
              'FILE_LINKED',
              'FILE_UNLINKED',
              'FILE_DELETED'
            )
            AND (
              df.project_id = $1::uuid
              OR EXISTS (
                SELECT 1
                FROM documents.file_entity_links fel
                WHERE fel.file_id = fa.file_id
                  AND fel.entity_type = 'project'
                  AND fel.entity_id = $1::uuid
              )
            )
        ) audit_stream
        ORDER BY created_at DESC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      egiId: row.egi_id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      source: row.source,
      result: row.result,
      details: row.details_json,
      createdAt: row.created_at.toISOString(),
    }));
  }

  private async findProjectRecord(id: string, includeInternal: boolean, egiId?: string | null) {
    const result = await this.postgresService.query<ProjectRow>(
      `
        SELECT
          p.id,
          p.egi_id,
          p.dataset_id,
          p.institution_id,
          p.portfolio_id,
          p.code,
          p.title,
          p.objective,
          p.summary,
          p.description,
          p.theme,
          p.priority,
          p.visibility,
          p.status,
          p.start_date,
          p.end_date,
          p.progress_pct,
          p.featured,
          p.financial_management_mode,
          p.financial_base_currency,
          p.actual_end_date,
          p.area_ha,
          p.created_at,
          p.updated_at,
          i.name AS institution_name,
          pf.name AS portfolio_name,
          (
            SELECT COUNT(*)::int
            FROM core.project_indicators pi
            WHERE pi.project_id = p.id
          ) AS indicator_count,
          (
            SELECT COUNT(*)::int
            FROM core.project_territories pt
            WHERE pt.project_id = p.id
          ) AS territory_count,
          (
            SELECT COUNT(*)::int
            FROM core.project_deliverables pd
            WHERE pd.project_id = p.id
          ) AS deliverable_count,
          (
            SELECT COUNT(*)::int
            FROM core.incidents ci
            WHERE ci.project_id = p.id
          ) AS incident_count
        FROM core.projects p
        LEFT JOIN core.institutions i ON i.id = p.institution_id
        LEFT JOIN core.project_portfolios pf ON pf.id = p.portfolio_id
        WHERE p.id = $1::uuid
          AND ($2::uuid IS NULL OR p.egi_id = $2::uuid)
          ${includeInternal ? '' : "AND p.visibility = 'public'"}
      `,
      [id, egiId ?? null],
    );

    return result.rows[0] ? mapProjectRow(result.rows[0]) : null;
  }

  private async findMilestoneRecord(projectId: string, milestoneId: string) {
    const result = await this.postgresService.query<ProjectMilestoneRow>(
      `
        SELECT
          id,
          project_id,
          activity_code,
          title,
          description,
          due_date,
          completed_at,
          status,
          progress_pct,
          created_at,
          updated_at
        FROM core.project_milestones
        WHERE id = $1::uuid
          AND project_id = $2::uuid
        LIMIT 1
      `,
      [milestoneId, projectId],
    );

    return result.rows[0] ?? null;
  }

  private async findActorRecord(projectId: string, actorId: string) {
    const result = await this.postgresService.query<ProjectActorRow>(
      `
        SELECT
          pa.id,
          pa.project_id,
          pa.actor_type,
          pa.institution_id,
          i.name AS institution_name,
          pa.display_name,
          pa.role_label,
          pa.status,
          pa.created_at,
          pa.updated_at
        FROM core.project_actors pa
        LEFT JOIN core.institutions i ON i.id = pa.institution_id
        WHERE pa.id = $1::uuid
          AND pa.project_id = $2::uuid
        LIMIT 1
      `,
      [actorId, projectId],
    );

    return result.rows[0] ?? null;
  }

  private async findDeliverableRecord(projectId: string, deliverableId: string) {
    const result = await this.postgresService.query<ProjectDeliverableRow>(
      `
        SELECT
          id,
          project_id,
          code,
          title,
          deliverable_type,
          description,
          status,
          due_date,
          published_at,
          output_url,
          created_at,
          updated_at
        FROM core.project_deliverables
        WHERE id = $1::uuid
          AND project_id = $2::uuid
        LIMIT 1
      `,
      [deliverableId, projectId],
    );

    return result.rows[0] ?? null;
  }

  private async getProjectPortfolio(portfolioId: string | null, includeInternal = true) {
    if (!portfolioId) {
      return null;
    }

    const result = await this.postgresService.query<ProjectPortfolioRow>(
      `
        SELECT
          pf.id,
          pf.code,
          pf.name,
          pf.description,
          pf.objective,
          pf.status,
          pf.visibility,
          pf.priority_label,
          pf.created_at,
          pf.updated_at,
          COUNT(p.id)::int AS project_count,
          COUNT(*) FILTER (WHERE p.status = 'active')::int AS active_project_count,
          COUNT(*) FILTER (WHERE p.status = 'published')::int AS published_project_count,
          COALESCE(SUM(p.area_ha), 0)::numeric AS total_area_ha
        FROM core.project_portfolios pf
        LEFT JOIN core.projects p
          ON p.portfolio_id = pf.id
          ${includeInternal ? '' : "AND p.visibility = 'public'"}
        WHERE pf.id = $1::uuid
        GROUP BY pf.id
      `,
      [portfolioId],
    );

    return result.rows[0] ? mapPortfolioRow(result.rows[0]) : null;
  }

  private async ensureProjectCodeAvailable(code: string | null | undefined, id: string | null) {
    if (!code) {
      return;
    }

    const result = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.projects
        WHERE LOWER(code) = LOWER($1)
          AND ($2::uuid IS NULL OR id <> $2::uuid)
        LIMIT 1
      `,
      [code, id],
    );

    if (result.rows.length > 0) {
      throw new ConflictException(`Ya existe un proyecto con el código ${code}.`);
    }
  }

  private async recordAudit(
    actorEmail: string | null,
    action: string,
    projectId: string,
    details: Record<string, unknown>,
    egiId: string | null,
  ) {
    const actorUserId = await this.resolveActorUserId(actorEmail);
    await this.postgresService.query(
      `
        INSERT INTO core.audit_events (
          actor_user_id,
          egi_id,
          action,
          entity_type,
          entity_id,
          source,
          result,
          details_json
        )
        VALUES ($1, $2::uuid, $3, 'project', $4::uuid, 'api', 'success', $5::jsonb)
      `,
      [actorUserId, egiId, action, projectId, JSON.stringify(details)],
    );
  }

  private async resolveActorUserId(actorEmail: string | null) {
    if (!actorEmail) {
      return null;
    }

    const result = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.users
        WHERE email = $1
      `,
      [actorEmail],
    );

    return result.rows[0]?.id ?? null;
  }

  private async validateProjectWriteInput(input: {
    egiId?: string | null;
    institutionId?: string | null;
    portfolioId?: string | null;
    datasetId?: string | null;
    priority?: string | null;
    visibility?: string | null;
    status?: string;
    progressPct?: number | null;
    featured?: boolean;
  }) {
    const institutionId = input.institutionId?.trim();
    if (!institutionId) {
      throw new BadRequestException('institutionId es requerido');
    }

    await this.ensureRecordExists('core.institutions', institutionId, 'La institución no existe.');

    const visibility = normalizeProjectVisibility(input.visibility);
    const status = normalizeProjectStatus(input.status);
    normalizeProjectPriority(input.priority);
    normalizeProgress(input.progressPct);

    if (input.datasetId) {
      const result = await this.postgresService.query<{ id: string }>(
        `
          SELECT id
          FROM core.datasets
          WHERE id = $1::uuid
            AND ($2::uuid IS NULL OR egi_id = $2::uuid)
          LIMIT 1
        `,
        [input.datasetId, input.egiId ?? null],
      );
      if (result.rows.length === 0) {
        throw new BadRequestException('El dataset asociado no existe dentro del EGI activo.');
      }
    }

    let portfolioVisibility: string | null = null;
    if (input.portfolioId) {
      portfolioVisibility = await this.ensurePortfolioExists(input.portfolioId);
    }

    if (status === 'published' && visibility !== 'public') {
      throw new BadRequestException('Un proyecto publicado debe tener visibilidad pública.');
    }

    if (input.featured && visibility !== 'public') {
      throw new BadRequestException('Solo los proyectos públicos pueden marcarse como destacados.');
    }

    if (portfolioVisibility === 'internal' && visibility === 'public') {
      throw new BadRequestException(
        'Un proyecto público no puede asociarse a un portafolio interno.',
      );
    }
  }

  private async ensurePortfolioExists(id: string) {
    const result = await this.postgresService.query<{ visibility: string }>(
      `
        SELECT visibility
        FROM core.project_portfolios
        WHERE id = $1::uuid
      `,
      [id],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException('El portafolio seleccionado no existe.');
    }

    return result.rows[0].visibility;
  }

  private async ensureRecordExists(tableName: string, id: string, message: string) {
    const result = await this.postgresService.query<{ id: string }>(
      `SELECT id FROM ${tableName} WHERE id = $1::uuid LIMIT 1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException(message);
    }
  }
}

type ProjectRow = {
  id: string;
  egi_id: string | null;
  dataset_id: string | null;
  institution_id: string;
  portfolio_id: string | null;
  code: string | null;
  title: string;
  objective: string | null;
  summary: string | null;
  description: string | null;
  theme: string | null;
  priority: string;
  visibility: string;
  status: string;
  start_date: Date | null;
  end_date: Date | null;
  progress_pct: string | number | null;
  featured: boolean;
  financial_management_mode: string;
  financial_base_currency: string | null;
  actual_end_date: Date | null;
  area_ha: string | null;
  created_at: Date;
  updated_at: Date;
  institution_name: string | null;
  portfolio_name: string | null;
  indicator_count: number;
  territory_count: number;
  deliverable_count: number;
  incident_count: number;
};

type ProjectFinancialSettingsRow = {
  financial_management_mode: string;
  financial_base_currency: string | null;
  financial_source_system: string | null;
  external_project_code: string | null;
  external_financial_url: string | null;
  financial_data_source: string | null;
  financial_update_method: string | null;
  financial_sync_status: string | null;
  financial_data_cutoff_date: Date | null;
  financial_data_last_updated_at: Date | null;
  external_budget_amount: string | number | null;
  external_committed_amount: string | number | null;
  external_executed_amount: string | number | null;
  external_available_amount: string | number | null;
  actual_end_date: Date | null;
  closure_summary: string | null;
  lessons_learned: string | null;
};

type ProjectFundingSourceRow = { id:string;project_id:string;code:string;name:string;source_type:string;funder:string|null;currency:string;approved_amount:string|number|null;received_amount:string|number|null;valid_from:Date|null;valid_to:Date|null;restrictions:string|null;observations:string|null;status:string;created_at:Date;updated_at:Date };
type ProjectBudgetVersionRow = { id:string;project_id:string;version_number:number;name:string;reason:string|null;status:string;effective_date:Date;total_amount:string|number;change_amount:string|number;approval_notes:string|null;approved_at:Date|null;created_at:Date;updated_at:Date };
type ProjectFinancialMovementRow = { id:string;project_id:string;budget_item_id:string|null;destination_budget_item_id:string|null;funding_source_id:string|null;task_id:string|null;movement_type:string;budget_effect:string;movement_date:Date;amount:string|number;currency:string;exchange_rate:string|number;base_amount:string|number;supplier_or_beneficiary:string|null;concept:string;external_reference:string|null;document_number:string|null;support_file_id:string|null;status:string;approved_at:Date|null;created_at:Date;updated_at:Date };
type ProjectManagementRecordRow = { id:string;project_id:string;record_type:string;code:string;title:string;description:string|null;status:string;priority:string;requester_actor_id:string|null;owner_actor_id:string|null;owner_name:string|null;approver_actor_id:string|null;requested_at:Date|null;decided_at:Date|null;due_date:Date|null;impact_scope:string|null;impact_schedule_days:number|null;impact_amount:string|number|null;previous_value_json:Record<string,unknown>|null;proposed_value_json:Record<string,unknown>|null;resolution:string|null;support_file_id:string|null;created_at:Date;updated_at:Date };
type ProjectStatusUpdateRow = { id:string;project_id:string;cutoff_date:Date;period_label:string;physical_progress_pct:string|number|null;financial_progress_pct:string|number|null;financial_data_mode:string|null;executive_summary:string;achievements:string|null;delays:string|null;main_risks:string|null;issues:string|null;decisions_required:string|null;next_steps:string|null;status:string;responsible_actor_id:string|null;responsible_name:string|null;approved_at:Date|null;created_at:Date;updated_at:Date };
type FinancialTotalsRow = { initial_budget:string|number;line_budget:string|number;adjustments:string|number;committed:string|number;executed:string|number };
type ProjectAlertFactsRow = { overdue_milestones:number;pending_documents:number;end_date:Date|null;progress_pct:string|number };

type ProjectPortfolioRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  objective: string | null;
  status: string;
  visibility: string;
  priority_label: string | null;
  created_at: Date;
  updated_at: Date;
  project_count: number;
  active_project_count: number;
  published_project_count: number;
  total_area_ha: string | null;
};

type PortfolioSummaryRow = {
  total_projects: number;
  active_projects: number;
  published_projects: number;
  featured_projects: number;
  total_area_ha: string | null;
};

type ProjectActorRow = {
  id: string;
  project_id: string;
  actor_type: string;
  institution_id: string | null;
  institution_name: string | null;
  display_name: string;
  role_label: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type ProjectMilestoneRow = {
  id: string;
  project_id: string;
  activity_code: string | null;
  title: string;
  description: string | null;
  due_date: Date | null;
  completed_at: Date | null;
  status: string;
  progress_pct: string | number | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectTaskRow = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  owner_actor_id: string | null;
  owner_name: string | null;
  task_type: 'phase' | 'activity' | 'task';
  code: string;
  title: string;
  description: string | null;
  start_date: Date | null;
  end_date: Date | null;
  status: 'planned' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
  progress_pct: string | number;
  weight: string | number;
  sort_order: number;
  predecessor_ids: string[];
  created_at: Date;
  updated_at: Date;
};

type ProjectBudgetItemRow = {
  id: string;
  project_id: string;
  task_id: string | null;
  code: string;
  category: string;
  name: string;
  funding_source: string | null;
  currency: string;
  planned_amount: string | number;
  committed_amount: string | number;
  actual_amount: string | number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectRiskRow = {
  id: string;
  project_id: string;
  owner_actor_id: string | null;
  owner_name: string | null;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  probability: number;
  impact: number;
  status: 'open' | 'monitoring' | 'mitigated' | 'closed' | 'accepted';
  response_strategy: 'avoid' | 'mitigate' | 'transfer' | 'accept';
  mitigation: string | null;
  review_date: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectIndicatorRow = {
  id: string;
  project_id: string;
  indicator_code: string;
  indicator_name: string | null;
  unit: string;
  value_numeric: string | null;
  value_text: string | null;
  category: string | null;
  observed_at: Date | null;
  baseline_value: string | null;
  target_value: string | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectTerritoryRow = {
  id: string;
  project_id: string;
  territory_id: string | null;
  territory_code: string;
  territory_name: string | null;
  territory_level: string | null;
  country: string;
  area_ha: string;
  created_at: Date;
  updated_at: Date;
};

type ProjectPolygonRow = {
  project_territory_id: string;
  territory_id: string;
  territory_code: string;
  territory_name: string | null;
  country: string;
  area_ha: string;
  geojson: Record<string, unknown>;
};

type ProjectDeliverableRow = {
  id: string;
  project_id: string;
  code: string;
  title: string;
  deliverable_type: string;
  description: string | null;
  status: string;
  due_date: Date | null;
  published_at: Date | null;
  output_url: string | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectDocumentRow = {
  id: string;
  project_id: string;
  code: string;
  title: string;
  document_type: string;
  file_url: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type ProjectDatasetRow = {
  id: string;
  project_id: string;
  dataset_id: string;
  dataset_title: string | null;
  dataset_status: string | null;
  latest_version_id: string | null;
  relationship_type: string;
  validation_status: string | null;
  evidence_note: string | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectIncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectAuditRow = {
  id: string;
  egi_id: string | null;
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

function mapProjectRow(row: ProjectRow) {
  return {
    id: row.id,
    egiId: row.egi_id,
    datasetId: row.dataset_id,
    institutionId: row.institution_id,
    portfolioId: row.portfolio_id,
    code: row.code,
    title: row.title,
    objective: row.objective,
    summary: row.summary,
    description: row.description,
    theme: row.theme,
    priority: row.priority,
    visibility: row.visibility,
    status: row.status,
    startDate: row.start_date ? row.start_date.toISOString().slice(0, 10) : null,
    endDate: row.end_date ? row.end_date.toISOString().slice(0, 10) : null,
    progressPct: row.progress_pct !== null ? Number(row.progress_pct) : null,
    featured: row.featured,
    financialManagementMode: row.financial_management_mode,
    financialBaseCurrency: row.financial_base_currency?.trim() ?? null,
    actualEndDate: row.actual_end_date ? row.actual_end_date.toISOString().slice(0, 10) : null,
    areaHa: row.area_ha ? Number(row.area_ha) : null,
    institutionName: row.institution_name,
    portfolioName: row.portfolio_name,
    indicatorCount: row.indicator_count,
    territoryCount: row.territory_count,
    deliverableCount: row.deliverable_count,
    incidentCount: row.incident_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function defaultFinancialSettings() {
  return { mode: 'none', baseCurrency: null, sourceSystem: null, externalProjectCode: null, externalUrl: null, dataSource: null, updateMethod: null, syncStatus: null, dataCutoffDate: null, dataLastUpdatedAt: null, externalBudgetAmount: null, externalCommittedAmount: null, externalExecutedAmount: null, externalAvailableAmount: null, actualEndDate: null, closureSummary: null, lessonsLearned: null };
}
function mapFinancialSettings(row: ProjectFinancialSettingsRow) { return { mode: row.financial_management_mode, baseCurrency: row.financial_base_currency?.trim()??null, sourceSystem:row.financial_source_system,externalProjectCode:row.external_project_code,externalUrl:row.external_financial_url,dataSource:row.financial_data_source,updateMethod:row.financial_update_method,syncStatus:row.financial_sync_status,dataCutoffDate:row.financial_data_cutoff_date?.toISOString().slice(0,10)??null,dataLastUpdatedAt:row.financial_data_last_updated_at?.toISOString()??null,externalBudgetAmount:row.external_budget_amount===null?null:Number(row.external_budget_amount),externalCommittedAmount:row.external_committed_amount===null?null:Number(row.external_committed_amount),externalExecutedAmount:row.external_executed_amount===null?null:Number(row.external_executed_amount),externalAvailableAmount:row.external_available_amount===null?null:Number(row.external_available_amount),actualEndDate:row.actual_end_date?.toISOString().slice(0,10)??null,closureSummary:row.closure_summary,lessonsLearned:row.lessons_learned}; }
function mapFinancialSettingsFromProject(project:{financialManagementMode?:string|null;financialBaseCurrency?:string|null}) { return { ...defaultFinancialSettings(), mode:project.financialManagementMode??'none',baseCurrency:project.financialBaseCurrency??null }; }
function mapFundingSourceRow(row:ProjectFundingSourceRow){return{id:row.id,projectId:row.project_id,code:row.code,name:row.name,sourceType:row.source_type,funder:row.funder,currency:row.currency.trim(),approvedAmount:row.approved_amount===null?null:Number(row.approved_amount),receivedAmount:row.received_amount===null?null:Number(row.received_amount),validFrom:row.valid_from?.toISOString().slice(0,10)??null,validTo:row.valid_to?.toISOString().slice(0,10)??null,restrictions:row.restrictions,observations:row.observations,status:row.status,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()};}
function mapBudgetVersionRow(row:ProjectBudgetVersionRow){return{id:row.id,projectId:row.project_id,versionNumber:row.version_number,name:row.name,reason:row.reason,status:row.status,effectiveDate:row.effective_date.toISOString().slice(0,10),totalAmount:Number(row.total_amount),changeAmount:Number(row.change_amount),approvalNotes:row.approval_notes,approvedAt:row.approved_at?.toISOString()??null,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()};}
function mapFinancialMovementRow(row:ProjectFinancialMovementRow){return{id:row.id,projectId:row.project_id,budgetItemId:row.budget_item_id,destinationBudgetItemId:row.destination_budget_item_id,fundingSourceId:row.funding_source_id,taskId:row.task_id,movementType:row.movement_type,budgetEffect:row.budget_effect,movementDate:row.movement_date.toISOString().slice(0,10),amount:Number(row.amount),currency:row.currency.trim(),exchangeRate:Number(row.exchange_rate),baseAmount:Number(row.base_amount),supplierOrBeneficiary:row.supplier_or_beneficiary,concept:row.concept,externalReference:row.external_reference,documentNumber:row.document_number,supportFileId:row.support_file_id,status:row.status,approvedAt:row.approved_at?.toISOString()??null,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()};}
function mapManagementRecordRow(row:ProjectManagementRecordRow){return{id:row.id,projectId:row.project_id,recordType:row.record_type,code:row.code,title:row.title,description:row.description,status:row.status,priority:row.priority,requesterActorId:row.requester_actor_id,ownerActorId:row.owner_actor_id,ownerName:row.owner_name,approverActorId:row.approver_actor_id,requestedAt:row.requested_at?.toISOString().slice(0,10)??null,decidedAt:row.decided_at?.toISOString().slice(0,10)??null,dueDate:row.due_date?.toISOString().slice(0,10)??null,impactScope:row.impact_scope,impactScheduleDays:row.impact_schedule_days,impactAmount:row.impact_amount===null?null:Number(row.impact_amount),previousValue:row.previous_value_json,proposedValue:row.proposed_value_json,resolution:row.resolution,supportFileId:row.support_file_id,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()};}
function mapStatusUpdateRow(row:ProjectStatusUpdateRow){return{id:row.id,projectId:row.project_id,cutoffDate:row.cutoff_date.toISOString().slice(0,10),periodLabel:row.period_label,physicalProgressPct:row.physical_progress_pct===null?null:Number(row.physical_progress_pct),financialProgressPct:row.financial_progress_pct===null?null:Number(row.financial_progress_pct),financialDataMode:row.financial_data_mode,executiveSummary:row.executive_summary,achievements:row.achievements,delays:row.delays,mainRisks:row.main_risks,issues:row.issues,decisionsRequired:row.decisions_required,nextSteps:row.next_steps,status:row.status,responsibleActorId:row.responsible_actor_id,responsibleName:row.responsible_name,approvedAt:row.approved_at?.toISOString()??null,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()};}
function normalizeFinancialMode(value:string){if(['none','planning','execution','external'].includes(value))return value;throw new BadRequestException('financialManagementMode inválido');}
function optionalString(value:unknown){return typeof value==='string'&&value.trim()?value.trim():null;}
function requiredString(value:unknown,field:string){const result=optionalString(value);if(!result)throw new BadRequestException(`${field} es requerido`);return result;}
function normalizeNullableCurrency(value:unknown){const text=optionalString(value);return text?normalizeCurrency(text):null;}
function normalizeUpdateMethod(value:unknown){const text=optionalString(value);if(text===null)return null;if(['manual','api','connector'].includes(text))return text;throw new BadRequestException('updateMethod inválido');}
function nullableNumber(value:unknown,field:string){if(value===undefined||value===null||value==='')return null;const numeric=Number(value);if(!Number.isFinite(numeric))throw new BadRequestException(`${field} debe ser numérico`);return Number(numeric.toFixed(2));}
function nullableNonNegative(value:unknown,field:string){const numeric=nullableNumber(value,field);if(numeric!==null&&numeric<0)throw new BadRequestException(`${field} no puede ser negativo`);return numeric;}
function nullableProgress(value:unknown){if(value===undefined||value===null||value==='')return null;return normalizeProgress(Number(value));}
function normalizeApprovalStatus(value:unknown){const text=optionalString(value)??'draft';if(['draft','under_review','approved','rejected','closed'].includes(text))return text;throw new BadRequestException('status de aprobación inválido');}
function normalizeMovementType(value:unknown){const text=requiredString(value,'movementType');if(['allocation','commitment','accrual','payment','disbursement','adjustment','transfer'].includes(text))return text;throw new BadRequestException('movementType inválido');}
function normalizeBudgetEffect(value:unknown){const text=optionalString(value)??'neutral';if(['increase','decrease','neutral'].includes(text))return text;throw new BadRequestException('budgetEffect inválido');}
function normalizeManagementRecordType(value:unknown){const text=requiredString(value,'recordType');if(['issue','decision','change_request'].includes(text))return text;throw new BadRequestException('recordType inválido');}

function mapPortfolioRow(row: ProjectPortfolioRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    objective: row.objective,
    status: row.status,
    visibility: row.visibility,
    priorityLabel: row.priority_label,
    projectCount: row.project_count,
    activeProjectCount: row.active_project_count,
    publishedProjectCount: row.published_project_count,
    totalAreaHa: row.total_area_ha ? Number(row.total_area_ha) : 0,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function buildProjectListWhere(filters: ProjectListFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeInternal) {
    params.push('public');
    clauses.push(`p.visibility = $${params.length}`);
  }

  if (filters.egiId) {
    params.push(filters.egiId);
    clauses.push(`p.egi_id = $${params.length}::uuid`);
  }

  if (filters.statuses && filters.statuses.length > 0) {
    params.push(filters.statuses);
    clauses.push(`p.status = ANY($${params.length}::text[])`);
  }

  if (filters.institutionId) {
    params.push(filters.institutionId);
    clauses.push(`p.institution_id = $${params.length}::uuid`);
  }

  if (filters.portfolioId) {
    params.push(filters.portfolioId);
    clauses.push(`p.portfolio_id = $${params.length}::uuid`);
  }

  if (filters.featured !== undefined) {
    params.push(filters.featured);
    clauses.push(`p.featured = $${params.length}`);
  }

  if (filters.visibility) {
    params.push(normalizeProjectVisibility(filters.visibility));
    clauses.push(`p.visibility = $${params.length}`);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeProjectStatus(value: string | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (candidate === 'active' || candidate === 'completed' || candidate === 'published') {
    return candidate;
  }
  return 'draft';
}

function normalizeProjectPriority(value: string | null | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (candidate === 'critical' || candidate === 'high' || candidate === 'medium' || candidate === 'low') {
    return candidate;
  }
  return 'medium';
}

function normalizeProjectVisibility(value: string | null | undefined) {
  // Default seguro: cualquier valor ausente, vacío o no reconocido se trata como 'internal',
  // igual que el DEFAULT de la columna en infra/postgres/init/007_project_management_module.sql.
  // Solo 'public' explícito publica el proyecto.
  return value?.trim().toLowerCase() === 'public' ? 'public' : 'internal';
}

function normalizeActorType(value: string | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (
    candidate === 'leader' ||
    candidate === 'partner' ||
    candidate === 'responsible' ||
    candidate === 'approver'
  ) {
    return candidate;
  }
  return 'partner';
}

function normalizeActiveStatus(value: string | undefined) {
  return value?.trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

function normalizeMilestoneStatus(value: string | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (
    candidate === 'planned' ||
    candidate === 'in_progress' ||
    candidate === 'done' ||
    candidate === 'blocked'
  ) {
    return candidate;
  }
  return 'planned';
}

function normalizeTaskType(value: string | undefined) {
  return value === 'phase' || value === 'activity' ? value : 'task';
}

function normalizePlanningStatus(value: string | undefined) {
  return value === 'in_progress' || value === 'done' || value === 'blocked' || value === 'cancelled'
    ? value
    : 'planned';
}

function normalizeNonNegative(value: number | null | undefined, field: string) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) throw new BadRequestException(`${field} debe ser un número mayor o igual a cero`);
  return Number(numeric.toFixed(2));
}

function normalizeCurrency(value: string | undefined) {
  const currency = (value ?? 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('currency debe usar un código ISO de tres letras');
  return currency;
}

function normalizeRiskFactor(value: number | null | undefined, field: string) {
  const numeric = Math.trunc(Number(value ?? 1));
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) throw new BadRequestException(`${field} debe estar entre 1 y 5`);
  return numeric;
}

function normalizeRiskStatus(value: string | undefined) {
  return value === 'monitoring' || value === 'mitigated' || value === 'closed' || value === 'accepted' ? value : 'open';
}

function normalizeRiskStrategy(value: string | undefined) {
  return value === 'avoid' || value === 'transfer' || value === 'accept' ? value : 'mitigate';
}

function normalizeDeliverableStatus(value: string | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (
    candidate === 'planned' ||
    candidate === 'in_progress' ||
    candidate === 'published' ||
    candidate === 'completed'
  ) {
    return candidate;
  }
  return 'planned';
}

function normalizeProgress(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    throw new BadRequestException('progressPct debe ser numérico');
  }
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function normalizeArea(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value)) {
    throw new BadRequestException('areaHa debe ser numérico');
  }
  return Number(value.toFixed(2));
}

function buildProjectScopedCode(projectRef: string, title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${projectRef}-${normalized || 'deliverable'}`;
}

function mapProjectMilestoneRow(row: ProjectMilestoneRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    activityCode: row.activity_code,
    title: row.title,
    description: row.description,
    dueDate: row.due_date ? row.due_date.toISOString().slice(0, 10) : null,
    completedAt: row.completed_at ? row.completed_at.toISOString().slice(0, 10) : null,
    status: row.status,
    progressPct: row.progress_pct ? Number(row.progress_pct) : 0,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapProjectTaskRow(row: ProjectTaskRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    parentTaskId: row.parent_task_id,
    ownerActorId: row.owner_actor_id,
    ownerName: row.owner_name,
    taskType: row.task_type,
    code: row.code,
    title: row.title,
    description: row.description,
    startDate: row.start_date?.toISOString().slice(0, 10) ?? null,
    endDate: row.end_date?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    progressPct: Number(row.progress_pct),
    weight: Number(row.weight),
    sortOrder: row.sort_order,
    predecessorIds: row.predecessor_ids,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapProjectBudgetItemRow(row: ProjectBudgetItemRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    code: row.code,
    category: row.category,
    name: row.name,
    fundingSource: row.funding_source,
    currency: row.currency.trim(),
    plannedAmount: Number(row.planned_amount),
    committedAmount: Number(row.committed_amount),
    actualAmount: Number(row.actual_amount),
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapProjectRiskRow(row: ProjectRiskRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerActorId: row.owner_actor_id,
    ownerName: row.owner_name,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    probability: row.probability,
    impact: row.impact,
    score: row.probability * row.impact,
    status: row.status,
    responseStrategy: row.response_strategy,
    mitigation: row.mitigation,
    reviewDate: row.review_date?.toISOString().slice(0, 10) ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapProjectActorRow(row: ProjectActorRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    actorType: row.actor_type,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    displayName: row.display_name,
    roleLabel: row.role_label,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapProjectDeliverableRow(row: ProjectDeliverableRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    title: row.title,
    deliverableType: row.deliverable_type,
    description: row.description,
    status: row.status,
    dueDate: row.due_date ? row.due_date.toISOString().slice(0, 10) : null,
    publishedAt: row.published_at ? row.published_at.toISOString().slice(0, 10) : null,
    outputUrl: row.output_url,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
