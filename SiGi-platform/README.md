# SIGI Platform

Monorepo modular para SIGI con:

- `apps/frontend-sigi`
- `apps/sigi-api`
- `services/integration-service`
- `services/gis-service`
- `services/bridge`
- `services/connectors/*`
- `libs/contracts`
- `libs/domain`
- `libs/shared`

## Estado del repo

Base real existente:

- backend principal en NestJS
- integracion en FastAPI
- GIS en FastAPI
- PostgreSQL/PostGIS

Bootstrap agregado:

- frontend único React + TypeScript + Vite
- contratos compartidos
- dominio compartido
- OpenAPI inicial
- ADR y documentos de arquitectura

## Inicio rapido

1. Copiar `.env.example` a `.env` y ajustar valores si necesitas puertos, URLs o secretos distintos.
   Para recorridos locales controlados usa `.env.example`; para releases usa `.env.production.example`.
2. Levantar backend actual:

```bash
docker compose up --build
```

3. Acceder a las apps dockerizadas:

- frontend SIGI: `http://localhost:5174`
- API: `http://localhost:3000/api`

4. Si quieres correr el frontend fuera de Docker, instala dependencias y usa Vite local:

```bash
npm install
npm run dev:frontend
```

## Sprint 6: testing, hardening y despliegue

Comandos base para readiness técnica:

```bash
npm run verify:env
npm run verify:compose
npm run build
```

Para validar un archivo `.env.production` real:

```bash
npm run verify:env:prod
```

Cuando el stack ya está levantado y con datos base, ejecuta el gate funcional:

```bash
npm run release:gate
```

Documentación operativa:

- [docs/operations/release-runbook.md](docs/operations/release-runbook.md)
- [docs/deployment/HETZNER-DEMO.md](docs/deployment/HETZNER-DEMO.md)

Para validación local del Compose productivo puede usarse una copia ignorada por
Git. En servidores, el archivo sensible debe mantenerse fuera del repositorio,
como detalla la guía de Hetzner.

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Para instalar una instancia de demostración independiente en un servidor
Linux, consulta [demo/README.md](demo/README.md). El paquete agrega HTTPS,
aislamiento por proyecto, validación, respaldos y restauración.

## Datos base de demostración controlada

Para cargar o refrescar el dataset de demostración sobre un volumen ya existente:

```bash
docker exec -i sigi-platform-postgres-1 psql -U sigi_user -d sigi_db -f /docker-entrypoint-initdb.d/900_phase5_demo_seed.sql
```

Este seed es idempotente y mantiene coherencia entre API, datos y frontend. No debe usarse como evidencia de producción.

## Instancia de demostración vacía

Para levantar una instancia aislada, sin proyectos, datasets, fuentes, capas ni
actividad operativa precargada:

```bash
npm run demo:empty:up
```

La instancia usa volúmenes propios y puertos alternos, por lo que no modifica
la instancia local normal:

- frontend SIGI: `http://localhost:5274`
- API: `http://localhost:3100/api`
- GeoServer: `http://localhost:8181/geoserver`
- PostgreSQL: `localhost:5532`

Acceso administrativo local:

- usuario: `superadmin@sigi.local`
- contraseña: `superadmin-dev-token`

Se conservan únicamente el esquema, los permisos, los catálogos técnicos y la
cuenta administrativa mínima. Para detenerla sin perder lo que se haya creado:

```bash
npm run demo:empty:down
```

Para eliminar también sus volúmenes y volver a iniciar totalmente desde cero:

```bash
npm run demo:empty:destroy
npm run demo:empty:up
```

## Ingesta universal CSV/XLSX (Fase 5 y 6)

Si ya tienes un volumen PostgreSQL creado, aplica primero el esquema de importación:

```bash
docker exec -i sigi-platform-postgres-1 psql -U sigi_user -d sigi_db -f /docker-entrypoint-initdb.d/004_import_pipeline_schema.sql
```

Luego aplica la tabla de administración de fuentes Odoo:

```bash
npm run demo:migrate:odoo
```

Luego puedes cargar plantillas de prueba con trazabilidad de batch (staging -> validación -> promoción):

```bash
npm run import:institutions
npm run import:projects
npm run import:indicators
npm run import:territories
```

O correr todo el flujo de una sola vez:

```bash
npm run import:all
```

El script usa por defecto en entorno local:

- API: `http://localhost:3000/api`
- Token: `superadmin-dev-token`

Puedes sobreescribirlos con variables de entorno:

```bash
SIGI_IMPORT_API_URL=http://localhost:3000/api
SIGI_IMPORT_ADMIN_TOKEN=superadmin-dev-token
```

Las plantillas incluidas están en:

- `templates/institutions_template.csv`
- `templates/projects_template.csv`
- `templates/project_indicators_template.csv`
- `templates/territories_template.csv`

## Conector Odoo

El conector Odoo se dispara por `sync job` y reutiliza el pipeline oficial de importación
(`import_batches` + staging + validación + promoción) para las entidades:

- `institutions`
- `projects`
- `project_indicators`
- `project_territories`

Variables relevantes:

```bash
SIGI_IMPORT_API_URL=http://localhost:3000/api
SIGI_IMPORT_ADMIN_TOKEN=superadmin-dev-token
SIGI_SECRETS_KEY=sigi-dev-secret
ODOO_MOCK_MODE=false
ODOO_URL=
ODOO_DB=
ODOO_USER=
ODOO_PASS=
```

`ODOO_MOCK_MODE=true` debe reservarse para recorridos locales o validaciones controladas. En producción queda bloqueado por validación de entorno.

Ejecución CLI:

```bash
npm run sync:odoo
```

Flujo desde UI admin:

1. Abrir `http://localhost:5174/admin/sources`
2. Ir al panel **Conector Odoo administrable**
3. Crear/editar fuente Odoo (institución, URL, DB, usuario, password, perfil de mapeo)
4. Probar conexión con **Probar conexión**
5. Guardar con **Guardar**
6. Ejecutar sync con **Ejecutar sync**
7. Revisar trazabilidad en **Batches relacionados** y **Errores recientes**

## Documentacion clave

- [docs/architecture/architecture-overview.md](docs/architecture/architecture-overview.md)
- [docs/architecture/html-to-modules-mapping.md](docs/architecture/html-to-modules-mapping.md)
- [docs/architecture/domain-model.md](docs/architecture/domain-model.md)
- [docs/architecture/api-contracts.md](docs/architecture/api-contracts.md)
- [docs/architecture/implementation-plan.md](docs/architecture/implementation-plan.md)
- [docs/openapi/sigi-core.openapi.yaml](docs/openapi/sigi-core.openapi.yaml)
- [docs/openapi/sigi-admin.openapi.yaml](docs/openapi/sigi-admin.openapi.yaml)
- [docs/openapi/sigi-bridge.openapi.yaml](docs/openapi/sigi-bridge.openapi.yaml)
- [docs/adrs/0001-monorepo-modular-architecture.md](docs/adrs/0001-monorepo-modular-architecture.md)

## Nota de arquitectura

`sigi-api` es el boundary HTTP principal del sistema.
Los frontends no deben consumir `integration-service` ni `gis-service` directamente.
