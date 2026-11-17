type MetricsSnapshot = {
  http_requests_total: number;
  http_requests_in_flight: number;
  http_requests_succeeded_total: number;
  http_requests_client_error_total: number;
  http_requests_server_error_total: number;
  http_requests_failed_total: number;
  import_batches_total: number;
  import_batches_completed_total: number;
  import_batches_failed_total: number;
  sync_jobs_total: number;
  sync_jobs_reused_total: number;
  sync_jobs_failed_total: number;
};

const startedAt = Date.now();
const metrics: MetricsSnapshot = {
  http_requests_total: 0,
  http_requests_in_flight: 0,
  http_requests_succeeded_total: 0,
  http_requests_client_error_total: 0,
  http_requests_server_error_total: 0,
  http_requests_failed_total: 0,
  import_batches_total: 0,
  import_batches_completed_total: 0,
  import_batches_failed_total: 0,
  sync_jobs_total: 0,
  sync_jobs_reused_total: 0,
  sync_jobs_failed_total: 0,
};

export function incrementRequests(): void {
  metrics.http_requests_total += 1;
  metrics.http_requests_in_flight += 1;
}

export function completeRequest(): void {
  metrics.http_requests_in_flight = Math.max(0, metrics.http_requests_in_flight - 1);
}

export function recordRequestCompletion(statusCode: number): void {
  if (statusCode >= 500) {
    metrics.http_requests_server_error_total += 1;
    metrics.http_requests_failed_total += 1;
    return;
  }

  if (statusCode >= 400) {
    metrics.http_requests_client_error_total += 1;
    metrics.http_requests_failed_total += 1;
    return;
  }

  metrics.http_requests_succeeded_total += 1;
}

export function incrementImportBatchStarted(): void {
  metrics.import_batches_total += 1;
}

export function incrementImportBatchCompleted(failed: boolean): void {
  if (failed) {
    metrics.import_batches_failed_total += 1;
    return;
  }
  metrics.import_batches_completed_total += 1;
}

export function incrementSyncJobStarted(): void {
  metrics.sync_jobs_total += 1;
}

export function incrementSyncJobReused(): void {
  metrics.sync_jobs_reused_total += 1;
}

export function incrementSyncJobFailed(): void {
  metrics.sync_jobs_failed_total += 1;
}

export function renderMetrics(): string {
  const uptimeSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return [
    '# HELP http_requests_total Total HTTP requests handled by the API',
    '# TYPE http_requests_total counter',
    `http_requests_total ${metrics.http_requests_total}`,
    '# HELP http_requests_in_flight Current in-flight HTTP requests',
    '# TYPE http_requests_in_flight gauge',
    `http_requests_in_flight ${metrics.http_requests_in_flight}`,
    '# HELP http_requests_succeeded_total Total HTTP requests that returned 2xx/3xx',
    '# TYPE http_requests_succeeded_total counter',
    `http_requests_succeeded_total ${metrics.http_requests_succeeded_total}`,
    '# HELP http_requests_client_error_total Total HTTP requests that returned 4xx',
    '# TYPE http_requests_client_error_total counter',
    `http_requests_client_error_total ${metrics.http_requests_client_error_total}`,
    '# HELP http_requests_server_error_total Total HTTP requests that returned 5xx',
    '# TYPE http_requests_server_error_total counter',
    `http_requests_server_error_total ${metrics.http_requests_server_error_total}`,
    '# HELP http_requests_failed_total Total HTTP requests that returned 4xx/5xx',
    '# TYPE http_requests_failed_total counter',
    `http_requests_failed_total ${metrics.http_requests_failed_total}`,
    '# HELP sigi_process_uptime_seconds API process uptime in seconds',
    '# TYPE sigi_process_uptime_seconds gauge',
    `sigi_process_uptime_seconds ${uptimeSeconds}`,
    '# HELP import_batches_total Total import batches started',
    '# TYPE import_batches_total counter',
    `import_batches_total ${metrics.import_batches_total}`,
    '# HELP import_batches_completed_total Total import batches completed successfully',
    '# TYPE import_batches_completed_total counter',
    `import_batches_completed_total ${metrics.import_batches_completed_total}`,
    '# HELP import_batches_failed_total Total import batches failed',
    '# TYPE import_batches_failed_total counter',
    `import_batches_failed_total ${metrics.import_batches_failed_total}`,
    '# HELP sync_jobs_total Total sync jobs started',
    '# TYPE sync_jobs_total counter',
    `sync_jobs_total ${metrics.sync_jobs_total}`,
    '# HELP sync_jobs_reused_total Total sync job requests that reused an active job',
    '# TYPE sync_jobs_reused_total counter',
    `sync_jobs_reused_total ${metrics.sync_jobs_reused_total}`,
    '# HELP sync_jobs_failed_total Total sync jobs that failed during dispatch',
    '# TYPE sync_jobs_failed_total counter',
    `sync_jobs_failed_total ${metrics.sync_jobs_failed_total}`,
  ].join('\n');
}
