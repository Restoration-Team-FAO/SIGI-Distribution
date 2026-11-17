# SIGI Release Gate

## Objetivo

Ejecutar una verificación integral y reproducible del stack SIGI con Docker, autenticación real y smoke tests por rol, aislamiento EGI, CRUD, auditoría, interoperabilidad y flujo operativo.

## Qué valida

- login real por `auth/login`;
- permisos por rol y endpoints administrativos;
- aislamiento por `egi_id` en módulos críticos;
- aislamiento por `scope` en `exports`, `publications` e `incidents`;
- operaciones CRUD y mutaciones clave;
- auditoría y `requestId`;
- observabilidad y endpoint interno de métricas;
- UAT multi-EGI / multi-institución;
- flujo operativo de datasets, validaciones, proyectos e indicadores.

## Scripts involucrados

- `npm run ci:prepare:prod-env`
- `npm run verify:env:prod`
- `npm run release:gate`
- `npm run smoke:exports`
- `npm run smoke:publications`
- `npm run smoke:incidents`
- `npm run smoke:metrics`
- `npm run smoke:uat`

## Ejecución local

```bash
npm ci
node scripts/write-ci-env.mjs --file=.env.production.ci
Copy-Item .env.production.ci .env.production
npm run verify:env:prod
docker compose -f docker-compose.prod.yml up -d --build
npm run release:gate
docker compose -f docker-compose.prod.yml down -v
```

## Ejecución en CI

Workflow: `.github/workflows/release-gate.yml`

Comportamiento:

- genera `.env.production` efímero con valores no-demo;
- levanta `docker-compose.prod.yml`;
- espera `GET /api/health`;
- ejecuta `release:gate`;
- captura un snapshot Prometheus de `GET /api/metrics`;
- publica artefactos con resultado JSON y logs del stack.

## Artefactos esperados

- `release-gate.json`
- `sigi-api.metrics.prom`
- `docker-compose.release-gate.log`

## Notas operativas

- El workflow usa cooldowns de ~61s entre gates sensibles para convivir con el rate limit y evitar falsos negativos por ráfaga.
- `scripts/write-ci-env.mjs` no sobrescribe archivos existentes salvo que se pase `--force=true`.
- Las contraseñas base de smoke siguen siendo las del seed autenticable actual:
  - `superadmin@sigi.local` / `superadmin-dev-token`
  - `national-admin@sigi.local` / `national-admin-dev-token`
  - `editor@sigi.local` / `editor-dev-token`
  - `validator@sigi.local` / `validator-dev-token`
  - `reader@sigi.local` / `reader-dev-token`
  - `integration@sigi.local` / `integration-dev-token`
- Esas contraseñas viven hasheadas en la base seed; no dependen de tokens legacy.
