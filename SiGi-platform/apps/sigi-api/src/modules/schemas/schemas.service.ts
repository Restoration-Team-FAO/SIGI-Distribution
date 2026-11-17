import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';

@Injectable()
export class SchemasService {
  constructor(private readonly postgresService: PostgresService) {}

  async list() {
    const result = await this.postgresService.query<SchemaRow>(
      `
        SELECT
          schema_code,
          COUNT(*)::int AS total_rules,
          COUNT(*) FILTER (WHERE active = TRUE)::int AS active_rules,
          MAX(updated_at) AS updated_at
        FROM core.validation_rules
        GROUP BY schema_code
        ORDER BY schema_code ASC
      `,
    );

    return result.rows.map((row) => ({
      code: row.schema_code,
      title: schemaTitle(row.schema_code),
      version: 'db',
      totalRules: row.total_rules,
      activeRules: row.active_rules,
      updatedAt: row.updated_at?.toISOString() ?? null,
    }));
  }
}

type SchemaRow = {
  schema_code: string;
  total_rules: number;
  active_rules: number;
  updated_at: Date | null;
};

function schemaTitle(schemaCode: string) {
  switch (schemaCode) {
    case 'project':
      return 'Esquema de proyectos';
    case 'territory':
      return 'Esquema territorial';
    case 'indicator':
      return 'Esquema de indicadores';
    default:
      return `Esquema ${schemaCode}`;
  }
}
