# Integration service migrations

This folder is reserved for integration-service migrations.

- Scope: `integration` schema only.
- Ownership: sync jobs, connector checkpoints, ETL staging tables, ingestion audit state.
- Rule: long-running workflows should persist their execution state here once durable storage is added.
