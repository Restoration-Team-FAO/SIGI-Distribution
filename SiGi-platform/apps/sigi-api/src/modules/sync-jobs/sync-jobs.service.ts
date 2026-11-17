import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getValidatedEnv } from '../../common/config/env';
import { PostgresService } from '../../common/db/postgres.service';
import { requestInternalJson } from '../../common/http/internal-service-client';
import {
  incrementSyncJobFailed,
  incrementSyncJobReused,
  incrementSyncJobStarted,
} from '../../common/observability/metrics';
import { ConnectorsService } from '../connectors/connectors.service';
import { InstitutionsService } from '../institutions/institutions.service';

type TriggeredBy = 'user' | 'scheduler';
type SyncMode = 'incremental' | 'full';
type SyncJobStatus =
  | 'queued'
  | 'dispatching'
  | 'running'
  | 'completed'
  | 'partial_failed'
  | 'failed';

type SyncJob = {
  id: string;
  institutionId: string;
  connectorId: string;
  integrationJobId: string | null;
  status: SyncJobStatus;
  triggeredBy: TriggeredBy;
  mode: SyncMode;
  summary: Record<string, unknown>;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateSyncJobInput = {
  institutionId: string;
  connectorId: string;
  source?: string;
  triggeredBy?: TriggeredBy;
  mode?: SyncMode;
  options?: Record<string, unknown>;
};

type IntegrationSyncResponse = {
  job_id: string;
  status: SyncJobStatus;
  status_url: string;
};

@Injectable()
export class SyncJobsService {
  private readonly logger = new Logger(SyncJobsService.name);

  constructor(
    private readonly postgresService: PostgresService,
    private readonly institutionsService: InstitutionsService,
    private readonly connectorsService: ConnectorsService,
  ) {}

  async create(input: CreateSyncJobInput) {
    const institution = await this.institutionsService.findById(input.institutionId);
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const connector = await this.connectorsService.findByInstitutionAndId(
      input.institutionId,
      input.connectorId,
    );
    if (!connector) {
      throw new NotFoundException('Connector not found');
    }

    const activeJob = await this.findActivePlatformSyncJob(
      input.institutionId,
      input.connectorId,
    );
    if (activeJob) {
      const refreshedActiveJob = await this.findById(activeJob.id);
      if (this.isTerminalStatus(refreshedActiveJob.status) === false) {
        incrementSyncJobReused();
        this.logger.log(
          JSON.stringify({
            event: 'sync_job_reused',
            jobId: refreshedActiveJob.jobId,
            institutionId: refreshedActiveJob.institutionId,
            connectorId: refreshedActiveJob.connectorId,
            status: refreshedActiveJob.status,
          }),
        );
        return refreshedActiveJob;
      }
    }

    const job = await this.createPlatformSyncJob({
      connectorId: input.connectorId,
      institutionId: input.institutionId,
      mode: input.mode ?? 'incremental',
      status: 'dispatching',
      triggeredBy: input.triggeredBy ?? 'user',
    });
    incrementSyncJobStarted();
    this.logger.log(
      JSON.stringify({
        event: 'sync_job_started',
        jobId: job.id,
        institutionId: job.institutionId,
        connectorId: job.connectorId,
        mode: job.mode,
        triggeredBy: job.triggeredBy,
      }),
    );

    try {
      const integrationJob = await this.enqueueIntegrationSync({
        connectorId: connector.id,
        connectorType: connector.connectorType,
        institutionId: institution.id,
        mode: job.mode,
        platformJobId: job.id,
        source: input.source,
        triggeredBy: job.triggeredBy,
        options: input.options ?? {},
      });

      const updatedJob = await this.updatePlatformSyncJob(job.id, {
        integrationJobId: integrationJob.job_id,
        status: integrationJob.status,
        summary: {
          integrationStatusUrl: integrationJob.status_url,
        },
      });
      this.logger.log(
        JSON.stringify({
          event: 'sync_job_dispatched',
          jobId: updatedJob.id,
          institutionId: updatedJob.institutionId,
          connectorId: updatedJob.connectorId,
          integrationJobId: updatedJob.integrationJobId,
          status: updatedJob.status,
        }),
      );

      return this.toResponse(updatedJob);
    } catch (error) {
      await this.updatePlatformSyncJob(job.id, {
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'Unable to dispatch integration sync job',
        },
        finishedAt: new Date().toISOString(),
        status: 'failed',
      });
      incrementSyncJobFailed();
      this.logger.error(
        JSON.stringify({
          event: 'sync_job_failed',
          jobId: job.id,
          institutionId: job.institutionId,
          connectorId: job.connectorId,
          message:
            error instanceof Error
              ? error.message
              : 'Unable to dispatch integration sync job',
        }),
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Failed to dispatch sync job to integration-service',
      );
    }
  }

  async findById(jobId: string) {
    let job = await this.findPlatformSyncJob(jobId);
    if (!job) {
      throw new NotFoundException('Sync job not found');
    }

    if (job.integrationJobId && this.isTerminalStatus(job.status) === false) {
      try {
        const integrationJob = await this.fetchIntegrationSync(job.integrationJobId);
        job = await this.updatePlatformSyncJob(job.id, {
          error: integrationJob.error ?? null,
          finishedAt: integrationJob.finished_at,
          startedAt: integrationJob.started_at,
          status: integrationJob.status,
          summary: {
            ...job.summary,
            checkpoint: integrationJob.checkpoint_json ?? {},
            retryCount: integrationJob.retry_count ?? 0,
          },
        });
      } catch {
        // Keep the last durable platform state if the integration service is unavailable.
      }
    }

    return this.toResponse(job);
  }

  private async createPlatformSyncJob(input: {
    institutionId: string;
    connectorId: string;
    triggeredBy: TriggeredBy;
    mode: SyncMode;
    status: SyncJobStatus;
  }): Promise<SyncJob> {
    const result = await this.postgresService.query<SyncJobRow>(
      `
        INSERT INTO core.sync_jobs (
          institution_id,
          connector_id,
          status,
          triggered_by,
          mode,
          started_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING
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
      `,
      [
        input.institutionId,
        input.connectorId,
        input.status,
        input.triggeredBy,
        input.mode,
      ],
    );

    return this.mapSyncJobRow(result.rows[0]);
  }

  private async findPlatformSyncJob(jobId: string): Promise<SyncJob | null> {
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
        WHERE id = $1
      `,
      [jobId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapSyncJobRow(result.rows[0]);
  }

  private async findActivePlatformSyncJob(
    institutionId: string,
    connectorId: string,
  ): Promise<SyncJob | null> {
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
        WHERE institution_id = $1
          AND connector_id = $2
          AND status IN ('queued', 'dispatching', 'running')
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [institutionId, connectorId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapSyncJobRow(result.rows[0]);
  }

  private async updatePlatformSyncJob(
    jobId: string,
    update: {
      integrationJobId?: string | null;
      status?: SyncJobStatus;
      summary?: Record<string, unknown>;
      error?: Record<string, unknown> | null;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ): Promise<SyncJob> {
    const result = await this.postgresService.query<SyncJobRow>(
      `
        UPDATE core.sync_jobs
        SET
          integration_job_id = COALESCE($2, integration_job_id),
          status = COALESCE($3, status),
          summary_json = CASE
            WHEN $4::jsonb IS NULL THEN summary_json
            ELSE $4::jsonb
          END,
          error_json = $5::jsonb,
          started_at = COALESCE($6::timestamptz, started_at),
          finished_at = $7::timestamptz,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
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
      `,
      [
        jobId,
        update.integrationJobId ?? null,
        update.status ?? null,
        update.summary ? JSON.stringify(update.summary) : null,
        update.error ? JSON.stringify(update.error) : null,
        update.startedAt ?? null,
        update.finishedAt ?? null,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Sync job not found');
    }

    return this.mapSyncJobRow(result.rows[0]);
  }

  private mapSyncJobRow(row: SyncJobRow): SyncJob {
    return {
      id: row.id,
      institutionId: row.institution_id,
      connectorId: row.connector_id,
      integrationJobId: row.integration_job_id,
      status: row.status,
      triggeredBy: row.triggered_by,
      mode: row.mode,
      summary: row.summary_json ?? {},
      error: row.error_json,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private toResponse(job: SyncJob) {
    return {
      jobId: job.id,
      institutionId: job.institutionId,
      connectorId: job.connectorId,
      integrationJobId: job.integrationJobId,
      status: job.status,
      triggeredBy: job.triggeredBy,
      mode: job.mode,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      summary: job.summary,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private enqueueIntegrationSync(body: {
    platformJobId: string;
    institutionId: string;
    connectorId: string;
    connectorType: string;
    source?: string;
    triggeredBy: TriggeredBy;
    mode: SyncMode;
    options?: Record<string, unknown>;
  }): Promise<IntegrationSyncResponse> {
    const env = getValidatedEnv();
    return requestInternalJson<IntegrationSyncResponse>({
      serviceName: 'integration-service',
      baseUrl: env.integrationServiceUrl,
      path: '/sync/',
      method: 'POST',
      timeoutMs: env.integrationServiceTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        options: body.options ?? {},
      }),
    });
  }

  private fetchIntegrationSync(jobId: string): Promise<IntegrationSyncRecord> {
    const env = getValidatedEnv();
    return requestInternalJson<IntegrationSyncRecord>({
      serviceName: 'integration-service',
      baseUrl: env.integrationServiceUrl,
      path: `/sync/${jobId}`,
      method: 'GET',
      timeoutMs: env.integrationServiceTimeoutMs,
    });
  }

  private isTerminalStatus(status: SyncJobStatus): boolean {
    return ['completed', 'failed', 'partial_failed'].includes(status);
  }
}

type SyncJobRow = {
  id: string;
  institution_id: string;
  connector_id: string;
  integration_job_id: string | null;
  status: SyncJobStatus;
  triggered_by: TriggeredBy;
  mode: SyncMode;
  summary_json: Record<string, unknown>;
  error_json: Record<string, unknown> | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type IntegrationSyncRecord = {
  job_id: string;
  status: SyncJobStatus;
  checkpoint_json?: Record<string, unknown>;
  payload_json?: Record<string, unknown>;
  retry_count?: number;
  error?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
};
