import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';

@Injectable()
export class CatalogsService {
  constructor(private readonly postgresService: PostgresService) {}

  async list() {
    const [institutionsResult, rolesResult, permissionsResult, territoryLevelsResult, countriesResult] =
      await Promise.all([
        this.postgresService.query<InstitutionCatalogRow>(
          `
            SELECT
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'active')::int AS active,
              ARRAY(
                SELECT name
                FROM core.institutions
                WHERE status = 'active'
                ORDER BY name ASC
                LIMIT 5
              ) AS preview
            FROM core.institutions
          `,
        ),
        this.postgresService.query<RoleCatalogRow>(
          `
            SELECT
              COUNT(*)::int AS total,
              ARRAY(
                SELECT code
                FROM core.roles
                ORDER BY code ASC
                LIMIT 6
              ) AS preview
            FROM core.roles
          `,
        ),
        this.postgresService.query<PermissionCatalogRow>(
          `
            SELECT
              COUNT(*)::int AS total,
              ARRAY(
                SELECT code
                FROM core.permissions
                ORDER BY code ASC
                LIMIT 6
              ) AS preview
            FROM core.permissions
          `,
        ),
        this.postgresService.query<TerritoryLevelCatalogRow>(
          `
            SELECT
              COUNT(DISTINCT level)::int AS total,
              ARRAY(
                SELECT DISTINCT level
                FROM core.territories
                ORDER BY level ASC
              ) AS preview
            FROM core.territories
          `,
        ),
        this.postgresService.query<CountryCatalogRow>(
          `
            SELECT
              COUNT(*)::int AS total,
              ARRAY_AGG(country ORDER BY country ASC) AS preview
            FROM (
              SELECT DISTINCT country
              FROM core.project_territories
              WHERE country IS NOT NULL
                AND BTRIM(country) <> ''
            ) countries
          `,
        ),
      ]);

    const institutions = institutionsResult.rows[0];
    const roles = rolesResult.rows[0];
    const permissions = permissionsResult.rows[0];
    const territoryLevels = territoryLevelsResult.rows[0];
    const countries = countriesResult.rows[0];

    return [
      {
        code: 'institutions',
        name: 'Instituciones',
        version: 'db',
        total: institutions?.total ?? 0,
        active: institutions?.active ?? 0,
        sourceTable: 'core.institutions',
        preview: institutions?.preview ?? [],
      },
      {
        code: 'roles',
        name: 'Roles',
        version: 'db',
        total: roles?.total ?? 0,
        sourceTable: 'core.roles',
        preview: roles?.preview ?? [],
      },
      {
        code: 'permissions',
        name: 'Permisos',
        version: 'db',
        total: permissions?.total ?? 0,
        sourceTable: 'core.permissions',
        preview: permissions?.preview ?? [],
      },
      {
        code: 'territory-levels',
        name: 'Niveles territoriales',
        version: 'db',
        total: territoryLevels?.total ?? 0,
        sourceTable: 'core.territories',
        preview: territoryLevels?.preview ?? [],
      },
      {
        code: 'countries',
        name: 'Paises operativos',
        version: 'db',
        total: countries?.total ?? 0,
        sourceTable: 'core.project_territories',
        preview: countries?.preview ?? [],
      },
    ];
  }
}

type InstitutionCatalogRow = {
  total: number;
  active: number;
  preview: string[] | null;
};

type RoleCatalogRow = {
  total: number;
  preview: string[] | null;
};

type PermissionCatalogRow = {
  total: number;
  preview: string[] | null;
};

type TerritoryLevelCatalogRow = {
  total: number;
  preview: string[] | null;
};

type CountryCatalogRow = {
  total: number;
  preview: string[] | null;
};
