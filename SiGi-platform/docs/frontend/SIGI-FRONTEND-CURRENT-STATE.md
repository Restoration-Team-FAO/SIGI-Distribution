# SIGI Frontend — Current State

> Este documento conserva el diagnóstico previo al cutover. El estado vigente es un único frontend autenticado bajo `apps/frontend-sigi`; ver [22-frontend-package-rename-result.md](22-frontend-package-rename-result.md).

Diagnóstico ejecutivo realizado sobre `feature/ux-ui-v2` el 2026-09-21.

El análisis completo y verificable está dividido en los documentos `01` a `08` de este directorio. La conclusión central es:

> `frontend-admin` ya puede evolucionar de forma segura hacia la única aplicación autenticada SIGI. `frontend-country` debe mantenerse temporalmente como referencia/rollback del portal público, no como experiencia alternativa para usuarios autenticados.

Hallazgos determinantes:

- autenticación, EGI, roles, permisos, rutas operativas y administración ya viven en `frontend-admin`;
- el menú y los guards se derivan de `route-catalog.ts`, aunque todavía usan nombres y agrupaciones heredadas de “Admin”;
- el backend es la autoridad final mediante `BearerAuthGuard`, `@Roles` y `@Permissions`;
- las vistas públicas migradas consumen `publicApi`, pero conservan copias físicas de componentes de Country;
- existen gaps reales para búsqueda global, “Mi trabajo”, Ask SIGI, navegación entidad-a-entidad e indicadores autenticados;
- no se deben simular esos gaps con fixtures.

Documentos:

1. [01-current-state.md](01-current-state.md)
2. [02-single-frontend-architecture.md](02-single-frontend-architecture.md)
3. [03-navigation-information-architecture.md](03-navigation-information-architecture.md)
4. [04-permission-driven-ui.md](04-permission-driven-ui.md)
5. [05-route-migration-map.md](05-route-migration-map.md)
6. [06-component-reuse-plan.md](06-component-reuse-plan.md)
7. [07-mock-vs-real-gap.md](07-mock-vs-real-gap.md)
8. [08-implementation-roadmap.md](08-implementation-roadmap.md)
9. [09-phase-1-foundation-result.md](09-phase-1-foundation-result.md)
10. [10-phase-2-home-360-result.md](10-phase-2-home-360-result.md)

Este diagnóstico no autoriza retirar `frontend-country`, cambiar contratos API ni modificar el baseline estable.
