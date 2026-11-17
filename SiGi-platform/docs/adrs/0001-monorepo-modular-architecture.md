# ADR 0001: Monorepo modular para SIGI

## Estado

Aprobado.

## Contexto

El repositorio ya contiene una base backend funcional:

- `apps/sigi-api` en NestJS
- `services/integration-service` en FastAPI
- `services/gis-service` en FastAPI
- PostgreSQL/PostGIS con bootstrap SQL

No existe frontend real dentro del repo y tampoco hay un workspace raiz para compartir contratos, tipos o configuraciones.

## Decision

Se adopta un **monorepo modular** como estructura objetivo.

### Motivos

1. Permite conservar el stack actual sin migraciones costosas.
2. Facilita compartir contratos entre frontends y backend.
3. Evita separar artificialmente repos cuando el producto todavia esta en fase de definicion.
4. Permite evolucionar por bounded contexts sin convertir el repo en monolito logico.

## Consecuencias

- `sigi-api` sigue siendo el boundary HTTP principal.
- Los frontends consumen solo `sigi-api`.
- `integration-service` y `gis-service` permanecen desacoplados.
- `services/connectors/*` y `services/bridge` se bootstrapean como dominios separados, aunque parte de la ejecucion inicial siga centralizada.

