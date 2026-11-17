# SF-1 — Evidencia del catálogo único de rutas y capacidades

## Resultado

SF-1 quedó completo en `feature/ux-ui-v2`. La consola Admin conserva sus rutas y gates, pero sidebar, búsqueda, metadata, breadcrumbs y router ahora parten de un único catálogo tipado.

No se añadieron rutas públicas ni se modificó o retiró `frontend-country`.

## Trazabilidad

| Campo | Evidencia |
| --- | --- |
| Implementación | `2a2757d2` — `refactor(frontend): introduce capability route catalog` |
| Pruebas | `d4488f41` — `test(frontend): cover permission-driven route navigation` |
| Rama | `feature/ux-ui-v2` |
| Catálogo | `apps/frontend-admin/src/app/route-catalog.ts` |
| Router | `apps/frontend-admin/src/app/AppRouter.tsx` |
| 404 | `apps/frontend-admin/src/pages/NotFoundPage.tsx` |
| Docker | proyecto `sigi-ux-v2`, Admin `http://127.0.0.1:5374` |
| Rollback | volver al padre de `2a2757d2`; Country continúa disponible en 5373 |

## Tickets cerrados

| Ticket | Resultado |
| --- | --- |
| UFE-001 | Catálogo con path, audiencia, dominio, permisos, roles, requisito EGI y marca de configuración |
| UFE-002 | Sidebar, búsqueda, títulos, subtítulos y breadcrumb derivados del catálogo |
| UFE-003 | `AppRouter` genera las rutas registradas y muestra 404 para rutas desconocidas |
| UFE-004 | Se eliminó “Resumen regional”; `/admin/modules` se presenta como “Estado de módulos” |
| UFE-005 | Se añadió cobertura E2E de navegación, alias, metadata, 404 y denegación por perfil |

## Rutas y permisos

- Se conservaron `/`, `/admin`, aliases de ayuda y todas las rutas Admin registradas antes de SF-1.
- Los gates siguen evaluando permisos con semántica `all` o `any`, roles administrativos equivalentes y contexto EGI.
- Las pantallas de configuración continúan fuera del menú operativo y permanecen protegidas al abrir un deep link.
- `/admin/reports/*` se conserva como fallback interno del módulo para no romper deep links existentes.
- Cualquier ruta que no pertenezca a una capacidad registrada muestra `Página no encontrada` y `Error 404`.

## Validación ejecutada

| Validación | Resultado |
| --- | --- |
| `npm run typecheck:admin` | aprobado |
| `npm run build:admin` | aprobado, 78 módulos transformados |
| `npm run test:e2e` contra Admin 5374 y Country 5373 | 22/22 aprobadas |
| `npm run smoke:roles` contra API 3200 | 36/36 aprobadas |
| Docker health | `sigi-ux-v2-frontend-admin-1` saludable en 5374 |

La primera ejecución E2E encontró que la base de validación no contenía `Región Central`; se restauró exclusivamente el fixture territorial ya definido por el repositorio. La repetición expuso dos paneles de filtro válidos en Country, por lo que el selector E2E se hizo explícito con `.first()`. No se cambió comportamiento funcional de Country.

## Gate de salida SF-1

- [x] Las rutas Admin actuales abren desde el catálogo.
- [x] `/admin/modules` se denomina “Estado de módulos”.
- [x] No existe el acceso “Resumen regional”.
- [x] Una ruta desconocida muestra 404.
- [x] Sidebar, búsqueda, metadata y breadcrumbs comparten fuente.
- [x] Perfil operativo no ve configuración y el deep link queda denegado.
- [x] Build, E2E y smoke de roles verdes.
- [x] Imagen Docker Admin candidata actualizada.

## Próximo gate

SF-2 puede iniciar con `PublicShell` y sesión opcional. Country debe permanecer operativo como referencia y rollback hasta SF-11/SF-12.
