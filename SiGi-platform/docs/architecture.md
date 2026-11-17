# SIGI Platform Architecture

## Operating model

The current platform uses one PostgreSQL/PostGIS instance with clear schema ownership:

- `core` schema: owned by `sigi-api` for core business entities and orchestration metadata.
- `integration` schema: reserved for ingestion state, ETL checkpoints, sync job metadata, and connector-specific staging tables.
- `gis` schema: reserved for geospatial working tables, derived layers, and spatial read models.

Services must not write directly into another service's schema. Cross-service collaboration should happen through HTTP contracts, asynchronous jobs, or published read models.

## Service boundaries

### `apps/sigi-api`

- System-of-record API for institutions, connectors, and business workflows.
- Owns synchronous client-facing endpoints.
- Coordinates with integration and GIS services through explicit service URLs.

### `services/integration-service`

- Handles ETL workflows and external connector execution such as Kobo.
- Exposes an asynchronous job submission contract for long-running imports.
- Should evolve toward queue-backed workers and durable job persistence in the `integration` schema.

### `services/gis-service`

- Handles geometry validation, spatial transformations, and PostGIS-heavy queries.
- Should own geospatial derived datasets and read models in the `gis` schema.

## Data and migration policy

- Keep one Postgres cluster for now to reduce operational overhead.
- Use one schema per bounded context to preserve ownership.
- Add service-owned migrations beside each service before adding more tables.
- Treat `infra/postgres/init` as bootstrap-only infrastructure, not the long-term migration mechanism.

## Async integration pattern

Long-running sync operations should use:

1. `POST /sync` to enqueue work and return `202 Accepted`.
2. `GET /sync/{job_id}` to observe state transitions.
3. A worker-backed implementation for retries, idempotency, and durability.

The current implementation is an in-memory placeholder that demonstrates the contract shape. It should later be replaced by a queue plus persistent job tracking.
