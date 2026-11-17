# Architecture Overview

## Diagnostico base

El repo actual ya tiene una base real y no debe reiniciarse desde cero:

- `apps/sigi-api`: API principal en NestJS
- `services/integration-service`: ETL e integracion en FastAPI
- `services/gis-service`: servicio GIS en FastAPI
- `infra/postgres`: bootstrap PostgreSQL/PostGIS

Faltan todavia:

- frontends en codigo
- contratos OpenAPI formales
- bounded contexts Core mas completos
- auth y autorizacion
- bridge/exportaciones
- GIS funcional sobre PostGIS

## Principios de arquitectura

1. `SIGI-Core` es el nucleo obligatorio.
2. `sigi-api` implementa inicialmente el boundary oficial del Core.
3. Los conectores extraen y transforman, pero no gobiernan.
4. `integration-service` es una capa operativa de conectores, no el Core.
5. `services/gis-service` implementa capacidad opcional `Geo/BI`.
6. `services/bridge` implementa exportaciones y autoreportes.
7. Los frontends no contienen reglas de negocio ni validacion.
8. El frontend solo consume `sigi-api`.

## Decision estructural

Se adopta un monorepo modular con esta forma:

- `apps/frontend-country`
- `apps/frontend-sigi`
- `apps/sigi-api`
- `services/connectors/*`
- `services/bridge`
- `services/gis-service`
- `libs/contracts`
- `libs/domain`
- `libs/shared`
- `infra/docker`
- `docs/architecture`
- `docs/openapi`
- `docs/adrs`

## Mapeo de responsabilidades

### `apps/sigi-api`

- contrato HTTP principal
- Core API
- Admin API
- auth, roles, permisos
- trazabilidad y auditoria
- publicacion y lectura publica

### `services/integration-service`

- orquestacion operativa ETL temporal
- sync jobs
- checkpoints
- payloads crudos
- staging e ingestion

### `services/connectors/*`

- adaptadores por fuente
- mapeo a payload canonicamente aceptable
- extraccion y empaquetado

### `services/bridge`

- exportaciones
- autoreportes
- interoperabilidad con FERM y otros targets

### `services/gis-service`

- validacion geometrica
- enriquecimiento espacial
- capas y vistas derivadas
- queries geoespaciales pesadas

