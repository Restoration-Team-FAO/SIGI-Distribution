import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';

@Injectable()
export class PublicDashboardService {
  constructor(private readonly postgresService: PostgresService) {}

  async summary() {
    const [institutionsResult, projectsResult, sourcesResult, validationsResult] =
      await Promise.all([
        this.postgresService.query<{ total: string }>(
          `
            SELECT COUNT(*)::text AS total
            FROM core.institutions
            WHERE status = 'active'
          `,
        ),
        this.postgresService.query<{ total: string }>(
          `
            SELECT COUNT(*)::text AS total
            FROM core.projects
          `,
        ),
        this.postgresService.query<{ total: string }>(
          `
            SELECT COUNT(*)::text AS total
            FROM core.data_sources
            WHERE status = 'active'
          `,
        ),
        this.postgresService.query<{ passed: string; total: string }>(
          `
            SELECT
              COUNT(*) FILTER (WHERE status = 'passed')::text AS passed,
              COUNT(*)::text AS total
            FROM core.validation_results
          `,
        ),
      ]);

    const validationRow = validationsResult.rows[0];
    const passed = Number(validationRow?.passed ?? '0');
    const total = Number(validationRow?.total ?? '0');

    return {
      institutions: Number(institutionsResult.rows[0]?.total ?? '0'),
      projectCount: Number(projectsResult.rows[0]?.total ?? '0'),
      sourceCount: Number(sourcesResult.rows[0]?.total ?? '0'),
      qualityScore: total === 0 ? 0 : Math.round((passed / total) * 100),
    };
  }
}
