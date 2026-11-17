# UX/UI V2 — Índice de documentación

## Estado actual

| Documento | Propósito |
| --- | --- |
| [01-ux-ui-current-state.md](01-ux-ui-current-state.md) | Auditoría UX/UI del baseline |
| [02-user-journeys.md](02-user-journeys.md) | Recorridos de usuarios principales |
| [03-information-architecture.md](03-information-architecture.md) | Dominios, navegación y mapeo de URLs |
| [04-design-system.md](04-design-system.md) | Tokens, componentes y patrones visuales |
| [05-reference-screens.md](05-reference-screens.md) | Pantallas de referencia iniciales |
| [06-ux-migration-plan.md](06-ux-migration-plan.md) | Olas de modernización UX |
| [10-module-operation-vs-configuration.md](10-module-operation-vs-configuration.md) | Separación entre operación y configuración |
| [11-current-screen-prototypes.md](11-current-screen-prototypes.md) | Prototipos técnicos as-built y función de cada pantalla |

## Arquitectura objetivo aprobada para preparación

| Documento | Propósito |
| --- | --- |
| [12-single-frontend-architecture-decision.md](12-single-frontend-architecture-decision.md) | Decisión de frontend único y sus invariantes |
| [13-permission-driven-screen-matrix.md](13-permission-driven-screen-matrix.md) | Visibilidad y capacidades por perfil |
| [14-single-frontend-migration-plan.md](14-single-frontend-migration-plan.md) | Implementación progresiva, gates y rollback |
| [15-single-frontend-execution-routemap.md](15-single-frontend-execution-routemap.md) | Backlog ejecutable, dependencias, rutas, commits y gates |

## Evidencia de ejecución

| Documento | Resultado |
| --- | --- |
| [16-sf1-route-catalog-validation.md](16-sf1-route-catalog-validation.md) | SF-1 · catálogo único de rutas y capacidades |
| [17-sf2-public-shell-validation.md](17-sf2-public-shell-validation.md) | SF-2 · shell público, sesión opcional y deep links |
| [18-public-private-api-boundary.md](18-public-private-api-boundary.md) | SF-4 · frontera entre API pública y workspace |
| [19-unified-frontend-cutover-runbook.md](19-unified-frontend-cutover-runbook.md) | SF-10 · operación, cutover y rollback preparado |
| [20-sf3-sf10-final-candidate.md](20-sf3-sf10-final-candidate.md) | SF-3 a SF-10 · evidencia de la candidata final |

## Orden recomendado de lectura

1. `11-current-screen-prototypes.md`: qué existe hoy.
2. `12-single-frontend-architecture-decision.md`: qué se decidió y por qué.
3. `13-permission-driven-screen-matrix.md`: quién verá y hará cada cosa.
4. `14-single-frontend-migration-plan.md`: cómo se realizará sin regresión.
5. `15-single-frontend-execution-routemap.md`: en qué orden ejecutar tickets y validar cada ola.

La implementación SF-1 a SF-10 está disponible para revisión final. La documentación no autoriza por sí sola el cutover SF-11, el retiro de `frontend-country` en SF-12 ni el merge al baseline estable.
