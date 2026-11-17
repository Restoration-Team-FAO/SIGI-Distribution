import { Injectable } from '@nestjs/common';
import { getValidatedEnv } from '../../common/config/env';
import { PostgresService } from '../../common/db/postgres.service';
import { requestInternalJson } from '../../common/http/internal-service-client';

@Injectable()
export class TerritoriesService {
  constructor(private readonly postgresService: PostgresService) {}

  async list(page = 1, pageSize = 250) {
    const offset = (page - 1) * pageSize;
    const [result, countResult] = await Promise.all([
      this.postgresService.query<TerritoryRow>(
      `
        SELECT
          id,
          code,
          name,
          level,
          parent_territory_id,
          status,
          created_at,
          updated_at
        FROM core.territories
        WHERE status = 'active'
        ORDER BY level ASC, name ASC
        LIMIT $1 OFFSET $2
      `,
      [pageSize, offset],
      ),
      this.postgresService.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM core.territories WHERE status = 'active'`,
      ),
    ]);

    const items = result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      level: row.level,
      parentTerritoryId: row.parent_territory_id,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
    const total = Number(countResult.rows[0]?.total ?? 0);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Fetch a layer as GeoJSON.
   *
   * `includeInternal` must be derived from the authenticated principal by the
   * caller. Anonymous callers always resolve to `false`, which restricts
   * gis-service to public, published layers.
   */
  async features(level?: string, layerCode?: string, includeInternal = false) {
    const env = getValidatedEnv();
    const search = new URLSearchParams();
    search.set('layer', layerCode?.trim() || 'territories');
    if (level) {
      search.set('level', level);
    }
    search.set('include_internal', includeInternal ? 'true' : 'false');

    return requestInternalJson<Record<string, unknown>>({
      serviceName: 'gis-service',
      baseUrl: env.gisServiceUrl,
      path: `/geometry/?${search.toString()}`,
      method: 'GET',
      authorize: true,
      timeoutMs: env.gisServiceTimeoutMs,
    });
  }
}

type TerritoryRow = {
  id: string;
  code: string;
  name: string;
  level: string;
  parent_territory_id: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};
