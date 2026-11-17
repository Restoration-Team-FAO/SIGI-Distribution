import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { URL } from 'url';
import { getValidatedEnv } from '../../common/config/env';
import { PostgresService } from '../../common/db/postgres.service';
import { requestInternalJson } from '../../common/http/internal-service-client';
import { ImportsService } from '../imports/imports.service';
import { SyncJobsService } from '../sync-jobs/sync-jobs.service';

type OdooSourceListRow = {
  source_id: string;
  source_code: string;
  source_name: string;
  source_status: string;
  source_type: string;
  source_created_at: Date;
  source_updated_at: Date;
  source_last_ingested_at: Date | null;
  connector_id: string;
  connector_status: string;
  connector_last_sync_at: Date | null;
  connector_display_name: string;
  institution_id: string;
  institution_name: string;
  config_id: string | null;
  base_url: string | null;
  database_name: string | null;
  username: string | null;
  mapping_profile_id: string | null;
  mapping_profile_name: string | null;
  is_active: boolean | null;
  config_status: string | null;
  last_test_at: Date | null;
  last_test_status: string | null;
  last_test_error: string | null;
  last_sync_job_id: string | null;
  last_sync_at: Date | null;
  config_created_at: Date | null;
  config_updated_at: Date | null;
  credentials_configured: boolean;
};

type OdooMappingProfileRow = {
  id: string;
  source_id: string;
  source_name: string;
  entity_type: string;
  profile_name: string;
  version: number;
  mapping_json: Record<string, unknown>;
  key_resolution_json: Record<string, unknown>;
  is_default: boolean;
  status: string;
  updated_at: Date;
};

type CreateOdooSourceInput = {
  sourceName: string;
  sourceCode?: string;
  institutionId: string;
  baseUrl: string;
  databaseName: string;
  username: string;
  password: string;
  mappingProfileId?: string | null;
  isActive?: boolean;
};

type UpdateOdooSourceInput = {
  sourceName?: string;
  sourceCode?: string;
  institutionId?: string;
  baseUrl?: string;
  databaseName?: string;
  username?: string;
  password?: string;
  mappingProfileId?: string | null;
  isActive?: boolean;
  status?: string;
};

type TestConnectionInput = {
  sourceId?: string;
  baseUrl?: string;
  databaseName?: string;
  username?: string;
  password?: string;
};

type OdooConnectionResponse = {
  ok: boolean;
  mode: 'live' | 'mock';
  message: string;
  latencyMs?: number;
};

type RunSyncResponse = {
  connectorId: string;
  jobId: string;
  status: string;
};

type OdooSyncSelectionInput = {
  institutionLimit?: number | string;
  institutionCodes?: string[];
};

type OdooPreviewResponse = {
  ok: boolean;
  mode: 'live' | 'mock';
  sourceId: string | null;
  institutionsFound: number;
  institutionsSelected: number;
  institutionCodesSelected: string[];
  projectsEstimated: number;
  selectionApplied: boolean;
  message: string;
};

type IntegrationTestResponse = {
  ok: boolean;
  mode: 'live' | 'mock';
  message: string;
  latencyMs?: number;
};

type IntegrationPreviewResponse = OdooPreviewResponse;

type OdooShapefileInput = {
  fileBuffer?: Buffer;
  fileName?: string | null;
  mappingJson?: string | null;
  country?: string;
  createMissingProjects?: boolean;
};

type OdooShapefileValidationIssue = {
  rowNumber: number;
  code: string;
  message: string;
  severity: string;
};

type OdooShapefileCanonicalRow = {
  rowNumber: number;
  project_code: string;
  territory_code: string;
  territory_name: string;
  territory_level: string;
  country: string;
  area_ha: number;
  geometry_wkt: string;
  source_crs: string;
  raw_properties: Record<string, unknown>;
};

type OdooShapefileValidationSummary = {
  validRows: number;
  invalidRows: number;
  warningRows: number;
  errorCount: number;
  warningCount: number;
};

type OdooShapefilePreviewResponse = {
  ok: boolean;
  fileName: string;
  recordCount: number;
  featureCount: number;
  geometryType: string;
  crs: string;
  detectedColumns: string[];
  requiredFields: string[];
  mappingSuggested: Record<string, string>;
  mappingApplied: Record<string, string>;
  bbox?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  } | null;
  countries?: string[];
  territoryLevels?: string[];
  geographicSummary?: {
    insideNationalBoundsRows: number;
    outsideNationalBoundsRows: number;
    configuredNationalBBox: {
      minLon: number;
      minLat: number;
      maxLon: number;
      maxLat: number;
    } | null;
  } | null;
  validationSummary: OdooShapefileValidationSummary;
  validationIssues: OdooShapefileValidationIssue[];
  previewRows: Record<string, unknown>[];
  rows?: OdooShapefileCanonicalRow[];
};

type ImportBatchGeographicDetails = {
  shapefilePreview?: {
    fileName: string;
    geometryType: string;
    crs: string;
    bbox?: {
      minLon: number;
      minLat: number;
      maxLon: number;
      maxLat: number;
    } | null;
    countries?: string[];
    territoryLevels?: string[];
    geographicSummary?: {
      insideNationalBoundsRows: number;
      outsideNationalBoundsRows: number;
      configuredNationalBBox: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
      } | null;
    } | null;
    validationSummary: OdooShapefileValidationSummary;
  };
};

type OdooProjectUpsertRow = {
  projectCode: string;
  projectName: string;
  startDate: string;
  endDate: string;
  totalAreaHa: number;
  status: string;
};

type IntegrationProjectUpsertResponse = {
  ok: boolean;
  mode: 'live' | 'mock';
  sourceId: string;
  model: string;
  totals: {
    received: number;
    created: number;
    existing: number;
    failed: number;
  };
  createdProjectCodes: string[];
  existingProjectCodes: string[];
  failedRows: Array<{
    projectCode: string | null;
    error: string;
  }>;
  message?: string;
};

@Injectable()
export class OdooSourcesService {
  private readonly logger = new Logger(OdooSourcesService.name);

  constructor(
    private readonly postgresService: PostgresService,
    private readonly syncJobsService: SyncJobsService,
    private readonly importsService: ImportsService,
  ) {}

  async list() {
    const result = await this.postgresService.query<OdooSourceListRow>(
      `
        SELECT
          ds.id AS source_id,
          ds.code AS source_code,
          ds.name AS source_name,
          ds.status AS source_status,
          ds.source_type,
          ds.created_at AS source_created_at,
          ds.updated_at AS source_updated_at,
          ds.last_ingested_at AS source_last_ingested_at,
          c.id AS connector_id,
          c.status AS connector_status,
          c.last_sync_at AS connector_last_sync_at,
          c.display_name AS connector_display_name,
          i.id AS institution_id,
          i.name AS institution_name,
          osc.id AS config_id,
          osc.base_url,
          osc.database_name,
          osc.username,
          osc.mapping_profile_id,
          mp.profile_name AS mapping_profile_name,
          osc.is_active,
          osc.status AS config_status,
          osc.last_test_at,
          osc.last_test_status,
          osc.last_test_error,
          osc.last_sync_job_id,
          osc.last_sync_at,
          osc.created_at AS config_created_at,
          osc.updated_at AS config_updated_at,
          (osc.password_encrypted IS NOT NULL) AS credentials_configured
        FROM core.data_sources ds
        INNER JOIN core.connectors c
          ON c.id = ds.connector_id
        INNER JOIN core.institutions i
          ON i.id = ds.institution_id
        LEFT JOIN integration.odoo_source_configs osc
          ON osc.source_id = ds.id
        LEFT JOIN integration.source_mapping_profiles mp
          ON mp.id = osc.mapping_profile_id
        WHERE ds.source_type = 'odoo'
        ORDER BY ds.updated_at DESC, ds.created_at DESC
      `,
    );

    return result.rows.map(mapOdooSourceRow);
  }

  async getBySourceId(sourceId: string) {
    const result = await this.postgresService.query<OdooSourceListRow>(
      `
        SELECT
          ds.id AS source_id,
          ds.code AS source_code,
          ds.name AS source_name,
          ds.status AS source_status,
          ds.source_type,
          ds.created_at AS source_created_at,
          ds.updated_at AS source_updated_at,
          ds.last_ingested_at AS source_last_ingested_at,
          c.id AS connector_id,
          c.status AS connector_status,
          c.last_sync_at AS connector_last_sync_at,
          c.display_name AS connector_display_name,
          i.id AS institution_id,
          i.name AS institution_name,
          osc.id AS config_id,
          osc.base_url,
          osc.database_name,
          osc.username,
          osc.mapping_profile_id,
          mp.profile_name AS mapping_profile_name,
          osc.is_active,
          osc.status AS config_status,
          osc.last_test_at,
          osc.last_test_status,
          osc.last_test_error,
          osc.last_sync_job_id,
          osc.last_sync_at,
          osc.created_at AS config_created_at,
          osc.updated_at AS config_updated_at,
          (osc.password_encrypted IS NOT NULL) AS credentials_configured
        FROM core.data_sources ds
        INNER JOIN core.connectors c
          ON c.id = ds.connector_id
        INNER JOIN core.institutions i
          ON i.id = ds.institution_id
        LEFT JOIN integration.odoo_source_configs osc
          ON osc.source_id = ds.id
        LEFT JOIN integration.source_mapping_profiles mp
          ON mp.id = osc.mapping_profile_id
        WHERE ds.source_type = 'odoo'
          AND ds.id = $1::uuid
      `,
      [sourceId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Odoo source not found');
    }

    return mapOdooSourceRow(row);
  }

  async listMappingProfiles(input: { sourceId?: string; institutionId?: string }) {
    const result = await this.postgresService.query<OdooMappingProfileRow>(
      `
        SELECT
          mp.id,
          mp.source_id,
          ds.name AS source_name,
          mp.entity_type,
          mp.profile_name,
          mp.version,
          mp.mapping_json,
          mp.key_resolution_json,
          mp.is_default,
          mp.status,
          mp.updated_at
        FROM integration.source_mapping_profiles mp
        INNER JOIN core.data_sources ds
          ON ds.id = mp.source_id
        WHERE mp.status = 'active'
          AND ($1::uuid IS NULL OR mp.source_id = $1::uuid)
          AND ($2::uuid IS NULL OR ds.institution_id = $2::uuid)
        ORDER BY ds.name ASC, mp.entity_type ASC, mp.version DESC
      `,
      [input.sourceId ?? null, input.institutionId ?? null],
    );

    return result.rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      entityType: row.entity_type,
      profileName: row.profile_name,
      version: row.version,
      mappingJson: row.mapping_json ?? {},
      keyResolutionJson: row.key_resolution_json ?? {},
      isDefault: row.is_default,
      status: row.status,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async create(input: CreateOdooSourceInput, actorEmail: string | null) {
    this.validateCreateInput(input);
    await this.ensureInstitutionExists(input.institutionId);
    if (input.mappingProfileId) {
      await this.ensureMappingProfileExists(input.mappingProfileId);
    }

    const actorUserId = await this.resolveActorUserId(actorEmail);
    const isActive = input.isActive ?? true;
    const sourceStatus = isActive ? 'active' : 'inactive';
    const sourceCode = await this.buildUniqueSourceCode(input.sourceCode ?? input.sourceName);

    const connectorResult = await this.postgresService.query<{ id: string }>(
      `
        INSERT INTO core.connectors (
          institution_id,
          connector_type,
          display_name,
          status,
          config_json
        )
        VALUES ($1::uuid, 'odoo', $2, $3, '{}'::jsonb)
        RETURNING id
      `,
      [input.institutionId, input.sourceName, sourceStatus],
    );
    const connectorId = connectorResult.rows[0].id;

    const sourceResult = await this.postgresService.query<{ id: string }>(
      `
        INSERT INTO core.data_sources (
          institution_id,
          connector_id,
          code,
          name,
          source_type,
          status,
          config_json
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, 'odoo', $5, '{}'::jsonb)
        RETURNING id
      `,
      [input.institutionId, connectorId, sourceCode, input.sourceName, sourceStatus],
    );
    const sourceId = sourceResult.rows[0].id;

    await this.postgresService.query(
      `
        INSERT INTO integration.odoo_source_configs (
          source_id,
          connector_id,
          base_url,
          database_name,
          username,
          password_encrypted,
          mapping_profile_id,
          is_active,
          status,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          $5,
          pgp_sym_encrypt($6, $7)::bytea,
          $8::uuid,
          $9,
          'configured',
          $10::uuid,
          $10::uuid
        )
      `,
      [
        sourceId,
        connectorId,
        input.baseUrl.trim(),
        input.databaseName.trim(),
        input.username.trim(),
        input.password,
        getValidatedEnv().sigiSecretsKey,
        input.mappingProfileId ?? null,
        isActive,
        actorUserId,
      ],
    );

    await this.recordAudit(
      actorEmail,
      'odoo_source.created',
      'data_source',
      sourceId,
      'api',
      'success',
      {
        connectorId,
        institutionId: input.institutionId,
        sourceCode,
        mappingProfileId: input.mappingProfileId ?? null,
      },
    );

    return this.getBySourceId(sourceId);
  }

  async update(sourceId: string, input: UpdateOdooSourceInput, actorEmail: string | null) {
    const current = await this.getBySourceId(sourceId);

    if (input.institutionId) {
      await this.ensureInstitutionExists(input.institutionId);
    }
    if (input.mappingProfileId) {
      await this.ensureMappingProfileExists(input.mappingProfileId);
    }

    const sourceName = (input.sourceName ?? current.sourceName).trim();
    const institutionId = input.institutionId ?? current.institutionId;
    const isActive = input.isActive ?? current.isActive;
    const sourceStatus = isActive ? 'active' : 'inactive';
    const actorUserId = await this.resolveActorUserId(actorEmail);

    let sourceCode = current.sourceCode;
    if (input.sourceCode && input.sourceCode.trim() && input.sourceCode.trim() !== current.sourceCode) {
      sourceCode = await this.buildUniqueSourceCode(input.sourceCode.trim(), sourceId);
    }

    await this.postgresService.query(
      `
        UPDATE core.connectors
        SET
          institution_id = $2::uuid,
          display_name = $3,
          status = $4,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [current.connectorId, institutionId, sourceName, sourceStatus],
    );

    await this.postgresService.query(
      `
        UPDATE core.data_sources
        SET
          institution_id = $2::uuid,
          code = $3,
          name = $4,
          status = $5,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [sourceId, institutionId, sourceCode, sourceName, sourceStatus],
    );

    const password = input.password?.trim() ?? null;
    const shouldReplacePassword = Boolean(password);
    const baseUrl = (input.baseUrl ?? current.baseUrl).trim();
    const databaseName = (input.databaseName ?? current.databaseName).trim();
    const username = (input.username ?? current.username).trim();
    const configStatus = (input.status ?? current.status ?? 'configured').trim() || 'configured';

    if (!current.configId) {
      if (!password) {
        throw new BadRequestException(
          'La fuente no tiene credencial guardada. Proporciona password para completar la configuración.',
        );
      }
      await this.postgresService.query(
        `
          INSERT INTO integration.odoo_source_configs (
            source_id,
            connector_id,
            base_url,
            database_name,
            username,
            password_encrypted,
            mapping_profile_id,
            is_active,
            status,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5,
            pgp_sym_encrypt($6, $7)::bytea,
            $8::uuid,
            $9,
            $10::text,
            $11::uuid,
            $11::uuid
          )
        `,
        [
          sourceId,
          current.connectorId,
          baseUrl,
          databaseName,
          username,
          password,
          getValidatedEnv().sigiSecretsKey,
          input.mappingProfileId ?? current.mappingProfileId ?? null,
          isActive,
          configStatus,
          actorUserId,
        ],
      );
    } else {
      await this.postgresService.query(
        `
          UPDATE integration.odoo_source_configs
          SET
            base_url = $2,
            database_name = $3,
            username = $4,
            password_encrypted = CASE
              WHEN $5::boolean = TRUE THEN pgp_sym_encrypt($6, $7)::bytea
              ELSE password_encrypted
            END,
            mapping_profile_id = $8::uuid,
            is_active = $9,
            status = $10,
            updated_by_user_id = $11::uuid,
            updated_at = NOW()
          WHERE source_id = $1::uuid
        `,
        [
          sourceId,
          baseUrl,
          databaseName,
          username,
          shouldReplacePassword,
          password,
          getValidatedEnv().sigiSecretsKey,
          input.mappingProfileId ?? current.mappingProfileId ?? null,
          isActive,
          configStatus,
          actorUserId,
        ],
      );
    }

    await this.recordAudit(
      actorEmail,
      'odoo_source.updated',
      'data_source',
      sourceId,
      'api',
      'success',
      {
        connectorId: current.connectorId,
        mappingProfileId: input.mappingProfileId ?? current.mappingProfileId ?? null,
        isActive,
        credentialsReplaced: shouldReplacePassword,
      },
    );

    return this.getBySourceId(sourceId);
  }

  async testConnection(input: TestConnectionInput, actorEmail: string | null): Promise<OdooConnectionResponse> {
    const payload: Record<string, unknown> = {};
    if (input.sourceId) {
      payload.sourceId = input.sourceId;
    }
    if (input.baseUrl) {
      payload.baseUrl = input.baseUrl.trim();
    }
    if (input.databaseName) {
      payload.databaseName = input.databaseName.trim();
    }
    if (input.username) {
      payload.username = input.username.trim();
    }
    if (input.password) {
      payload.password = input.password;
    }

    const response = await this.requestIntegrationOdooTest(payload);

    await this.recordAudit(
      actorEmail,
      'odoo_source.connection_tested',
      'data_source',
      input.sourceId ?? null,
      'api',
      response.ok ? 'success' : 'failed',
      {
        mode: response.mode,
        message: response.message,
      },
    );

    if (input.sourceId) {
      await this.postgresService.query(
        `
          UPDATE integration.odoo_source_configs
          SET
            last_test_at = NOW(),
            last_test_status = $2,
            last_test_error = $3,
            status = CASE
              WHEN $2 = 'ok' THEN status
              ELSE 'connection_error'
            END,
            updated_at = NOW()
          WHERE source_id = $1::uuid
        `,
        [
          input.sourceId,
          response.ok ? 'ok' : 'error',
          response.ok ? null : response.message,
        ],
      );
    }

    return response;
  }

  async runSync(
    sourceId: string,
    selection: OdooSyncSelectionInput | undefined,
    actorEmail: string | null,
  ): Promise<RunSyncResponse> {
    const source = await this.getBySourceId(sourceId);
    if (!source.configId) {
      throw new BadRequestException('La fuente Odoo no tiene configuración guardada.');
    }
    if (!source.isActive) {
      throw new BadRequestException('La fuente Odoo está inactiva.');
    }

    const normalizedSelection = this.normalizeSelection(selection);

    const job = await this.syncJobsService.create({
      institutionId: source.institutionId,
      connectorId: source.connectorId,
      triggeredBy: 'user',
      mode: 'incremental',
      options: normalizedSelection,
    });

    await this.postgresService.query(
      `
        UPDATE integration.odoo_source_configs
        SET
          status = 'syncing',
          last_sync_job_id = $2::uuid,
          updated_at = NOW()
        WHERE source_id = $1::uuid
      `,
      [sourceId, job.jobId],
    );

    await this.recordAudit(
      actorEmail,
      'odoo_source.sync_requested',
      'data_source',
      sourceId,
      'api',
      'accepted',
      {
        connectorId: source.connectorId,
        jobId: job.jobId,
        selection: normalizedSelection,
      },
    );

    return {
      connectorId: source.connectorId,
      jobId: job.jobId,
      status: job.status,
    };
  }

  async getLastJob(sourceId: string) {
    const source = await this.getBySourceId(sourceId);
    let jobId = source.lastSyncJobId;
    if (!jobId) {
      const result = await this.postgresService.query<{ id: string }>(
        `
          SELECT id
          FROM core.sync_jobs
          WHERE connector_id = $1::uuid
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [source.connectorId],
      );
      jobId = result.rows[0]?.id ?? null;
    }
    if (!jobId) {
      return null;
    }
    return this.syncJobsService.findById(jobId);
  }

  async listBatches(sourceId: string) {
    await this.getBySourceId(sourceId);
    return this.importsService.listBatchesBySource(sourceId, 50);
  }

  async listErrors(sourceId: string) {
    await this.getBySourceId(sourceId);
    return this.importsService.listRecentErrorsBySource(sourceId, 100);
  }

  async previewSync(sourceId: string, selection: OdooSyncSelectionInput | undefined) {
    const source = await this.getBySourceId(sourceId);
    if (!source.configId) {
      throw new BadRequestException('La fuente Odoo no tiene configuración guardada.');
    }
    if (!source.isActive) {
      throw new BadRequestException('La fuente Odoo está inactiva.');
    }

    const normalizedSelection = this.normalizeSelection(selection);
    const preview = await this.requestIntegrationOdooPreview({
      sourceId,
      institutionLimit: normalizedSelection.institutionLimit,
      institutionCodes: normalizedSelection.institutionCodes,
    });
    return preview;
  }

  async previewShapefile(sourceId: string, input: OdooShapefileInput, actorEmail: string | null) {
    const source = await this.getBySourceId(sourceId);
    this.ensureShapefileInput(input);

    const preview = await this.requestGisShapefilePreview({
      fileBuffer: input.fileBuffer as Buffer,
      fileName: input.fileName ?? 'shapefile.zip',
      mappingJson: input.mappingJson ?? null,
      country: input.country ?? null,
    });

    await this.recordAudit(
      actorEmail,
      'odoo_source.shapefile_previewed',
      'data_source',
      sourceId,
      'api',
      'success',
      {
        connectorId: source.connectorId,
        featureCount: preview.featureCount,
        geometryType: preview.geometryType,
        invalidRows: preview.validationSummary.invalidRows,
        bbox: preview.bbox ?? null,
        countries: preview.countries ?? [],
        territoryLevels: preview.territoryLevels ?? [],
        geographicSummary: preview.geographicSummary ?? null,
      },
    );

    return preview;
  }

  async importShapefile(sourceId: string, input: OdooShapefileInput, actorEmail: string | null) {
    const source = await this.getBySourceId(sourceId);
    this.ensureShapefileInput(input);

    const transform = await this.requestGisShapefileTransform({
      fileBuffer: input.fileBuffer as Buffer,
      fileName: input.fileName ?? 'shapefile.zip',
      mappingJson: input.mappingJson ?? null,
      country: input.country ?? null,
    });

    if (transform.validationSummary.invalidRows > 0) {
      throw new BadRequestException(
        `El shapefile contiene ${transform.validationSummary.invalidRows} filas inválidas. Corrige validaciones antes de importar.`,
      );
    }

    const rows = transform.rows ?? [];
    if (rows.length === 0) {
      throw new BadRequestException(
        'No se detectaron filas válidas para importar en project_territories.',
      );
    }

    let odooProjectUpsert: IntegrationProjectUpsertResponse | null = null;
    let projectBootstrapBatchId: string | null = null;
    let missingProjectsDetected = 0;
    const autoCreateMissingProjects = input.createMissingProjects !== false;

    if (autoCreateMissingProjects) {
      const knownProjectKeys = await this.fetchResolvableProjectKeySet(sourceId);
      const missingProjects = this.collectMissingProjectsFromTerritories(
        rows,
        knownProjectKeys,
      );
      missingProjectsDetected = missingProjects.length;

      if (missingProjects.length > 0) {
        odooProjectUpsert = await this.requestIntegrationOdooUpsertProjects({
          sourceId,
          projects: missingProjects,
          dryRun: false,
        });
        if (!odooProjectUpsert.ok || odooProjectUpsert.totals.failed > 0) {
          const firstError = odooProjectUpsert.failedRows[0]?.error;
          throw new BadRequestException(
            `No se pudieron crear ${odooProjectUpsert.totals.failed} proyectos en Odoo antes de importar territorios.${firstError ? ` Detalle: ${firstError}` : ''}`,
          );
        }

        const institutionCode = await this.resolveInstitutionCodeById(source.institutionId);
        const bootstrapProjectsCsv = this.buildBootstrapProjectsCsv(
          missingProjects,
          institutionCode,
        );
        const projectBootstrapImportResult = await this.importsService.processUpload(
          {
            fileBuffer: bootstrapProjectsCsv,
            fileName: this.buildShapefileProjectBootstrapCsvName(input.fileName ?? 'shapefile.zip'),
            entityType: 'projects',
            sourceId,
          },
          actorEmail,
        );
        projectBootstrapBatchId = projectBootstrapImportResult.batch.id;
      }
    }

    const csvBuffer = this.buildProjectTerritoriesCsv(rows);
    const importFileName = this.buildShapefileCsvName(input.fileName ?? 'shapefile.zip');
    const importResult = await this.importsService.processUpload(
      {
        fileBuffer: csvBuffer,
        fileName: importFileName,
        entityType: 'project_territories',
        sourceId,
      },
      actorEmail,
    );

    const geometryResult = await this.persistShapefileGeometry({
      sourceId,
      batchId: importResult.batch.id,
      rows,
    });

    await this.mergeImportBatchDetails(importResult.batch.id, {
      shapefilePreview: {
        fileName: transform.fileName,
        geometryType: transform.geometryType,
        crs: transform.crs,
        bbox: transform.bbox ?? null,
        countries: transform.countries ?? [],
        territoryLevels: transform.territoryLevels ?? [],
        geographicSummary: transform.geographicSummary ?? null,
        validationSummary: transform.validationSummary,
      },
    });

    await this.recordAudit(
      actorEmail,
      'odoo_source.shapefile_imported',
      'data_source',
      sourceId,
      'api',
      'success',
      {
        connectorId: source.connectorId,
        batchId: importResult.batch.id,
        importedRows: rows.length,
        promotedRows: importResult.batch.promotedRows,
        missingProjectsDetected,
        odooProjectsCreated: odooProjectUpsert?.totals.created ?? 0,
        odooProjectsExisting: odooProjectUpsert?.totals.existing ?? 0,
        projectBootstrapBatchId,
        geoFeaturesPersisted: geometryResult.persisted,
        geoFeaturesSkipped: geometryResult.skipped,
        layerCode: geometryResult.layerCode,
        bbox: transform.bbox ?? null,
        countries: transform.countries ?? [],
        territoryLevels: transform.territoryLevels ?? [],
        geographicSummary: transform.geographicSummary ?? null,
      },
    );

    return {
      preview: {
        featureCount: transform.featureCount,
        geometryType: transform.geometryType,
        crs: transform.crs,
        validationSummary: transform.validationSummary,
      },
      batch: importResult.batch,
      errors: importResult.errors,
      missingProjectsDetected,
      odooProjectUpsert,
      projectBootstrapBatchId,
      geoFeaturesPersisted: geometryResult.persisted,
      geoFeaturesSkipped: geometryResult.skipped,
      layerCode: geometryResult.layerCode,
    };
  }

  private validateCreateInput(input: CreateOdooSourceInput) {
    if (!input.sourceName?.trim()) {
      throw new BadRequestException('sourceName es requerido');
    }
    if (!input.institutionId?.trim()) {
      throw new BadRequestException('institutionId es requerido');
    }
    if (!input.baseUrl?.trim()) {
      throw new BadRequestException('baseUrl es requerido');
    }
    if (!input.databaseName?.trim()) {
      throw new BadRequestException('databaseName es requerido');
    }
    if (!input.username?.trim()) {
      throw new BadRequestException('username es requerido');
    }
    if (!input.password?.trim()) {
      throw new BadRequestException('password es requerido');
    }
  }

  private async ensureInstitutionExists(institutionId: string) {
    const result = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.institutions
        WHERE id = $1::uuid
      `,
      [institutionId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Institution not found');
    }
  }

  private async ensureMappingProfileExists(mappingProfileId: string) {
    const result = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM integration.source_mapping_profiles
        WHERE id = $1::uuid
      `,
      [mappingProfileId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Mapping profile not found');
    }
  }

  private async buildUniqueSourceCode(input: string, currentSourceId?: string): Promise<string> {
    const base = normalizeSourceCode(input);
    let candidate = base;
    let suffix = 1;

    while (await this.isSourceCodeInUse(candidate, currentSourceId)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private async isSourceCodeInUse(code: string, currentSourceId?: string) {
    const result = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.data_sources
        WHERE code = $1
          AND ($2::uuid IS NULL OR id <> $2::uuid)
        LIMIT 1
      `,
      [code, currentSourceId ?? null],
    );
    return Boolean(result.rows[0]);
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

  private async recordAudit(
    actorEmail: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    source: string,
    result: string,
    details: Record<string, unknown>,
  ) {
    try {
      const actorUserId = await this.resolveActorUserId(actorEmail);
      await this.postgresService.query(
        `
          INSERT INTO core.audit_events (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            source,
            result,
            details_json
          )
          VALUES ($1, $2, $3, $4::uuid, $5, $6, $7::jsonb)
        `,
        [actorUserId, action, entityType, entityId, source, result, JSON.stringify(details)],
      );
    } catch (error) {
      this.logger.warn(
        `Audit persistence failed for ${action}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async mergeImportBatchDetails(
    batchId: string,
    details: ImportBatchGeographicDetails,
  ) {
    await this.postgresService.query(
      `
        UPDATE integration.import_batches
        SET
          details_json = COALESCE(details_json, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [batchId, JSON.stringify(details)],
    );
  }

  private requestIntegrationOdooTest(payload: Record<string, unknown>) {
    const env = getValidatedEnv();
    return requestInternalJson<IntegrationTestResponse>({
      serviceName: 'integration-service',
      baseUrl: env.integrationServiceUrl,
      path: '/odoo/test-connection',
      method: 'POST',
      timeoutMs: env.integrationServiceTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  private requestIntegrationOdooPreview(payload: {
    sourceId: string;
    institutionLimit?: number;
    institutionCodes?: string[];
  }) {
    const env = getValidatedEnv();
    return requestInternalJson<IntegrationPreviewResponse>({
      serviceName: 'integration-service',
      baseUrl: env.integrationServiceUrl,
      path: '/odoo/preview',
      method: 'POST',
      timeoutMs: env.integrationServiceTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  private requestIntegrationOdooUpsertProjects(payload: {
    sourceId: string;
    projects: OdooProjectUpsertRow[];
    dryRun?: boolean;
  }) {
    const env = getValidatedEnv();
    return requestInternalJson<IntegrationProjectUpsertResponse>({
      serviceName: 'integration-service',
      baseUrl: env.integrationServiceUrl,
      path: '/odoo/projects/upsert',
      method: 'POST',
      timeoutMs: env.integrationServiceTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceId: payload.sourceId,
        projects: payload.projects,
        dryRun: payload.dryRun ?? false,
      }),
    });
  }

  private normalizeSelection(selection: OdooSyncSelectionInput | undefined): {
    institutionLimit?: number;
    institutionCodes?: string[];
  } {
    const institutionCodes = selection?.institutionCodes
      ?.map((value) => value.trim())
      .filter((value) => value.length > 0);

    const institutionLimitRaw = selection?.institutionLimit;
    const hasLimit = institutionLimitRaw !== undefined && institutionLimitRaw !== null;
    let institutionLimit: number | undefined;
    if (hasLimit) {
      const numericValue =
        typeof institutionLimitRaw === 'string'
          ? Number.parseFloat(institutionLimitRaw)
          : institutionLimitRaw;
      if (!Number.isFinite(numericValue)) {
        throw new BadRequestException('institutionLimit debe ser numérico.');
      }
      const normalized = Math.floor(numericValue);
      if (normalized <= 0) {
        throw new BadRequestException('institutionLimit debe ser mayor que 0.');
      }
      institutionLimit = normalized;
    }

    const normalizedSelection: {
      institutionLimit?: number;
      institutionCodes?: string[];
    } = {};
    if (institutionLimit !== undefined) {
      normalizedSelection.institutionLimit = institutionLimit;
    }
    if (institutionCodes && institutionCodes.length > 0) {
      normalizedSelection.institutionCodes = institutionCodes;
    }
    return normalizedSelection;
  }

  private async fetchResolvableProjectKeySet(sourceId: string) {
    const result = await this.postgresService.query<{ key: string }>(
      `
        SELECT LOWER(code) AS key
        FROM core.projects
        WHERE code IS NOT NULL
        UNION
        SELECT LOWER(alias_key) AS key
        FROM core.project_keys
        WHERE active = TRUE
          AND (source_id = $1::uuid OR source_id IS NULL)
      `,
      [sourceId],
    );

    return new Set(
      result.rows
        .map((row) => row.key)
        .filter((key): key is string => typeof key === 'string' && key.length > 0),
    );
  }

  private collectMissingProjectsFromTerritories(
    rows: OdooShapefileCanonicalRow[],
    knownKeys: Set<string>,
  ) {
    const byCode = new Map<string, OdooProjectUpsertRow>();
    const now = new Date();
    const year = now.getUTCFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    for (const row of rows) {
      const projectCode = row.project_code?.trim();
      if (!projectCode) {
        continue;
      }
      const normalized = projectCode.toLowerCase();
      if (knownKeys.has(normalized)) {
        continue;
      }

      const existing = byCode.get(normalized);
      const area = Number.isFinite(row.area_ha) ? Math.max(0, row.area_ha) : 0;
      const inferredName =
        row.territory_name?.trim().length > 0
          ? `Proyecto ${projectCode} (${row.territory_name.trim()})`
          : `Proyecto ${projectCode}`;

      if (!existing) {
        byCode.set(normalized, {
          projectCode,
          projectName: inferredName,
          startDate,
          endDate,
          totalAreaHa: area,
          status: 'draft',
        });
        continue;
      }

      existing.totalAreaHa = Number((existing.totalAreaHa + area).toFixed(2));
    }

    return Array.from(byCode.values());
  }

  private async resolveInstitutionCodeById(institutionId: string) {
    const result = await this.postgresService.query<{ code: string | null }>(
      `
        SELECT code
        FROM core.institutions
        WHERE id = $1::uuid
      `,
      [institutionId],
    );
    const code = result.rows[0]?.code?.trim();
    if (!code) {
      throw new BadRequestException(
        `La institución asociada a la fuente Odoo no tiene código para crear proyectos bootstrap.`,
      );
    }
    return code;
  }

  private ensureShapefileInput(input: OdooShapefileInput) {
    if (!input.fileBuffer || input.fileBuffer.length === 0) {
      throw new BadRequestException('Debes adjuntar un shapefile .zip.');
    }
    const fileName = (input.fileName ?? '').toLowerCase();
    if (!fileName.endsWith('.zip')) {
      throw new BadRequestException('El archivo geoespacial debe enviarse como .zip.');
    }
  }

  private async requestGisShapefilePreview(input: {
    fileBuffer: Buffer;
    fileName: string;
    mappingJson: string | null;
    country: string | null;
  }): Promise<OdooShapefilePreviewResponse> {
    return this.requestGisShapefile('/shapefile/preview', input);
  }

  private async requestGisShapefileTransform(input: {
    fileBuffer: Buffer;
    fileName: string;
    mappingJson: string | null;
    country: string | null;
  }): Promise<OdooShapefilePreviewResponse> {
    return this.requestGisShapefile('/shapefile/transform', input);
  }

  private async requestGisShapefile(
    path: string,
    input: {
      fileBuffer: Buffer;
      fileName: string;
      mappingJson: string | null;
      country: string | null;
    },
  ): Promise<OdooShapefilePreviewResponse> {
    const env = getValidatedEnv();
    const fields: Record<string, string> = {};
    if (input.mappingJson && input.mappingJson.trim().length > 0) {
      fields.mappingJson = input.mappingJson.trim();
    }
    if (input.country && input.country.trim().length > 0) {
      fields.country = input.country.trim();
    }

    const multipart = this.encodeMultipartFormData({
      fields,
      fileField: 'file',
      fileName: input.fileName || 'shapefile.zip',
      filePayload: input.fileBuffer,
      fileContentType: 'application/zip',
    });

    return requestInternalJson<OdooShapefilePreviewResponse>({
      serviceName: 'gis-service',
      baseUrl: env.gisServiceUrl,
      path,
      method: 'POST',
      timeoutMs: env.gisServiceTimeoutMs,
      headers: {
        'Content-Type': multipart.contentType,
      },
      body: multipart.body,
    });
  }

  private buildProjectTerritoriesCsv(rows: OdooShapefileCanonicalRow[]) {
    const headers = [
      'project_code',
      'territory_code',
      'territory_name',
      'territory_level',
      'country',
      'area_ha',
    ];
    const csvLines = [headers.join(',')];
    for (const row of rows) {
      const values = [
        row.project_code,
        row.territory_code,
        row.territory_name,
        row.territory_level,
        row.country,
        String(row.area_ha),
      ].map((value) => this.escapeCsvValue(value));
      csvLines.push(values.join(','));
    }
    return Buffer.from(csvLines.join('\n'), 'utf-8');
  }

  private buildBootstrapProjectsCsv(
    rows: OdooProjectUpsertRow[],
    leadInstitutionCode: string,
  ) {
    const headers = [
      'project_code',
      'project_name',
      'lead_institution_code',
      'start_date',
      'end_date',
      'total_area_ha',
      'status',
      'project_aliases_json',
    ];
    const csvLines = [headers.join(',')];
    for (const row of rows) {
      const values = [
        row.projectCode,
        row.projectName,
        leadInstitutionCode,
        row.startDate,
        row.endDate,
        String(row.totalAreaHa),
        row.status,
        JSON.stringify([row.projectCode]),
      ].map((value) => this.escapeCsvValue(value));
      csvLines.push(values.join(','));
    }
    return Buffer.from(csvLines.join('\n'), 'utf-8');
  }

  private buildShapefileCsvName(originalName: string) {
    const normalized = originalName.trim() || 'shapefile.zip';
    const withoutExt = normalized.replace(/\.zip$/i, '');
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+$/, '')
      .replace('T', '');
    return `${withoutExt}_${timestamp}.csv`;
  }

  private buildShapefileProjectBootstrapCsvName(originalName: string) {
    const normalized = originalName.trim() || 'shapefile.zip';
    const withoutExt = normalized.replace(/\.zip$/i, '');
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+$/, '')
      .replace('T', '');
    return `${withoutExt}_projects_bootstrap_${timestamp}.csv`;
  }

  private escapeCsvValue(value: string) {
    const text = value ?? '';
    if (text.includes('"') || text.includes(',') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private encodeMultipartFormData(input: {
    fields: Record<string, string>;
    fileField: string;
    fileName: string;
    filePayload: Buffer;
    fileContentType: string;
  }) {
    const boundary = `----sigi-${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const chunks: Buffer[] = [];

    for (const [key, value] of Object.entries(input.fields)) {
      chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf-8'));
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${key}"\r\n\r\n`,
          'utf-8',
        ),
      );
      chunks.push(Buffer.from(`${value}\r\n`, 'utf-8'));
    }

    chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf-8'));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${input.fileField}"; filename="${input.fileName}"\r\n`,
        'utf-8',
      ),
    );
    chunks.push(
      Buffer.from(`Content-Type: ${input.fileContentType}\r\n\r\n`, 'utf-8'),
    );
    chunks.push(input.filePayload);
    chunks.push(Buffer.from('\r\n', 'utf-8'));
    chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));

    return {
      body: Buffer.concat(chunks),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  private async persistShapefileGeometry(input: {
    sourceId: string;
    batchId: string;
    rows: OdooShapefileCanonicalRow[];
  }) {
    const batchErrors = await this.importsService.listBatchErrors(input.batchId);
    const invalidRows = new Set(batchErrors.map((item) => item.rowNumber));
    const validRows = input.rows.filter((row) => !invalidRows.has(row.rowNumber));
    if (validRows.length === 0) {
      return {
        persisted: 0,
        skipped: 0,
        layerCode: 'odoo_project_territories',
      };
    }

    const layer = await this.postgresService.query<{ id: string }>(
      `
        INSERT INTO gis.geo_layers (
          code,
          name,
          layer_type,
          visibility,
          status
        )
        VALUES (
          'odoo_project_territories',
          'Odoo Project Territories',
          'project-territory',
          'private',
          'published'
        )
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
        RETURNING id
      `,
    );
    const layerId = layer.rows[0].id;

    const territoryCodes = Array.from(
      new Set(
        validRows
          .map((row) => row.territory_code.trim().toLowerCase())
          .filter((value) => value.length > 0),
      ),
    );
    const territories = await this.postgresService.query<{ id: string; key: string }>(
      `
        SELECT id, LOWER(code) AS key
        FROM core.territories
        WHERE LOWER(code) = ANY($1::text[])
      `,
      [territoryCodes],
    );
    const territoryMap = new Map(
      territories.rows.map((row) => [row.key, row.id] as const),
    );

    let persisted = 0;
    let skipped = 0;
    for (const row of validRows) {
      const territoryId = territoryMap.get(row.territory_code.trim().toLowerCase());
      if (!territoryId || !row.geometry_wkt) {
        skipped += 1;
        continue;
      }

      const properties = {
        sourceId: input.sourceId,
        batchId: input.batchId,
        projectCode: row.project_code,
        rowNumber: row.rowNumber,
        sourceCrs: row.source_crs,
        ...row.raw_properties,
      };

      await this.postgresService.query(
        `
          DELETE FROM gis.territory_features
          WHERE layer_id = $1::uuid
            AND territory_id = $2::uuid
        `,
        [layerId, territoryId],
      );

      try {
        await this.postgresService.query(
          `
            WITH deleted AS (
              DELETE FROM gis.territory_features
              WHERE layer_id = $1::uuid
                AND territory_id = $2::uuid
            )
            INSERT INTO gis.territory_features (
              territory_id,
              layer_id,
              area_ha,
              geometry,
              properties_json
            )
            VALUES (
              $2::uuid,
              $1::uuid,
              $3,
              ST_Multi(ST_GeomFromText($4, 4326)),
              $5::jsonb
            )
          `,
          [
            layerId,
            territoryId,
            row.area_ha,
            row.geometry_wkt,
            JSON.stringify(properties),
          ],
        );
        persisted += 1;
      } catch (error) {
        this.logger.warn(
          `Skipping shapefile feature for territory ${row.territory_code}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        skipped += 1;
      }
    }

    return {
      persisted,
      skipped,
      layerCode: 'odoo_project_territories',
    };
  }
}

function mapOdooSourceRow(row: OdooSourceListRow) {
  return {
    sourceId: row.source_id,
    sourceCode: row.source_code,
    sourceName: row.source_name,
    sourceStatus: row.source_status,
    sourceType: row.source_type,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    connectorId: row.connector_id,
    connectorStatus: row.connector_status,
    connectorDisplayName: row.connector_display_name,
    baseUrl: row.base_url ?? '',
    databaseName: row.database_name ?? '',
    username: row.username ?? '',
    credentialsConfigured: row.credentials_configured,
    mappingProfileId: row.mapping_profile_id,
    mappingProfileName: row.mapping_profile_name,
    configId: row.config_id,
    isActive: row.is_active ?? row.source_status === 'active',
    status: row.config_status ?? 'unconfigured',
    lastTestAt: row.last_test_at ? row.last_test_at.toISOString() : null,
    lastTestStatus: row.last_test_status,
    lastTestError: row.last_test_error,
    lastSyncJobId: row.last_sync_job_id,
    lastSyncAt: row.last_sync_at ? row.last_sync_at.toISOString() : null,
    sourceLastIngestedAt: row.source_last_ingested_at
      ? row.source_last_ingested_at.toISOString()
      : null,
    connectorLastSyncAt: row.connector_last_sync_at
      ? row.connector_last_sync_at.toISOString()
      : null,
    sourceCreatedAt: row.source_created_at.toISOString(),
    sourceUpdatedAt: row.source_updated_at.toISOString(),
    configCreatedAt: row.config_created_at ? row.config_created_at.toISOString() : null,
    configUpdatedAt: row.config_updated_at ? row.config_updated_at.toISOString() : null,
  };
}

function normalizeSourceCode(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return `odoo-source-${Date.now()}`;
  }
  if (normalized.startsWith('odoo-')) {
    return normalized;
  }
  return `odoo-${normalized}`;
}
