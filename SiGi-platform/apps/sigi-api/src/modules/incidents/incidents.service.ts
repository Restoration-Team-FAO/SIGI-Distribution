import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';

@Injectable()
export class IncidentsService {
  constructor(private readonly postgresService: PostgresService) {}

  async list() {
    const result = await this.postgresService.query<IncidentRow>(
      `
        SELECT id, title, severity, status, created_at, updated_at
        FROM core.incidents
        ORDER BY created_at DESC
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      severity: row.severity,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }
}

type IncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

