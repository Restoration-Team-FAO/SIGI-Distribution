import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getValidatedEnv } from '../../common/config/env';
import { PostgresService } from '../../common/db/postgres.service';
import { requestInternalJson } from '../../common/http/internal-service-client';
import { SyncJobsService } from '../sync-jobs/sync-jobs.service';

type KoboSourceRow = {
  source_id: string;
  source_code: string;
  source_name: string;
  source_status: string;
  source_type: string;
  institution_id: string;
  institution_name: string;
  connector_id: string | null;
  connector_display_name: string | null;
  connector_status: string | null;
  source_config_json: Record<string, unknown> | null;
  connector_config_json: Record<string, unknown> | null;
  source_last_ingested_at: Date | null;
  connector_last_sync_at: Date | null;
  source_created_at: Date;
  source_updated_at: Date;
};

type SyncJobRow = {
  id: string;
  institution_id: string;
  connector_id: string;
  integration_job_id: string | null;
  status: 'queued' | 'dispatching' | 'running' | 'completed' | 'partial_failed' | 'failed';
  triggered_by: 'user' | 'scheduler';
  mode: 'incremental' | 'full';
  summary_json: Record<string, unknown>;
  error_json: Record<string, unknown> | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type IntegrationTestResponse = {
  ok: boolean;
  mode: 'live' | 'mock';
  message: string;
  sourceId?: string | null;
  assetUid?: string | null;
  baseUrl?: string | null;
  authScheme?: string | null;
  recordsOnFirstPage?: number;
  hasMore?: boolean;
};

type IntegrationPreviewResponse = IntegrationTestResponse & {
  previewRows: Array<Record<string, unknown>>;
  geojsonPreview: Record<string, unknown> | null;
  lastSubmissionTime?: string | null;
  lastSubmissionId?: number | null;
};

@Injectable()
export class KoboSourcesService {
  constructor(
    private readonly postgresService: PostgresService,
    private readonly syncJobsService: SyncJobsService,
  ) {}

  async list() {
    const result = await this.postgresService.query<KoboSourceRow>(
      `
        SELECT
          ds.id AS source_id,
          ds.code AS source_code,
          ds.name AS source_name,
          ds.status AS source_status,
          ds.source_type,
          ds.institution_id,
          i.name AS institution_name,
          ds.connector_id,
          c.display_name AS connector_display_name,
          c.status AS connector_status,
          ds.config_json AS source_config_json,
          c.config_json AS connector_config_json,
          ds.last_ingested_at AS source_last_ingested_at,
          c.last_sync_at AS connector_last_sync_at,
          ds.created_at AS source_created_at,
          ds.updated_at AS source_updated_at
        FROM core.data_sources ds
        INNER JOIN core.institutions i ON i.id = ds.institution_id
        LEFT JOIN core.connectors c ON c.id = ds.connector_id
        WHERE ds.source_type = 'kobo'
        ORDER BY ds.updated_at DESC, ds.created_at DESC
      `,
    );

    return result.rows.map((row) => this.mapSource(row));
  }

  async getBySourceId(sourceId: string) {
    const row = await this.findSourceRow(sourceId);
    if (!row) {
      throw new NotFoundException('Kobo source not found');
    }
    return this.mapSource(row);
  }

  async testConnection(
    input: {
      sourceId?: string;
      baseUrl?: string;
      token?: string;
      assetUid?: string;
    },
    _actorEmail: string | null,
  ) {
    if (!input.sourceId && (!input.baseUrl || !input.token || !input.assetUid)) {
      throw new BadRequestException(
        'sourceId o credenciales completas (baseUrl, token y assetUid) son requeridas.',
      );
    }

    return this.requestIntegrationKoboTest(input);
  }

  async previewSync(sourceId: string) {
    await this.getBySourceId(sourceId);
    return this.requestIntegrationKoboPreview({ sourceId });
  }

  async runSync(sourceId: string, _actorEmail: string | null) {
    const source = await this.getBySourceId(sourceId);
    if (!source.connectorId) {
      throw new BadRequestException('La fuente Kobo no tiene un conector asociado.');
    }
    if (source.status !== 'active') {
      throw new BadRequestException('La fuente Kobo debe estar activa para ejecutar sincronizacion.');
    }

    const job = await this.syncJobsService.create({
      institutionId: source.institutionId,
      connectorId: source.connectorId,
      source: sourceId,
      triggeredBy: 'user',
      mode: 'incremental',
    });

    return {
      connectorId: source.connectorId,
      jobId: job.jobId,
      status: job.status,
    };
  }

  async getLastJob(sourceId: string) {
    const source = await this.getBySourceId(sourceId);
    if (!source.connectorId) {
      return null;
    }

    const result = await this.postgresService.query<SyncJobRow>(
      `
        SELECT
          id,
          institution_id,
          connector_id,
          integration_job_id,
          status,
          triggered_by,
          mode,
          summary_json,
          error_json,
          started_at,
          finished_at,
          created_at,
          updated_at
        FROM core.sync_jobs
        WHERE connector_id = $1::uuid
          AND integration_job_id IN (
            SELECT id
            FROM integration.sync_jobs
            WHERE payload_json->>'source' = $2
          )
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [source.connectorId, sourceId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapSyncJob(result.rows[0]);
  }

  private async findSourceRow(sourceId: string) {
    const result = await this.postgresService.query<KoboSourceRow>(
      `
        SELECT
          ds.id AS source_id,
          ds.code AS source_code,
          ds.name AS source_name,
          ds.status AS source_status,
          ds.source_type,
          ds.institution_id,
          i.name AS institution_name,
          ds.connector_id,
          c.display_name AS connector_display_name,
          c.status AS connector_status,
          ds.config_json AS source_config_json,
          c.config_json AS connector_config_json,
          ds.last_ingested_at AS source_last_ingested_at,
          c.last_sync_at AS connector_last_sync_at,
          ds.created_at AS source_created_at,
          ds.updated_at AS source_updated_at
        FROM core.data_sources ds
        INNER JOIN core.institutions i ON i.id = ds.institution_id
        LEFT JOIN core.connectors c ON c.id = ds.connector_id
        WHERE ds.id = $1::uuid
          AND ds.source_type = 'kobo'
        LIMIT 1
      `,
      [sourceId],
    );

    return result.rows[0] ?? null;
  }

  private mapSource(row: KoboSourceRow) {
    const sourceConfig = row.source_config_json ?? {};
    const connectorConfig = row.connector_config_json ?? {};
    return {
      sourceId: row.source_id,
      sourceCode: row.source_code,
      sourceName: row.source_name,
      sourceStatus: row.source_status,
      sourceType: row.source_type,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      connectorId: row.connector_id,
      connectorDisplayName: row.connector_display_name,
      connectorStatus: row.connector_status,
      baseUrl: this.readConfigText(connectorConfig, ['baseUrl', 'endpointUrl']),
      assetUid: this.readConfigText(sourceConfig, ['assetUid', 'asset_uid', 'projectUid', 'formUid']),
      credentialsConfigured:
        this.readConfigText(connectorConfig, ['credentialSecret', 'token', 'apiKey', 'password'])
          .length > 0,
      status: row.source_status,
      sourceLastIngestedAt: row.source_last_ingested_at?.toISOString() ?? null,
      connectorLastSyncAt: row.connector_last_sync_at?.toISOString() ?? null,
      sourceCreatedAt: row.source_created_at.toISOString(),
      sourceUpdatedAt: row.source_updated_at.toISOString(),
    };
  }

  private mapSyncJob(row: SyncJobRow) {
    return {
      jobId: row.id,
      institutionId: row.institution_id,
      connectorId: row.connector_id,
      integrationJobId: row.integration_job_id,
      status: row.status,
      triggeredBy: row.triggered_by,
      mode: row.mode,
      summary: row.summary_json ?? {},
      error: row.error_json,
      startedAt: row.started_at?.toISOString() ?? null,
      finishedAt: row.finished_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private readConfigText(config: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = config[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return '';
  }

  private requestIntegrationKoboTest(payload: {
    sourceId?: string;
    baseUrl?: string;
    token?: string;
    assetUid?: string;
  }) {
    const env = getValidatedEnv();
    return requestInternalJson<IntegrationTestResponse>({
      serviceName: 'integration-service',
      baseUrl: env.integrationServiceUrl,
      path: '/kobo/test-connection',
      method: 'POST',
      timeoutMs: env.integrationServiceTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  private requestIntegrationKoboPreview(payload: { sourceId: string }) {
    const env = getValidatedEnv();
    return requestInternalJson<IntegrationPreviewResponse>({
      serviceName: 'integration-service',
      baseUrl: env.integrationServiceUrl,
      path: '/kobo/preview',
      method: 'POST',
      timeoutMs: env.integrationServiceTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }
}
