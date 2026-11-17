import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PostgresService } from '../../common/db/postgres.service';
import { CreateDatasetDto } from './dto/create-dataset.dto';

@Injectable()
export class DatasetsService {
  constructor(private readonly postgresService: PostgresService) {}

  async list(requestedEgiId: string | null) {
    const result = await this.postgresService.query<DatasetRow>(
      `
        SELECT
          id,
          institution_id,
          source_id,
          schema_code,
          title,
          status,
          created_at,
          updated_at,
          egi_id
        FROM core.datasets
        WHERE ($1::uuid IS NULL OR egi_id = $1::uuid)
        ORDER BY created_at DESC
      `,
      [requestedEgiId],
    );

    return result.rows.map(mapDatasetRow);
  }

  async submit(payload: CreateDatasetDto, actorEmail: string | null, requestedEgiId: string | null) {
    const sourceResult = await this.postgresService.query<{ id: string; egi_id: string | null }>(
      `
        SELECT id, egi_id
        FROM core.data_sources
        WHERE id = $1
          AND institution_id = $2
          AND ($3::uuid IS NULL OR egi_id = $3::uuid)
      `,
      [payload.sourceId, payload.institutionId, requestedEgiId],
    );

    if (sourceResult.rows.length === 0) {
      throw new NotFoundException('Data source not found for institution');
    }

    const sourceEgiId = sourceResult.rows[0].egi_id ?? requestedEgiId ?? null;
    if (!sourceEgiId) {
      throw new BadRequestException(
        'El dataset requiere un EGI activo o una fuente asociada a un EGI.',
      );
    }

    const datasetResult = await this.postgresService.query<DatasetRow>(
      `
        INSERT INTO core.datasets (
          institution_id,
          source_id,
          schema_code,
          title,
          status,
          egi_id
        )
        VALUES ($1, $2, $3, $4, 'validating', $5::uuid)
        RETURNING id, institution_id, source_id, schema_code, title, status, created_at, updated_at, egi_id
      `,
      [
        payload.institutionId,
        payload.sourceId,
        payload.schemaCode,
        String(payload.payload.title ?? 'Untitled dataset'),
        sourceEgiId,
      ],
    );

    const dataset = datasetResult.rows[0];

    const versionResult = await this.postgresService.query<DatasetVersionRow>(
      `
        INSERT INTO core.dataset_versions (
          dataset_id,
          version_number,
          status,
          payload_json
        )
        VALUES ($1, 1, 'received', $2::jsonb)
        RETURNING id, dataset_id, version_number, status
      `,
      [dataset.id, JSON.stringify(payload.payload)],
    );

    const version = versionResult.rows[0];
    const ruleResult = await this.postgresService.query<ValidationRuleRow>(
      `
        SELECT id, code, schema_code, severity
        FROM core.validation_rules
        WHERE active = TRUE AND schema_code = $1
        ORDER BY code ASC
      `,
      [payload.schemaCode],
    );

    const validationResults = ruleResult.rows.map((rule) =>
      evaluateRule(rule.code, payload.payload),
    );

    for (const validation of validationResults) {
      await this.postgresService.query(
        `
          INSERT INTO core.validation_results (
            egi_id,
            dataset_version_id,
            rule_code,
            status,
            message
          )
          VALUES ((SELECT egi_id FROM core.datasets WHERE id = $1::uuid), $2, $3, $4, $5)
        `,
        [dataset.id, version.id, validation.ruleCode, validation.status, validation.message],
      );
    }

    const hasFailures = validationResults.some((result) => result.status === 'failed');
    const datasetStatus = hasFailures ? 'rejected' : 'validated';

    await this.postgresService.query(
      `
        UPDATE core.datasets
        SET status = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [dataset.id, datasetStatus],
    );

    await this.postgresService.query(
      `
        UPDATE core.dataset_versions
        SET status = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [version.id, datasetStatus],
    );

    await this.recordAudit(
      actorEmail,
      'dataset.submitted',
      'dataset',
      dataset.id,
      'api',
      datasetStatus,
      {
        schemaCode: payload.schemaCode,
        validationResults: validationResults.length,
      },
      sourceEgiId,
    );

    return {
      dataset: {
        ...mapDatasetRow(dataset),
        status: datasetStatus,
      },
    };
  }

  async importExcel(
    input: {
      fileBuffer?: Buffer;
      fileName?: string | null;
      institutionId: string;
      sourceId: string;
      schemaCode?: string;
      datasetTitle?: string;
      sheetName?: string;
    },
    actorEmail: string | null,
    requestedEgiId: string | null,
  ) {
    if (!input.fileBuffer || input.fileBuffer.length === 0) {
      throw new BadRequestException('Excel file is required');
    }

    const parsedWorkbook = this.parseExcelWorkbook(input.fileBuffer, input.sheetName);
    const schemaCode = (input.schemaCode ?? 'project').trim().toLowerCase();

    const importedRows = parsedWorkbook.rows;
    const nonEmptyRows = importedRows.filter((row) => isRowNotEmpty(row));

    let payloadRows: Record<string, unknown>[] = nonEmptyRows;
    let validProjectRows: CanonicalProjectRow[] = [];

    if (schemaCode === 'project') {
      const canonicalRows = nonEmptyRows.map((row) => mapProjectRow(row));
      validProjectRows = canonicalRows.filter((row) => isProjectRowValid(row));
      payloadRows = validProjectRows.map((row) => ({
        title: row.title,
        status: row.status,
        areaHa: row.areaHa,
        raw: row.raw,
      }));
    }

    const stats = buildExcelStats({
      totalRows: importedRows.length,
      validRows: schemaCode === 'project' ? validProjectRows.length : nonEmptyRows.length,
      sheetName: parsedWorkbook.sheetName,
      projectRows: schemaCode === 'project' ? validProjectRows : undefined,
    });

    const submissionResult = await this.submit(
      {
        institutionId: input.institutionId,
        sourceId: input.sourceId,
        schemaCode,
        payload: {
          title:
            input.datasetTitle?.trim() ||
            `${schemaCode.toUpperCase()} import ${new Date().toISOString()}`,
          source: 'excel',
          fileName: input.fileName ?? null,
          sheetName: parsedWorkbook.sheetName,
          importedAt: new Date().toISOString(),
          stats,
          rows: payloadRows,
        },
      },
      actorEmail,
      requestedEgiId,
    );

    let insertedProjects = 0;
    if (schemaCode === 'project') {
      insertedProjects = await this.persistProjectsFromRows(
        submissionResult.dataset.id,
        input.institutionId,
        validProjectRows,
        submissionResult.dataset.egiId,
      );
    }

    await this.recordAudit(
      actorEmail,
      'dataset.excel_imported',
      'dataset',
      submissionResult.dataset.id,
      'api',
      'success',
      {
        schemaCode,
        fileName: input.fileName ?? null,
        totalRows: stats.totalRows,
        validRows: stats.validRows,
        insertedProjects,
      },
      submissionResult.dataset.egiId,
    );

    const importStats = await this.getImportStats(
      submissionResult.dataset.id,
      submissionResult.dataset.egiId,
    );

    return {
      dataset: submissionResult.dataset,
      import: {
        schemaCode,
        fileName: input.fileName ?? null,
        sheetName: parsedWorkbook.sheetName,
        insertedProjects,
      },
      stats: importStats?.stats ?? stats,
    };
  }

  async findOne(id: string, requestedEgiId: string | null = null) {
    const result = await this.postgresService.query<DatasetRow>(
      `
        SELECT id, institution_id, source_id, schema_code, title, status, created_at, updated_at, egi_id
        FROM core.datasets
        WHERE id = $1
          AND ($2::uuid IS NULL OR egi_id = $2::uuid)
      `,
      [id, requestedEgiId],
    );

    return result.rows[0] ? mapDatasetRow(result.rows[0]) : null;
  }

  async getValidation(id: string, requestedEgiId: string | null = null) {
    const dataset = await this.findOne(id, requestedEgiId);
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }

    const result = await this.postgresService.query<ValidationRow>(
      `
        SELECT
          vr.id,
          vr.rule_code,
          vr.status,
          vr.message
        FROM core.validation_results vr
        INNER JOIN core.dataset_versions dv ON dv.id = vr.dataset_version_id
        WHERE dv.dataset_id = $1
        ORDER BY vr.created_at DESC
      `,
      [id],
    );

    const hasFailures = result.rows.some((row) => row.status === 'failed');
    const hasWarnings = result.rows.some((row) => row.status === 'warning');

    return {
      datasetId: id,
      status:
        result.rows.length === 0
          ? 'pending'
          : hasFailures
            ? 'failed'
            : hasWarnings
              ? 'warning'
              : 'passed',
      results: result.rows.map((row) => ({
        id: row.id,
        ruleCode: row.rule_code,
        status: row.status,
        message: row.message,
      })),
    };
  }

  async getImportStats(datasetId: string, requestedEgiId: string | null = null) {
    const dataset = await this.findOne(datasetId, requestedEgiId);
    if (!dataset) {
      return null;
    }

    const result = await this.postgresService.query<DatasetVersionPayloadRow>(
      `
        SELECT payload_json
        FROM core.dataset_versions
        WHERE dataset_id = $1
        ORDER BY version_number DESC, created_at DESC
        LIMIT 1
      `,
      [datasetId],
    );

    const payload = result.rows[0]?.payload_json;
    const stats = asRecord(payload?.stats);
    if (!stats) {
      return null;
    }

    return {
      datasetId,
      egiId: dataset.egiId,
      title: dataset.title,
      schemaCode: dataset.schemaCode,
      source: payload?.source ?? null,
      fileName: payload?.fileName ?? null,
      sheetName: payload?.sheetName ?? null,
      importedAt: payload?.importedAt ?? null,
      stats,
    };
  }

  private parseExcelWorkbook(fileBuffer: Buffer, requestedSheetName?: string) {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    } catch (error) {
      throw new BadRequestException('Invalid Excel file');
    }

    if (workbook.SheetNames.length === 0) {
      throw new BadRequestException('Excel workbook has no sheets');
    }

    const sheetName = requestedSheetName?.trim()
      ? requestedSheetName.trim()
      : workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new BadRequestException(`Sheet "${sheetName}" not found in workbook`);
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      raw: false,
    });

    return {
      sheetName,
      rows,
    };
  }

  private async persistProjectsFromRows(
    datasetId: string,
    institutionId: string,
    rows: CanonicalProjectRow[],
    egiId: string | null,
  ) {
    if (rows.length === 0) {
      return 0;
    }

    let inserted = 0;
    for (const row of rows) {
      if (!isProjectRowValid(row)) {
        continue;
      }

      await this.postgresService.query(
        `
          INSERT INTO core.projects (
            dataset_id,
            egi_id,
            institution_id,
            title,
            status,
            area_ha
          )
          VALUES ($1, $2::uuid, $3, $4, $5, $6)
        `,
        [datasetId, egiId, institutionId, row.title, row.status, row.areaHa],
      );

      inserted += 1;
    }

    return inserted;
  }

  private async recordAudit(
    actorEmail: string | null,
    action: string,
    entityType: string,
    entityId: string,
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

    const result = await this.postgresService.query<AuditUserRow>(
      `
        SELECT id
        FROM core.users
        WHERE email = $1
      `,
      [actorEmail],
    );

    return result.rows[0]?.id ?? null;
  }

  async deleteDataset(id: string, actorEmail: string | null, requestedEgiId: string | null) {
    const dataset = await this.findOne(id, requestedEgiId);
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }

    const dependencies = await this.postgresService.query<{ dependency: string; total: number }>(
      `
        SELECT dependency, total
        FROM (
          SELECT 'projects'::text AS dependency, COUNT(*)::int AS total
          FROM core.projects
          WHERE dataset_id = $1::uuid

          UNION ALL

          SELECT 'project_datasets'::text AS dependency, COUNT(*)::int AS total
          FROM core.project_datasets
          WHERE dataset_id = $1::uuid

          UNION ALL

          SELECT 'publications'::text AS dependency, COUNT(*)::int AS total
          FROM core.publications
          WHERE dataset_id = $1::uuid
        ) dependency_counts
      `,
      [id],
    );

    const blocking = dependencies.rows.filter((item) => item.total > 0);
    if (blocking.length > 0) {
      const detail = blocking.map((item) => `${item.dependency}: ${item.total}`).join(', ');
      throw new BadRequestException(
        `No se puede eliminar el dataset porque tiene dependencias activas (${detail}).`,
      );
    }

    await this.postgresService.transaction(async (client) => {
      await client.query(
        `
          DELETE FROM core.validation_results
          WHERE dataset_version_id IN (
            SELECT id
            FROM core.dataset_versions
            WHERE dataset_id = $1::uuid
          )
        `,
        [id],
      );

      await client.query(
        `
          DELETE FROM core.dataset_versions
          WHERE dataset_id = $1::uuid
        `,
        [id],
      );

      await client.query(
        `
          DELETE FROM core.datasets
          WHERE id = $1::uuid
        `,
        [id],
      );
    });

    await this.recordAudit(
      actorEmail,
      'dataset.deleted',
      'dataset',
      id,
      'api',
      'success',
      {
        title: dataset.title,
        schemaCode: dataset.schemaCode,
      },
      dataset.egiId,
    );

    return {
      id,
      deleted: true,
    };
  }
}

type DatasetRow = {
  id: string;
  institution_id: string;
  source_id: string;
  schema_code: string;
  title: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  egi_id: string | null;
};

type DatasetVersionRow = {
  id: string;
  dataset_id: string;
  version_number: number;
  status: string;
};

type ValidationRow = {
  id: string;
  rule_code: string;
  status: string;
  message: string;
};

type ValidationRuleRow = {
  id: string;
  code: string;
  schema_code: string;
  severity: string;
};

type DatasetVersionPayloadRow = {
  payload_json: Record<string, unknown>;
};

type CanonicalProjectRow = {
  title: string;
  status: string;
  areaHa: number | null;
  raw: Record<string, unknown>;
};

function mapDatasetRow(row: DatasetRow) {
  return {
    id: row.id,
    egiId: row.egi_id,
    institutionId: row.institution_id,
    sourceId: row.source_id,
    schemaCode: row.schema_code,
    title: row.title,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function evaluateRule(ruleCode: string, payload: Record<string, unknown>) {
  if (ruleCode === 'required_title') {
    const title = String(payload.title ?? '').trim();
    return {
      ruleCode,
      status: title.length > 0 ? 'passed' : 'failed',
      message:
        title.length > 0 ? 'Title provided in payload.' : 'Payload title is required.',
    };
  }

  if (ruleCode === 'payload_not_empty') {
    const hasFields = Object.keys(payload).length > 0;
    return {
      ruleCode,
      status: hasFields ? 'passed' : 'failed',
      message: hasFields
        ? 'Payload contains fields for validation.'
        : 'Payload must not be empty.',
    };
  }

  return {
    ruleCode,
    status: 'passed',
    message: 'Rule evaluation defaulted to passed.',
  };
}

type AuditUserRow = {
  id: string;
};

function normalizeColumnName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function getColumnValue(row: Record<string, unknown>, aliases: string[]) {
  const normalizedRow = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalizedRow.set(normalizeColumnName(key), value);
  }

  for (const alias of aliases) {
    const value = normalizedRow.get(normalizeColumnName(alias));
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return null;
}

function parseArea(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function normalizeProjectStatus(statusValue: unknown): string {
  const normalized = String(statusValue ?? '').trim().toLowerCase();

  if (
    ['published', 'publicado', 'publicada'].includes(normalized)
  ) {
    return 'published';
  }

  if (
    ['completed', 'completado', 'completada', 'finalizado', 'finalizada'].includes(
      normalized,
    )
  ) {
    return 'completed';
  }

  if (
    ['draft', 'borrador'].includes(normalized)
  ) {
    return 'draft';
  }

  if (
    ['active', 'activo', 'activa', 'en ejecucion', 'ejecucion'].includes(normalized)
  ) {
    return 'active';
  }

  return 'active';
}

function mapProjectRow(row: Record<string, unknown>): CanonicalProjectRow {
  const titleValue = getColumnValue(row, [
    'title',
    'project',
    'project_title',
    'nombre',
    'nombre_proyecto',
    'proyecto',
  ]);
  const statusValue = getColumnValue(row, ['status', 'estado']);
  const areaValue = getColumnValue(row, ['area_ha', 'area', 'hectares', 'ha']);

  return {
    title: String(titleValue ?? '').trim(),
    status: normalizeProjectStatus(statusValue),
    areaHa: parseArea(areaValue),
    raw: row,
  };
}

function isProjectRowValid(row: CanonicalProjectRow) {
  return row.title.length > 0;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function buildExcelStats(input: {
  totalRows: number;
  validRows: number;
  sheetName: string;
  projectRows?: CanonicalProjectRow[];
}) {
  const statusBreakdown: Record<string, number> = {};
  let totalAreaHa = 0;

  for (const row of input.projectRows ?? []) {
    if (row.status) {
      statusBreakdown[row.status] = (statusBreakdown[row.status] ?? 0) + 1;
    }
    if (typeof row.areaHa === 'number') {
      totalAreaHa += row.areaHa;
    }
  }

  return {
    sheetName: input.sheetName,
    totalRows: input.totalRows,
    validRows: input.validRows,
    invalidRows: Math.max(input.totalRows - input.validRows, 0),
    totalAreaHa: Number(totalAreaHa.toFixed(2)),
    statusBreakdown,
    generatedAt: new Date().toISOString(),
  };
}
