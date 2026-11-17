# SIGI Platform Architecture V1

## Purpose

This document defines the V1 target architecture for SIGI as a geospatial and interoperability platform supporting:

- KoboToolbox integration
- PostGIS-backed geospatial processing
- multi-institution data integration

The goal of V1 is not to maximize microservice purity. The goal is to create a system that is operationally simple, domain-correct, and ready to scale in the areas that matter for SIGI:

- ingestion reliability
- institution isolation
- geospatial query performance
- connector extensibility

## Core opinion

SIGI should be built as a platform with one primary business API and two specialized processing services.

- `sigi-api` is the platform boundary.
- `integration-service` is the ingestion and ETL boundary.
- `gis-service` is the geospatial processing boundary.

These are not three equal business services.

`sigi-api` owns business workflows.
`integration-service` owns external system integration and transformation.
`gis-service` owns spatial computation and spatial read models.

If this discipline is not maintained, the system will drift into a shared-database distributed monolith.

## Architecture principles

1. External clients talk to `sigi-api`, not directly to internal processing services.
2. Long-running ingestion and spatial workflows are asynchronous.
3. Raw external data, canonical platform data, and spatial derived data are stored separately.
4. Institution scope is a first-class property across APIs, jobs, storage, and logs.
5. One PostgreSQL/PostGIS cluster is acceptable in V1, but ownership must be separated by schema.
6. Service boundaries are defined by capability, not by entity.

## System context

### External actors

- web or admin clients
- KoboToolbox
- future interoperability sources

### Internal services

- `apps/sigi-api`
- `services/integration-service`
- `services/gis-service`
- `postgres/postgis`
- queue and worker runtime

## Service responsibilities

### `sigi-api`

Role:
- system of record API
- institution-aware business boundary
- orchestration layer for sync and GIS workflows

Owns:
- institution lifecycle
- connector registration and activation
- user-facing resource APIs
- sync request submission
- sync and processing status exposure
- canonical business entities in `core`

Must not own:
- Kobo extraction logic
- connector-specific transformation pipelines
- heavy spatial computation

Public endpoints in V1:
- `GET /api/health`
- `GET /api/metrics`
- `GET /api/institutions`
- `GET /api/connectors`
- `POST /api/institutions/:institutionId/connectors/:connectorId/sync`
- `GET /api/sync-jobs/:jobId`
- `GET /api/datasets/:datasetId/features`

### `integration-service`

Role:
- integration and ETL worker boundary

Owns:
- KoboToolbox client logic
- extraction scheduling hooks
- raw payload capture
- connector normalization and mapping
- idempotency, checkpointing, retry behavior
- sync job execution state in `integration`

Must not own:
- public institution CRUD
- final client-facing business APIs
- general platform authorization logic

Internal endpoints in V1:
- `GET /health`
- `GET /metrics`
- `POST /sync`
- `GET /sync`
- `GET /sync/{job_id}`

### `gis-service`

Role:
- geospatial processing and spatial read-model boundary

Owns:
- geometry validation
- reprojection and normalization
- spatial enrichment
- intersection, containment, buffer, and overlay logic
- GIS-oriented query/read models in `gis`

Must not own:
- connector logic
- institution lifecycle logic
- generic business workflows

Internal endpoints in V1:
- `GET /health`
- `GET /metrics`
- `POST /geometry/validate`
- `POST /geometry/enrich`
- `POST /layers/rebuild`
- `GET /features/search`

## Data ownership model

V1 uses one Postgres cluster with strict schema ownership.

### `core` schema

Owner:
- `sigi-api`

Contains:
- institutions
- connectors
- canonical datasets
- canonical features or business entities
- platform-visible sync/job summary records

Purpose:
- durable platform state
- client-facing business records

### `integration` schema

Owner:
- `integration-service`

Contains:
- connector sync jobs
- ingestion checkpoints
- raw Kobo payload snapshots
- staging tables
- transformation audit logs

Purpose:
- reliable ETL execution and replay

### `gis` schema

Owner:
- `gis-service`

Contains:
- validated geometry artifacts
- derived spatial layers
- materialized views
- spatial indexes and enrichment outputs

Purpose:
- high-performance geospatial querying and derived geospatial products

## Data classification

V1 must keep these layers distinct:

- raw data: external source payloads exactly as received
- canonical data: normalized SIGI platform entities
- derived GIS data: computed geospatial outputs optimized for query or analysis

This separation is mandatory for maintainability and auditability.

## Institution model

Multi-institution support must exist in every layer.

Required rule:
- every platform record, sync job, staging batch, and GIS output must be attributable to an `institution_id`

Practical implications:
- connector config is institution-scoped
- sync jobs are institution-scoped
- canonical data is institution-scoped unless intentionally global
- GIS layers must either be institution-scoped or explicitly shared/reference data

Reference datasets such as administrative boundaries may be global, but their usage must still be explicit.

## Integration model for KoboToolbox

### Why the split is correct

Kobo ingestion is an external-system reliability problem, not a normal CRUD problem.

That means SIGI needs:
- retries
- checkpointing
- raw payload retention
- schema drift handling
- mapping from source forms into canonical SIGI entities

This belongs in `integration-service`, not in `sigi-api`.

### Recommended Kobo flow

1. A client or scheduler requests a sync through `sigi-api`.
2. `sigi-api` validates institution and connector state.
3. `sigi-api` creates a platform sync record and submits work to `integration-service`.
4. `integration-service` pulls submissions from KoboToolbox.
5. Raw payloads are stored in `integration`.
6. The payload is normalized into canonical records.
7. Canonical records are promoted into `core`.
8. If spatial fields exist, a GIS processing request is emitted.
9. `gis-service` validates and enriches geometry, then writes derived outputs to `gis`.
10. `sigi-api` exposes final status and downstream query access.

### Kobo connector abstraction

Even if Kobo is the first connector, V1 should treat it as one implementation of a connector interface:

- authenticate
- fetch changes
- checkpoint progress
- map source schema
- emit normalized records

This prevents the entire platform from becoming Kobo-shaped.

## Geospatial processing model

### Why GIS should be separate

PostGIS is central, but not every spatial concern should live inside the main API.

Separate GIS ownership is justified because:
- spatial operations can be expensive
- derived spatial models often differ from transactional models
- spatial indexing and materialized views need dedicated tuning
- GIS logic tends to evolve differently from business CRUD logic

### Recommended GIS responsibilities

- validate geometry validity and SRID
- normalize geometries to SIGI storage conventions
- derive centroids, extents, overlays, and intersections
- maintain spatially optimized read models
- expose internal spatial query operations to `sigi-api`

### Geospatial rule

`gis-service` should be treated as a compute and read-model service, not as the canonical source of business truth.

Canonical truth stays in `core`.
Spatially optimized truth lives in `gis`.

## API boundary rules

### External API rule

Only `sigi-api` is public in V1.

Reasons:
- one auth boundary
- one institution authorization boundary
- stable public contract
- internal service refactors stay internal

### Internal API rule

`integration-service` and `gis-service` expose narrow internal contracts only.

Internal contracts should be:
- task-oriented
- capability-oriented
- versionable

They should not mirror public CRUD resources.

## Flow diagrams

### Sync flow

```text
Client
  -> sigi-api
  -> validate institution + connector
  -> create sync record
  -> submit async sync job
  -> integration-service
  -> fetch from KoboToolbox
  -> store raw payload in integration schema
  -> normalize data
  -> promote canonical records into core schema
  -> emit GIS processing request if geometry exists
  -> gis-service
  -> validate/enrich geometry
  -> write derived outputs to gis schema
  -> sigi-api exposes status/results to client
```

### Spatial query flow

```text
Client
  -> sigi-api
  -> validate institution scope
  -> request spatial data or filtered features
  -> gis-service
  -> execute PostGIS-heavy query against gis schema
  -> return shaped result to sigi-api
  -> return client response
```

## Runtime architecture

### V1 runtime components

- `sigi-api`
- `integration-service`
- `gis-service`
- `postgres/postgis`
- job queue
- worker process for integration jobs
- optional worker process for GIS rebuild jobs

### Queue recommendation

V1 should add a real queue as soon as the first non-trivial sync pipeline is implemented.

Recommended uses:
- connector sync jobs
- retryable ETL tasks
- GIS enrichment or rebuild tasks

The queue is not optional for production-grade ingestion.

## Recommended storage pattern

### Canonical platform tables

Live in `core`.

Examples:
- institutions
- connectors
- datasets
- records promoted from ETL

### ETL tables

Live in `integration`.

Examples:
- sync_jobs
- sync_checkpoints
- raw_submissions
- staging_records
- transform_failures

### GIS tables

Live in `gis`.

Examples:
- validated_features
- enriched_features
- spatial_index tables
- materialized reporting layers

## Scalability model

### What scales first

In SIGI, the first scaling pressure is not usually API CRUD.
It is:
- ETL throughput
- spatial query cost
- institution-specific processing bursts

### Recommended scaling path

1. keep one Postgres/PostGIS cluster initially
2. add queue-backed async workers
3. scale `integration-service` workers horizontally
4. scale `gis-service` independently for spatial workloads
5. add read models and materialized views before considering database fragmentation
6. separate databases only when ownership or workload isolation truly requires it

Strong opinion:
do not split databases too early.
Schema ownership and async processing will buy more value than early database fragmentation.

## Security and tenancy rules

### Institution isolation

- every request in `sigi-api` must resolve institution context
- connector operations must verify institution ownership
- sync jobs must carry institution context through all downstream processing

### Service trust model

- internal services should be treated as trusted but not public
- only `sigi-api` should handle external auth in V1
- later, internal auth or signed service tokens can be added if network boundaries require it

## Observability requirements

V1 must support:
- health endpoints
- metrics endpoints
- structured logs
- job status tracking
- institution-aware correlation where possible

Critical future improvement:
- add trace or correlation IDs that flow from `sigi-api` into integration and GIS jobs

## What not to do

Do not:
- expose `integration-service` directly to external clients
- expose `gis-service` as a second public API surface
- let all services read and write all schemas freely
- store raw Kobo payloads directly in canonical tables
- make spatial enrichment part of synchronous user requests when it is expensive
- turn each entity into its own microservice

## Build-now decisions for V1

These decisions should be considered committed for V1:

1. one public API: `sigi-api`
2. one Postgres/PostGIS cluster
3. schema ownership: `core`, `integration`, `gis`
4. async sync workflow for Kobo ingestion
5. `integration-service` as connector adapter and ETL processor
6. `gis-service` as spatial compute and read-model service
7. institution-scoped data model across the stack

## Deferred decisions

These can wait until after V1:

- separate databases per service
- event bus beyond a simple queue
- advanced workflow orchestration engine
- vector tiles or map-serving stack
- CDC-based replication between schemas
- zero-trust service-to-service auth

## Recommended next implementation steps

1. add durable queue-backed job execution for sync workflows
2. add institution-scoped sync job tables in `integration`
3. define canonical dataset and record tables in `core`
4. define raw Kobo submission and checkpoint tables in `integration`
5. define validated and enriched geometry tables in `gis`
6. add internal GIS task endpoints for validation and enrichment
7. add correlation IDs across API, ETL, and GIS execution

## Final architecture statement

SIGI V1 should be implemented as a domain-centered platform where:

- `sigi-api` is the only public business API
- `integration-service` handles external interoperability and ETL reliability
- `gis-service` handles spatial processing and spatial read models
- Postgres/PostGIS is shared initially but partitioned by strict schema ownership
- asynchronous jobs are the default pattern for ingestion and heavy spatial workflows

This is the architecture most aligned with KoboToolbox integration, PostGIS-heavy workloads, and multi-institution interoperability without overcomplicating the platform too early.
