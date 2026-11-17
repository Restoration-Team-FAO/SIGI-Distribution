# SIGI V1 Rebaseline

Este directorio reinicia la auditoría de SIGI V1 tomando como referencia de
aceptación el producto revisado por el usuario en Docker bajo el proyecto
`sigi-demo-local`. A pesar de su nombre, no se considera un prototipo ni un demo
desechable: es la versión que fue evaluada como casi lista para producción.

## Fuentes de verdad

- Baseline funcional y de aceptación: contenedores e imágenes de
  `sigi-demo-local`, reproducidos desde `demo-deploy-tested` en
  `ec40482c34a536db1dc9b53c980f9c848baf6fb5`.
- Fuente de controles técnicos: `release/sigi-v1-rc` en
  `b3cbc6a76b755c048c00bca92f7afd76225cbfd0`.
- Ancestro común: `a0dbadcddefd98ea547e6298a1b6bea31ca0a689`.
- Evidencia Docker preservada fuera de Git:
  `C:\GIT\SIGI\_audit_evidence\sigi-demo-local-2026-09-17`.

La RC no es una evolución lineal del baseline aceptado. Las dos ramas divergieron
y cualquier integración debe conservar explícitamente esa funcionalidad mientras adapta
los controles de seguridad, datos, operación y QA de la RC.

## Regla de no regresión

Una candidata solo puede avanzar si:

1. conserva las pantallas, rutas y capacidades aceptadas del baseline;
2. no sustituye implementaciones funcionales por mocks;
3. supera los controles técnicos aplicables de la RC;
4. puede reconstruirse desde un checkout limpio;
5. pasa validación funcional y visual contra `sigi-demo-local`.

## Documentos

- [Baseline revisado](00-reviewed-baseline.md)
- [Divergencia demo vs RC](01-demo-vs-release-gap.md)
- [Plan de auditoría y validación](02-audit-and-validation-plan.md)
- [Resultado del Sprint 0R](sprints/SPRINT-00R-RESULTS.md)

### Sprint 1R — Inventario funcional

- [Rutas frontend](10-frontend-route-inventory.md)
- [Funciones por pantalla](11-screen-functional-inventory.md)
- [Trazabilidad end-to-end](12-end-to-end-traceability.md)
- [Identidad, roles y EGI](13-auth-role-egi-inventory.md)
- [Flujos dorados](14-golden-flows.md)
- [Real vs mock](15-real-vs-mock.md)
- [Registro de aceptación](16-functional-acceptance-register.md)

### Sprint 2R — Auditoría técnica y portabilidad

- [Esquema y migraciones](20-schema-migration-portability.md)
- [Identidad, autorización y scope](21-auth-authorization-scope-portability.md)
- [Infraestructura y operación](22-infrastructure-operations-portability.md)
- [GIS, uploads y conectores](23-gis-uploads-connectors-portability.md)
- [CI, QA, backup y observabilidad](24-ci-qa-backup-observability-portability.md)
- [Matriz de commits RC](25-rc-commit-portability-matrix.md)
- [Resultado Sprint 2R](26-sprint-2r-results.md)

### Sprint 3R — Fundación de integración

- [Resultado Sprint 3R](30-sprint-3r-foundation.md)

### Sprint 4R — Infraestructura y operación

- [Resultado Sprint 4R](40-sprint-4r-infrastructure-operations.md)
- [Runbook productivo](../operations/release-runbook.md)

### Sprint 5R — Identidad y aislamiento

- [Resultado Sprint 5R](50-sprint-5r-identity-isolation.md)

### Sprint 6R — Hardening de dominios

- [Resultado Sprint 6R](60-sprint-6r-domain-hardening.md)
