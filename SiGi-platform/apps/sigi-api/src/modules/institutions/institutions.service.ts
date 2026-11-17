import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';

export type Institution = {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'inactive';
};

@Injectable()
export class InstitutionsService {
  constructor(private readonly postgresService: PostgresService) {}

  async list(): Promise<Institution[]> {
    const result = await this.postgresService.query<InstitutionRow>(
      `
        SELECT id, code, name, status
        FROM core.institutions
        ORDER BY name ASC
      `,
    );

    return result.rows.map(mapInstitutionRow);
  }

  async listPublic(): Promise<Institution[]> {
    const result = await this.postgresService.query<InstitutionRow>(
      `
        SELECT id, code, name, status
        FROM core.institutions
        WHERE status = 'active'
        ORDER BY name ASC
      `,
    );

    return result.rows.map(mapInstitutionRow);
  }

  async findById(id: string): Promise<Institution | null> {
    const result = await this.postgresService.query<InstitutionRow>(
      `
        SELECT id, code, name, status
        FROM core.institutions
        WHERE id = $1
      `,
      [id],
    );

    const row = result.rows[0];
    return row ? mapInstitutionRow(row) : null;
  }

  async findPublicById(id: string): Promise<Institution | null> {
    const result = await this.postgresService.query<InstitutionRow>(
      `
        SELECT id, code, name, status
        FROM core.institutions
        WHERE id = $1
          AND status = 'active'
      `,
      [id],
    );

    const row = result.rows[0];
    return row ? mapInstitutionRow(row) : null;
  }
}

type InstitutionRow = {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'inactive';
};

function mapInstitutionRow(row: InstitutionRow): Institution {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
  };
}
