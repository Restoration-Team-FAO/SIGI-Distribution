# API Contracts

Los contratos iniciales se publican como OpenAPI en:

- [../openapi/sigi-core.openapi.yaml](../openapi/sigi-core.openapi.yaml)
- [../openapi/sigi-admin.openapi.yaml](../openapi/sigi-admin.openapi.yaml)
- [../openapi/sigi-bridge.openapi.yaml](../openapi/sigi-bridge.openapi.yaml)

Principios:

1. `sigi-api` expone Core y Admin.
2. `services/bridge` expone Bridge.
3. El frontend nunca consume `integration-service` ni `gis-service` directamente.

