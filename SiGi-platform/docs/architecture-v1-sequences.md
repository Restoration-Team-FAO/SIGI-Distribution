# SIGI Platform V1 Sequence Diagrams

## Purpose

This document translates the SIGI V1 architecture into concrete request and processing sequences.

These flows are intentionally opinionated:

- `sigi-api` is the only public API
- `integration-service` handles ETL and connector execution
- `gis-service` handles spatial processing and GIS read models
- long-running operations are asynchronous

## 1. Kobo Sync Submission Flow

### Intent

A user or scheduler requests a sync for an institution-specific connector.

### Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API as sigi-api
    participant DB as Postgres core
    participant INT as integration-service
    participant IDB as Postgres integration

    Client->>API: POST /api/institutions/{institutionId}/connectors/{connectorId}/sync
    API->>DB: Validate institution + connector ownership/state
    API->>DB: Create platform sync record (queued)
    API->>INT: POST /sync
    INT->>IDB: Create integration job record
    INT-->>API: 202 Accepted + job_id
    API->>DB: Store integration job reference
    API-->>Client: 202 Accepted + platform job id + status endpoint
```

### Notes

- The client does not call `integration-service` directly.
- `sigi-api` owns authorization and institution validation.
- `integration-service` returns an internal job reference.

## 2. Kobo Extraction and Normalization Flow

### Intent

The integration worker extracts data from KoboToolbox, stores raw data, and prepares canonical records.

### Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Worker as integration worker
    participant INT as integration-service
    participant Kobo as KoboToolbox
    participant IDB as Postgres integration
    participant API as sigi-api
    participant CDB as Postgres core

    Worker->>IDB: Mark sync job as running
    Worker->>Kobo: Fetch submissions using connector credentials/checkpoint
    Kobo-->>Worker: Submission batch
    Worker->>IDB: Store raw payload snapshot
    Worker->>IDB: Store staging/normalized records
    Worker->>API: POST internal promotion request or publish canonical payload
    API->>CDB: Upsert canonical platform records
    API-->>Worker: Promotion result
    Worker->>IDB: Mark sync job as completed or partial_failed
```

### Notes

- Raw data and canonical data must stay separated.
- Promotion into `core` should remain controlled by the platform boundary.
- Failed transforms should be persisted, not dropped.

## 3. GIS Enrichment Trigger Flow

### Intent

Canonical records with geometry trigger downstream spatial validation and enrichment.

### Sequence

```mermaid
sequenceDiagram
    autonumber
    participant API as sigi-api
    participant GIS as gis-service
    participant GDB as Postgres gis

    API->>GIS: POST /geometry/enrich
    GIS->>GDB: Validate geometry and normalize SRID
    GIS->>GDB: Compute derived geometry/enrichment outputs
    GIS-->>API: Enrichment result reference
```

### Notes

- This may be synchronous for very small workloads, but V1 should prefer async when enrichment becomes expensive.
- `gis-service` owns spatially optimized outputs, not platform business ownership.

## 4. Spatial Query Flow

### Intent

A client requests institution-scoped spatial data through the public API.

### Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API as sigi-api
    participant GIS as gis-service
    participant GDB as Postgres gis

    Client->>API: GET /api/datasets/{datasetId}/features?bbox=...
    API->>API: Validate institution access
    API->>GIS: GET /features/search
    GIS->>GDB: Execute PostGIS query on derived GIS read model
    GDB-->>GIS: Feature result set
    GIS-->>API: Filtered spatial response
    API-->>Client: Institution-scoped response
```

### Notes

- Public clients still talk only to `sigi-api`.
- `gis-service` executes the heavy spatial query.

## 5. Sync Status Flow

### Intent

The client checks sync progress from the platform boundary.

### Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API as sigi-api
    participant DB as Postgres core
    participant INT as integration-service

    Client->>API: GET /api/sync-jobs/{jobId}
    API->>DB: Read platform sync status
    alt status requires refresh
        API->>INT: GET /sync/{integrationJobId}
        INT-->>API: Current integration status
        API->>DB: Update platform sync status
    end
    API-->>Client: Current sync status
```

### Notes

- The public source of truth for status is `sigi-api`.
- Internal status may be synchronized from `integration-service`.

## 6. Failure and Retry Flow

### Intent

A Kobo sync fails due to source or network issues.

### Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Worker as integration worker
    participant Kobo as KoboToolbox
    participant IDB as Postgres integration
    participant API as sigi-api
    participant CDB as Postgres core

    Worker->>Kobo: Fetch submission batch
    Kobo-->>Worker: Timeout / error
    Worker->>IDB: Persist error and increment retry count
    alt retries remaining
        Worker->>IDB: Requeue job
    else retries exhausted
        Worker->>IDB: Mark job as failed
        Worker->>API: Notify terminal failure
        API->>CDB: Mark platform sync as failed
    end
```

### Notes

- Retry state belongs in `integration`.
- User-facing failure state belongs in `core`.

## 7. Suggested Correlation Model

Every flow should carry:

- `institution_id`
- `connector_id`
- `platform_job_id`
- `integration_job_id` when applicable
- request or correlation id

These should appear in:

- logs
- job tables
- status payloads
- downstream service calls
