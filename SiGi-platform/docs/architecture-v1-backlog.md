# SIGI Platform V1 Schema and API Backlog

## Purpose

This document turns the V1 architecture into an implementation backlog covering:

- schema design priorities
- API contracts
- sequencing recommendations

The backlog is grouped into what should be built first versus what can safely follow.

## Delivery order

### Phase 1: platform foundations

- institution-scoped core tables
- connector registration model
- sync job tracking in `core`
- integration sync jobs and raw payload storage
- public sync submission and status APIs

### Phase 2: ETL reliability

- checkpoints
- staging tables
- transform error tracking
- retry metadata
- durable queue-backed workers

### Phase 3: GIS capabilities

- validated geometry tables
- enriched geometry tables
- spatial search read models
- internal GIS processing endpoints

## Schema backlog

## `core` schema

### 1. `core.institutions`

Purpose:
- top-level tenant or participating organization

Suggested columns:
- `id uuid pk`
- `code text unique`
- `name text`
- `status text`
- `created_at timestamptz`
- `updated_at timestamptz`

### 2. `core.connectors`

Purpose:
- institution-specific connector registration

Suggested columns:
- `id uuid pk`
- `institution_id uuid fk -> core.institutions.id`
- `connector_type text`
- `display_name text`
- `status text`
- `config_json jsonb`
- `last_sync_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Notes:
- `config_json` should contain connector settings, not raw secrets if a secret manager is introduced later.

### 3. `core.datasets`

Purpose:
- canonical data collection definitions exposed by SIGI

Suggested columns:
- `id uuid pk`
- `institution_id uuid fk`
- `name text`
- `dataset_type text`
- `source_connector_id uuid nullable fk`
- `status text`
- `created_at timestamptz`
- `updated_at timestamptz`

### 4. `core.records`

Purpose:
- canonical normalized records promoted from integration pipelines

Suggested columns:
- `id uuid pk`
- `institution_id uuid fk`
- `dataset_id uuid fk`
- `source_connector_id uuid fk`
- `source_record_key text`
- `record_data jsonb`
- `geometry_ref uuid nullable`
- `sync_job_id uuid nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

Indexes:
- `(institution_id, dataset_id)`
- `(source_connector_id, source_record_key)` unique when appropriate

### 5. `core.sync_jobs`

Purpose:
- public platform-visible sync status

Suggested columns:
- `id uuid pk`
- `institution_id uuid fk`
- `connector_id uuid fk`
- `integration_job_id uuid nullable`
- `status text`
- `triggered_by text`
- `started_at timestamptz nullable`
- `finished_at timestamptz nullable`
- `summary_json jsonb`
- `error_json jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Status examples:
- `queued`
- `running`
- `completed`
- `partial_failed`
- `failed`

## `integration` schema

### 6. `integration.sync_jobs`

Purpose:
- internal ETL execution state

Suggested columns:
- `id uuid pk`
- `institution_id uuid`
- `connector_id uuid`
- `platform_sync_job_id uuid`
- `connector_type text`
- `status text`
- `retry_count int`
- `checkpoint_json jsonb`
- `started_at timestamptz nullable`
- `finished_at timestamptz nullable`
- `error_json jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

### 7. `integration.raw_payloads`

Purpose:
- immutable raw snapshots from Kobo or other external systems

Suggested columns:
- `id uuid pk`
- `institution_id uuid`
- `connector_id uuid`
- `sync_job_id uuid fk -> integration.sync_jobs.id`
- `source_record_key text`
- `payload jsonb`
- `payload_hash text`
- `received_at timestamptz`

Indexes:
- `(sync_job_id)`
- `(connector_id, source_record_key)`

### 8. `integration.staging_records`

Purpose:
- normalized intermediate records before promotion to `core`

Suggested columns:
- `id uuid pk`
- `institution_id uuid`
- `connector_id uuid`
- `sync_job_id uuid`
- `source_record_key text`
- `canonical_type text`
- `normalized_data jsonb`
- `promotion_status text`
- `promotion_error jsonb nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

### 9. `integration.sync_checkpoints`

Purpose:
- resumable extraction markers

Suggested columns:
- `id uuid pk`
- `institution_id uuid`
- `connector_id uuid`
- `checkpoint_type text`
- `checkpoint_value jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

### 10. `integration.transform_failures`

Purpose:
- preserve normalization or mapping errors for diagnosis and replay

Suggested columns:
- `id uuid pk`
- `institution_id uuid`
- `connector_id uuid`
- `sync_job_id uuid`
- `source_record_key text`
- `failure_stage text`
- `error_json jsonb`
- `raw_payload_id uuid nullable`
- `created_at timestamptz`

## `gis` schema

### 11. `gis.validated_features`

Purpose:
- geometry after validation and normalization

Suggested columns:
- `id uuid pk`
- `institution_id uuid`
- `record_id uuid`
- `dataset_id uuid`
- `geometry geometry`
- `srid int`
- `is_valid boolean`
- `validation_notes jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Indexes:
- `gist (geometry)`
- `(institution_id, dataset_id)`

### 12. `gis.enriched_features`

Purpose:
- features after spatial derivation or enrichment

Suggested columns:
- `id uuid pk`
- `institution_id uuid`
- `record_id uuid`
- `dataset_id uuid`
- `geometry geometry`
- `centroid geometry`
- `bbox geometry`
- `enrichment_json jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Indexes:
- `gist (geometry)`
- `gist (centroid)`

### 13. `gis.feature_search_view`

Purpose:
- optimized spatial query layer for `gis-service`

Suggested structure:
- materialized view or denormalized table
- includes `institution_id`, `dataset_id`, `record_id`, selected properties, and indexed geometry

## API backlog

## Public API in `sigi-api`

### 1. Submit sync job

`POST /api/institutions/{institutionId}/connectors/{connectorId}/sync`

Request:

```json
{
  "triggeredBy": "user|scheduler",
  "mode": "incremental"
}
```

Response:

```json
{
  "jobId": "uuid",
  "status": "queued",
  "statusUrl": "/api/sync-jobs/uuid"
}
```

### 2. Get sync job status

`GET /api/sync-jobs/{jobId}`

Response:

```json
{
  "jobId": "uuid",
  "institutionId": "uuid",
  "connectorId": "uuid",
  "status": "running",
  "startedAt": "2026-04-13T10:00:00Z",
  "finishedAt": null,
  "summary": {},
  "error": null
}
```

### 3. List institution connectors

`GET /api/institutions/{institutionId}/connectors`

### 4. List datasets

`GET /api/institutions/{institutionId}/datasets`

### 5. Query dataset features

`GET /api/datasets/{datasetId}/features`

Suggested query params:
- `bbox`
- `limit`
- `offset`
- `q`

## Internal API in `integration-service`

### 6. Submit integration sync

`POST /sync`

Request:

```json
{
  "platformJobId": "uuid",
  "institutionId": "uuid",
  "connectorId": "uuid",
  "connectorType": "kobo",
  "mode": "incremental",
  "options": {}
}
```

Response:

```json
{
  "job_id": "uuid",
  "status": "queued",
  "status_url": "/sync/uuid"
}
```

### 7. Get integration sync status

`GET /sync/{job_id}`

### 8. List integration jobs

`GET /sync`

## Internal API in `gis-service`

### 9. Validate geometry

`POST /geometry/validate`

Request:

```json
{
  "institutionId": "uuid",
  "datasetId": "uuid",
  "recordId": "uuid",
  "geometry": {}
}
```

### 10. Enrich geometry

`POST /geometry/enrich`

Request:

```json
{
  "institutionId": "uuid",
  "datasetId": "uuid",
  "recordId": "uuid",
  "geometryRef": "uuid",
  "operations": ["centroid", "bbox", "admin_overlay"]
}
```

### 11. Search features

`GET /features/search`

Suggested query params:
- `institutionId`
- `datasetId`
- `bbox`
- `intersects`
- `limit`

## Implementation steps

## Step 1. Stabilize core platform contract

Build:
- `core.institutions`
- `core.connectors`
- `core.sync_jobs`
- public sync submit/status endpoints in `sigi-api`

Reason:
- this establishes tenancy, connector ownership, and public orchestration first

## Step 2. Build durable integration state

Build:
- `integration.sync_jobs`
- `integration.raw_payloads`
- `integration.sync_checkpoints`
- `integration.transform_failures`

Reason:
- Kobo integration reliability depends on durable state more than on UI features

## Step 3. Add promotion pipeline

Build:
- `integration.staging_records`
- `core.datasets`
- `core.records`

Reason:
- this creates the bridge from raw and staged data into canonical SIGI data

## Step 4. Add GIS persistence and query model

Build:
- `gis.validated_features`
- `gis.enriched_features`
- `gis.feature_search_view`
- internal GIS endpoints

Reason:
- this provides scalable spatial validation and query performance

## Step 5. Add worker and queue execution

Build:
- queue-backed integration worker
- queue-backed GIS jobs when needed
- retry and dead-letter policies

Reason:
- async reliability is required for real ETL and large spatial workloads

## Acceptance criteria for V1

V1 is structurally complete when:

- clients use only `sigi-api`
- sync jobs are institution-scoped end to end
- raw Kobo payloads are stored separately from canonical records
- canonical records are visible from `core`
- GIS outputs are stored in `gis`
- sync status is durable and queryable
- heavy ETL and GIS work can run asynchronously
