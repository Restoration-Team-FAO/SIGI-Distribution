# Sprint 3R — Fundación de integración

Fecha de cierre: 2026-09-17

Rama: `integration/sigi-v1-reconciled`

Baseline funcional preservado: `ec40482c34a536db1dc9b53c980f9c848baf6fb5`

## Resultado

Sprint completado. La rama de integración conserva el producto aceptado en
`sigi-demo-local` e incorpora únicamente controles fundacionales que no cambian
su comportamiento funcional.

## Cambios incorporados

- higiene de repositorio adaptada desde la RC, sin versionar secretos,
  artefactos de build, resultados de pruebas ni datos locales;
- excepción explícita para mantener versionable `.env.production.example`;
- build Docker reproducible de los tres componentes Node mediante `npm ci`;
- gate `verify:foundation` para comprobar artefactos, lockfiles, Dockerfiles,
  dependencias Python fijadas y seguridad del manifest de migraciones;
- workflow GitHub Actions ubicado en `.github/workflows`, con gates de build,
  tipos, unitarias, Docker y migraciones;
- runner incremental y multiplataforma `npm run db:migrate`, ejecutado a través
  de Docker Compose y protegido contra arranque incompleto de PostgreSQL;
- ledger `public.sigi_schema_migrations` con checksum para detectar cambios en
  migraciones ya aplicadas;
- migración idempotente del índice GiST canónico
  `gis.territory_features_geometry_gix`.

## Estrategia de migración

Los SQL de `infra/postgres/init` siguen siendo el bootstrap del baseline
aceptado. No se volvieron a ejecutar como migraciones incrementales porque
mezclan creación de esquema y carga inicial/demo. Las migraciones posteriores
al baseline se enumeran, en orden, en
`infra/postgres/migrations/manifest.txt`; seeds y demos quedan excluidos.

El runner exige que existan `core.projects` y `gis.territory_features`, espera
el servidor PostgreSQL definitivo, aplica cada archivo dentro de una
transacción y rechaza un checksum distinto para una migración registrada.

## Evidencia ejecutada

| Control | Resultado |
|---|---|
| `npm run verify:foundation` | PASS, 0 hallazgos |
| `npm run verify:env:prod` | PASS |
| `npm run verify:compose` | PASS |
| migración sobre PostgreSQL aislado | PASS, primera ejecución aplica 1 |
| segunda ejecución de migración | PASS, aplica 0 y omite 1 |
| ledger / índice GiST | PASS, `1 / 1` |
| typecheck country/admin/API | PASS |
| build country/admin/API | PASS |
| unitarias | PASS, 81/81 |
| build Docker API desde lockfile | PASS |
| Playwright de protección del baseline | PASS, 10/10 |

La validación Playwright se ejecutó contra `sigi-r1-validation` en los puertos
aceptados `3000/5173/5174/8081`. No se modificaron pantallas, rutas, contratos
de API ni datos funcionales.

## Decisión

Sprint 3R: **DONE**. Puede iniciar Sprint 4R sobre esta rama. La siguiente
integración debe concentrarse en topología productiva, TLS, exposición mínima,
roles de infraestructura, backup/restore, health/readiness y límites de logs,
manteniendo como gate los 10 recorridos funcionales del baseline.
