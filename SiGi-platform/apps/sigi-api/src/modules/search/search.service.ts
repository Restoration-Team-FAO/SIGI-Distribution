import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';
import { AdminService } from '../admin/admin.service';
import type { AuthPrincipal } from '../auth/auth.types';

type SearchInput = {
  query: string;
  scope: 'active' | 'global';
  limit: number;
  requestedEgiId: string | null;
  principal: AuthPrincipal;
};

type SearchRow = {
  id: string;
  code: string | null;
  title: string;
  subtitle: string | null;
  status: string | null;
  updated_at: Date | string | null;
};

type GlobalSearchResultType = 'project' | 'indicator' | 'report' | 'file';
type GlobalSearchItem = {
  type: GlobalSearchResultType;
  id: string;
  code: string | null;
  title: string;
  subtitle: string | null;
  status: string | null;
  path: string;
  updatedAt: string | null;
};

const TYPE_LABELS: Record<GlobalSearchResultType, string> = {
  project: 'Proyectos',
  indicator: 'Indicadores',
  report: 'Informes',
  file: 'Documentos',
};

@Injectable()
export class SearchService {
  constructor(
    private readonly db: PostgresService,
    private readonly adminService: AdminService,
  ) {}

  async search(input: SearchInput) {
    const query = input.query.trim();
    if (query.length < 2) {
      throw new BadRequestException('La búsqueda requiere al menos 2 caracteres.');
    }
    if (query.length > 120) {
      throw new BadRequestException('La búsqueda no puede superar 120 caracteres.');
    }

    const egiId = await this.adminService.resolveAdminScopeEgiId(
      input.principal.subject,
      input.requestedEgiId,
      input.scope,
    );
    const permissions = new Set(input.principal.permissions);
    const tasks: Array<Promise<GlobalSearchItem[]>> = [];
    const availableTypes: GlobalSearchResultType[] = [];
    const omittedTypes: GlobalSearchResultType[] = [];

    if (permissions.has('projects.read')) {
      availableTypes.push('project');
      tasks.push(this.searchProjects(query, egiId, input.limit));
    }
    if (permissions.has('indicators.read')) {
      availableTypes.push('indicator');
      tasks.push(this.searchIndicators(query, egiId, input.limit));
    }
    if (permissions.has('reports.read')) {
      if (input.scope === 'active' && egiId) {
        availableTypes.push('report');
        tasks.push(this.searchReports(query, egiId, input.limit, input.principal));
      } else {
        omittedTypes.push('report');
      }
    }
    if (permissions.has('files.read')) {
      if (input.scope === 'active' && egiId) {
        availableTypes.push('file');
        tasks.push(this.searchFiles(query, egiId, input.limit));
      } else {
        omittedTypes.push('file');
      }
    }

    const items = (await Promise.all(tasks)).flat();
    const groups = availableTypes.map((type) => ({
      type,
      label: TYPE_LABELS[type],
      count: items.filter((item) => item.type === type).length,
    }));

    return { query, scope: input.scope, items, groups, omittedTypes };
  }

  private async searchProjects(query: string, egiId: string | null, limit: number) {
    const result = await this.db.query<SearchRow>(`
      SELECT p.id, p.code, p.title,
        COALESCE(i.name, p.theme, 'Proyecto') AS subtitle,
        p.status, p.updated_at
      FROM core.projects p
      LEFT JOIN core.institutions i ON i.id = p.institution_id
      WHERE ($1::uuid IS NULL OR p.egi_id = $1::uuid)
        AND CONCAT_WS(' ', p.code, p.title, p.objective, p.summary, p.description, p.theme, i.name)
          ILIKE '%' || $2::text || '%'
      ORDER BY
        CASE WHEN LOWER(COALESCE(p.code, '')) = LOWER($2) THEN 0
          WHEN p.title ILIKE $2 || '%' THEN 1 ELSE 2 END,
        p.updated_at DESC
      LIMIT $3
    `, [egiId, query, limit]);
    return result.rows.map((row) => this.mapRow('project', row,
      `/admin/projects?view=summary&projectId=${encodeURIComponent(row.id)}`));
  }

  private async searchIndicators(query: string, egiId: string | null, limit: number) {
    const result = await this.db.query<SearchRow>(`
      WITH scoped AS (
        SELECT pi.*
        FROM core.project_indicators pi
        JOIN core.projects p ON p.id = pi.project_id
        WHERE ($1::uuid IS NULL OR p.egi_id = $1::uuid)
      ), codes AS (
        SELECT code FROM core.indicators
        UNION
        SELECT indicator_code FROM scoped
      )
      SELECT COALESCE(i.id, MIN(scoped.id::text)::uuid) AS id, codes.code,
        COALESCE(i.name, MAX(scoped.indicator_name), codes.code) AS title,
        CONCAT_WS(' · ', COALESCE(i.category, MAX(scoped.category), 'project'),
          COALESCE(i.unit, MAX(scoped.unit), 'n/d')) AS subtitle,
        NULL::text AS status,
        GREATEST(i.updated_at, MAX(scoped.updated_at)) AS updated_at
      FROM codes
      LEFT JOIN core.indicators i ON LOWER(i.code) = LOWER(codes.code)
      LEFT JOIN scoped ON LOWER(scoped.indicator_code) = LOWER(codes.code)
      GROUP BY codes.code, i.id, i.name, i.category, i.unit, i.updated_at
      HAVING CONCAT_WS(' ', codes.code, COALESCE(i.name, MAX(scoped.indicator_name), codes.code),
          COALESCE(i.category, MAX(scoped.category), 'project'), COALESCE(i.unit, MAX(scoped.unit), 'n/d'))
        ILIKE '%' || $2::text || '%'
      ORDER BY
        CASE WHEN LOWER(codes.code) = LOWER($2) THEN 0
          WHEN COALESCE(i.name, MAX(scoped.indicator_name), codes.code) ILIKE $2 || '%' THEN 1 ELSE 2 END,
        COALESCE(i.name, MAX(scoped.indicator_name), codes.code)
      LIMIT $3
    `, [egiId, query, limit]);
    return result.rows.map((row) => this.mapRow('indicator', row,
      `/admin/indicators?view=detail&indicator=${encodeURIComponent(row.code ?? '')}`));
  }

  private async searchReports(query: string, egiId: string, limit: number, principal: AuthPrincipal) {
    const canReadAll = principal.roles.some((role) => ['superadmin', 'national_admin'].includes(role));
    const result = await this.db.query<SearchRow>(`
      SELECT ri.id, rf.code, ri.name AS title,
        CONCAT_WS(' · ', rf.name, institution.name) AS subtitle,
        ri.status, ri.updated_at
      FROM core.report_instances ri
      JOIN core.report_templates template ON template.id = ri.template_id
      JOIN core.report_frameworks rf ON rf.id = template.framework_id
      LEFT JOIN core.institutions institution ON institution.id = ri.institution_id
      WHERE ri.egi_id = $1::uuid
        AND ($4::boolean OR ri.institution_id IS NULL OR ri.institution_id = $5::uuid)
        AND CONCAT_WS(' ', ri.name, rf.code, rf.name, institution.name, ri.status)
          ILIKE '%' || $2::text || '%'
      ORDER BY CASE WHEN ri.name ILIKE $2 || '%' THEN 0 ELSE 1 END, ri.updated_at DESC
      LIMIT $3
    `, [egiId, query, limit, canReadAll, principal.institutionId ?? null]);
    return result.rows.map((row) => this.mapRow('report', row,
      `/admin/reports/detail?reportId=${encodeURIComponent(row.id)}`));
  }

  private async searchFiles(query: string, egiId: string, limit: number) {
    const result = await this.db.query<SearchRow>(`
      SELECT file.id, file.extension AS code,
        COALESCE(file.title, file.name) AS title,
        CONCAT_WS(' · ', project.title, institution.name, file.file_type) AS subtitle,
        file.validation_status AS status, file.updated_at
      FROM documents.files file
      LEFT JOIN core.projects project ON project.id = file.project_id
      LEFT JOIN core.institutions institution ON institution.id = file.institution_id
      WHERE file.egi_id = $1::uuid AND file.deleted_at IS NULL
        AND CONCAT_WS(' ', file.name, file.title, file.description, project.title, institution.name)
          ILIKE '%' || $2::text || '%'
      ORDER BY CASE WHEN COALESCE(file.title, file.name) ILIKE $2 || '%' THEN 0 ELSE 1 END,
        file.updated_at DESC
      LIMIT $3
    `, [egiId, query, limit]);
    return result.rows.map((row) => this.mapRow('file', row,
      `/admin/files?q=${encodeURIComponent(query)}&fileId=${encodeURIComponent(row.id)}`));
  }

  private mapRow(type: GlobalSearchResultType, row: SearchRow, path: string): GlobalSearchItem {
    return {
      type,
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.subtitle,
      status: row.status,
      path,
      updatedAt: row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at ? String(row.updated_at) : null,
    };
  }
}
