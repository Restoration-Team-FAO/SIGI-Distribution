import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PoolClient } from 'pg';
import { getValidatedEnv } from '../../common/config/env';
import { PostgresService } from '../../common/db/postgres.service';
import { AuthService } from '../auth/auth.service';
import { deriveOperationalScopeCapabilities } from '../auth/operational-scope.policy';
import { ConnectorsService } from '../connectors/connectors.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { SyncJobsService } from '../sync-jobs/sync-jobs.service';
import { redactSecrets } from '../../common/security/redact-secrets';

const RESET_CONFIRMATION_TEXT = 'RESET SIGI DATABASE';

// Comparación en tiempo constante (digests de igual longitud) para la passphrase de reset.
export function passphraseMatches(provided: string, expected: string) {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

@Injectable()
export class AdminService {
  constructor(
    private readonly postgresService: PostgresService,
    private readonly authService: AuthService,
    private readonly institutionsService: InstitutionsService,
    private readonly connectorsService: ConnectorsService,
    private readonly syncJobsService: SyncJobsService,
  ) {}

  async listEgiWorkspace(actorEmail: string | null) {
    const access = await this.getEgiAccessContext(actorEmail);
    const spaces = await this.listAccessibleEgis(access);
    let activeEgiId = await this.getActiveEgiPreference(access.userId);

    if (!activeEgiId && spaces.length === 1) {
      activeEgiId = spaces[0].id;
      await this.upsertActiveEgiPreference(access.userId, activeEgiId);
    }

    return {
      spaces: spaces.map((space) => ({
        ...space,
        isSelected: activeEgiId === space.id,
      })),
      activeEgiId,
      activeEgi: spaces.find((space) => space.id === activeEgiId) ?? null,
      requiresCreation: spaces.length === 0,
      currentUser: {
        email: actorEmail,
        roles: access.roles,
        permissions: access.permissions,
        canUseGlobalView: access.canManageAll,
      },
    };
  }

  async getEgiSummary(egiId: string, actorEmail: string | null) {
    const access = await this.assertEgiAccess(egiId, actorEmail);
    const egi = await this.loadEgiById(egiId, access.userId);
    if (!egi) {
      throw new NotFoundException('EGI not found');
    }

    const result = await this.postgresService.query<{
      users: number;
      sources: number;
      projects: number;
      documents: number;
      imports: number;
      validations_pending: number;
      publications: number;
      alerts: number;
      recent_audit: number;
    }>(
      `
        SELECT
          (SELECT COUNT(*)::int FROM core.egi_memberships WHERE egi_id = $1::uuid AND membership_status = 'active') AS users,
          (SELECT COUNT(*)::int FROM core.data_sources WHERE egi_id = $1::uuid) AS sources,
          (SELECT COUNT(*)::int FROM core.projects WHERE egi_id = $1::uuid) AS projects,
          (SELECT COUNT(*)::int FROM documents.files WHERE egi_id = $1::uuid AND deleted_at IS NULL) AS documents,
          (SELECT COUNT(*)::int FROM integration.import_batches WHERE egi_id = $1::uuid) AS imports,
          (
            SELECT COUNT(*)::int
            FROM core.validation_results vr
            INNER JOIN core.dataset_versions dv ON dv.id = vr.dataset_version_id
            INNER JOIN core.datasets d ON d.id = dv.dataset_id
            WHERE d.egi_id = $1::uuid
              AND vr.status <> 'passed'
          ) AS validations_pending,
          (
            SELECT COUNT(*)::int
            FROM core.publications p
            INNER JOIN core.datasets d ON d.id = p.dataset_id
            WHERE d.egi_id = $1::uuid
          ) AS publications,
          (
            SELECT COUNT(*)::int
            FROM core.incidents i
            INNER JOIN core.projects p ON p.id = i.project_id
            WHERE p.egi_id = $1::uuid
              AND i.status <> 'resolved'
          ) AS alerts,
          (
            SELECT COUNT(*)::int
            FROM core.audit_events
            WHERE egi_id = $1::uuid
              AND created_at >= NOW() - INTERVAL '7 days'
          ) AS recent_audit
      `,
      [egiId],
    );

    const summary = result.rows[0];
    return {
      egi,
      summary: {
        users: summary?.users ?? 0,
        sources: summary?.sources ?? 0,
        projects: summary?.projects ?? 0,
        documents: summary?.documents ?? 0,
        imports: summary?.imports ?? 0,
        validationsPending: summary?.validations_pending ?? 0,
        publications: summary?.publications ?? 0,
        alerts: summary?.alerts ?? 0,
        recentAudit: summary?.recent_audit ?? 0,
      },
    };
  }

  async createEgi(
    input: {
      institutionId?: string | null;
      code: string;
      name: string;
      description?: string | null;
      responsible?: string | null;
      territorialScope?: string | null;
      thematicScope?: string | null;
      visibility?: 'public' | 'institutional' | 'internal';
      status?: 'draft' | 'active' | 'inactive';
    },
    actorEmail: string | null,
  ) {
    const access = await this.getEgiAccessContext(actorEmail);
    const code = this.normalizeEgiCode(input.code);
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name es requerido');
    }

    const institutionId = input.institutionId ?? access.institutionId ?? null;
    if (institutionId) {
      const institution = await this.institutionsService.findById(institutionId);
      if (!institution) {
        throw new NotFoundException('Institution not found');
      }
      if (
        !access.canManageAll &&
        access.institutionId &&
        access.institutionId !== institutionId
      ) {
        throw new ForbiddenException('No puedes crear espacios para otra institución.');
      }
    }

    const duplicate = await this.postgresService.query<{ id: string }>(
      `SELECT id FROM core.egi_spaces WHERE LOWER(code) = LOWER($1) LIMIT 1`,
      [code],
    );
    if (duplicate.rows.length > 0) {
      throw new ConflictException(`Ya existe un EGI con el código ${code}.`);
    }

    const actorUserId = access.userId;
    const result = await this.postgresService.query<EgiRow>(
      `
        INSERT INTO core.egi_spaces (
          institution_id,
          code,
          name,
          description,
          responsible,
          territorial_scope,
          thematic_scope,
          visibility,
          status,
          created_by,
          updated_by
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid, $10::uuid)
        RETURNING
          id,
          institution_id,
          code,
          name,
          description,
          responsible,
          territorial_scope,
          thematic_scope,
          visibility,
          status,
          created_at,
          updated_at
      `,
      [
        institutionId,
        code,
        name,
        normalizeOptionalText(input.description),
        normalizeOptionalText(input.responsible),
        normalizeOptionalText(input.territorialScope),
        normalizeOptionalText(input.thematicScope),
        input.visibility ?? 'institutional',
        input.status ?? 'active',
        actorUserId,
      ],
    );

    const created = result.rows[0];
    await this.postgresService.query(
      `
        INSERT INTO core.egi_memberships (
          egi_id,
          user_id,
          role_code,
          membership_status,
          permissions_json
        )
        VALUES ($1::uuid, $2::uuid, 'egi_owner', 'active', $3::jsonb)
        ON CONFLICT (egi_id, user_id)
        DO UPDATE SET
          role_code = EXCLUDED.role_code,
          membership_status = 'active',
          permissions_json = EXCLUDED.permissions_json,
          updated_at = NOW()
      `,
      [
        created.id,
        actorUserId,
        JSON.stringify(['egi.read', 'egi.select', 'egi.update', 'egi.memberships.manage', 'egi.summary.read']),
      ],
    );

    await this.upsertActiveEgiPreference(actorUserId, created.id);
    await this.recordAudit(
      actorEmail,
      'egi.created',
      'egi_space',
      created.id,
      'api',
      'success',
      { code, name, institutionId, visibility: input.visibility ?? 'institutional' },
      created.id,
    );

    return (await this.loadEgiById(created.id, actorUserId))!;
  }

  async updateEgi(
    id: string,
    input: {
      institutionId?: string | null;
      code?: string;
      name?: string;
      description?: string | null;
      responsible?: string | null;
      territorialScope?: string | null;
      thematicScope?: string | null;
      visibility?: 'public' | 'institutional' | 'internal';
      status?: 'draft' | 'active' | 'inactive';
    },
    actorEmail: string | null,
  ) {
    const access = await this.assertEgiManagerAccess(id, actorEmail);
    const current = await this.loadEgiById(id, access.userId);
    if (!current) {
      throw new NotFoundException('EGI not found');
    }

    const nextCode = input.code ? this.normalizeEgiCode(input.code) : null;
    if (nextCode && nextCode !== current.code) {
      const duplicate = await this.postgresService.query<{ id: string }>(
        `SELECT id FROM core.egi_spaces WHERE LOWER(code) = LOWER($1) AND id <> $2::uuid LIMIT 1`,
        [nextCode, id],
      );
      if (duplicate.rows.length > 0) {
        throw new ConflictException(`Ya existe un EGI con el código ${nextCode}.`);
      }
    }

    const institutionId = input.institutionId === undefined ? null : input.institutionId;
    const result = await this.postgresService.query<EgiRow>(
      `
        UPDATE core.egi_spaces
        SET
          institution_id = CASE WHEN $2::boolean THEN $3::uuid ELSE institution_id END,
          code = COALESCE($4, code),
          name = COALESCE($5, name),
          description = CASE WHEN $6::boolean THEN $7 ELSE description END,
          responsible = CASE WHEN $8::boolean THEN $9 ELSE responsible END,
          territorial_scope = CASE WHEN $10::boolean THEN $11 ELSE territorial_scope END,
          thematic_scope = CASE WHEN $12::boolean THEN $13 ELSE thematic_scope END,
          visibility = COALESCE($14, visibility),
          status = COALESCE($15, status),
          updated_by = $16::uuid,
          updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING
          id,
          institution_id,
          code,
          name,
          description,
          responsible,
          territorial_scope,
          thematic_scope,
          visibility,
          status,
          created_at,
          updated_at
      `,
      [
        id,
        input.institutionId !== undefined,
        institutionId,
        nextCode,
        input.name?.trim() || null,
        input.description !== undefined,
        normalizeOptionalText(input.description),
        input.responsible !== undefined,
        normalizeOptionalText(input.responsible),
        input.territorialScope !== undefined,
        normalizeOptionalText(input.territorialScope),
        input.thematicScope !== undefined,
        normalizeOptionalText(input.thematicScope),
        input.visibility ?? null,
        input.status ?? null,
        access.userId,
      ],
    );

    await this.recordAudit(
      actorEmail,
      'egi.updated',
      'egi_space',
      id,
      'api',
      'success',
      { previousStatus: current.status, nextStatus: input.status ?? current.status },
      id,
    );

    return (await this.loadEgiById(result.rows[0].id, access.userId))!;
  }

  async upsertEgiMembership(
    egiId: string,
    input: {
      userEmail: string;
      roleCode: 'egi_owner' | 'egi_admin' | 'egi_editor' | 'egi_validator' | 'egi_viewer';
      membershipStatus?: 'active' | 'inactive';
    },
    actorEmail: string | null,
  ) {
    const access = await this.assertEgiManagerAccess(egiId, actorEmail);
    const userEmail = input.userEmail?.trim().toLowerCase();
    const allowedRoles = ['egi_owner', 'egi_admin', 'egi_editor', 'egi_validator', 'egi_viewer'];
    if (!userEmail || !allowedRoles.includes(input.roleCode)) {
      throw new BadRequestException('userEmail y roleCode EGI válidos son requeridos.');
    }
    const membershipStatus = input.membershipStatus ?? 'active';
    if (!['active', 'inactive'].includes(membershipStatus)) {
      throw new BadRequestException('membershipStatus inválido.');
    }

    const target = await this.postgresService.query<{
      user_id: string;
      user_institution_id: string | null;
      egi_institution_id: string | null;
    }>(
      `
        SELECT
          u.id AS user_id,
          u.institution_id AS user_institution_id,
          e.institution_id AS egi_institution_id
        FROM core.egi_spaces e
        CROSS JOIN core.users u
        WHERE e.id = $1::uuid
          AND LOWER(u.email) = LOWER($2)
          AND u.status = 'active'
        LIMIT 1
      `,
      [egiId, userEmail],
    );
    const row = target.rows[0];
    if (!row) throw new NotFoundException('EGI or active user not found.');
    if (
      !access.canManageAll &&
      (row.egi_institution_id !== access.institutionId ||
        row.user_institution_id !== row.egi_institution_id)
    ) {
      throw new ForbiddenException('No puedes gestionar membresías fuera de tu institución.');
    }

    const permissionsByRole: Record<string, string[]> = {
      egi_owner: ['egi.read', 'egi.select', 'egi.update', 'egi.memberships.manage', 'egi.summary.read', 'indicators.read'],
      egi_admin: ['egi.read', 'egi.select', 'egi.update', 'egi.memberships.manage', 'egi.summary.read', 'indicators.read'],
      egi_editor: ['egi.read', 'egi.select', 'egi.summary.read', 'indicators.read'],
      egi_validator: ['egi.read', 'egi.select', 'egi.summary.read', 'indicators.read'],
      egi_viewer: ['egi.read', 'egi.select', 'egi.summary.read', 'indicators.read'],
    };
    const result = await this.postgresService.query<{
      egi_id: string;
      user_id: string;
      role_code: string;
      membership_status: string;
      permissions_json: unknown;
    }>(
      `
        INSERT INTO core.egi_memberships (
          egi_id, user_id, role_code, membership_status, permissions_json
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
        ON CONFLICT (egi_id, user_id)
        DO UPDATE SET
          role_code = EXCLUDED.role_code,
          membership_status = EXCLUDED.membership_status,
          permissions_json = EXCLUDED.permissions_json,
          updated_at = NOW()
        RETURNING egi_id, user_id, role_code, membership_status, permissions_json
      `,
      [
        egiId,
        row.user_id,
        input.roleCode,
        membershipStatus,
        JSON.stringify(permissionsByRole[input.roleCode]),
      ],
    );

    await this.recordAudit(
      actorEmail,
      'egi.membership.upserted',
      'egi_membership',
      row.user_id,
      'api',
      'success',
      { userEmail, roleCode: input.roleCode, membershipStatus },
      egiId,
    );
    const membership = result.rows[0];
    return {
      egiId: membership.egi_id,
      userId: membership.user_id,
      userEmail,
      roleCode: membership.role_code,
      membershipStatus: membership.membership_status,
      permissions: membership.permissions_json,
    };
  }

  async selectActiveEgi(egiId: string, actorEmail: string | null) {
    const access = await this.assertEgiAccess(egiId, actorEmail);
    await this.upsertActiveEgiPreference(access.userId, egiId);
    const activeEgi = await this.loadEgiById(egiId, access.userId);
    await this.recordAudit(
      actorEmail,
      'egi.selected',
      'egi_space',
      egiId,
      'api',
      'success',
      { egiId },
      egiId,
    );

    return {
      activeEgiId: egiId,
      activeEgi,
    };
  }

  async resolveAdminScopeEgiId(
    actorEmail: string | null,
    requestedEgiId: string | null,
    scope: 'active' | 'global' = 'active',
  ) {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId, scope);
    return operational.egiId;
  }

  async listSources(actorEmail?: string | null, requestedEgiId?: string | null, scope?: 'active' | 'global') {
    const operational = await this.resolveOperationalEgi(actorEmail ?? null, requestedEgiId ?? null, scope);
    const result = await this.postgresService.query<SourceRow>(
      `
        SELECT
          id,
          egi_id,
          institution_id,
          connector_id,
          code,
          name,
          source_type,
          status,
          config_json,
          last_ingested_at,
          created_at,
          updated_at
        FROM core.data_sources
        ${operational.egiId ? 'WHERE egi_id = $1::uuid' : ''}
        ORDER BY name ASC
      `,
      operational.egiId ? [operational.egiId] : [],
    );

    return result.rows.map(mapSourceRow);
  }

  async createSource(input: {
    institutionId: string;
    connectorId?: string;
    code: string;
    name: string;
    sourceType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
    assetUid?: string;
    description?: string;
    userName?: string;
    country?: string | null;
    allowedCountries?: string[] | null;
    territorialScope?: string | null;
    status?: 'active' | 'inactive';
  }, actorEmail: string | null, requestedEgiId: string | null) {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId);
    await this.assertSourceInputIntegrity(input);

    const code = input.code.trim();
    const name = input.name.trim();
    const assetUid = normalizeOptionalText(input.assetUid);
    const description = normalizeOptionalText(input.description);
    const userName = normalizeOptionalText(input.userName);
    const country = normalizeOptionalText(input.country);
    const territorialScope = normalizeOptionalText(input.territorialScope);
    const allowedCountries = normalizeStringArray(input.allowedCountries);
    const status = input.status === 'inactive' ? 'inactive' : 'active';
    const configJson = {
      ...(assetUid ? { assetUid } : {}),
      description,
      userName,
      ...(country ? { country } : {}),
      ...(territorialScope ? { territorialScope } : {}),
      ...(allowedCountries.length > 0 ? { allowedCountries } : {}),
    };

    const result = await this.postgresService.query<SourceRow>(
      `
        INSERT INTO core.data_sources (
          egi_id,
          institution_id,
          connector_id,
          code,
          name,
          source_type,
          status,
          config_json
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
        RETURNING
          id,
          egi_id,
          institution_id,
          connector_id,
          code,
          name,
          source_type,
          status,
          config_json,
          last_ingested_at,
          created_at,
          updated_at
      `,
      [
        operational.egiId,
        input.institutionId,
        input.connectorId ?? null,
        code,
        name,
        input.sourceType,
        status,
        JSON.stringify(configJson),
      ],
    );

    await this.recordAudit(
      actorEmail,
      'source.created',
      'data_source',
      result.rows[0].id,
      'api',
      'success',
      {
        code,
        sourceType: input.sourceType,
        assetUid,
        description,
        userName,
        country,
        territorialScope,
        allowedCountries,
        status,
      },
      operational.egiId,
    );
    return mapSourceRow(result.rows[0]);
  }

  async updateSource(
    id: string,
    input: {
      institutionId?: string;
      connectorId?: string | null;
      code?: string;
      name?: string;
      sourceType?: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
      assetUid?: string | null;
      description?: string | null;
      userName?: string | null;
      country?: string | null;
      allowedCountries?: string[] | null;
      territorialScope?: string | null;
      status?: 'active' | 'inactive';
    },
    actorEmail: string | null,
    requestedEgiId: string | null,
  ) {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId);
    const existing = await this.postgresService.query<SourceRow>(
      `
        SELECT
          id,
          egi_id,
          institution_id,
          connector_id,
          code,
          name,
          source_type,
          status,
          config_json,
          last_ingested_at,
          created_at,
          updated_at
        FROM core.data_sources
        WHERE id = $1::uuid
          AND ($2::uuid IS NULL OR egi_id = $2::uuid)
      `,
      [id, operational.egiId],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundException('Source not found');
    }

    const current = existing.rows[0];

    await this.assertSourceInputIntegrity({
      institutionId: input.institutionId ?? current.institution_id,
      connectorId:
        input.connectorId === undefined ? current.connector_id ?? undefined : input.connectorId ?? undefined,
      code: input.code ?? current.code,
      name: input.name ?? current.name,
      sourceType: input.sourceType ?? current.source_type,
      assetUid:
        input.assetUid === undefined
          ? normalizeOptionalText(readSourceConfigText(current.config_json, 'assetUid') ?? undefined)
          : normalizeOptionalText(input.assetUid ?? undefined) ?? undefined,
      description:
        input.description === undefined
          ? normalizeOptionalText(readSourceConfigText(current.config_json, 'description') ?? undefined)
          : normalizeOptionalText(input.description ?? undefined) ?? undefined,
      userName:
        input.userName === undefined
          ? normalizeOptionalText(readSourceConfigText(current.config_json, 'userName') ?? undefined)
          : normalizeOptionalText(input.userName ?? undefined) ?? undefined,
      status: input.status ?? current.status,
    }, id);

    const nextConfig = {
      ...(current.config_json ?? {}),
      ...(input.assetUid !== undefined
        ? { assetUid: normalizeOptionalText(input.assetUid ?? undefined) }
        : {}),
      ...(input.description !== undefined
        ? { description: normalizeOptionalText(input.description ?? undefined) }
        : {}),
      ...(input.userName !== undefined
        ? { userName: normalizeOptionalText(input.userName ?? undefined) }
        : {}),
      ...(input.country !== undefined
        ? { country: normalizeOptionalText(input.country ?? undefined) }
        : {}),
      ...(input.territorialScope !== undefined
        ? { territorialScope: normalizeOptionalText(input.territorialScope ?? undefined) }
        : {}),
      ...(input.allowedCountries !== undefined
        ? { allowedCountries: normalizeStringArray(input.allowedCountries ?? undefined) }
        : {}),
    };

    const result = await this.postgresService.query<SourceRow>(
      `
        UPDATE core.data_sources
        SET
          institution_id = COALESCE($2::uuid, institution_id),
          connector_id = CASE
            WHEN $3::boolean THEN $4::uuid
            ELSE connector_id
          END,
          code = COALESCE($5, code),
          name = COALESCE($6, name),
          source_type = COALESCE($7, source_type),
          status = COALESCE($8, status),
          config_json = $9::jsonb,
          updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING
          id,
          institution_id,
          connector_id,
          code,
          name,
          source_type,
          status,
          config_json,
          last_ingested_at,
          created_at,
          updated_at
      `,
      [
        id,
        input.institutionId ?? null,
        input.connectorId !== undefined,
        input.connectorId ?? null,
        input.code?.trim() || null,
        input.name?.trim() || null,
        input.sourceType ?? null,
        input.status ?? null,
        JSON.stringify(nextConfig),
      ],
    );

    const updated = mapSourceRow(result.rows[0]);
    await this.recordAudit(
      actorEmail,
      'source.updated',
      'data_source',
      updated.id,
      'api',
      'success',
      {
        code: updated.code,
        sourceType: updated.sourceType,
        status: updated.status,
        assetUid: readSourceConfigText(result.rows[0].config_json, 'assetUid'),
        description: updated.description ?? null,
        userName: updated.userName ?? null,
        country: readSourceConfigText(result.rows[0].config_json, 'country'),
        territorialScope: readSourceConfigText(result.rows[0].config_json, 'territorialScope'),
        allowedCountries: readSourceConfigStringArray(result.rows[0].config_json, 'allowedCountries'),
      },
      operational.egiId,
    );

    return updated;
  }

  async deleteSource(id: string, actorEmail: string | null, requestedEgiId: string | null) {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId);
    const sourceResult = await this.postgresService.query<SourceRow>(
      `
        SELECT
          id,
          egi_id,
          institution_id,
          connector_id,
          code,
          name,
          source_type,
          status,
          config_json,
          last_ingested_at,
          created_at,
          updated_at
        FROM core.data_sources
        WHERE id = $1::uuid
          AND ($2::uuid IS NULL OR egi_id = $2::uuid)
      `,
      [id, operational.egiId],
    );

    if (sourceResult.rows.length === 0) {
      throw new NotFoundException('Source not found');
    }

    const dependencyCounts = await this.postgresService.query<DependencyCountRow>(
      `
        SELECT dependency, total
        FROM (
          SELECT 'datasets'::text AS dependency, COUNT(*)::int AS total
          FROM core.datasets
          WHERE source_id = $1::uuid

          UNION ALL

          SELECT 'import_batches'::text AS dependency, COUNT(*)::int AS total
          FROM integration.import_batches
          WHERE source_id = $1::uuid
        ) dependency_counts
      `,
      [id],
    );

    const blocking = dependencyCounts.rows.filter((row) => row.total > 0);
    if (blocking.length > 0) {
      const detail = blocking.map((row) => `${row.dependency}: ${row.total}`).join(', ');
      throw new BadRequestException(
        `No se puede eliminar la fuente porque tiene dependencias activas (${detail}).`,
      );
    }

    await this.postgresService.query(
      `
        DELETE FROM core.data_sources
        WHERE id = $1::uuid
      `,
      [id],
    );

    await this.recordAudit(
      actorEmail,
      'source.deleted',
      'data_source',
      id,
      'api',
      'success',
      {
        code: sourceResult.rows[0].code,
        name: sourceResult.rows[0].name,
      },
      operational.egiId,
    );

    return {
      id,
      deleted: true,
    };
  }

  async listInstitutions() {
    return this.institutionsService.list();
  }

  async createInstitution(
    input: {
      code: string;
      name: string;
      status?: 'active' | 'inactive';
    },
    actorEmail: string | null,
  ) {
    const code = input.code?.trim();
    const name = input.name?.trim();
    const status = input.status === 'inactive' ? 'inactive' : 'active';

    if (!code) {
      throw new BadRequestException('code es requerido');
    }
    if (!name) {
      throw new BadRequestException('name es requerido');
    }

    const existing = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.institutions
        WHERE LOWER(code) = LOWER($1)
        LIMIT 1
      `,
      [code],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Ya existe una institución con el código ${code}.`);
    }

    const result = await this.postgresService.query<InstitutionRow>(
      `
        INSERT INTO core.institutions (code, name, status)
        VALUES ($1, $2, $3)
        RETURNING id, code, name, status
      `,
      [code, name, status],
    );

    const institution = mapInstitutionRow(result.rows[0]);
    await this.recordAudit(
      actorEmail,
      'institution.created',
      'institution',
      institution.id,
      'api',
      'success',
      {
        code: institution.code,
        name: institution.name,
        status: institution.status,
      },
    );

    return institution;
  }

  async updateInstitution(
    id: string,
    input: {
      code?: string;
      name?: string;
      status?: 'active' | 'inactive';
    },
    actorEmail: string | null,
  ) {
    const institution = await this.institutionsService.findById(id);
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const code = input.code?.trim();
    const name = input.name?.trim();
    const status = input.status;

    if (code !== undefined && code.length === 0) {
      throw new BadRequestException('code no puede ir vacío');
    }
    if (name !== undefined && name.length === 0) {
      throw new BadRequestException('name no puede ir vacío');
    }
    if (
      status !== undefined &&
      status !== 'active' &&
      status !== 'inactive'
    ) {
      throw new BadRequestException('status debe ser active o inactive');
    }

    if (code && code.toLowerCase() !== institution.code.toLowerCase()) {
      const existing = await this.postgresService.query<{ id: string }>(
        `
          SELECT id
          FROM core.institutions
          WHERE LOWER(code) = LOWER($1)
            AND id <> $2::uuid
          LIMIT 1
        `,
        [code, id],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Ya existe una institución con el código ${code}.`);
      }
    }

    const result = await this.postgresService.query<InstitutionRow>(
      `
        UPDATE core.institutions
        SET
          code = COALESCE($2, code),
          name = COALESCE($3, name),
          status = COALESCE($4, status),
          updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING id, code, name, status
      `,
      [id, code ?? null, name ?? null, status ?? null],
    );

    const updatedInstitution = mapInstitutionRow(result.rows[0]);
    await this.recordAudit(
      actorEmail,
      'institution.updated',
      'institution',
      updatedInstitution.id,
      'api',
      'success',
      {
        previousCode: institution.code,
        nextCode: updatedInstitution.code,
        previousName: institution.name,
        nextName: updatedInstitution.name,
        previousStatus: institution.status,
        nextStatus: updatedInstitution.status,
      },
    );

    return updatedInstitution;
  }

  async deleteInstitution(id: string, actorEmail: string | null) {
    const institution = await this.institutionsService.findById(id);
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const dependencyCounts = await this.postgresService.query<DependencyCountRow>(
      `
        SELECT dependency, total
        FROM (
          SELECT 'connectors'::text AS dependency, COUNT(*)::int AS total
          FROM core.connectors
          WHERE institution_id = $1::uuid

          UNION ALL

          SELECT 'sources'::text AS dependency, COUNT(*)::int AS total
          FROM core.data_sources
          WHERE institution_id = $1::uuid

          UNION ALL

          SELECT 'users'::text AS dependency, COUNT(*)::int AS total
          FROM core.users
          WHERE institution_id = $1::uuid

          UNION ALL

          SELECT 'datasets'::text AS dependency, COUNT(*)::int AS total
          FROM core.datasets
          WHERE institution_id = $1::uuid

          UNION ALL

          SELECT 'projects'::text AS dependency, COUNT(*)::int AS total
          FROM core.projects
          WHERE institution_id = $1::uuid

          UNION ALL

          SELECT 'sync_jobs'::text AS dependency, COUNT(*)::int AS total
          FROM core.sync_jobs
          WHERE institution_id = $1::uuid
        ) dependency_counts
      `,
      [id],
    );

    const blocking = dependencyCounts.rows.filter((row) => row.total > 0);
    if (blocking.length > 0) {
      const detail = blocking
        .map((row) => `${row.dependency}: ${row.total}`)
        .join(', ');
      throw new BadRequestException(
        `No se puede eliminar la institución porque tiene dependencias activas (${detail}).`,
      );
    }

    await this.postgresService.query(
      `
        DELETE FROM core.institutions
        WHERE id = $1::uuid
      `,
      [id],
    );

    await this.recordAudit(
      actorEmail,
      'institution.deleted',
      'institution',
      id,
      'api',
      'success',
      {
        code: institution.code,
        name: institution.name,
      },
    );

    return {
      id,
      deleted: true,
    };
  }

  // V2-03: los roles sin alcance global solo ven conectores de las instituciones de sus EGI.
  async listConnectors(actorEmail?: string | null) {
    const connectors = await this.connectorsService.listAll();
    const access = await this.getEgiAccessContext(actorEmail ?? null);
    if (access.canManageAll) {
      return connectors;
    }
    const spaces = await this.listAccessibleEgis(access);
    const allowed = new Set(
      [access.institutionId, ...spaces.map((space) => space.institutionId)].filter(
        (value): value is string => Boolean(value),
      ),
    );
    return connectors.filter((connector) => allowed.has(connector.institutionId));
  }

  async createConnector(
    input: {
      institutionId: string;
      connectorType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
      displayName: string;
      description?: string;
      endpointUrl?: string;
      userName?: string;
      httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      authScheme?: 'none' | 'basic' | 'bearer' | 'api_key';
      resourcePath?: string;
      timeoutMs?: number;
      credentialSecret?: string;
      status?: 'active' | 'inactive';
    },
    actorEmail: string | null,
  ) {
    await this.assertConnectorInputIntegrity(input);

    const displayName = input.displayName.trim();
    const description = normalizeOptionalText(input.description);
    const endpointUrl = normalizeOptionalText(input.endpointUrl);
    const userName = normalizeOptionalText(input.userName);
    const httpMethod = normalizeOptionalText(input.httpMethod);
    const authScheme = normalizeOptionalText(input.authScheme);
    const resourcePath = normalizeOptionalText(input.resourcePath);
    const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
    const credentialSecret = normalizeOptionalText(input.credentialSecret);
    const status = input.status === 'inactive' ? 'inactive' : 'active';
    const configJson = {
      description,
      endpointUrl,
      userName,
      ...(httpMethod ? { httpMethod } : {}),
      ...(authScheme ? { authScheme } : {}),
      ...(resourcePath ? { resourcePath } : {}),
      ...(timeoutMs !== null ? { timeoutMs } : {}),
      ...(credentialSecret ? { credentialSecret } : {}),
    };

    const result = await this.postgresService.query<ConnectorRow>(
      `
        INSERT INTO core.connectors (
          institution_id,
          connector_type,
          display_name,
          status,
          config_json
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
      `,
      [
        input.institutionId,
        input.connectorType,
        displayName,
        status,
        JSON.stringify(configJson),
      ],
    );

    const connector = mapConnectorRow(result.rows[0]);
    await this.recordAudit(
      actorEmail,
      'connector.created',
      'connector',
      connector.id,
      'api',
      'success',
      {
        displayName: connector.displayName,
        connectorType: connector.connectorType,
        status: connector.status,
        credentialsConfigured: connector.credentialsConfigured,
      },
    );

    return connector;
  }

  async updateConnector(
    id: string,
    input: {
      institutionId?: string;
      connectorType?: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
      displayName?: string;
      description?: string | null;
      endpointUrl?: string | null;
      userName?: string | null;
      httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | null;
      authScheme?: 'none' | 'basic' | 'bearer' | 'api_key' | null;
      resourcePath?: string | null;
      timeoutMs?: number | null;
      credentialSecret?: string | null;
      status?: 'active' | 'inactive';
    },
    actorEmail: string | null,
  ) {
    const existing = await this.postgresService.query<ConnectorRow>(
      `
        SELECT
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
        FROM core.connectors
        WHERE id = $1::uuid
      `,
      [id],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundException('Connector not found');
    }

    const current = existing.rows[0];

    await this.assertConnectorInputIntegrity(
      {
        institutionId: input.institutionId ?? current.institution_id,
        connectorType: input.connectorType ?? current.connector_type,
        displayName: input.displayName ?? current.display_name,
        description:
          input.description === undefined
            ? normalizeOptionalText(readSourceConfigText(current.config_json, 'description') ?? undefined)
            : normalizeOptionalText(input.description ?? undefined) ?? undefined,
        endpointUrl:
          input.endpointUrl === undefined
            ? normalizeOptionalText(
                readSourceConfigText(current.config_json, 'endpointUrl') ??
                  readSourceConfigText(current.config_json, 'baseUrl') ??
                  undefined,
              ) ?? undefined
            : normalizeOptionalText(input.endpointUrl ?? undefined) ?? undefined,
        userName:
          input.userName === undefined
            ? normalizeOptionalText(
                readSourceConfigText(current.config_json, 'userName') ??
                  readSourceConfigText(current.config_json, 'username') ??
                  undefined,
              ) ?? undefined
            : normalizeOptionalText(input.userName ?? undefined) ?? undefined,
        httpMethod:
          input.httpMethod === undefined
            ? normalizeOptionalText(
                readSourceConfigText(current.config_json, 'httpMethod') ?? undefined,
              ) ?? undefined
            : normalizeOptionalText(input.httpMethod ?? undefined) ?? undefined,
        authScheme:
          input.authScheme === undefined
            ? normalizeOptionalText(
                readSourceConfigText(current.config_json, 'authScheme') ?? undefined,
              ) ?? undefined
            : normalizeOptionalText(input.authScheme ?? undefined) ?? undefined,
        resourcePath:
          input.resourcePath === undefined
            ? normalizeOptionalText(
                readSourceConfigText(current.config_json, 'resourcePath') ?? undefined,
              ) ?? undefined
            : normalizeOptionalText(input.resourcePath ?? undefined) ?? undefined,
        timeoutMs:
          input.timeoutMs === undefined
            ? readSourceConfigNumber(current.config_json, 'timeoutMs') ?? undefined
            : input.timeoutMs ?? undefined,
        credentialSecret:
          input.credentialSecret === undefined
            ? normalizeOptionalText(readSourceConfigText(current.config_json, 'credentialSecret') ?? undefined)
            : normalizeOptionalText(input.credentialSecret ?? undefined) ?? undefined,
        status: input.status ?? current.status,
      },
      id,
    );

    const nextConfig = {
      ...(current.config_json ?? {}),
      ...(input.description !== undefined
        ? { description: normalizeOptionalText(input.description ?? undefined) }
        : {}),
      ...(input.endpointUrl !== undefined
        ? { endpointUrl: normalizeOptionalText(input.endpointUrl ?? undefined) }
        : {}),
      ...(input.userName !== undefined
        ? { userName: normalizeOptionalText(input.userName ?? undefined) }
        : {}),
      ...(input.httpMethod !== undefined
        ? { httpMethod: normalizeOptionalText(input.httpMethod ?? undefined) }
        : {}),
      ...(input.authScheme !== undefined
        ? { authScheme: normalizeOptionalText(input.authScheme ?? undefined) }
        : {}),
      ...(input.resourcePath !== undefined
        ? { resourcePath: normalizeOptionalText(input.resourcePath ?? undefined) }
        : {}),
      ...(input.timeoutMs !== undefined
        ? { timeoutMs: normalizeTimeoutMs(input.timeoutMs ?? undefined) }
        : {}),
      ...(input.credentialSecret !== undefined
        ? { credentialSecret: normalizeOptionalText(input.credentialSecret ?? undefined) }
        : {}),
    };

    const result = await this.postgresService.query<ConnectorRow>(
      `
        UPDATE core.connectors
        SET
          institution_id = COALESCE($2::uuid, institution_id),
          connector_type = COALESCE($3, connector_type),
          display_name = COALESCE($4, display_name),
          status = COALESCE($5, status),
          config_json = $6::jsonb,
          updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
      `,
      [
        id,
        input.institutionId ?? null,
        input.connectorType ?? null,
        input.displayName?.trim() || null,
        input.status ?? null,
        JSON.stringify(nextConfig),
      ],
    );

    const connector = mapConnectorRow(result.rows[0]);
    await this.recordAudit(
      actorEmail,
      'connector.updated',
      'connector',
      connector.id,
      'api',
      'success',
      {
        displayName: connector.displayName,
        connectorType: connector.connectorType,
        status: connector.status,
        credentialsConfigured: connector.credentialsConfigured,
      },
    );

    return connector;
  }

  async deleteConnector(id: string, actorEmail: string | null) {
    const connectorResult = await this.postgresService.query<ConnectorRow>(
      `
        SELECT
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
        FROM core.connectors
        WHERE id = $1::uuid
      `,
      [id],
    );

    if (connectorResult.rows.length === 0) {
      throw new NotFoundException('Connector not found');
    }

    const dependencyCounts = await this.postgresService.query<DependencyCountRow>(
      `
        SELECT dependency, total
        FROM (
          SELECT 'sources'::text AS dependency, COUNT(*)::int AS total
          FROM core.data_sources
          WHERE connector_id = $1::uuid

          UNION ALL

          SELECT 'sync_jobs'::text AS dependency, COUNT(*)::int AS total
          FROM core.sync_jobs
          WHERE connector_id = $1::uuid

          UNION ALL

          SELECT 'odoo_configs'::text AS dependency, COUNT(*)::int AS total
          FROM integration.odoo_source_configs
          WHERE connector_id = $1::uuid
        ) dependency_counts
      `,
      [id],
    );

    const blocking = dependencyCounts.rows.filter((row) => row.total > 0);
    if (blocking.length > 0) {
      const detail = blocking.map((row) => `${row.dependency}: ${row.total}`).join(', ');
      throw new BadRequestException(
        `No se puede eliminar el conector porque tiene dependencias activas (${detail}).`,
      );
    }

    await this.postgresService.query(
      `
        DELETE FROM core.connectors
        WHERE id = $1::uuid
      `,
      [id],
    );

    await this.recordAudit(
      actorEmail,
      'connector.deleted',
      'connector',
      id,
      'api',
      'success',
      {
        displayName: connectorResult.rows[0].display_name,
        connectorType: connectorResult.rows[0].connector_type,
      },
    );

    return {
      id,
      deleted: true,
    };
  }

  async runConnector(id: string, actorEmail: string | null) {
    const connector = await this.connectorsService.findById(id);
    if (!connector) {
      throw new NotFoundException('Connector not found');
    }

    const job = await this.syncJobsService.create({
      institutionId: connector.institutionId,
      connectorId: connector.id,
      triggeredBy: 'user',
      mode: 'incremental',
    });

    await this.recordAudit(
      actorEmail,
      'connector.run',
      'connector',
      connector.id,
      'api',
      'accepted',
      { jobId: job.jobId },
    );

    return {
      connectorId: id,
      jobId: job.jobId,
      status: job.status,
    };
  }

  async listValidations(actorEmail: string | null, requestedEgiId: string | null, scope?: 'active' | 'global') {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId, scope);
    const result = await this.postgresService.query<ValidationRow>(
      `
        SELECT
          id,
          egi_id,
          dataset_version_id,
          rule_code,
          status,
          message,
          assigned_to_user_id,
          created_at,
          updated_at
        FROM core.validation_results
        ${operational.egiId ? 'WHERE egi_id = $1::uuid' : ''}
        ORDER BY created_at DESC
      `,
      operational.egiId ? [operational.egiId] : [],
    );

    return result.rows.map((row) => ({
      id: row.id,
      egiId: row.egi_id,
      datasetVersionId: row.dataset_version_id,
      ruleCode: row.rule_code,
      status: row.status,
      message: row.message,
      assignedToUserId: row.assigned_to_user_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async assignValidation(id: string, userId: string | null, actorEmail: string | null, requestedEgiId: string | null) {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId);
    const result = await this.postgresService.query<ValidationRow>(
      `
        UPDATE core.validation_results
        SET
          assigned_to_user_id = $2,
          updated_at = NOW()
        WHERE id = $1
          AND ($3::uuid IS NULL OR egi_id = $3::uuid)
        RETURNING
          id,
          egi_id,
          dataset_version_id,
          rule_code,
          status,
          message,
          assigned_to_user_id,
          created_at,
          updated_at
      `,
      [id, userId, operational.egiId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Validation result not found');
    }

    await this.recordAudit(
      actorEmail,
      'validation.assigned',
      'validation_result',
      id,
      'api',
      'success',
      { assignedToUserId: userId },
      operational.egiId,
    );

    const row = result.rows[0];
    return {
      id: row.id,
      egiId: row.egi_id,
      datasetVersionId: row.dataset_version_id,
      assignedToUserId: row.assigned_to_user_id,
      status: row.status,
    };
  }

  async listPublications(
    actorEmail: string | null,
    requestedEgiId: string | null,
    scope: 'active' | 'global' = 'active',
  ) {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId, scope);
    const result = await this.postgresService.query<PublicationRow>(
      `
        SELECT
          p.id,
          p.dataset_id,
          p.target,
          p.status,
          p.created_at,
          p.updated_at
        FROM core.publications p
        LEFT JOIN core.datasets d ON d.id = p.dataset_id
        WHERE ($1::uuid IS NULL OR d.egi_id = $1::uuid)
        ORDER BY p.created_at DESC
      `,
      [operational.egiId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      datasetId: row.dataset_id,
      target: row.target,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async publish(
    id: string,
    actorEmail: string | null,
    requestedEgiId: string | null,
    scope: 'active' | 'global' = 'active',
  ) {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId, scope);
    const result = await this.postgresService.query<PublicationRow>(
      `
        UPDATE core.publications p
        SET status = 'published', updated_at = NOW()
        FROM core.datasets d
        WHERE p.dataset_id = d.id
          AND p.id = $1::uuid
          AND ($2::uuid IS NULL OR d.egi_id = $2::uuid)
        RETURNING p.id, p.dataset_id, p.target, p.status, p.created_at, p.updated_at
      `,
      [id, operational.egiId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Publication not found in the active EGI scope');
    }

    await this.recordAudit(
      actorEmail,
      'publication.published',
      'publication',
      id,
      'api',
      'success',
      {},
      operational.egiId,
    );

    const row = result.rows[0];
    return {
      id: row.id,
      datasetId: row.dataset_id,
      target: row.target,
      status: row.status,
    };
  }

  async listIncidents(
    actorEmail: string | null,
    requestedEgiId: string | null,
    scope: 'active' | 'global' = 'active',
  ) {
    const operational = await this.resolveOperationalEgi(actorEmail, requestedEgiId, scope);
    const result = await this.postgresService.query<IncidentRow>(
      `
        SELECT
          i.id,
          i.title,
          i.severity,
          i.status,
          i.created_at,
          i.updated_at
        FROM core.incidents i
        LEFT JOIN core.projects p ON p.id = i.project_id
        WHERE ($1::uuid IS NULL OR p.egi_id = $1::uuid)
        ORDER BY i.created_at DESC
      `,
      [operational.egiId],
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

  async createUser(
    input: {
      institutionId?: string | null;
      email: string;
      displayName: string;
      password?: string;
      status?: 'active' | 'inactive' | 'pending';
      roles?: string[];
    },
    actorEmail: string | null,
  ) {
    const email = this.normalizeUserEmail(input.email);
    const displayName = input.displayName?.trim();
    const status = this.normalizeUserStatus(input.status);
    const roles = this.normalizeRoleCodes(input.roles);
    const institutionId = input.institutionId ?? null;
    const password = input.password?.trim() || null;

    await this.assertUserInputIntegrity({
      institutionId,
      email,
      displayName,
      status,
      roles,
    });

    const user = await this.postgresService.transaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO core.users (institution_id, email, display_name, status)
          VALUES ($1::uuid, $2, $3, $4)
          RETURNING id
        `,
        [institutionId, email, displayName, status],
      );

      if (password) {
        await this.authService.setUserPassword(inserted.rows[0].id, password, actorEmail, client);
      }

      await this.replaceUserRoles(client, inserted.rows[0].id, roles);
      return this.loadUserById(inserted.rows[0].id, client);
    });

    if (!user) {
      throw new NotFoundException('User not found after creation');
    }

    await this.recordAudit(actorEmail, 'user.created', 'user', user.id, 'api', 'success', {
      email: user.email,
      displayName: user.displayName,
      institutionId: user.institutionId,
      status: user.status,
      roles: user.roles ?? [],
      hasPassword: user.hasPassword ?? false,
    });

    return user;
  }

  async updateUser(
    id: string,
    input: {
      institutionId?: string | null;
      email?: string;
      displayName?: string;
      password?: string;
      status?: 'active' | 'inactive' | 'pending';
      roles?: string[];
    },
    actorEmail: string | null,
  ) {
    const current = await this.loadUserById(id);
    if (!current) {
      throw new NotFoundException('User not found');
    }

    const nextRoles =
      input.roles === undefined ? [...(current.roles ?? [])] : this.normalizeRoleCodes(input.roles);
    const email =
      input.email === undefined ? current.email : this.normalizeUserEmail(input.email);
    const displayName =
      input.displayName === undefined ? current.displayName : input.displayName.trim();
    const status =
      input.status === undefined
        ? this.normalizeUserStatus(current.status as 'active' | 'inactive' | 'pending')
        : this.normalizeUserStatus(input.status);
    const institutionId =
      input.institutionId === undefined ? current.institutionId : input.institutionId;
    const password = input.password?.trim() || null;

    await this.assertUserInputIntegrity(
      {
        institutionId,
        email,
        displayName,
        status,
        roles: nextRoles,
      },
      id,
    );

    if (current.roles?.includes('superadmin') && !nextRoles.includes('superadmin')) {
      await this.assertSuperadminRoleCanBeRemoved(id);
    }

    const updated = await this.postgresService.transaction(async (client) => {
      await client.query(
        `
          UPDATE core.users
          SET
            institution_id = $2::uuid,
            email = $3,
            display_name = $4,
            status = $5,
            updated_at = NOW()
          WHERE id = $1::uuid
        `,
        [id, institutionId, email, displayName, status],
      );

      if (password) {
        await this.authService.setUserPassword(id, password, actorEmail, client);
      }

      await this.replaceUserRoles(client, id, nextRoles);
      return this.loadUserById(id, client);
    });

    if (!updated) {
      throw new NotFoundException('User not found after update');
    }

    await this.recordAudit(actorEmail, 'user.updated', 'user', updated.id, 'api', 'success', {
      email: updated.email,
      displayName: updated.displayName,
      institutionId: updated.institutionId,
      status: updated.status,
      roles: updated.roles ?? [],
      hasPassword: updated.hasPassword ?? false,
    });

    return updated;
  }

  async deleteUser(id: string, actorEmail: string | null) {
    const current = await this.loadUserById(id);
    if (!current) {
      throw new NotFoundException('User not found');
    }

    if (current.roles?.includes('superadmin')) {
      await this.assertSuperadminRoleCanBeRemoved(id);
    }

    const dependencyCounts = await this.postgresService.query<DependencyCountRow>(
      `
        SELECT dependency, total
        FROM (
          SELECT 'dataset_versions'::text AS dependency, COUNT(*)::int AS total
          FROM core.dataset_versions
          WHERE submitted_by_user_id = $1::uuid

          UNION ALL

          SELECT 'validation_results'::text AS dependency, COUNT(*)::int AS total
          FROM core.validation_results
          WHERE assigned_to_user_id = $1::uuid

          UNION ALL

          SELECT 'audit_events'::text AS dependency, COUNT(*)::int AS total
          FROM core.audit_events
          WHERE actor_user_id = $1::uuid

          UNION ALL

          SELECT 'report_runs'::text AS dependency, COUNT(*)::int AS total
          FROM core.report_runs
          WHERE created_by_user_id = $1::uuid

          UNION ALL

          SELECT 'export_runs'::text AS dependency, COUNT(*)::int AS total
          FROM core.export_runs
          WHERE requested_by_user_id = $1::uuid

          UNION ALL

          SELECT 'import_batches'::text AS dependency, COUNT(*)::int AS total
          FROM integration.import_batches
          WHERE initiated_by_user_id = $1::uuid

          UNION ALL

          SELECT 'source_mapping_profiles'::text AS dependency, COUNT(*)::int AS total
          FROM integration.source_mapping_profiles
          WHERE created_by_user_id = $1::uuid

          UNION ALL

          SELECT 'odoo_source_configs_created'::text AS dependency, COUNT(*)::int AS total
          FROM integration.odoo_source_configs
          WHERE created_by_user_id = $1::uuid

          UNION ALL

          SELECT 'odoo_source_configs_updated'::text AS dependency, COUNT(*)::int AS total
          FROM integration.odoo_source_configs
          WHERE updated_by_user_id = $1::uuid
        ) dependency_counts
      `,
      [id],
    );

    const blocking = dependencyCounts.rows.filter((row) => row.total > 0);
    if (blocking.length > 0) {
      const detail = blocking.map((row) => `${row.dependency}: ${row.total}`).join(', ');
      throw new BadRequestException(
        `No se puede eliminar el usuario porque tiene dependencias activas (${detail}).`,
      );
    }

    await this.postgresService.transaction(async (client) => {
      await client.query(
        `
          DELETE FROM core.user_roles
          WHERE user_id = $1::uuid
        `,
        [id],
      );

      await client.query(
        `
          DELETE FROM core.users
          WHERE id = $1::uuid
        `,
        [id],
      );
    });

    await this.recordAudit(actorEmail, 'user.deleted', 'user', id, 'api', 'success', {
      email: current.email,
      displayName: current.displayName,
      institutionId: current.institutionId,
      roles: current.roles ?? [],
    });

    return {
      id,
      deleted: true,
    };
  }

  async listUsers() {
    const result = await this.postgresService.query<UserRow>(
      `
        SELECT
          u.id,
          u.institution_id,
          i.name AS institution_name,
          u.email,
          u.display_name,
          u.status,
          (uc.password_hash IS NOT NULL) AS has_password,
          COALESCE(
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.code ORDER BY r.code), NULL),
            ARRAY[]::text[]
          ) AS roles
        FROM core.users u
        LEFT JOIN core.institutions i ON i.id = u.institution_id
        LEFT JOIN core.user_credentials uc ON uc.user_id = u.id
        LEFT JOIN core.user_roles ur ON ur.user_id = u.id
        LEFT JOIN core.roles r ON r.id = ur.role_id
        GROUP BY
          u.id,
          u.institution_id,
          i.name,
          u.email,
          u.display_name,
          u.status,
          uc.password_hash
        ORDER BY
          CASE u.status
            WHEN 'active' THEN 0
            WHEN 'pending' THEN 1
            ELSE 2
          END,
          u.display_name ASC
      `,
    );

    return result.rows.map(mapUserRow);
  }

  async listRoles() {
    const result = await this.postgresService.query<RoleRow>(
      `
        SELECT
          r.id,
          r.code,
          r.name,
          COALESCE(
            JSONB_AGG(
              DISTINCT JSONB_BUILD_OBJECT(
                'id', p.id,
                'code', p.code,
                'name', p.name
              )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::jsonb
          ) AS permissions
        FROM core.roles r
        LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
        LEFT JOIN core.permissions p ON p.id = rp.permission_id
        GROUP BY r.id, r.code, r.name
        ORDER BY name ASC
      `,
    );

    return result.rows.map(mapRoleRow);
  }

  async listPermissions() {
    const result = await this.postgresService.query<PermissionRow>(
      `
        SELECT id, code, name
        FROM core.permissions
        ORDER BY name ASC
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
    }));
  }

  async createRole(
    input: {
      code: string;
      name: string;
      permissions?: string[];
    },
    actorEmail: string | null,
  ) {
    const code = this.normalizeRoleCode(input.code);
    const name = input.name?.trim();
    const permissions = await this.normalizePermissionCodes(input.permissions);

    await this.assertRoleInputIntegrity({ code, name, permissions });

    const role = await this.postgresService.transaction(async (client: PoolClient) => {
      const result = await client.query<RoleRow>(
        `
          INSERT INTO core.roles (code, name)
          VALUES ($1, $2)
          RETURNING id, code, name, '[]'::jsonb AS permissions
        `,
        [code, name],
      );

      await this.replaceRolePermissions(client, result.rows[0].id, permissions);
      return this.loadRoleById(result.rows[0].id, client);
    });

    if (!role) {
      throw new NotFoundException('Role not found after creation');
    }

    await this.recordAudit(actorEmail, 'role.created', 'role', role.id, 'api', 'success', {
      code: role.code,
      name: role.name,
      permissions,
    });

    return role;
  }

  async updateRole(
    id: string,
    input: {
      code?: string;
      name?: string;
      permissions?: string[];
    },
    actorEmail: string | null,
  ) {
    const current = await this.loadRoleById(id);
    if (!current) {
      throw new NotFoundException('Role not found');
    }

    const nextCode =
      input.code === undefined ? current.code : this.normalizeRoleCode(input.code);
    const nextName = input.name === undefined ? current.name : input.name.trim();
    const nextPermissions =
      input.permissions === undefined
        ? current.permissions?.map((permission) => permission.code) ?? []
        : await this.normalizePermissionCodes(input.permissions);

    if (this.isProtectedRoleCode(current.code) && input.code !== undefined && nextCode !== current.code) {
      throw new BadRequestException(
        'No se puede cambiar el código de un rol base del sistema.',
      );
    }

    await this.assertRoleInputIntegrity(
      {
        code: nextCode,
        name: nextName,
        permissions: nextPermissions,
      },
      id,
    );

    const role = await this.postgresService.transaction(async (client: PoolClient) => {
      await client.query(
        `
          UPDATE core.roles
          SET
            code = $2,
            name = $3
          WHERE id = $1::uuid
        `,
        [id, nextCode, nextName],
      );

      await this.replaceRolePermissions(client, id, nextPermissions);
      return this.loadRoleById(id, client);
    });

    if (!role) {
      throw new NotFoundException('Role not found after update');
    }

    await this.recordAudit(actorEmail, 'role.updated', 'role', role.id, 'api', 'success', {
      code: role.code,
      name: role.name,
      permissions: nextPermissions,
    });

    return role;
  }

  async deleteRole(id: string, actorEmail: string | null) {
    const currentResult = await this.postgresService.query<RoleRow>(
      `
        SELECT id, code, name
        FROM core.roles
        WHERE id = $1::uuid
      `,
      [id],
    );

    if (currentResult.rows.length === 0) {
      throw new NotFoundException('Role not found');
    }

    const current = currentResult.rows[0];
    if (this.isProtectedRoleCode(current.code)) {
      throw new BadRequestException('No se puede eliminar un rol base del sistema.');
    }

    const assignments = await this.postgresService.query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM core.user_roles
        WHERE role_id = $1::uuid
      `,
      [id],
    );

    if ((assignments.rows[0]?.total ?? 0) > 0) {
      throw new BadRequestException(
        'No se puede eliminar el rol porque tiene usuarios asignados.',
      );
    }

    await this.postgresService.query(
      `
        DELETE FROM core.roles
        WHERE id = $1::uuid
      `,
      [id],
    );

    await this.recordAudit(actorEmail, 'role.deleted', 'role', id, 'api', 'success', {
      code: current.code,
      name: current.name,
    });

    return {
      id,
      deleted: true,
    };
  }

  async listAudit() {
    const result = await this.postgresService.query<AuditRow>(
      `
        SELECT
          id,
          actor_user_id,
          (
            SELECT email
            FROM core.users u
            WHERE u.id = actor_user_id
          ) AS actor_email,
          egi_id,
          action,
          entity_type,
          entity_id,
          source,
          result,
          details_json,
          created_at
        FROM core.audit_events
        ORDER BY created_at DESC
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email,
      egiId: row.egi_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      source: row.source,
      result: row.result,
      details: row.details_json,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async resetDatabase(
    input: { confirmationText: string; passphrase: string },
    actorEmail: string | null,
  ) {
    const env = getValidatedEnv();
    // Apagado por defecto (y prohibido en producción): la ruta se comporta como inexistente.
    if (!env.sigiEnableDbReset || !env.sigiDbResetPassphrase) {
      throw new NotFoundException();
    }

    if (!passphraseMatches(input.passphrase?.trim() ?? '', env.sigiDbResetPassphrase)) {
      throw new ForbiddenException('Passphrase de reset inválida.');
    }

    const providedConfirmation = input.confirmationText?.trim().toUpperCase() ?? '';
    if (providedConfirmation !== RESET_CONFIRMATION_TEXT) {
      throw new BadRequestException(
        `Confirmación inválida. Escribe exactamente: ${RESET_CONFIRMATION_TEXT}`,
      );
    }

    const tableRows = await this.postgresService.query<{
      schema_name: string;
      table_name: string;
    }>(
      `
        SELECT schemaname AS schema_name, tablename AS table_name
        FROM pg_tables
        WHERE schemaname IN ('core', 'integration', 'gis')
        ORDER BY schemaname, tablename
      `,
    );

    const tableRefs = tableRows.rows.map((row) => `"${row.schema_name}"."${row.table_name}"`);
    if (tableRefs.length === 0) {
      return {
        resetExecuted: false,
        truncatedTables: 0,
        schemas: {},
        resetAt: new Date().toISOString(),
      };
    }

    await this.postgresService.query(
      `TRUNCATE TABLE ${tableRefs.join(', ')} RESTART IDENTITY CASCADE`,
    );

    await this.recordAudit(
      actorEmail,
      'system.database_reset',
      'system',
      null,
      'api',
      'success',
      {
        truncatedTables: tableRefs.length,
        confirmationText: RESET_CONFIRMATION_TEXT,
      },
    );

    const schemaCounts = tableRows.rows.reduce<Record<string, number>>((accumulator, row) => {
      const current = accumulator[row.schema_name] ?? 0;
      accumulator[row.schema_name] = current + 1;
      return accumulator;
    }, {});

    return {
      resetExecuted: true,
      truncatedTables: tableRefs.length,
      schemas: schemaCounts,
      resetAt: new Date().toISOString(),
    };
  }

  private async loadUserById(id: string, client?: PoolClient) {
    const query = `
        SELECT
          u.id,
          u.institution_id,
          i.name AS institution_name,
          u.email,
          u.display_name,
          u.status,
          (uc.password_hash IS NOT NULL) AS has_password,
          COALESCE(
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.code ORDER BY r.code), NULL),
            ARRAY[]::text[]
          ) AS roles
        FROM core.users u
        LEFT JOIN core.institutions i ON i.id = u.institution_id
        LEFT JOIN core.user_credentials uc ON uc.user_id = u.id
        LEFT JOIN core.user_roles ur ON ur.user_id = u.id
        LEFT JOIN core.roles r ON r.id = ur.role_id
        WHERE u.id = $1::uuid
        GROUP BY
          u.id,
          u.institution_id,
          i.name,
          u.email,
          u.display_name,
          u.status,
          uc.password_hash
      `;
    const result = client
      ? await client.query<UserRow>(
          query,
          [id],
        )
      : await this.postgresService.query<UserRow>(
          query,
          [id],
        );

    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }

  private async loadRoleById(id: string, client?: PoolClient) {
    const query = `
        SELECT
          r.id,
          r.code,
          r.name,
          COALESCE(
            JSONB_AGG(
              DISTINCT JSONB_BUILD_OBJECT(
                'id', p.id,
                'code', p.code,
                'name', p.name
              )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::jsonb
          ) AS permissions
        FROM core.roles r
        LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
        LEFT JOIN core.permissions p ON p.id = rp.permission_id
        WHERE r.id = $1::uuid
        GROUP BY r.id, r.code, r.name
      `;
    const result = client
      ? await client.query<RoleRow>(query, [id])
      : await this.postgresService.query<RoleRow>(query, [id]);

    return result.rows[0] ? mapRoleRow(result.rows[0]) : null;
  }

  private async getEgiAccessContext(actorEmail: string | null) {
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
          ) AS global_roles,
          COALESCE(
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
      roles,
      permissions: row?.permissions ?? [],
      ...capabilities,
    };
  }

  private async resolveOperationalEgi(
    actorEmail: string | null,
    requestedEgiId: string | null,
    scope: 'active' | 'global' = 'active',
  ) {
    const access = await this.getEgiAccessContext(actorEmail);
    if (scope === 'global') {
      if (!access.canManageAll) {
        throw new ForbiddenException('La vista global consolidada requiere permisos administrativos globales.');
      }
      return { ...access, egiId: null };
    }

    const spaces = await this.listAccessibleEgis(access);
    if (spaces.length === 0) {
      throw new ForbiddenException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }

    const preferredEgiId = requestedEgiId ?? (await this.getActiveEgiPreference(access.userId));
    const matched = preferredEgiId ? spaces.find((space) => space.id === preferredEgiId) : null;
    if (matched) {
      return { ...access, egiId: matched.id };
    }

    if (spaces.length === 1) {
      await this.upsertActiveEgiPreference(access.userId, spaces[0].id);
      return { ...access, egiId: spaces[0].id };
    }

    throw new ForbiddenException(
      'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
    );
  }

  private async listAccessibleEgis(access: {
    userId: string;
    institutionId: string | null;
    canManageAll: boolean;
    canManageInstitution: boolean;
  }) {
    const result = access.canManageAll
      ? await this.postgresService.query<EgiRow>(
          `
            SELECT
              e.id,
              e.institution_id,
              i.name AS institution_name,
              e.code,
              e.name,
              e.description,
              e.responsible,
              e.territorial_scope,
              e.thematic_scope,
              e.visibility,
              e.status,
              e.created_at,
              e.updated_at,
              em.role_code AS active_user_role,
              em.permissions_json,
              up.last_egi_selected_at
              FROM core.egi_spaces e
              LEFT JOIN core.institutions i ON i.id = e.institution_id
              LEFT JOIN core.egi_memberships em
                ON em.egi_id = e.id
               AND em.user_id = $1::uuid
               AND em.membership_status = 'active'
              LEFT JOIN core.user_preferences up ON up.user_id = $1::uuid
              ORDER BY e.status = 'active' DESC, e.name ASC
            `,
            [access.userId],
          )
        : await this.postgresService.query<EgiRow>(
            `
              SELECT
                e.id,
                e.institution_id,
                i.name AS institution_name,
              e.code,
              e.name,
              e.description,
              e.responsible,
              e.territorial_scope,
              e.thematic_scope,
              e.visibility,
              e.status,
              e.created_at,
              e.updated_at,
              em.role_code AS active_user_role,
                em.permissions_json,
                up.last_egi_selected_at
              FROM core.egi_spaces e
              LEFT JOIN core.institutions i ON i.id = e.institution_id
              LEFT JOIN core.egi_memberships em
                ON em.egi_id = e.id
               AND em.user_id = $1::uuid
               AND em.membership_status = 'active'
              LEFT JOIN core.user_preferences up ON up.user_id = $1::uuid
              WHERE em.user_id = $1::uuid
                 OR ($2::boolean AND e.institution_id IS NOT DISTINCT FROM $3::uuid)
            ORDER BY e.status = 'active' DESC, e.name ASC
          `,
          [access.userId, access.canManageInstitution, access.institutionId],
        );

    return result.rows.map(mapEgiRow);
  }

  private async assertEgiAccess(egiId: string, actorEmail: string | null) {
    const access = await this.getEgiAccessContext(actorEmail);
    const spaces = await this.listAccessibleEgis(access);
    if (!spaces.some((space) => space.id === egiId)) {
      throw new ForbiddenException('No tienes acceso al EGI solicitado.');
    }
    return access;
  }

  private async assertEgiManagerAccess(egiId: string, actorEmail: string | null) {
    const access = await this.assertEgiAccess(egiId, actorEmail);
    if (access.canManageAll) {
      return access;
    }

    const membership = await this.postgresService.query<{
      role_code: string;
    }>(
      `
        SELECT role_code
        FROM core.egi_memberships
        WHERE egi_id = $1::uuid
          AND user_id = $2::uuid
          AND membership_status = 'active'
        LIMIT 1
      `,
      [egiId, access.userId],
    );

    const roleCode = membership.rows[0]?.role_code ?? null;
    if (!['egi_owner', 'egi_admin'].includes(roleCode ?? '')) {
      throw new ForbiddenException('Tu rol dentro del EGI no permite esta acción.');
    }

    return access;
  }

  private async loadEgiById(id: string, userId: string) {
    const result = await this.postgresService.query<EgiRow>(
      `
        SELECT
          e.id,
          e.institution_id,
          i.name AS institution_name,
          e.code,
          e.name,
          e.description,
          e.responsible,
          e.territorial_scope,
          e.thematic_scope,
          e.visibility,
          e.status,
          e.created_at,
          e.updated_at,
          em.role_code AS active_user_role,
          em.permissions_json,
          up.last_egi_selected_at
        FROM core.egi_spaces e
        LEFT JOIN core.institutions i ON i.id = e.institution_id
        LEFT JOIN core.egi_memberships em ON em.egi_id = e.id AND em.user_id = $2::uuid
        LEFT JOIN core.user_preferences up ON up.user_id = $2::uuid
        WHERE e.id = $1::uuid
      `,
      [id, userId],
    );

    return result.rows[0] ? mapEgiRow(result.rows[0]) : null;
  }

  private async getActiveEgiPreference(userId: string) {
    const result = await this.postgresService.query<{ active_egi_id: string | null }>(
      `
        SELECT active_egi_id
        FROM core.user_preferences
        WHERE user_id = $1::uuid
      `,
      [userId],
    );
    return result.rows[0]?.active_egi_id ?? null;
  }

  private async upsertActiveEgiPreference(userId: string, egiId: string) {
    await this.postgresService.query(
      `
        INSERT INTO core.user_preferences (
          user_id,
          active_egi_id,
          preferences_json,
          last_egi_selected_at,
          updated_at
        )
        VALUES ($1::uuid, $2::uuid, '{}'::jsonb, NOW(), NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          active_egi_id = EXCLUDED.active_egi_id,
          last_egi_selected_at = NOW(),
          updated_at = NOW()
      `,
      [userId, egiId],
    );
  }

  private normalizeUserEmail(value: string | undefined | null) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('email es requerido');
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(normalized)) {
      throw new BadRequestException('email no es valido');
    }

    return normalized;
  }

  private normalizeUserStatus(
    status: 'active' | 'inactive' | 'pending' | undefined | null,
  ): 'active' | 'inactive' | 'pending' {
    if (!status) {
      return 'pending';
    }

    if (!['active', 'inactive', 'pending'].includes(status)) {
      throw new BadRequestException('status no es valido');
    }

    return status;
  }

  private normalizeRoleCodes(roles: string[] | undefined) {
    if (!roles) {
      return [];
    }

    return Array.from(new Set(roles.map((role) => role.trim()).filter(Boolean)));
  }

  private async assertUserInputIntegrity(
    input: {
      institutionId: string | null;
      email: string;
      displayName: string | undefined;
      status: 'active' | 'inactive' | 'pending';
      roles: string[];
    },
    currentUserId?: string,
  ) {
    if (!input.displayName) {
      throw new BadRequestException('displayName es requerido');
    }

    if (input.displayName.length > 160) {
      throw new BadRequestException('displayName no puede exceder 160 caracteres');
    }

    if (input.institutionId) {
      const institution = await this.institutionsService.findById(input.institutionId);
      if (!institution) {
        throw new NotFoundException('Institution not found');
      }
    }

    const duplicate = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.users
        WHERE LOWER(email) = LOWER($1)
          AND ($2::uuid IS NULL OR id <> $2::uuid)
        LIMIT 1
      `,
      [input.email, currentUserId ?? null],
    );
    if (duplicate.rows.length > 0) {
      throw new ConflictException(`Ya existe un usuario con el correo ${input.email}.`);
    }

    if (input.roles.length > 0) {
      const knownRoles = await this.postgresService.query<{ code: string }>(
        `
          SELECT code
          FROM core.roles
          WHERE code = ANY($1::text[])
        `,
        [input.roles],
      );
      const knownRoleSet = new Set(knownRoles.rows.map((row) => row.code));
      const missingRoles = input.roles.filter((role) => !knownRoleSet.has(role));
      if (missingRoles.length > 0) {
        throw new BadRequestException(
          `Roles no encontrados en catalogo: ${missingRoles.join(', ')}.`,
        );
      }
    }
  }

  private async replaceUserRoles(client: PoolClient, userId: string, roleCodes: string[]) {
    await client.query(
      `
        DELETE FROM core.user_roles
        WHERE user_id = $1::uuid
      `,
      [userId],
    );

    if (roleCodes.length === 0) {
      return;
    }

    await client.query(
      `
        INSERT INTO core.user_roles (user_id, role_id)
        SELECT $1::uuid, r.id
        FROM core.roles r
        WHERE r.code = ANY($2::text[])
      `,
      [userId, roleCodes],
    );
  }

  private async replaceRolePermissions(client: PoolClient, roleId: string, permissionCodes: string[]) {
    await client.query(
      `
        DELETE FROM core.role_permissions
        WHERE role_id = $1::uuid
      `,
      [roleId],
    );

    if (permissionCodes.length === 0) {
      return;
    }

    await client.query(
      `
        INSERT INTO core.role_permissions (role_id, permission_id)
        SELECT $1::uuid, p.id
        FROM core.permissions p
        WHERE p.code = ANY($2::text[])
      `,
      [roleId, permissionCodes],
    );
  }

  private async assertSuperadminRoleCanBeRemoved(userId: string) {
    const result = await this.postgresService.query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM core.user_roles ur
        INNER JOIN core.roles r ON r.id = ur.role_id
        WHERE r.code = 'superadmin'
          AND ur.user_id <> $1::uuid
      `,
      [userId],
    );

    if ((result.rows[0]?.total ?? 0) === 0) {
      throw new ForbiddenException(
        'No se puede remover o eliminar el ultimo usuario con rol superadmin.',
      );
    }
  }

  private normalizeRoleCode(value: string | undefined | null) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('code es requerido');
    }

    if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
      throw new BadRequestException(
        'code debe usar minúsculas, números o guion bajo y comenzar con letra.',
      );
    }

    return normalized;
  }

  private normalizeEgiCode(value: string | undefined | null) {
    const normalized = value?.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('code es requerido');
    }

    if (!/^[A-Z][A-Z0-9_-]*$/.test(normalized)) {
      throw new BadRequestException(
        'code del EGI debe iniciar con letra y solo usar mayúsculas, números, guion o guion bajo.',
      );
    }

    return normalized.replace(/_/g, '-');
  }

  private isProtectedRoleCode(code: string) {
    return this.authService.getSupportedRoles().includes(code as never);
  }

  private async assertRoleInputIntegrity(
    input: {
      code: string;
      name: string | undefined;
      permissions: string[];
    },
    currentRoleId?: string,
  ) {
    if (!input.name) {
      throw new BadRequestException('name es requerido');
    }

    if (input.name.length > 160) {
      throw new BadRequestException('name no puede exceder 160 caracteres');
    }

    const duplicate = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.roles
        WHERE LOWER(code) = LOWER($1)
          AND ($2::uuid IS NULL OR id <> $2::uuid)
        LIMIT 1
      `,
      [input.code, currentRoleId ?? null],
    );

    if (duplicate.rows.length > 0) {
      throw new ConflictException(`Ya existe un rol con el código ${input.code}.`);
    }

    if (input.permissions.length > 0) {
      const knownPermissions = await this.postgresService.query<{ code: string }>(
        `
          SELECT code
          FROM core.permissions
          WHERE code = ANY($1::text[])
        `,
        [input.permissions],
      );
      const knownPermissionSet = new Set(knownPermissions.rows.map((row) => row.code));
      const missingPermissions = input.permissions.filter(
        (permission) => !knownPermissionSet.has(permission),
      );
      if (missingPermissions.length > 0) {
        throw new BadRequestException(
          `Permisos no encontrados en catalogo: ${missingPermissions.join(', ')}.`,
        );
      }
    }
  }

  private async normalizePermissionCodes(permissions: string[] | undefined) {
    if (!permissions) {
      return [];
    }

    return Array.from(
      new Set(permissions.map((permission) => permission.trim().toLowerCase()).filter(Boolean)),
    ).sort();
  }

  private async recordAudit(
    actorEmail: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    source: string,
    result: string,
    details: Record<string, unknown>,
    egiId: string | null = null,
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
        VALUES ($1, $2::uuid, $3, $4, $5::uuid, $6, $7, $8::jsonb)
      `,
      [actorUserId, egiId, action, entityType, entityId, source, result, JSON.stringify(details)],
    );
  }

  private async resolveActorUserId(actorEmail: string | null): Promise<string | null> {
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

  private async assertSourceInputIntegrity(
    input: {
      institutionId: string;
      connectorId?: string;
      code: string;
      name: string;
      sourceType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
      assetUid?: string | null;
      description?: string | null;
      userName?: string | null;
      status?: 'active' | 'inactive';
    },
    sourceId?: string,
  ) {
    const institution = await this.institutionsService.findById(input.institutionId);
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    if (input.connectorId) {
      const connector = await this.connectorsService.findById(input.connectorId);
      if (!connector) {
        throw new NotFoundException('Connector not found');
      }
      if (connector.institutionId !== input.institutionId) {
        throw new BadRequestException(
          'El conector seleccionado no pertenece a la institución indicada.',
        );
      }
    }

    if (!input.code?.trim()) {
      throw new BadRequestException('code es requerido');
    }
    if (!input.name?.trim()) {
      throw new BadRequestException('name es requerido');
    }
    if (
      input.sourceType === 'kobo' &&
      !normalizeOptionalText(input.assetUid ?? undefined)
    ) {
      throw new BadRequestException(
        'Las fuentes Kobo requieren assetUid para habilitar extracción directa por API.',
      );
    }
    if (
      input.status !== undefined &&
      input.status !== 'active' &&
      input.status !== 'inactive'
    ) {
      throw new BadRequestException('status debe ser active o inactive');
    }

    const duplicate = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.data_sources
        WHERE LOWER(code) = LOWER($1)
          AND ($2::uuid IS NULL OR id <> $2::uuid)
        LIMIT 1
      `,
      [input.code.trim(), sourceId ?? null],
    );

    if (duplicate.rows.length > 0) {
      throw new ConflictException(`Ya existe una fuente con el código ${input.code.trim()}.`);
    }
  }

  private async assertConnectorInputIntegrity(
    input: {
      institutionId: string;
      connectorType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
      displayName: string;
      description?: string | null;
      endpointUrl?: string | null;
      userName?: string | null;
      httpMethod?: string | null;
      authScheme?: string | null;
      resourcePath?: string | null;
      timeoutMs?: number | null;
      credentialSecret?: string | null;
      status?: 'active' | 'inactive';
    },
    connectorId?: string,
  ) {
    const institution = await this.institutionsService.findById(input.institutionId);
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    if (!input.displayName?.trim()) {
      throw new BadRequestException('displayName es requerido');
    }

    const validTypes = new Set(['kobo', 'excel', 'odoo', 'postgis', 'api']);
    if (!validTypes.has(input.connectorType)) {
      throw new BadRequestException('connectorType no es válido');
    }

    if (input.connectorType === 'api' && !normalizeOptionalText(input.endpointUrl ?? undefined)) {
      throw new BadRequestException(
        'Los conectores Web Service requieren endpointUrl para poder integrarse.',
      );
    }

    const normalizedMethod = normalizeOptionalText(input.httpMethod ?? undefined);
    if (
      normalizedMethod &&
      !new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).has(normalizedMethod.toUpperCase())
    ) {
      throw new BadRequestException('httpMethod debe ser GET, POST, PUT, PATCH o DELETE.');
    }

    const normalizedAuthScheme = normalizeOptionalText(input.authScheme ?? undefined);
    if (
      normalizedAuthScheme &&
      !new Set(['none', 'basic', 'bearer', 'api_key']).has(normalizedAuthScheme)
    ) {
      throw new BadRequestException('authScheme no es válido para el conector Web Service.');
    }

    if (input.timeoutMs !== undefined && normalizeTimeoutMs(input.timeoutMs ?? undefined) === null) {
      throw new BadRequestException(
        'timeoutMs debe ser un entero positivo menor o igual a 120000.',
      );
    }

    if (
      input.status !== undefined &&
      input.status !== 'active' &&
      input.status !== 'inactive'
    ) {
      throw new BadRequestException('status debe ser active o inactive');
    }

    const duplicate = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.connectors
        WHERE institution_id = $1::uuid
          AND LOWER(display_name) = LOWER($2)
          AND ($3::uuid IS NULL OR id <> $3::uuid)
        LIMIT 1
      `,
      [input.institutionId, input.displayName.trim(), connectorId ?? null],
    );

    if (duplicate.rows.length > 0) {
      throw new ConflictException(
        `Ya existe un conector con el nombre ${input.displayName.trim()} en la institución seleccionada.`,
      );
    }
  }
}

type SourceRow = {
  id: string;
  egi_id: string | null;
  institution_id: string;
  connector_id: string | null;
  code: string;
  name: string;
  source_type: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  status: 'active' | 'inactive';
  config_json: Record<string, unknown>;
  last_ingested_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type InstitutionRow = {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'inactive';
};

type EgiRow = {
  id: string;
  institution_id: string | null;
  institution_name?: string | null;
  code: string;
  name: string;
  description: string | null;
  responsible: string | null;
  territorial_scope: string | null;
  thematic_scope: string | null;
  visibility: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  active_user_role?: string | null;
  permissions_json?: unknown;
  last_egi_selected_at?: Date | null;
};

type ConnectorRow = {
  id: string;
  institution_id: string;
  connector_type: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  display_name: string;
  status: 'active' | 'inactive';
  config_json: Record<string, unknown>;
  last_sync_at: Date | null;
};

type DependencyCountRow = {
  dependency: string;
  total: number;
};

type ValidationRow = {
  id: string;
  egi_id: string | null;
  dataset_version_id: string;
  rule_code: string;
  status: string;
  message: string;
  assigned_to_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type PublicationRow = {
  id: string;
  dataset_id: string | null;
  target: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type IncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type UserRow = {
  id: string;
  institution_id: string | null;
  institution_name: string | null;
  email: string;
  display_name: string;
  status: string;
  has_password: boolean;
  roles: string[];
};

type RoleRow = {
  id: string;
  code: string;
  name: string;
  permissions: Array<{
    id: string;
    code: string;
    name: string;
  }>;
};

type PermissionRow = {
  id: string;
  code: string;
  name: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  egi_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  source: string;
  result: string;
  details_json: Record<string, unknown>;
  created_at: Date;
};

export function mapSourceRow(row: SourceRow) {
  return {
    id: row.id,
    egiId: row.egi_id,
    institutionId: row.institution_id,
    connectorId: row.connector_id,
    code: row.code,
    name: row.name,
    sourceType: row.source_type,
    status: row.status,
    description: readSourceConfigText(row.config_json, 'description'),
    assetUid: readSourceConfigText(row.config_json, 'assetUid'),
    userName: readSourceConfigText(row.config_json, 'userName'),
    country: readSourceConfigText(row.config_json, 'country'),
    territorialScope: readSourceConfigText(row.config_json, 'territorialScope'),
    allowedCountries: readSourceConfigStringArray(row.config_json, 'allowedCountries'),
    config: redactSecrets(row.config_json ?? {}),
    lastIngestedAt: row.last_ingested_at ? row.last_ingested_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapInstitutionRow(row: InstitutionRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
  };
}

function mapEgiRow(row: EgiRow) {
  const permissions = Array.isArray(row.permissions_json)
    ? row.permissions_json.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    id: row.id,
    institutionId: row.institution_id,
    institutionName: row.institution_name ?? null,
    code: row.code,
    name: row.name,
    description: row.description,
    responsible: row.responsible,
    territorialScope: row.territorial_scope,
    thematicScope: row.thematic_scope,
    visibility: row.visibility,
    status: row.status,
    activeUserRole: row.active_user_role ?? null,
    effectivePermissions: permissions,
    lastSelectedAt: row.last_egi_selected_at ? row.last_egi_selected_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function mapConnectorRow(row: ConnectorRow) {
  return {
    id: row.id,
    institutionId: row.institution_id,
    connectorType: row.connector_type,
    displayName: row.display_name,
    status: row.status,
    description: readSourceConfigText(row.config_json, 'description'),
    endpointUrl:
      readSourceConfigText(row.config_json, 'endpointUrl') ??
      readSourceConfigText(row.config_json, 'baseUrl'),
    userName:
      readSourceConfigText(row.config_json, 'userName') ??
      readSourceConfigText(row.config_json, 'username'),
    httpMethod: readSourceConfigText(row.config_json, 'httpMethod'),
    authScheme: readSourceConfigText(row.config_json, 'authScheme'),
    resourcePath: readSourceConfigText(row.config_json, 'resourcePath'),
    timeoutMs: readSourceConfigNumber(row.config_json, 'timeoutMs'),
    credentialsConfigured: Boolean(
      readSourceConfigText(row.config_json, 'credentialSecret') ??
        readSourceConfigText(row.config_json, 'token') ??
        readSourceConfigText(row.config_json, 'apiKey') ??
        readSourceConfigText(row.config_json, 'password'),
    ),
    config: redactSecrets(row.config_json ?? {}),
    lastSyncAt: row.last_sync_at ? row.last_sync_at.toISOString() : null,
  };
}

function mapUserRow(row: UserRow) {
  return {
    id: row.id,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    hasPassword: row.has_password,
    roles: row.roles,
  };
}

function mapRoleRow(row: RoleRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    permissions: Array.isArray(row.permissions)
      ? row.permissions
          .filter(
            (permission) =>
              permission &&
              typeof permission.id === 'string' &&
              typeof permission.code === 'string' &&
              typeof permission.name === 'string',
          )
          .sort((left, right) => left.name.localeCompare(right.name))
      : [],
  };
}

function normalizeOptionalText(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeTimeoutMs(value: number | undefined | null) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }

  if (value <= 0 || value > 120000) {
    return null;
  }

  return value;
}

function normalizeStringArray(values: string[] | undefined | null) {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  }

  return Array.from(unique.values());
}

function readSourceConfigText(
  config: Record<string, unknown> | null | undefined,
  key: string,
) {
  const raw = config?.[key];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function readSourceConfigNumber(
  config: Record<string, unknown> | null | undefined,
  key: string,
) {
  const raw = config?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function readSourceConfigStringArray(
  config: Record<string, unknown> | null | undefined,
  key: string,
) {
  const raw = config?.[key];
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
