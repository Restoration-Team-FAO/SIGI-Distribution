import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { getValidatedEnv } from '../../common/config/env';
import { PostgresService } from '../../common/db/postgres.service';
import {
  incrementImportBatchCompleted,
  incrementImportBatchStarted,
} from '../../common/observability/metrics';

type ImportEntityType =
  | 'institutions'
  | 'projects'
  | 'project_indicators'
  | 'project_territories';

type ImportSourceFormat = 'csv' | 'xlsx';

type ImportUploadInput = {
  fileBuffer?: Buffer;
  fileName?: string | null;
  entityType?: ImportEntityType;
  sheetName?: string;
  sourceId?: string | null;
  mappingProfileId?: string | null;
  columnMapping?: Record<string, string> | string | null;
  egiId?: string | null;
};

type ParsedInputFile = {
  rows: Record<string, unknown>[];
  headers: string[];
  sheetName: string;
  sourceFormat: ImportSourceFormat;
  fileName: string;
};

type RowError = {
  rowNumber: number;
  errorCode: string;
  errorMessage: string;
  rawPayload: Record<string, unknown>;
};

type ProcessResult = {
  stagedRows: number;
  validRows: number;
  invalidRows: number;
  promotedRows: number;
  errors: RowError[];
  ruleResults: BatchRuleResultInput[];
  quality: BatchQuality;
};

type ImportProcessContext = {
  sourceId: string | null;
  egiId: string;
  validationCatalog: ImportValidationCatalog;
};

type ImportValidationCatalog = {
  knownCountries: Map<string, string>;
  territoryLevels: Set<string>;
  sourceScope: SourceScopeContext | null;
};

type SourceScopeContext = {
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  sourceCountry: string | null;
  allowedCountries: string[];
  territorialScope: string | null;
  egiTerritorialScope: string | null;
};

type BatchRuleResultInput = {
  ruleCode: string;
  severity: 'info' | 'warning' | 'error';
  status: 'passed' | 'warning' | 'failed';
  affectedRows: number;
  message: string;
  details: Record<string, unknown>;
};

type BatchQuality = {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  summary: Record<string, unknown>;
};

type ImportBatchRow = {
  id: string;
  egi_id: string | null;
  entity_type: string;
  source_format: string;
  file_name: string;
  sheet_name: string | null;
  status: string;
  source_id: string | null;
  mapping_profile_id: string | null;
  dataset_id: string | null;
  initiated_by_user_id: string | null;
  total_rows: number;
  staged_rows: number;
  valid_rows: number;
  invalid_rows: number;
  promoted_rows: number;
  quality_score: string | number | null;
  quality_grade: string;
  quality_json: Record<string, unknown>;
  details_json: Record<string, unknown>;
  started_at: Date;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ImportBatchErrorRow = {
  id: string;
  batch_id: string;
  entity_type: string;
  row_number: number;
  error_code: string;
  error_message: string;
  raw_payload: Record<string, unknown>;
  created_at: Date;
};

type ImportBatchRuleRow = {
  id: string;
  batch_id: string;
  entity_type: string;
  rule_code: string;
  severity: string;
  status: string;
  affected_rows: number;
  message: string;
  details_json: Record<string, unknown>;
  created_at: Date;
};

type MappingProfileRow = {
  id: string;
  source_id: string;
  entity_type: ImportEntityType;
  profile_name: string;
  mapping_json: Record<string, unknown>;
  key_resolution_json: Record<string, unknown>;
  is_default: boolean;
  status: string;
  version: number;
  source_name?: string;
  updated_at?: Date;
};

type BaseStagingRow = {
  rowNumber: number;
  rawPayload: Record<string, unknown>;
};

type StagingInstitutionRow = BaseStagingRow & {
  institutionCode: string | null;
  institutionName: string | null;
  country: string | null;
};

type StagingProjectRow = BaseStagingRow & {
  projectCode: string | null;
  projectAliases: string[];
  projectName: string | null;
  leadInstitutionCode: string | null;
  startDate: string | null;
  endDate: string | null;
  totalAreaHa: number | null;
  status: string | null;
};

type StagingProjectIndicatorRow = BaseStagingRow & {
  projectCode: string | null;
  indicatorCode: string | null;
  indicatorName: string | null;
  unit: string | null;
  valueNumeric: number | null;
  valueText: string | null;
  category: string | null;
  observedAt: string | null;
};

type StagingProjectTerritoryRow = BaseStagingRow & {
  projectCode: string | null;
  territoryCode: string | null;
  territoryName: string | null;
  territoryLevel: string | null;
  country: string | null;
  areaHa: number | null;
};

const REQUIRED_HEADERS_BY_ENTITY: Record<ImportEntityType, string[]> = {
  institutions: ['institution_code', 'institution_name', 'country'],
  projects: [
    'project_code',
    'project_name',
    'lead_institution_code',
    'start_date',
    'end_date',
    'total_area_ha',
  ],
  project_indicators: ['project_code', 'indicator_code', 'unit'],
  project_territories: ['project_code', 'country', 'area_ha'],
};

const ALLOWED_IMPORT_STATUSES = new Set([
  'received',
  'running',
  'completed',
  'completed_with_errors',
  'failed',
]);

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(private readonly postgresService: PostgresService) {}

  async processUpload(input: ImportUploadInput, actorEmail: string | null) {
    const egiId = input.egiId?.trim() || null;
    if (!egiId) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }
    const parsed = this.parseInputFile(input);
    const directColumnMapping = parseColumnMapping(input.columnMapping);
    const preMappedRows = applyColumnMapping(parsed.rows, directColumnMapping);
    const preMappedHeaders = collectHeaders(preMappedRows);
    const sourceId = input.sourceId ?? null;

    const mappingProfile = await this.resolveMappingProfile({
      sourceId,
      mappingProfileId: input.mappingProfileId ?? null,
      explicitEntityType: input.entityType ?? null,
      detectedHeaders: preMappedHeaders,
    });

    const profileColumnMapping = parseColumnMapping(mappingProfile?.mapping_json ?? null);
    const effectiveColumnMapping = {
      ...profileColumnMapping,
      ...directColumnMapping,
    };
    const mappedRows = applyColumnMapping(parsed.rows, effectiveColumnMapping);
    const mappedHeaders = collectHeaders(mappedRows);

    if (sourceId) {
      const sourceResult = await this.postgresService.query<{ id: string }>(
        `
          SELECT id
          FROM core.data_sources
          WHERE id = $1::uuid
            AND egi_id = $2::uuid
          LIMIT 1
        `,
        [sourceId, egiId],
      );
      if (sourceResult.rows.length === 0) {
        throw new BadRequestException('La fuente seleccionada no pertenece al EGI activo.');
      }
    }

    const detectedEntityType = tryDetectEntityType(mappedHeaders);
    const entityType =
      input.entityType ??
      mappingProfile?.entity_type ??
      detectedEntityType;
    if (!entityType) {
      throw new BadRequestException(
        `No se pudo detectar la entidad para encabezados: ${mappedHeaders.join(', ')}`,
      );
    }

    const actorUserId = await this.resolveActorUserId(actorEmail);
    const validationCatalog = await this.buildImportValidationCatalog(egiId, sourceId);
    const batch = await this.createBatch({
      entityType,
      egiId,
      sourceId,
      mappingProfileId: mappingProfile?.id ?? null,
      datasetId: null,
      sourceFormat: parsed.sourceFormat,
      fileName: parsed.fileName,
      sheetName: parsed.sheetName,
      initiatedByUserId: actorUserId,
      totalRows: mappedRows.length,
      details: {
        detectedHeaders: parsed.headers,
        preMappedHeaders,
        mappedHeaders,
        columnMapping: effectiveColumnMapping,
        directColumnMapping,
        profileColumnMapping,
        mappingProfile: mappingProfile
          ? {
              id: mappingProfile.id,
              sourceId: mappingProfile.source_id,
              entityType: mappingProfile.entity_type,
              version: mappingProfile.version,
              isDefault: mappingProfile.is_default,
            }
          : null,
        validationCatalog: {
          knownCountries: Array.from(validationCatalog.knownCountries.values()).sort((left, right) =>
            left.localeCompare(right),
          ),
          territoryLevels: Array.from(validationCatalog.territoryLevels.values()).sort((left, right) =>
            left.localeCompare(right),
          ),
          sourceScope: validationCatalog.sourceScope,
        },
      },
    });
    incrementImportBatchStarted();
    this.logger.log(
      JSON.stringify({
        event: 'import_batch_started',
        batchId: batch.id,
        entityType,
        sourceFormat: parsed.sourceFormat,
        sourceId,
        totalRows: mappedRows.length,
        fileName: parsed.fileName,
      }),
    );

    const requiredHeaders = REQUIRED_HEADERS_BY_ENTITY[entityType];
    const missingHeaders = requiredHeaders.filter(
      (header) => !mappedHeaders.includes(header),
    );
    if (missingHeaders.length > 0) {
      const error: RowError = {
        rowNumber: 1,
        errorCode: 'missing_headers',
        errorMessage: `Faltan columnas requeridas: ${missingHeaders.join(', ')}`,
        rawPayload: {
          detectedHeaders: parsed.headers,
          preMappedHeaders,
          mappedHeaders,
          columnMapping: effectiveColumnMapping,
          directColumnMapping,
          profileColumnMapping,
          mappingProfileId: mappingProfile?.id ?? null,
          requiredHeaders,
        },
      };
      await this.persistBatchErrors(batch.id, entityType, [error]);
      await this.completeBatch(batch.id, {
        status: 'failed',
        stagedRows: 0,
        validRows: 0,
        invalidRows: 0,
        promotedRows: 0,
        details: {
          ...batch.details_json,
          missingHeaders,
          quality: buildMissingHeadersQuality(missingHeaders, requiredHeaders),
        },
        quality: buildMissingHeadersQuality(missingHeaders, requiredHeaders),
      });
      await this.recordAudit(
        actorEmail,
        'import.batch.failed',
        'import_batch',
        batch.id,
        'api',
        'failed',
        {
          entityType,
          sourceFormat: parsed.sourceFormat,
          missingHeaders,
          columnMapping: effectiveColumnMapping,
          mappingProfileId: mappingProfile?.id ?? null,
          sourceId,
        },
        egiId,
      );
      incrementImportBatchCompleted(true);
      this.logger.warn(
        JSON.stringify({
          event: 'import_batch_failed',
          batchId: batch.id,
          entityType,
          sourceId,
          reason: 'missing_headers',
          missingHeaders,
        }),
      );
      throw new BadRequestException(error.errorMessage);
    }

    try {
      const result = await this.processRows(entityType, batch.id, mappedRows, {
        sourceId,
        egiId,
        validationCatalog,
      });
      const status = result.invalidRows > 0 ? 'completed_with_errors' : 'completed';
      await this.persistBatchRuleResults(batch.id, entityType, result.ruleResults);
      await this.completeBatch(batch.id, {
        status,
        stagedRows: result.stagedRows,
        validRows: result.validRows,
        invalidRows: result.invalidRows,
        promotedRows: result.promotedRows,
        details: {
          ...batch.details_json,
          quality: result.quality,
          ruleSummary: summarizeRuleResults(result.ruleResults),
        },
        quality: result.quality,
      });

      if (sourceId) {
        await this.touchSource(sourceId);
      }

      await this.recordAudit(
        actorEmail,
        'import.batch.completed',
        'import_batch',
        batch.id,
        'api',
        status,
        {
          entityType,
          sourceFormat: parsed.sourceFormat,
          totals: {
            totalRows: mappedRows.length,
            validRows: result.validRows,
            invalidRows: result.invalidRows,
            promotedRows: result.promotedRows,
          },
          sourceId,
          egiId,
          mappingProfileId: mappingProfile?.id ?? null,
          columnMapping: effectiveColumnMapping,
          quality: result.quality,
          ruleSummary: summarizeRuleResults(result.ruleResults),
        },
        egiId,
      );
      incrementImportBatchCompleted(false);
      this.logger.log(
        JSON.stringify({
          event: 'import_batch_completed',
          batchId: batch.id,
          entityType,
          sourceId,
          status,
          totalRows: mappedRows.length,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
          promotedRows: result.promotedRows,
          qualityScore: result.quality.score,
          qualityGrade: result.quality.grade,
          errorCount: result.errors.length,
        }),
      );

      const hydratedBatch = await this.getBatch(batch.id, egiId);
      return {
        batch: hydratedBatch,
        errors: result.errors.length,
      };
    } catch (error) {
      await this.completeBatch(batch.id, {
        status: 'failed',
        stagedRows: 0,
        validRows: 0,
        invalidRows: 0,
        promotedRows: 0,
        quality: {
          score: 0,
          grade: 'E',
          summary: {
            reason: 'runtime_failure',
          },
        },
      });

      await this.recordAudit(
        actorEmail,
        'import.batch.failed',
        'import_batch',
        batch.id,
        'api',
        'failed',
        {
          entityType,
          sourceFormat: parsed.sourceFormat,
          message: error instanceof Error ? error.message : 'Unexpected import error',
          columnMapping: effectiveColumnMapping,
          mappingProfileId: mappingProfile?.id ?? null,
          sourceId,
        },
        egiId,
      );
      incrementImportBatchCompleted(true);
      this.logger.error(
        JSON.stringify({
          event: 'import_batch_failed',
          batchId: batch.id,
          entityType,
          sourceId,
          sourceFormat: parsed.sourceFormat,
          message: error instanceof Error ? error.message : 'Unexpected import error',
        }),
      );
      throw error;
    }
  }

  async listBatches(egiId?: string | null, allowGlobal = false) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId && !allowGlobal) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }
    const result = await this.postgresService.query<ImportBatchRow>(
      `
        SELECT
          id,
          egi_id,
          entity_type,
          source_format,
          file_name,
          sheet_name,
          status,
          source_id,
          mapping_profile_id,
          dataset_id,
          initiated_by_user_id,
          total_rows,
          staged_rows,
          valid_rows,
          invalid_rows,
          promoted_rows,
          quality_score,
          quality_grade,
          quality_json,
          details_json,
          started_at,
          finished_at,
          created_at,
          updated_at
        FROM integration.import_batches
        ${normalizedEgiId ? 'WHERE egi_id = $1::uuid' : ''}
        ORDER BY created_at DESC
        LIMIT 100
      `,
      normalizedEgiId ? [normalizedEgiId] : [],
    );

    return result.rows.map(mapImportBatchRow);
  }

  async listBatchesBySource(sourceId: string, limit = 50) {
    const cappedLimit = Math.max(1, Math.min(limit, 200));
    const result = await this.postgresService.query<ImportBatchRow>(
      `
        SELECT
          id,
          entity_type,
          source_format,
          file_name,
          sheet_name,
          status,
          source_id,
          mapping_profile_id,
          dataset_id,
          initiated_by_user_id,
          total_rows,
          staged_rows,
          valid_rows,
          invalid_rows,
          promoted_rows,
          quality_score,
          quality_grade,
          quality_json,
          details_json,
          started_at,
          finished_at,
          created_at,
          updated_at
        FROM integration.import_batches
        WHERE source_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [sourceId, cappedLimit],
    );

    return result.rows.map(mapImportBatchRow);
  }

  async getBatch(batchId: string, egiId?: string | null, allowGlobal = false) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId && !allowGlobal) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }
    const result = await this.postgresService.query<ImportBatchRow>(
      `
        SELECT
          id,
          egi_id,
          entity_type,
          source_format,
          file_name,
          sheet_name,
          status,
          source_id,
          mapping_profile_id,
          dataset_id,
          initiated_by_user_id,
          total_rows,
          staged_rows,
          valid_rows,
          invalid_rows,
          promoted_rows,
          quality_score,
          quality_grade,
          quality_json,
          details_json,
          started_at,
          finished_at,
          created_at,
          updated_at
        FROM integration.import_batches
        WHERE id = $1
          ${normalizedEgiId ? 'AND egi_id = $2::uuid' : ''}
      `,
      normalizedEgiId ? [batchId, normalizedEgiId] : [batchId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Import batch not found');
    }

    return mapImportBatchRow(result.rows[0]);
  }

  async listBatchErrors(batchId: string, egiId?: string | null, allowGlobal = false) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId && !allowGlobal) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }
    const result = await this.postgresService.query<ImportBatchErrorRow>(
      `
        SELECT
          id,
          batch_id,
          entity_type,
          row_number,
          error_code,
          error_message,
          raw_payload,
          created_at
        FROM integration.import_batch_errors
        WHERE batch_id = $1
          AND EXISTS (
            SELECT 1
            FROM integration.import_batches b
            WHERE b.id = $1
              ${normalizedEgiId ? 'AND b.egi_id = $2::uuid' : ''}
          )
        ORDER BY row_number ASC, created_at ASC
        LIMIT 500
      `,
      normalizedEgiId ? [batchId, normalizedEgiId] : [batchId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      entityType: row.entity_type,
      rowNumber: row.row_number,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      rawPayload: row.raw_payload ?? {},
      createdAt: row.created_at.toISOString(),
    }));
  }

  async listRecentErrorsBySource(sourceId: string, limit = 100) {
    const cappedLimit = Math.max(1, Math.min(limit, 500));
    const result = await this.postgresService.query<
      ImportBatchErrorRow & { file_name: string; batch_status: string }
    >(
      `
        SELECT
          e.id,
          e.batch_id,
          e.entity_type,
          e.row_number,
          e.error_code,
          e.error_message,
          e.raw_payload,
          e.created_at,
          b.file_name,
          b.status AS batch_status
        FROM integration.import_batch_errors e
        INNER JOIN integration.import_batches b
          ON b.id = e.batch_id
        WHERE b.source_id = $1::uuid
        ORDER BY e.created_at DESC
        LIMIT $2
      `,
      [sourceId, cappedLimit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      batchFileName: row.file_name,
      batchStatus: row.batch_status,
      entityType: row.entity_type,
      rowNumber: row.row_number,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      rawPayload: row.raw_payload ?? {},
      createdAt: row.created_at.toISOString(),
    }));
  }

  async listBatchRuleResults(batchId: string, egiId?: string | null, allowGlobal = false) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId && !allowGlobal) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }
    const result = await this.postgresService.query<ImportBatchRuleRow>(
      `
        SELECT
          id,
          batch_id,
          entity_type,
          rule_code,
          severity,
          status,
          affected_rows,
          message,
          details_json,
          created_at
        FROM integration.import_batch_rule_results
        WHERE batch_id = $1
          AND EXISTS (
            SELECT 1
            FROM integration.import_batches b
            WHERE b.id = $1
              ${normalizedEgiId ? 'AND b.egi_id = $2::uuid' : ''}
          )
        ORDER BY severity DESC, created_at ASC
      `,
      normalizedEgiId ? [batchId, normalizedEgiId] : [batchId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      entityType: row.entity_type,
      ruleCode: row.rule_code,
      severity: row.severity,
      status: row.status,
      affectedRows: row.affected_rows,
      message: row.message,
      details: row.details_json ?? {},
      createdAt: row.created_at.toISOString(),
    }));
  }

  async listMappingProfiles(
    input: {
      sourceId?: string | null;
      entityType?: ImportEntityType | null;
    },
    egiId?: string | null,
    allowGlobal = false,
  ) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId && !allowGlobal) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }

    const result = await this.postgresService.query<MappingProfileRow>(
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
          AND ($2::text IS NULL OR mp.entity_type = $2)
          ${normalizedEgiId ? 'AND ds.egi_id = $3::uuid' : ''}
        ORDER BY ds.name ASC, mp.entity_type ASC, mp.is_default DESC, mp.version DESC
      `,
      normalizedEgiId
        ? [input.sourceId ?? null, input.entityType ?? null, normalizedEgiId]
        : [input.sourceId ?? null, input.entityType ?? null],
    );

    return result.rows.map((row) => mapSourceMappingProfileRow(row));
  }

  async createMappingProfile(
    input: {
      sourceId: string;
      entityType: ImportEntityType;
      profileName: string;
      mappingJson: Record<string, string> | string;
      isDefault?: boolean;
    },
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId) {
      throw new BadRequestException(
        'Debe seleccionar un Espacio de Gestión de Información antes de guardar perfiles de mapeo.',
      );
    }

    const source = await this.ensureSourceInEgi(input.sourceId, normalizedEgiId);
    const profileName = input.profileName.trim();
    if (!profileName) {
      throw new BadRequestException('profileName es requerido');
    }

    const mappingJson = parseColumnMapping(input.mappingJson);
    if (Object.keys(mappingJson).length === 0) {
      throw new BadRequestException('mappingJson debe incluir al menos una columna válida');
    }

    const actorUserId = await this.resolveActorUserId(actorEmail);
    const versionResult = await this.postgresService.query<{ next_version: number }>(
      `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM integration.source_mapping_profiles
        WHERE source_id = $1::uuid
          AND entity_type = $2
          AND profile_name = $3
      `,
      [input.sourceId, input.entityType, profileName],
    );
    const nextVersion = versionResult.rows[0]?.next_version ?? 1;

    // N-02: transacción real sobre un único cliente (BEGIN/COMMIT en el pool podían caer en conexiones distintas).
    const created = await this.postgresService.transaction(async (client) => {
      if (input.isDefault) {
        await client.query(
          `
            UPDATE integration.source_mapping_profiles
            SET is_default = FALSE,
                updated_at = NOW()
            WHERE source_id = $1::uuid
              AND entity_type = $2
              AND status = 'active'
          `,
          [input.sourceId, input.entityType],
        );
      }

      return client.query<MappingProfileRow>(
        `
          INSERT INTO integration.source_mapping_profiles (
            source_id,
            entity_type,
            profile_name,
            version,
            mapping_json,
            key_resolution_json,
            is_default,
            status,
            created_by_user_id
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5::jsonb,
            '{}'::jsonb,
            $6,
            'active',
            $7::uuid
          )
          RETURNING
            id,
            source_id,
            entity_type,
            profile_name,
            version,
            mapping_json,
            key_resolution_json,
            is_default,
            status,
            updated_at
        `,
        [
          input.sourceId,
          input.entityType,
          profileName,
          nextVersion,
          JSON.stringify(mappingJson),
          input.isDefault ?? false,
          actorUserId,
        ],
      );

    });
    const profile = mapSourceMappingProfileRow({
      ...created.rows[0],
      source_name: source.name,
    });
    await this.recordAudit(
      actorEmail,
      'import.mapping_profile.created',
      'integration.source_mapping_profile',
      profile.id,
      'admin.imports.mapping-profiles',
      'success',
      {
        sourceId: input.sourceId,
        entityType: input.entityType,
        profileName,
        version: profile.version,
        isDefault: profile.isDefault,
      },
      normalizedEgiId,
    );
    return profile;
  }

  async updateMappingProfile(
    profileId: string,
    input: {
      profileName?: string;
      mappingJson?: Record<string, string> | string;
      isDefault?: boolean;
      status?: 'active' | 'inactive';
    },
    actorEmail: string | null,
    egiId?: string | null,
  ) {
    const normalizedEgiId = egiId?.trim() || null;
    if (!normalizedEgiId) {
      throw new BadRequestException(
        'Debe seleccionar un Espacio de Gestión de Información antes de actualizar perfiles de mapeo.',
      );
    }

    const existingResult = await this.postgresService.query<MappingProfileRow>(
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
        WHERE mp.id = $1::uuid
          AND ds.egi_id = $2::uuid
      `,
      [profileId, normalizedEgiId],
    );
    if (existingResult.rows.length === 0) {
      throw new NotFoundException('Perfil de mapeo no encontrado en el EGI activo');
    }

    const current = existingResult.rows[0];
    const nextProfileName =
      typeof input.profileName === 'string' ? input.profileName.trim() : current.profile_name;
    if (!nextProfileName) {
      throw new BadRequestException('profileName no puede quedar vacío');
    }

    const nextMappingJson =
      input.mappingJson !== undefined
        ? parseColumnMapping(input.mappingJson)
        : parseColumnMapping(current.mapping_json ?? {});
    if (Object.keys(nextMappingJson).length === 0) {
      throw new BadRequestException('mappingJson debe incluir al menos una columna válida');
    }

    // N-02: transacción real sobre un único cliente (BEGIN/COMMIT en el pool podían caer en conexiones distintas).
    const updated = await this.postgresService.transaction(async (client) => {
      if (input.isDefault) {
        await client.query(
          `
            UPDATE integration.source_mapping_profiles
            SET is_default = FALSE,
                updated_at = NOW()
            WHERE source_id = $1::uuid
              AND entity_type = $2
              AND id <> $3::uuid
              AND status = 'active'
          `,
          [current.source_id, current.entity_type, profileId],
        );
      }

      return client.query<MappingProfileRow>(
        `
          UPDATE integration.source_mapping_profiles
          SET profile_name = $2,
              mapping_json = $3::jsonb,
              is_default = $4,
              status = $5,
              updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING
            id,
            source_id,
            entity_type,
            profile_name,
            version,
            mapping_json,
            key_resolution_json,
            is_default,
            status,
            updated_at
        `,
        [
          profileId,
          nextProfileName,
          JSON.stringify(nextMappingJson),
          input.isDefault ?? current.is_default,
          input.status ?? current.status,
        ],
      );

    });
    const profile = mapSourceMappingProfileRow({
      ...updated.rows[0],
      source_name: current.source_name,
    });
    await this.recordAudit(
      actorEmail,
      'import.mapping_profile.updated',
      'integration.source_mapping_profile',
      profile.id,
      'admin.imports.mapping-profiles',
      'success',
      {
        sourceId: profile.sourceId,
        entityType: profile.entityType,
        profileName: profile.profileName,
        version: profile.version,
        isDefault: profile.isDefault,
        status: profile.status,
      },
      normalizedEgiId,
    );
    return profile;
  }

  private parseInputFile(input: ImportUploadInput): ParsedInputFile {
    if (!input.fileBuffer || input.fileBuffer.length === 0) {
      throw new BadRequestException('El archivo es requerido');
    }

    const fileName = (input.fileName ?? 'upload').trim() || 'upload';
    const sourceFormat = detectSourceFormat(fileName);
    let workbook: XLSX.WorkBook;

    try {
      if (sourceFormat === 'csv') {
        // CSV templates in this repo are authored in UTF-8. Decoding them
        // explicitly avoids mojibake when SheetJS guesses a legacy codepage.
        const csvText = new TextDecoder('utf-8').decode(stripUtf8Bom(input.fileBuffer));
        workbook = XLSX.read(csvText, {
          type: 'string',
          raw: false,
          cellDates: true,
          codepage: 65001,
        });
      } else {
        workbook = XLSX.read(input.fileBuffer, {
          type: 'buffer',
          raw: false,
          cellDates: true,
        });
      }
    } catch {
      throw new BadRequestException('No se pudo leer el archivo CSV/XLSX');
    }

    if (workbook.SheetNames.length === 0) {
      throw new BadRequestException('El archivo no contiene hojas válidas');
    }

    const requestedSheetName = input.sheetName?.trim();
    const sheetName = requestedSheetName && requestedSheetName.length > 0
      ? requestedSheetName
      : workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new BadRequestException(`No existe la hoja "${sheetName}" en el archivo`);
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      raw: false,
    });

    const rows = rawRows
      .map((row) => normalizeRowHeaders(row))
      .filter((row) => isRowNotEmpty(row));

    if (rows.length === 0) {
      throw new BadRequestException('El archivo no contiene filas de datos');
    }
    if (rows.length > getValidatedEnv().importMaxRows) {
      throw new BadRequestException(
        `El archivo excede el máximo de filas permitido (${getValidatedEnv().importMaxRows}).`,
      );
    }

    const headers = collectHeaders(rows);

    return {
      rows,
      headers,
      sheetName,
      sourceFormat,
      fileName,
    };
  }

  private async createBatch(input: {
    entityType: ImportEntityType;
    egiId: string;
    sourceId: string | null;
    mappingProfileId: string | null;
    datasetId: string | null;
    sourceFormat: ImportSourceFormat;
    fileName: string;
    sheetName: string;
    initiatedByUserId: string | null;
    totalRows: number;
    details: Record<string, unknown>;
  }) {
    const result = await this.postgresService.query<ImportBatchRow>(
      `
        INSERT INTO integration.import_batches (
          egi_id,
          entity_type,
          source_format,
          file_name,
          sheet_name,
          status,
          source_id,
          mapping_profile_id,
          dataset_id,
          initiated_by_user_id,
          total_rows,
          quality_grade,
          quality_json,
          details_json
        )
        VALUES ($1::uuid, $2, $3, $4, $5, 'running', $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10, 'pending', '{}'::jsonb, $11::jsonb)
        RETURNING
          id,
          egi_id,
          entity_type,
          source_format,
          file_name,
          sheet_name,
          status,
          source_id,
          mapping_profile_id,
          dataset_id,
          initiated_by_user_id,
          total_rows,
          staged_rows,
          valid_rows,
          invalid_rows,
          promoted_rows,
          quality_score,
          quality_grade,
          quality_json,
          details_json,
          started_at,
          finished_at,
          created_at,
          updated_at
      `,
      [
        input.egiId,
        input.entityType,
        input.sourceFormat,
        input.fileName,
        input.sheetName,
        input.sourceId,
        input.mappingProfileId,
        input.datasetId,
        input.initiatedByUserId,
        input.totalRows,
        JSON.stringify(input.details),
      ],
    );

    return result.rows[0];
  }

  private async completeBatch(
    batchId: string,
    input: {
      status: string;
      stagedRows: number;
      validRows: number;
      invalidRows: number;
      promotedRows: number;
      details?: Record<string, unknown>;
      quality?: BatchQuality;
    },
  ) {
    if (!ALLOWED_IMPORT_STATUSES.has(input.status)) {
      throw new BadRequestException(`Invalid batch status: ${input.status}`);
    }

    await this.postgresService.query(
      `
        UPDATE integration.import_batches
        SET
          status = $2,
          staged_rows = $3,
          valid_rows = $4,
          invalid_rows = $5,
          promoted_rows = $6,
          details_json = COALESCE($7::jsonb, details_json),
          quality_score = COALESCE($8, quality_score),
          quality_grade = COALESCE($9, quality_grade),
          quality_json = COALESCE($10::jsonb, quality_json),
          finished_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        batchId,
        input.status,
        input.stagedRows,
        input.validRows,
        input.invalidRows,
        input.promotedRows,
        input.details ? JSON.stringify(input.details) : null,
        input.quality ? input.quality.score : null,
        input.quality ? input.quality.grade : null,
        input.quality ? JSON.stringify(input.quality.summary) : null,
      ],
    );
  }

  private async processRows(
    entityType: ImportEntityType,
    batchId: string,
    rows: Record<string, unknown>[],
    context: ImportProcessContext,
  ): Promise<ProcessResult> {
    switch (entityType) {
      case 'institutions':
        return this.processInstitutions(batchId, rows, context);
      case 'projects':
        return this.processProjects(batchId, rows, context);
      case 'project_indicators':
        return this.processProjectIndicators(batchId, rows, context);
      case 'project_territories':
        return this.processProjectTerritories(batchId, rows, context);
      default:
        throw new BadRequestException(`Entity type not supported: ${entityType}`);
    }
  }

  private async processInstitutions(
    batchId: string,
    rows: Record<string, unknown>[],
    context: ImportProcessContext,
  ) {
    const errors: RowError[] = [];
    const stagedRows: StagingInstitutionRow[] = [];
    const usedCodes = new Set<string>();

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const institutionCode = pickString(row, ['institution_code', 'code']);
      const institutionName = pickString(row, ['institution_name', 'name']);
      const country = pickString(row, ['country', 'pais']);

      const rowErrors: RowError[] = [];
      if (!institutionCode) {
        rowErrors.push(buildRowError(rowNumber, 'institution_code_required', 'institution_code es requerido', row));
      }
      if (!institutionName) {
        rowErrors.push(buildRowError(rowNumber, 'institution_name_required', 'institution_name es requerido', row));
      }
      if (!country) {
        rowErrors.push(buildRowError(rowNumber, 'country_required', 'country es requerido', row));
      } else {
        this.appendCountryValidationErrors(
          rowErrors,
          rowNumber,
          country,
          row,
          context.validationCatalog,
        );
      }

      if (institutionCode) {
        const normalizedCode = institutionCode.toLowerCase();
        if (usedCodes.has(normalizedCode)) {
          rowErrors.push(
            buildRowError(
              rowNumber,
              'institution_code_duplicated_in_batch',
              `institution_code duplicado en el mismo batch: ${institutionCode}`,
              row,
            ),
          );
        } else {
          usedCodes.add(normalizedCode);
        }
      }

      stagedRows.push({
        rowNumber,
        institutionCode,
        institutionName,
        country,
        rawPayload: row,
      });
      errors.push(...rowErrors);
    });

    await this.stageInstitutions(batchId, stagedRows, errors);
    const validRows = stagedRows.filter((row) =>
      !errors.some((error) => error.rowNumber === row.rowNumber),
    );
    const promotedRows = await this.promoteInstitutions(validRows, context.sourceId);
    await this.persistBatchErrors(batchId, 'institutions', errors);
    const ruleResults = [
      ...buildRuleResults('institutions', stagedRows.length, errors),
      ...buildGeographicRuleResults('institutions', errors, context.validationCatalog),
    ];
    const quality = calculateBatchQuality(stagedRows.length, errors, ruleResults);

    return {
      stagedRows: stagedRows.length,
      validRows: validRows.length,
      invalidRows: stagedRows.length - validRows.length,
      promotedRows,
      errors,
      ruleResults,
      quality,
    };
  }

  private async processProjects(
    batchId: string,
    rows: Record<string, unknown>[],
    context: ImportProcessContext,
  ) {
    const errors: RowError[] = [];
    const stagedRows: StagingProjectRow[] = [];
    const usedCodes = new Set<string>();
    const institutionMap = await this.fetchInstitutionKeyMap(context.sourceId);

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const projectCode = pickString(row, ['project_code', 'code']);
      const projectName = pickString(row, ['project_name', 'name', 'title']);
      const leadInstitutionCode = pickString(row, [
        'lead_institution_code',
        'institution_code',
      ]);
      const startDateText = pickString(row, ['start_date']);
      const endDateText = pickString(row, ['end_date']);
      const totalAreaText = pickString(row, ['total_area_ha', 'area_ha']);
      const status = normalizeProjectStatus(pickString(row, ['status']));
      const projectAliases = parseAliasCollection(row, [
        'project_aliases_json',
        'project_aliases',
      ]);

      const rowErrors: RowError[] = [];
      const startDate = parseDateOnly(startDateText);
      const endDate = parseDateOnly(endDateText);
      const totalAreaHa = parseNullableNumber(totalAreaText);

      if (!projectCode) {
        rowErrors.push(buildRowError(rowNumber, 'project_code_required', 'project_code es requerido', row));
      }
      if (!projectName) {
        rowErrors.push(buildRowError(rowNumber, 'project_name_required', 'project_name es requerido', row));
      }
      if (!leadInstitutionCode) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'lead_institution_code_required',
            'lead_institution_code es requerido',
            row,
          ),
        );
      }
      if (leadInstitutionCode && !institutionMap.has(leadInstitutionCode.toLowerCase())) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'lead_institution_not_found',
            `No existe la institución líder: ${leadInstitutionCode}`,
            row,
          ),
        );
      }
      if (!startDate) {
        rowErrors.push(buildRowError(rowNumber, 'start_date_invalid', 'start_date es inválida', row));
      }
      if (endDateText && !endDate) {
        rowErrors.push(buildRowError(rowNumber, 'end_date_invalid', 'end_date es inválida', row));
      }
      if (!endDate) {
        rowErrors.push(buildRowError(rowNumber, 'end_date_invalid', 'end_date es inválida', row));
      }
      if (startDate && endDate && endDate < startDate) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'date_range_invalid',
            'end_date debe ser mayor o igual a start_date',
            row,
          ),
        );
      }
      if (totalAreaHa === null) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'total_area_ha_invalid',
            'total_area_ha debe ser numérico',
            row,
          ),
        );
      } else if (totalAreaHa < 0) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'total_area_ha_negative',
            'total_area_ha debe ser >= 0',
            row,
          ),
        );
      }

      if (projectCode) {
        const normalizedCode = projectCode.toLowerCase();
        if (usedCodes.has(normalizedCode)) {
          rowErrors.push(
            buildRowError(
              rowNumber,
              'project_code_duplicated_in_batch',
              `project_code duplicado en el mismo batch: ${projectCode}`,
              row,
            ),
          );
        } else {
          usedCodes.add(normalizedCode);
        }
        if (!projectAliases.some((alias) => alias.toLowerCase() === normalizedCode)) {
          projectAliases.unshift(projectCode);
        }
      }

      stagedRows.push({
        rowNumber,
        projectCode,
        projectAliases,
        projectName,
        leadInstitutionCode,
        startDate,
        endDate,
        totalAreaHa,
        status,
        rawPayload: row,
      });
      errors.push(...rowErrors);
    });

    await this.stageProjects(batchId, stagedRows, errors);
    const validRows = stagedRows.filter((row) =>
      !errors.some((error) => error.rowNumber === row.rowNumber),
    );
    const promotedRows = await this.promoteProjects(
      validRows,
      institutionMap,
      context.sourceId,
      context.egiId,
    );
    await this.persistBatchErrors(batchId, 'projects', errors);
    const ruleResults = buildRuleResults('projects', stagedRows.length, errors);
    const quality = calculateBatchQuality(stagedRows.length, errors, ruleResults);

    return {
      stagedRows: stagedRows.length,
      validRows: validRows.length,
      invalidRows: stagedRows.length - validRows.length,
      promotedRows,
      errors,
      ruleResults,
      quality,
    };
  }

  private async processProjectIndicators(
    batchId: string,
    rows: Record<string, unknown>[],
    context: ImportProcessContext,
  ) {
    const errors: RowError[] = [];
    const stagedRows: StagingProjectIndicatorRow[] = [];
    const projectMap = await this.fetchProjectKeyMap(context.sourceId);

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const projectCode = pickString(row, ['project_code']);
      const indicatorCode = pickString(row, ['indicator_code', 'code']);
      const indicatorName = pickString(row, ['indicator_name', 'name']);
      const unit = pickString(row, ['unit']);
      const valueRaw = pickString(row, ['value_numeric', 'value', 'current_value']);
      const valueNumeric = valueRaw === null ? null : parseNullableNumber(valueRaw);
      const valueText = pickString(row, ['value_text']);
      const category = pickString(row, ['category']) ?? 'project';
      const observedAtText = pickString(row, ['observed_at']);
      const observedAt = parseDateOnly(observedAtText);

      const rowErrors: RowError[] = [];

      if (!projectCode) {
        rowErrors.push(buildRowError(rowNumber, 'project_code_required', 'project_code es requerido', row));
      }
      if (projectCode && !projectMap.has(projectCode.toLowerCase())) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'project_not_found',
            `No existe el proyecto referenciado: ${projectCode}`,
            row,
          ),
        );
      }
      if (!indicatorCode) {
        rowErrors.push(
          buildRowError(rowNumber, 'indicator_code_required', 'indicator_code es requerido', row),
        );
      }
      if (!unit) {
        rowErrors.push(buildRowError(rowNumber, 'unit_required', 'unit es requerida', row));
      }
      // Antes una fecha ausente o inválida se guardaba como 1970-01-01.
      if (!observedAt) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            observedAtText ? 'observed_at_invalid' : 'observed_at_required',
            observedAtText ? 'observed_at es inválida' : 'observed_at es requerida',
            row,
          ),
        );
      }
      if (valueRaw !== null && valueNumeric === null) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'indicator_value_invalid',
            'value_numeric/value debe ser numérico cuando se provee',
            row,
          ),
        );
      }

      stagedRows.push({
        rowNumber,
        projectCode,
        indicatorCode,
        indicatorName,
        unit,
        valueNumeric,
        valueText,
        category,
        observedAt,
        rawPayload: row,
      });
      errors.push(...rowErrors);
    });

    await this.stageProjectIndicators(batchId, stagedRows, errors);
    const validRows = stagedRows.filter((row) =>
      !errors.some((error) => error.rowNumber === row.rowNumber),
    );
    const promotedRows = await this.promoteProjectIndicators(validRows, projectMap);
    await this.persistBatchErrors(batchId, 'project_indicators', errors);
    const ruleResults = buildRuleResults(
      'project_indicators',
      stagedRows.length,
      errors,
    );
    const quality = calculateBatchQuality(stagedRows.length, errors, ruleResults);

    return {
      stagedRows: stagedRows.length,
      validRows: validRows.length,
      invalidRows: stagedRows.length - validRows.length,
      promotedRows,
      errors,
      ruleResults,
      quality,
    };
  }

  private async processProjectTerritories(
    batchId: string,
    rows: Record<string, unknown>[],
    context: ImportProcessContext,
  ) {
    const errors: RowError[] = [];
    const stagedRows: StagingProjectTerritoryRow[] = [];
    const projectMap = await this.fetchProjectKeyMap(context.sourceId);
    const territoryReferenceMap = await this.fetchTerritoryReferenceMap(context.sourceId);

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const projectCode = pickString(row, ['project_code']);
      const territoryCode = pickString(row, ['territory_code', 'territory']);
      const territoryName = pickString(row, ['territory_name', 'name']);
      const territoryLevel = pickString(row, ['territory_level', 'level']) ?? 'custom';
      const country = pickString(row, ['country', 'pais']);
      const areaHa = parseNullableNumber(pickString(row, ['area_ha', 'total_area_ha']));

      const rowErrors: RowError[] = [];
      if (!projectCode) {
        rowErrors.push(buildRowError(rowNumber, 'project_code_required', 'project_code es requerido', row));
      }
      if (projectCode && !projectMap.has(projectCode.toLowerCase())) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'project_not_found',
            `No existe el proyecto referenciado: ${projectCode}`,
            row,
          ),
        );
      }
      if (!country) {
        rowErrors.push(buildRowError(rowNumber, 'country_required', 'country es requerido', row));
      } else {
        this.appendCountryValidationErrors(
          rowErrors,
          rowNumber,
          country,
          row,
          context.validationCatalog,
        );
      }
      if (!territoryLevel) {
        rowErrors.push(
          buildRowError(rowNumber, 'territory_level_required', 'territory_level es requerido', row),
        );
      } else if (!context.validationCatalog.territoryLevels.has(territoryLevel.toLowerCase())) {
        rowErrors.push(
          buildRowError(
            rowNumber,
            'territory_level_invalid',
            `territory_level no existe en el catálogo operativo: ${territoryLevel}`,
            row,
          ),
        );
      }
      if (territoryCode) {
        const reference = territoryReferenceMap.get(territoryCode.toLowerCase()) ?? null;
        if (reference && territoryLevel && reference.level.toLowerCase() !== territoryLevel.toLowerCase()) {
          rowErrors.push(
            buildRowError(
              rowNumber,
              'territory_level_mismatch',
              `El territorio ${territoryCode} ya existe con nivel ${reference.level}, no ${territoryLevel}.`,
              row,
            ),
          );
        }
        if (
          reference &&
          reference.level.toLowerCase() === 'country' &&
          country &&
          !matchesCountryName(reference.name, country) &&
          !matchesCountryName(reference.code, country)
        ) {
          rowErrors.push(
            buildRowError(
              rowNumber,
              'territory_country_mismatch',
              `El territorio ${territoryCode} corresponde a ${reference.name} y no coincide con country=${country}.`,
              row,
            ),
          );
        }
        if (
          reference &&
          context.validationCatalog.sourceScope?.egiTerritorialScope &&
          !matchesTerritoryScope(reference, context.validationCatalog.sourceScope.egiTerritorialScope)
        ) {
          rowErrors.push(
            buildRowError(
              rowNumber,
              'territory_outside_egi_scope',
              `El territorio ${territoryCode} no parece corresponder al alcance territorial declarado del EGI (${context.validationCatalog.sourceScope.egiTerritorialScope}).`,
              row,
            ),
          );
        }
      }
      if (areaHa === null) {
        rowErrors.push(buildRowError(rowNumber, 'area_ha_invalid', 'area_ha debe ser numérico', row));
      } else if (areaHa < 0) {
        rowErrors.push(buildRowError(rowNumber, 'area_ha_negative', 'area_ha debe ser >= 0', row));
      }

      stagedRows.push({
        rowNumber,
        projectCode,
        territoryCode,
        territoryName,
        territoryLevel,
        country,
        areaHa,
        rawPayload: row,
      });
      errors.push(...rowErrors);
    });

    await this.stageProjectTerritories(batchId, stagedRows, errors);
    const validRows = stagedRows.filter((row) =>
      !errors.some((error) => error.rowNumber === row.rowNumber),
    );
    const promotedRows = await this.promoteProjectTerritories(
      validRows,
      projectMap,
      context.sourceId,
    );
    await this.persistBatchErrors(batchId, 'project_territories', errors);
    const ruleResults = [
      ...buildRuleResults('project_territories', stagedRows.length, errors),
      ...buildGeographicRuleResults('project_territories', errors, context.validationCatalog),
    ];
    const quality = calculateBatchQuality(stagedRows.length, errors, ruleResults);

    return {
      stagedRows: stagedRows.length,
      validRows: validRows.length,
      invalidRows: stagedRows.length - validRows.length,
      promotedRows,
      errors,
      ruleResults,
      quality,
    };
  }

  private async stageInstitutions(
    batchId: string,
    rows: StagingInstitutionRow[],
    errors: RowError[],
  ) {
    for (const row of rows) {
      const status = errors.some((error) => error.rowNumber === row.rowNumber)
        ? 'invalid'
        : 'valid';
      await this.postgresService.query(
        `
          INSERT INTO integration.staging_institutions (
            batch_id,
            row_number,
            institution_code,
            institution_name,
            country,
            raw_payload,
            processed_status,
            processed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
        `,
        [
          batchId,
          row.rowNumber,
          row.institutionCode,
          row.institutionName,
          row.country,
          JSON.stringify(row.rawPayload),
          status,
        ],
      );
    }
  }

  private async stageProjects(batchId: string, rows: StagingProjectRow[], errors: RowError[]) {
    for (const row of rows) {
      const status = errors.some((error) => error.rowNumber === row.rowNumber)
        ? 'invalid'
        : 'valid';
      await this.postgresService.query(
        `
          INSERT INTO integration.staging_projects (
            batch_id,
            row_number,
            project_code,
            project_name,
            lead_institution_code,
            start_date,
            end_date,
            total_area_ha,
            status,
            raw_payload,
            processed_status,
            processed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10::jsonb, $11, NOW())
        `,
        [
          batchId,
          row.rowNumber,
          row.projectCode,
          row.projectName,
          row.leadInstitutionCode,
          row.startDate,
          row.endDate,
          row.totalAreaHa,
          row.status ?? 'draft',
          JSON.stringify(row.rawPayload),
          status,
        ],
      );
    }
  }

  private async stageProjectIndicators(
    batchId: string,
    rows: StagingProjectIndicatorRow[],
    errors: RowError[],
  ) {
    for (const row of rows) {
      const status = errors.some((error) => error.rowNumber === row.rowNumber)
        ? 'invalid'
        : 'valid';
      await this.postgresService.query(
        `
          INSERT INTO integration.staging_project_indicators (
            batch_id,
            row_number,
            project_code,
            indicator_code,
            indicator_name,
            unit,
            value_numeric,
            value_text,
            category,
            observed_at,
            raw_payload,
            processed_status,
            processed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::jsonb, $12, NOW())
        `,
        [
          batchId,
          row.rowNumber,
          row.projectCode,
          row.indicatorCode,
          row.indicatorName,
          row.unit,
          row.valueNumeric,
          row.valueText,
          row.category ?? 'project',
          row.observedAt,
          JSON.stringify(row.rawPayload),
          status,
        ],
      );
    }
  }

  private async stageProjectTerritories(
    batchId: string,
    rows: StagingProjectTerritoryRow[],
    errors: RowError[],
  ) {
    for (const row of rows) {
      const status = errors.some((error) => error.rowNumber === row.rowNumber)
        ? 'invalid'
        : 'valid';
      await this.postgresService.query(
        `
          INSERT INTO integration.staging_project_territories (
            batch_id,
            row_number,
            project_code,
            territory_code,
            territory_name,
            territory_level,
            country,
            area_ha,
            raw_payload,
            processed_status,
            processed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW())
        `,
        [
          batchId,
          row.rowNumber,
          row.projectCode,
          row.territoryCode,
          row.territoryName,
          row.territoryLevel ?? 'custom',
          row.country,
          row.areaHa,
          JSON.stringify(row.rawPayload),
          status,
        ],
      );
    }
  }

  private async promoteInstitutions(rows: StagingInstitutionRow[], sourceId: string | null) {
    let promotedRows = 0;
    for (const row of rows) {
      const result = await this.postgresService.query<{ id: string }>(
        `
          INSERT INTO core.institutions (code, name, country, status)
          VALUES ($1, $2, $3, 'active')
          ON CONFLICT (code)
          DO UPDATE SET
            name = EXCLUDED.name,
            country = EXCLUDED.country,
            status = 'active',
            updated_at = NOW()
          RETURNING id
        `,
        [row.institutionCode, row.institutionName, row.country],
      );
      const institutionId = result.rows[0]?.id ?? null;
      if (institutionId && row.institutionCode) {
        await this.upsertInstitutionKey(institutionId, row.institutionCode, sourceId);
      }
      promotedRows += 1;
    }
    return promotedRows;
  }

  private async promoteProjects(
    rows: StagingProjectRow[],
    institutionMap: Map<string, string>,
    sourceId: string | null,
    egiId: string,
  ) {
    let promotedRows = 0;
    for (const row of rows) {
      const institutionId = row.leadInstitutionCode
        ? institutionMap.get(row.leadInstitutionCode.toLowerCase()) ?? null
        : null;
      if (!institutionId) {
        continue;
      }
      // N-01: el proyecto queda en el EGI del lote y nunca se mueve de un EGI a otro.
      // No se permite reasignar institution_id en el UPSERT: si el código de proyecto ya
      // existe bajo una institución distinta a la de este lote, la fila se omite en vez de
      // sobrescribir silenciosamente la propiedad/datos de un proyecto de otra institución.
      const result = await this.postgresService.query<{ id: string }>(
        `
          INSERT INTO core.projects (
            code,
            institution_id,
            title,
            status,
            area_ha,
            start_date,
            end_date,
            egi_id
          )
          VALUES ($1, $2::uuid, $3, $4, $5, $6::date, $7::date, $8::uuid)
          ON CONFLICT (code)
          DO UPDATE SET
            title = EXCLUDED.title,
            status = EXCLUDED.status,
            area_ha = EXCLUDED.area_ha,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            egi_id = COALESCE(core.projects.egi_id, EXCLUDED.egi_id),
            updated_at = NOW()
          WHERE core.projects.institution_id = EXCLUDED.institution_id
            AND (core.projects.egi_id IS NULL OR core.projects.egi_id = EXCLUDED.egi_id)
          RETURNING id
        `,
        [
          row.projectCode,
          institutionId,
          row.projectName,
          row.status ?? 'draft',
          row.totalAreaHa,
          row.startDate,
          row.endDate,
          egiId,
        ],
      );
      const projectId = result.rows[0]?.id ?? null;
      if (!projectId) {
        // Conflicto de institución (o cualquier otro motivo por el que no se insertó/actualizó
        // la fila): no se cuenta como promovida y no se tocan sus claves de alias.
        continue;
      }
      if (row.projectCode) {
        await this.upsertProjectKey(projectId, row.projectCode, sourceId);
        for (const alias of row.projectAliases) {
          await this.upsertProjectKey(projectId, alias, sourceId);
        }
      }
      promotedRows += 1;
    }
    return promotedRows;
  }

  private async promoteProjectIndicators(
    rows: StagingProjectIndicatorRow[],
    projectMap: Map<string, string>,
  ) {
    let promotedRows = 0;
    for (const row of rows) {
      if (!row.projectCode || !row.indicatorCode || !row.unit) {
        continue;
      }

      const projectId = projectMap.get(row.projectCode.toLowerCase());
      if (!projectId) {
        continue;
      }

      if (!row.observedAt) {
        continue;
      }
      const observedAt = row.observedAt;
      const indicatorName = row.indicatorName ?? row.indicatorCode;
      const category = row.category ?? 'project';

      await this.postgresService.query(
        `
          INSERT INTO core.project_indicators (
            project_id,
            indicator_code,
            indicator_name,
            unit,
            value_numeric,
            value_text,
            category,
            observed_at
          )
          VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::date)
          ON CONFLICT (project_id, indicator_code, observed_at)
          DO UPDATE SET
            indicator_name = EXCLUDED.indicator_name,
            unit = EXCLUDED.unit,
            value_numeric = EXCLUDED.value_numeric,
            value_text = EXCLUDED.value_text,
            category = EXCLUDED.category,
            updated_at = NOW()
        `,
        [
          projectId,
          row.indicatorCode,
          indicatorName,
          row.unit,
          row.valueNumeric,
          row.valueText,
          category,
          observedAt,
        ],
      );

      await this.postgresService.query(
        `
          INSERT INTO core.indicators (
            code,
            name,
            unit,
            category,
            current_value
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (code)
          DO UPDATE SET
            name = EXCLUDED.name,
            unit = EXCLUDED.unit,
            category = EXCLUDED.category,
            current_value = COALESCE(EXCLUDED.current_value, core.indicators.current_value),
            updated_at = NOW()
        `,
        [row.indicatorCode, indicatorName, row.unit, category, row.valueNumeric],
      );
      promotedRows += 1;
    }
    return promotedRows;
  }

  private async promoteProjectTerritories(
    rows: StagingProjectTerritoryRow[],
    projectMap: Map<string, string>,
    sourceId: string | null,
  ) {
    let promotedRows = 0;
    for (const row of rows) {
      if (!row.projectCode || !row.country || row.areaHa === null) {
        continue;
      }

      const projectId = projectMap.get(row.projectCode.toLowerCase());
      if (!projectId) {
        continue;
      }

      const territoryCode = row.territoryCode ?? buildCountryTerritoryCode(row.country);
      const territoryName = row.territoryName ?? territoryCode;
      const territoryLevel = row.territoryLevel ?? 'custom';

      const territoryId = await this.resolveOrCreateTerritory({
        territoryCode,
        territoryName,
        level: territoryLevel,
        sourceId,
      });

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
          ON CONFLICT (project_id, territory_code, country)
          DO UPDATE SET
            territory_id = EXCLUDED.territory_id,
            territory_name = EXCLUDED.territory_name,
            area_ha = EXCLUDED.area_ha,
            updated_at = NOW()
        `,
        [projectId, territoryId, territoryCode, territoryName, row.country, row.areaHa],
      );
      await this.upsertTerritoryKey(territoryId, territoryCode, sourceId);
      promotedRows += 1;
    }
    return promotedRows;
  }

  private async persistBatchErrors(
    batchId: string,
    entityType: ImportEntityType,
    errors: RowError[],
  ) {
    for (const error of errors) {
      await this.postgresService.query(
        `
          INSERT INTO integration.import_batch_errors (
            batch_id,
            entity_type,
            row_number,
            error_code,
            error_message,
            raw_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          batchId,
          entityType,
          error.rowNumber,
          error.errorCode,
          error.errorMessage,
          JSON.stringify(error.rawPayload),
        ],
      );
    }
  }

  private async fetchInstitutionKeyMap(sourceId: string | null) {
    const result = await this.postgresService.query<{ id: string; key: string }>(
      `
        SELECT id, LOWER(code) AS key
        FROM core.institutions
        WHERE code IS NOT NULL
        UNION
        SELECT
          k.institution_id AS id,
          LOWER(k.alias_key) AS key
        FROM core.institution_keys k
        WHERE k.active = TRUE
          AND ($1::uuid IS NULL OR k.source_id = $1::uuid OR k.source_id IS NULL)
      `,
      [sourceId],
    );

    return new Map(
      result.rows.map((row) => [row.key, row.id] as const),
    );
  }

  private async fetchProjectKeyMap(sourceId: string | null) {
    const result = await this.postgresService.query<{ id: string; key: string }>(
      `
        SELECT id, LOWER(code) AS key
        FROM core.projects
        WHERE code IS NOT NULL
        UNION
        SELECT
          k.project_id AS id,
          LOWER(k.alias_key) AS key
        FROM core.project_keys k
        WHERE k.active = TRUE
          AND ($1::uuid IS NULL OR k.source_id = $1::uuid OR k.source_id IS NULL)
      `,
      [sourceId],
    );

    return new Map(
      result.rows.map((row) => [row.key, row.id] as const),
    );
  }

  private async fetchTerritoryReferenceMap(sourceId: string | null) {
    const result = await this.postgresService.query<{
      key: string;
      code: string;
      name: string;
      level: string;
    }>(
      `
        SELECT LOWER(code) AS key, code, name, level
        FROM core.territories
        WHERE code IS NOT NULL
        UNION
        SELECT LOWER(k.alias_key) AS key, t.code, t.name, t.level
        FROM core.territory_keys k
        INNER JOIN core.territories t ON t.id = k.territory_id
        WHERE k.active = TRUE
          AND ($1::uuid IS NULL OR k.source_id = $1::uuid OR k.source_id IS NULL)
      `,
      [sourceId],
    );

    return new Map(
      result.rows.map((row) => [
        row.key,
        { code: row.code, name: row.name, level: row.level },
      ] as const),
    );
  }

  private appendCountryValidationErrors(
    rowErrors: RowError[],
    rowNumber: number,
    country: string,
    rawPayload: Record<string, unknown>,
    validationCatalog: ImportValidationCatalog,
  ) {
    const normalizedCountry = normalizeCountryKey(country);
    if (!normalizedCountry) {
      return;
    }

    if (
      validationCatalog.knownCountries.size > 0 &&
      !validationCatalog.knownCountries.has(normalizedCountry)
    ) {
      rowErrors.push(
        buildRowError(
          rowNumber,
          'country_unknown',
          `country no existe en el catálogo operativo: ${country}`,
          rawPayload,
        ),
      );
    }

    const allowedCountries = resolveAllowedCountries(validationCatalog.sourceScope);
    if (
      allowedCountries.length > 0 &&
      !allowedCountries.some((allowedCountry) => matchesCountryName(allowedCountry, country))
    ) {
      rowErrors.push(
        buildRowError(
          rowNumber,
          'country_scope_mismatch',
          `country=${country} queda fuera del alcance permitido de la fuente (${allowedCountries.join(', ')}).`,
          rawPayload,
        ),
      );
    }
  }

  private async buildImportValidationCatalog(
    egiId: string,
    sourceId: string | null,
  ): Promise<ImportValidationCatalog> {
    const [countryResult, territoryLevelResult, sourceScope] = await Promise.all([
      this.postgresService.query<{ country: string }>(
        `
          SELECT DISTINCT country
          FROM (
            SELECT name AS country
            FROM core.territories
            WHERE level = 'country'
              AND status = 'active'
            UNION
            SELECT country
            FROM core.project_territories
            WHERE country IS NOT NULL
              AND BTRIM(country) <> ''
            UNION
            SELECT country
            FROM core.institutions
            WHERE country IS NOT NULL
              AND BTRIM(country) <> ''
          ) countries
          ORDER BY country ASC
        `,
      ),
      this.postgresService.query<{ level: string }>(
        `
          SELECT DISTINCT level
          FROM core.territories
          WHERE level IS NOT NULL
            AND BTRIM(level) <> ''
          ORDER BY level ASC
        `,
      ),
      sourceId ? this.loadSourceScope(sourceId, egiId) : Promise.resolve(null),
    ]);

    const knownCountries = new Map<string, string>();
    for (const row of countryResult.rows) {
      const normalized = normalizeCountryKey(row.country);
      if (!normalized || knownCountries.has(normalized)) {
        continue;
      }
      knownCountries.set(normalized, row.country);
    }

    return {
      knownCountries,
      territoryLevels: new Set(
        territoryLevelResult.rows.map((row) => row.level.toLowerCase()),
      ),
      sourceScope,
    };
  }

  private async loadSourceScope(sourceId: string, egiId: string) {
    const result = await this.postgresService.query<{
      id: string;
      code: string;
      name: string;
      config_json: Record<string, unknown> | null;
      territorial_scope: string | null;
    }>(
      `
        SELECT
          s.id,
          s.code,
          s.name,
          s.config_json,
          e.territorial_scope
        FROM core.data_sources s
        INNER JOIN core.egi_spaces e ON e.id = s.egi_id
        WHERE s.id = $1::uuid
          AND s.egi_id = $2::uuid
        LIMIT 1
      `,
      [sourceId, egiId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      sourceId: row.id,
      sourceCode: row.code,
      sourceName: row.name,
      sourceCountry: readConfigText(row.config_json, 'country'),
      allowedCountries: readConfigStringArray(row.config_json, 'allowedCountries'),
      territorialScope: readConfigText(row.config_json, 'territorialScope'),
      egiTerritorialScope: row.territorial_scope,
    };
  }

  private async resolveOrCreateTerritory(input: {
    territoryCode: string;
    territoryName: string;
    level: string;
    sourceId: string | null;
  }) {
    const existingByAlias = await this.postgresService.query<{ territory_id: string }>(
      `
        SELECT k.territory_id
        FROM core.territory_keys k
        WHERE k.active = TRUE
          AND LOWER(k.alias_key) = LOWER($1)
          AND ($2::uuid IS NULL OR k.source_id = $2::uuid OR k.source_id IS NULL)
        LIMIT 1
      `,
      [input.territoryCode, input.sourceId],
    );

    if (existingByAlias.rows.length > 0) {
      return existingByAlias.rows[0].territory_id;
    }

    const existing = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.territories
        WHERE code = $1
      `,
      [input.territoryCode],
    );

    if (existing.rows.length > 0) {
      await this.upsertTerritoryKey(existing.rows[0].id, input.territoryCode, input.sourceId);
      return existing.rows[0].id;
    }

    const created = await this.postgresService.query<{ id: string }>(
      `
        INSERT INTO core.territories (
          code,
          name,
          level,
          status
        )
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          level = EXCLUDED.level,
          updated_at = NOW()
        RETURNING id
      `,
      [input.territoryCode, input.territoryName, input.level],
    );

    const territoryId = created.rows[0].id;
    await this.upsertTerritoryKey(territoryId, input.territoryCode, input.sourceId);
    return territoryId;
  }

  private async resolveMappingProfile(input: {
    sourceId: string | null;
    mappingProfileId: string | null;
    explicitEntityType: ImportEntityType | null;
    detectedHeaders: string[];
  }) {
    if (input.mappingProfileId) {
      const byId = await this.postgresService.query<MappingProfileRow>(
        `
          SELECT
            id,
            source_id,
            entity_type,
            mapping_json,
            key_resolution_json,
            is_default,
            status,
            version
          FROM integration.source_mapping_profiles
          WHERE id = $1::uuid
            AND status = 'active'
        `,
        [input.mappingProfileId],
      );
      if (byId.rows.length === 0) {
        throw new BadRequestException('mappingProfileId no existe o no está activo');
      }

      const profile = byId.rows[0];
      if (input.sourceId && profile.source_id !== input.sourceId) {
        throw new BadRequestException(
          'El mappingProfileId no pertenece al sourceId indicado',
        );
      }
      if (input.explicitEntityType && profile.entity_type !== input.explicitEntityType) {
        throw new BadRequestException(
          'El mappingProfileId no coincide con entityType',
        );
      }
      return profile;
    }

    if (!input.sourceId) {
      return null;
    }

    const detectedEntityType = input.explicitEntityType ?? tryDetectEntityType(input.detectedHeaders);
    if (detectedEntityType) {
      const bySourceEntity = await this.postgresService.query<MappingProfileRow>(
        `
          SELECT
            id,
            source_id,
            entity_type,
            mapping_json,
            key_resolution_json,
            is_default,
            status,
            version
          FROM integration.source_mapping_profiles
          WHERE source_id = $1::uuid
            AND entity_type = $2
            AND status = 'active'
            AND is_default = TRUE
          ORDER BY version DESC
          LIMIT 1
        `,
        [input.sourceId, detectedEntityType],
      );
      return bySourceEntity.rows[0] ?? null;
    }

    const sourceDefaults = await this.postgresService.query<MappingProfileRow>(
      `
        SELECT
          id,
          source_id,
          entity_type,
          mapping_json,
          key_resolution_json,
          is_default,
          status,
          version
        FROM integration.source_mapping_profiles
        WHERE source_id = $1::uuid
          AND status = 'active'
          AND is_default = TRUE
      `,
      [input.sourceId],
    );

    return sourceDefaults.rows.length === 1 ? sourceDefaults.rows[0] : null;
  }

  private async persistBatchRuleResults(
    batchId: string,
    entityType: ImportEntityType,
    ruleResults: BatchRuleResultInput[],
  ) {
    await this.postgresService.query(
      `
        DELETE FROM integration.import_batch_rule_results
        WHERE batch_id = $1
      `,
      [batchId],
    );

    for (const rule of ruleResults) {
      await this.postgresService.query(
        `
          INSERT INTO integration.import_batch_rule_results (
            batch_id,
            entity_type,
            rule_code,
            severity,
            status,
            affected_rows,
            message,
            details_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          batchId,
          entityType,
          rule.ruleCode,
          rule.severity,
          rule.status,
          rule.affectedRows,
          rule.message,
          JSON.stringify(rule.details ?? {}),
        ],
      );
    }
  }

  private async upsertInstitutionKey(
    institutionId: string,
    aliasKey: string,
    sourceId: string | null,
  ) {
    const normalizedAlias = aliasKey.trim().toLowerCase();
    if (!normalizedAlias) {
      return;
    }

    const updated = await this.postgresService.query(
      `
        UPDATE core.institution_keys
        SET
          active = TRUE,
          match_type = 'code',
          confidence = 1.00,
          updated_at = NOW()
        WHERE institution_id = $1::uuid
          AND alias_key = $2
          AND source_id IS NOT DISTINCT FROM $3::uuid
      `,
      [institutionId, normalizedAlias, sourceId],
    );

    if ((updated.rowCount ?? 0) > 0) {
      return;
    }

    await this.postgresService.query(
      `
        INSERT INTO core.institution_keys (
          institution_id,
          source_id,
          alias_key,
          match_type,
          confidence,
          active
        )
        VALUES ($1::uuid, $2::uuid, $3, 'code', 1.00, TRUE)
        ON CONFLICT DO NOTHING
      `,
      [institutionId, sourceId, normalizedAlias],
    );
  }

  private async upsertProjectKey(projectId: string, aliasKey: string, sourceId: string | null) {
    const normalizedAlias = aliasKey.trim().toLowerCase();
    if (!normalizedAlias) {
      return;
    }

    const updated = await this.postgresService.query(
      `
        UPDATE core.project_keys
        SET
          active = TRUE,
          match_type = 'code',
          confidence = 1.00,
          updated_at = NOW()
        WHERE project_id = $1::uuid
          AND alias_key = $2
          AND source_id IS NOT DISTINCT FROM $3::uuid
      `,
      [projectId, normalizedAlias, sourceId],
    );

    if ((updated.rowCount ?? 0) > 0) {
      return;
    }

    await this.postgresService.query(
      `
        INSERT INTO core.project_keys (
          project_id,
          source_id,
          alias_key,
          match_type,
          confidence,
          active
        )
        VALUES ($1::uuid, $2::uuid, $3, 'code', 1.00, TRUE)
        ON CONFLICT DO NOTHING
      `,
      [projectId, sourceId, normalizedAlias],
    );
  }

  private async upsertTerritoryKey(
    territoryId: string,
    aliasKey: string,
    sourceId: string | null,
  ) {
    const normalizedAlias = aliasKey.trim().toLowerCase();
    if (!normalizedAlias) {
      return;
    }

    const updated = await this.postgresService.query(
      `
        UPDATE core.territory_keys
        SET
          active = TRUE,
          match_type = 'code',
          confidence = 1.00,
          updated_at = NOW()
        WHERE territory_id = $1::uuid
          AND alias_key = $2
          AND source_id IS NOT DISTINCT FROM $3::uuid
      `,
      [territoryId, normalizedAlias, sourceId],
    );

    if ((updated.rowCount ?? 0) > 0) {
      return;
    }

    await this.postgresService.query(
      `
        INSERT INTO core.territory_keys (
          territory_id,
          source_id,
          alias_key,
          match_type,
          confidence,
          active
        )
        VALUES ($1::uuid, $2::uuid, $3, 'code', 1.00, TRUE)
        ON CONFLICT DO NOTHING
      `,
      [territoryId, sourceId, normalizedAlias],
    );
  }

  private async touchSource(sourceId: string) {
    await this.postgresService.query(
      `
        UPDATE core.data_sources
        SET
          last_ingested_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [sourceId],
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

  private async ensureSourceInEgi(sourceId: string, egiId: string) {
    const result = await this.postgresService.query<{ id: string; name: string }>(
      `
        SELECT id, name
        FROM core.data_sources
        WHERE id = $1::uuid
          AND egi_id = $2::uuid
        LIMIT 1
      `,
      [sourceId, egiId],
    );
    if (result.rows.length === 0) {
      throw new BadRequestException('La fuente seleccionada no pertenece al EGI activo.');
    }
    return result.rows[0];
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
    try {
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
      this.logger.log(`${action} -> ${result}`);
    } catch (error) {
      this.logger.warn(
        `Audit persistence failed for ${action}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}

function mapImportBatchRow(row: ImportBatchRow) {
  const qualityScore =
    row.quality_score === null
      ? null
      : typeof row.quality_score === 'number'
        ? row.quality_score
        : Number(row.quality_score);

  return {
    id: row.id,
    egiId: row.egi_id,
    entityType: row.entity_type,
    sourceFormat: row.source_format,
    fileName: row.file_name,
    sheetName: row.sheet_name,
    status: row.status,
    sourceId: row.source_id,
    mappingProfileId: row.mapping_profile_id,
    datasetId: row.dataset_id,
    initiatedByUserId: row.initiated_by_user_id,
    totalRows: row.total_rows,
    stagedRows: row.staged_rows,
    validRows: row.valid_rows,
    invalidRows: row.invalid_rows,
    promotedRows: row.promoted_rows,
    qualityScore: Number.isFinite(qualityScore) ? qualityScore : null,
    qualityGrade: row.quality_grade,
    quality: row.quality_json ?? {},
    details: row.details_json ?? {},
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSourceMappingProfileRow(row: MappingProfileRow) {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name ?? 'Fuente',
    entityType: row.entity_type,
    profileName: row.profile_name,
    version: row.version,
    mappingJson: row.mapping_json ?? {},
    keyResolutionJson: row.key_resolution_json ?? {},
    isDefault: row.is_default,
    status: row.status,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
  };
}

function parseColumnMapping(
  input: unknown,
): Record<string, string> {
  if (!input) {
    return {};
  }

  const rawInput = typeof input === 'string' ? input.trim() : input;
  if (typeof rawInput === 'string' && rawInput.length === 0) {
    return {};
  }

  let parsed: unknown = rawInput;
  if (typeof rawInput === 'string') {
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      throw new BadRequestException('columnMapping debe ser un JSON válido');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException('columnMapping debe ser un objeto JSON');
  }

  const normalizedPairs: Array<readonly [string, string]> = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalizedKey = normalizeHeader(key);
    const normalizedValue = normalizeHeader(value);
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    normalizedPairs.push([normalizedKey, normalizedValue] as const);
  }

  if (normalizedPairs.length === 0) {
    return {};
  }

  const canonicalHeaders = new Set<string>(
    Object.values(REQUIRED_HEADERS_BY_ENTITY).flat(),
  );

  const keyCanonicalMatches = normalizedPairs.filter(([key]) =>
    canonicalHeaders.has(key),
  ).length;
  const valueCanonicalMatches = normalizedPairs.filter(([, value]) =>
    canonicalHeaders.has(value),
  ).length;

  const normalizedMapping: Record<string, string> = {};
  if (valueCanonicalMatches > keyCanonicalMatches) {
    for (const [sourceHeader, canonicalHeader] of normalizedPairs) {
      normalizedMapping[canonicalHeader] = sourceHeader;
    }
  } else {
    for (const [canonicalHeader, sourceHeader] of normalizedPairs) {
      normalizedMapping[canonicalHeader] = sourceHeader;
    }
  }

  return normalizedMapping;
}

function applyColumnMapping(
  rows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
) {
  if (Object.keys(columnMapping).length === 0) {
    return rows;
  }

  return rows.map((row) => {
    const mappedRow: Record<string, unknown> = { ...row };
    for (const [targetHeader, sourceHeader] of Object.entries(columnMapping)) {
      if (Object.prototype.hasOwnProperty.call(row, sourceHeader)) {
        mappedRow[targetHeader] = row[sourceHeader];
      }
    }
    return mappedRow;
  });
}

function tryDetectEntityType(headers: string[]): ImportEntityType | null {
  try {
    return detectEntityType(headers);
  } catch {
    return null;
  }
}

function buildRuleResults(
  entityType: ImportEntityType,
  totalRows: number,
  errors: RowError[],
): BatchRuleResultInput[] {
  const invalidRows = new Set<number>(errors.map((error) => error.rowNumber)).size;
  const requiredErrors = errors.filter((error) =>
    error.errorCode.includes('required'),
  ).length;
  const unresolvedErrors = errors.filter((error) =>
    error.errorCode.includes('not_found'),
  ).length;
  const duplicatedErrors = errors.filter((error) =>
    error.errorCode.includes('duplicated'),
  ).length;

  return [
    {
      ruleCode: 'row_validity',
      severity: 'error',
      status: invalidRows > 0 ? 'failed' : 'passed',
      affectedRows: invalidRows,
      message:
        invalidRows > 0
          ? `${invalidRows} filas inválidas detectadas en ${entityType}.`
          : `No se detectaron filas inválidas en ${entityType}.`,
      details: { totalRows, invalidRows },
    },
    {
      ruleCode: 'required_fields_completeness',
      severity: 'error',
      status: requiredErrors > 0 ? 'failed' : 'passed',
      affectedRows: requiredErrors,
      message:
        requiredErrors > 0
          ? `Se detectaron ${requiredErrors} errores por campos requeridos.`
          : 'Campos requeridos completos.',
      details: { requiredErrors },
    },
    {
      ruleCode: 'business_key_resolution',
      severity: unresolvedErrors > 0 ? 'error' : 'info',
      status: unresolvedErrors > 0 ? 'failed' : 'passed',
      affectedRows: unresolvedErrors,
      message:
        unresolvedErrors > 0
          ? `Se detectaron ${unresolvedErrors} referencias sin resolver.`
          : 'Resolución de claves de negocio sin incidencias.',
      details: { unresolvedErrors },
    },
    {
      ruleCode: 'duplicate_keys_in_batch',
      severity: duplicatedErrors > 0 ? 'warning' : 'info',
      status: duplicatedErrors > 0 ? 'warning' : 'passed',
      affectedRows: duplicatedErrors,
      message:
        duplicatedErrors > 0
          ? `Se detectaron ${duplicatedErrors} duplicidades en el lote.`
          : 'Sin duplicidades detectadas.',
      details: { duplicatedErrors },
    },
  ];
}

function buildGeographicRuleResults(
  entityType: ImportEntityType,
  errors: RowError[],
  validationCatalog: ImportValidationCatalog,
): BatchRuleResultInput[] {
  const countryUnknownErrors = errors.filter((error) => error.errorCode === 'country_unknown').length;
  const countryScopeErrors = errors.filter((error) => error.errorCode === 'country_scope_mismatch').length;
  const territoryLevelErrors = errors.filter((error) => error.errorCode === 'territory_level_invalid').length;
  const territoryConsistencyErrors = errors.filter((error) =>
    error.errorCode === 'territory_level_mismatch' ||
    error.errorCode === 'territory_country_mismatch',
  ).length;
  const territoryEgiScopeErrors = errors.filter(
    (error) => error.errorCode === 'territory_outside_egi_scope',
  ).length;

  const results: BatchRuleResultInput[] = [
    {
      ruleCode: 'country_catalog_alignment',
      severity: countryUnknownErrors > 0 ? 'error' : 'info',
      status: countryUnknownErrors > 0 ? 'failed' : 'passed',
      affectedRows: countryUnknownErrors,
      message:
        countryUnknownErrors > 0
          ? `Se detectaron ${countryUnknownErrors} filas con country fuera del catálogo operativo.`
          : 'Todos los países pertenecen al catálogo operativo.',
      details: {
        catalogCountries: Array.from(validationCatalog.knownCountries.values()),
      },
    },
    {
      ruleCode: 'source_country_scope_alignment',
      severity: countryScopeErrors > 0 ? 'error' : 'info',
      status: countryScopeErrors > 0 ? 'failed' : 'passed',
      affectedRows: countryScopeErrors,
      message:
        countryScopeErrors > 0
          ? `Se detectaron ${countryScopeErrors} filas fuera del alcance territorial permitido de la fuente.`
          : 'Las filas respetan el alcance territorial configurado para la fuente.',
      details: {
        sourceScope: validationCatalog.sourceScope,
        allowedCountries: resolveAllowedCountries(validationCatalog.sourceScope),
      },
    },
  ];

  if (entityType === 'project_territories') {
    results.push(
      {
        ruleCode: 'territory_level_catalog_alignment',
        severity: territoryLevelErrors > 0 ? 'error' : 'info',
        status: territoryLevelErrors > 0 ? 'failed' : 'passed',
        affectedRows: territoryLevelErrors,
        message:
          territoryLevelErrors > 0
            ? `Se detectaron ${territoryLevelErrors} filas con territory_level fuera del catálogo operativo.`
            : 'Los niveles territoriales pertenecen al catálogo operativo.',
        details: {
          territoryLevels: Array.from(validationCatalog.territoryLevels.values()),
        },
      },
      {
        ruleCode: 'territory_reference_consistency',
        severity: territoryConsistencyErrors > 0 ? 'error' : 'info',
        status: territoryConsistencyErrors > 0 ? 'failed' : 'passed',
        affectedRows: territoryConsistencyErrors,
        message:
          territoryConsistencyErrors > 0
            ? `Se detectaron ${territoryConsistencyErrors} filas con conflictos entre territorio, nivel y país.`
            : 'No se detectaron conflictos entre territorio, nivel y país.',
        details: {},
      },
      {
        ruleCode: 'territory_egi_scope_alignment',
        severity: territoryEgiScopeErrors > 0 ? 'warning' : 'info',
        status: territoryEgiScopeErrors > 0 ? 'warning' : 'passed',
        affectedRows: territoryEgiScopeErrors,
        message:
          territoryEgiScopeErrors > 0
            ? `Se detectaron ${territoryEgiScopeErrors} filas con territorios potencialmente fuera del alcance declarado del EGI.`
            : 'No se detectaron territorios fuera del alcance declarado del EGI.',
        details: {
          sourceScope: validationCatalog.sourceScope,
        },
      },
    );
  }

  return results;
}

function calculateBatchQuality(
  totalRows: number,
  errors: RowError[],
  ruleResults: BatchRuleResultInput[],
): BatchQuality {
  const invalidRows = new Set<number>(errors.map((error) => error.rowNumber)).size;
  const validRows = Math.max(totalRows - invalidRows, 0);
  const validityRatio = totalRows > 0 ? (validRows / totalRows) * 100 : 0;

  const requiredErrors = errors.filter((error) =>
    error.errorCode.includes('required'),
  ).length;
  const unresolvedErrors = errors.filter((error) =>
    error.errorCode.includes('not_found'),
  ).length;
  const duplicatedErrors = errors.filter((error) =>
    error.errorCode.includes('duplicated'),
  ).length;

  const severityPenalty = clamp(
    requiredErrors * 1.8 + unresolvedErrors * 2.2 + duplicatedErrors * 1.1,
    0,
    55,
  );
  const rulePenalty = clamp(
    ruleResults.filter((rule) => rule.status === 'failed').length * 4 +
      ruleResults.filter((rule) => rule.status === 'warning').length * 2,
    0,
    20,
  );

  const score = round2(clamp(validityRatio - severityPenalty - rulePenalty, 0, 100));
  const grade =
    score >= 95 ? 'A' :
    score >= 85 ? 'B' :
    score >= 70 ? 'C' :
    score >= 50 ? 'D' : 'E';

  return {
    score,
    grade,
    summary: {
      totalRows,
      validRows,
      invalidRows,
      requiredErrors,
      unresolvedErrors,
      duplicatedErrors,
      penalties: {
        severityPenalty: round2(severityPenalty),
        rulePenalty,
      },
      computedAt: new Date().toISOString(),
    },
  };
}

function buildMissingHeadersQuality(
  missingHeaders: string[],
  requiredHeaders: string[],
): BatchQuality {
  const completeness = requiredHeaders.length > 0
    ? (requiredHeaders.length - missingHeaders.length) / requiredHeaders.length
    : 0;
  const score = round2(clamp(completeness * 100, 0, 100));
  return {
    score,
    grade: score >= 70 ? 'C' : 'E',
    summary: {
      reason: 'missing_headers',
      missingHeaders,
      requiredHeaders,
      computedAt: new Date().toISOString(),
    },
  };
}

function summarizeRuleResults(ruleResults: BatchRuleResultInput[]) {
  return {
    totalRules: ruleResults.length,
    failedRules: ruleResults.filter((rule) => rule.status === 'failed').length,
    warningRules: ruleResults.filter((rule) => rule.status === 'warning').length,
    passedRules: ruleResults.filter((rule) => rule.status === 'passed').length,
  };
}

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function detectSourceFormat(fileName: string): ImportSourceFormat {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.csv')) {
    return 'csv';
  }
  if (normalized.endsWith('.xlsx') || normalized.endsWith('.xls')) {
    return 'xlsx';
  }
  throw new BadRequestException('Formato no soportado. Usa .csv o .xlsx/.xls');
}

function detectEntityType(headers: string[]): ImportEntityType {
  const candidates = (
    Object.keys(REQUIRED_HEADERS_BY_ENTITY) as ImportEntityType[]
  ).filter((entityType) =>
    REQUIRED_HEADERS_BY_ENTITY[entityType].every((required) =>
      headers.includes(required),
    ),
  );

  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    throw new BadRequestException(
      `No se pudo identificar una entidad única con los encabezados detectados: ${headers.join(', ')}`,
    );
  }
  throw new BadRequestException(
    `No se pudo detectar el tipo de entidad para encabezados: ${headers.join(', ')}`,
  );
}

function normalizeRowHeaders(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey) {
      continue;
    }
    normalized[normalizedKey] = value;
  }
  return normalized;
}

function collectHeaders(rows: Record<string, unknown>[]) {
  const headers = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headers.add(key);
    }
  }
  return Array.from(headers);
}

function normalizeHeader(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isRowNotEmpty(row: Record<string, unknown>) {
  return Object.values(row).some((value) => {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return true;
  });
}

function pickString(row: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return null;
}

function parseAliasCollection(row: Record<string, unknown>, candidates: string[]) {
  const values: string[] = [];
  for (const candidate of candidates) {
    const raw = row[candidate];
    if (raw === null || raw === undefined) {
      continue;
    }

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string' && item.trim().length > 0) {
          values.push(item.trim());
        } else if (typeof item === 'number') {
          values.push(String(item));
        }
      }
      continue;
    }

    if (typeof raw === 'number') {
      values.push(String(raw));
      continue;
    }

    if (typeof raw !== 'string') {
      continue;
    }

    const text = raw.trim();
    if (text.length === 0) {
      continue;
    }

    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim().length > 0) {
              values.push(item.trim());
            } else if (typeof item === 'number') {
              values.push(String(item));
            }
          }
          continue;
        }
      } catch {
        // fallback to separator parsing below
      }
    }

    const separated = text.split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
    if (separated.length > 0) {
      values.push(...separated);
    } else {
      values.push(text);
    }
  }

  const unique = new Map<string, string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || unique.has(normalized)) {
      continue;
    }
    unique.set(normalized, value.trim());
  }
  return Array.from(unique.values());
}

function parseNullableNumber(rawValue: string | null) {
  if (rawValue === null) {
    return null;
  }
  const normalized = rawValue.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export function parseDateOnly(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawValue.trim());
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return candidate.getUTCFullYear() === Number(year) &&
      candidate.getUTCMonth() === Number(month) - 1 &&
      candidate.getUTCDate() === Number(day)
      ? rawValue.trim()
      : null;
  }
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeProjectStatus(status: string | null) {
  const candidate = (status ?? 'draft').toLowerCase();
  if (candidate === 'active' || candidate === 'completed' || candidate === 'published') {
    return candidate;
  }
  return 'draft';
}

function buildRowError(
  rowNumber: number,
  errorCode: string,
  errorMessage: string,
  rawPayload: Record<string, unknown>,
): RowError {
  return {
    rowNumber,
    errorCode,
    errorMessage,
    rawPayload,
  };
}

function stripUtf8Bom(buffer: Buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.subarray(3);
  }

  return buffer;
}

function buildCountryTerritoryCode(country: string) {
  const normalized = country
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `country-${normalized || 'unknown'}`;
}

function normalizeCountryKey(country: string) {
  return country
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesCountryName(left: string, right: string) {
  return normalizeCountryKey(left) === normalizeCountryKey(right);
}

function normalizeScopeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesTerritoryScope(
  reference: { code: string; name: string; level: string },
  scope: string,
) {
  const normalizedScope = normalizeScopeKey(scope);
  if (!normalizedScope) {
    return true;
  }

  const candidates = [reference.code, reference.name, reference.level]
    .map((item) => normalizeScopeKey(item))
    .filter((item) => item.length > 0);

  return candidates.some(
    (candidate) => candidate === normalizedScope || candidate.includes(normalizedScope) || normalizedScope.includes(candidate),
  );
}

function resolveAllowedCountries(sourceScope: SourceScopeContext | null) {
  if (!sourceScope) {
    return [];
  }

  if (sourceScope.allowedCountries.length > 0) {
    return sourceScope.allowedCountries;
  }

  return sourceScope.sourceCountry ? [sourceScope.sourceCountry] : [];
}

function readConfigText(
  config: Record<string, unknown> | null | undefined,
  key: string,
) {
  const raw = config?.[key];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function readConfigStringArray(
  config: Record<string, unknown> | null | undefined,
  key: string,
) {
  const raw = config?.[key];
  if (Array.isArray(raw)) {
    const unique = new Map<string, string>();
    for (const item of raw) {
      if (typeof item !== 'string') {
        continue;
      }
      const normalized = item.trim();
      if (!normalized) {
        continue;
      }
      const bucket = normalized.toLowerCase();
      if (!unique.has(bucket)) {
        unique.set(bucket, normalized);
      }
    }
    return Array.from(unique.values());
  }

  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw
      .split(/[;,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}
