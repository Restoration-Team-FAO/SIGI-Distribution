# Domain Model

SIGI se organiza en cuatro bounded contexts principales:

- `Core`
- `Connectors`
- `Bridge`
- `GeoBI`

## Core

Entidades:

- Institution
- DataSource
- Dataset
- DatasetVersion
- Project
- Indicator
- Territory
- ValidationRule
- ValidationResult
- AuditEvent
- Publication
- Incident
- ReportTemplate
- ReportRun
- User
- Role
- Permission

## Connectors

Entidades:

- IntegrationConnector
- SyncJob

## Bridge

Entidades:

- ExportTarget
- ExportRun

## GeoBI

Entidades:

- GeoLayer
- TerritoryView
- SpatialDatasetView

