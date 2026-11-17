# SF-2 — Evidencia del shell público y sesión opcional

## Resultado

SF-2 quedó completo en `feature/ux-ui-v2`. El anfitrión Admin ahora distingue una superficie pública mínima de un workspace autenticado sin duplicar la aplicación ni debilitar los gates existentes.

La única ruta pública añadida en esta ola es `/administration`. Dashboard, Territorio y las demás vistas Country permanecen en 5373 hasta sus olas correspondientes.

## Trazabilidad

| Campo | Evidencia |
| --- | --- |
| Implementación | `72e6f54a` — `feat(frontend): add public shell to unified host` |
| Pruebas | `fbdbdd3a` — `test(auth): protect optional-session route transitions` |
| Rama | `feature/ux-ui-v2` |
| Shell público | `apps/frontend-admin/src/app/PublicShell.tsx` |
| Workspace | `apps/frontend-admin/src/app/WorkspaceShell.tsx` y `WorkspaceApp.tsx` |
| Acceso | `apps/frontend-admin/src/pages/AdministrationPage.tsx` |
| Orquestación de sesión | `apps/frontend-admin/src/App.tsx` |
| Docker | proyecto `sigi-ux-v2`, candidato `http://127.0.0.1:5374` |
| Rollback | revertir `72e6f54a`; Country continúa operativo en 5373 |

## Tickets cerrados

| Ticket | Resultado |
| --- | --- |
| UFE-006 | `PublicShell` y `WorkspaceShell` separados dentro del anfitrión único |
| UFE-007 | Sesión opcional: `/administration` no requiere token; `/admin*` sí |
| UFE-008 | `/administration` explica el acceso unificado e incorpora login seguro |
| UFE-009 | `/` anónimo lleva a acceso; login recupera deep link; logout vuelve a `/administration` |
| UFE-010 | `WorkspaceApp` y todas las páginas administrativas se cargan de forma diferida |

## Contrato de navegación

| Estado | Ruta solicitada | Resultado |
| --- | --- | --- |
| Anónimo | `/administration` | Shell público sin llamadas privadas |
| Anónimo | `/` | Redirección a `/administration` |
| Anónimo | `/admin/projects` | `/administration?returnTo=%2Fadmin%2Fprojects` |
| Login válido | URL con `returnTo` | Retorno a la ruta Admin solicitada |
| Login válido | acceso normal | `/admin` |
| Sesión activa | recarga de `/admin/*` | Hidrata sesión antes del primer render y conserva la ruta |
| Logout o expiración | ruta Admin | Limpieza de sesión y retorno público |

El parámetro `returnTo` solo acepta `/admin` o rutas bajo `/admin/`; no acepta hosts externos ni rutas públicas arbitrarias.

## Frontera de carga y datos

- `PublicShell` y `AdministrationPage` forman parte del bundle inicial.
- El build produce `WorkspaceApp-*.js` como chunk independiente.
- La prueba anónima verifica que ese chunk no se solicita antes de iniciar sesión.
- La prueba también verifica que `/administration` no llama `/api/admin/*`, `/api/auth/me` ni endpoints EGI.
- Las páginas de módulos continúan en chunks lazy independientes.
- No se incorporaron secretos ni variables nuevas al frontend.

## Validación ejecutada

| Validación | Resultado |
| --- | --- |
| `npm run typecheck:admin` | aprobado |
| `npm run build:admin` | aprobado, 82 módulos y chunk `WorkspaceApp` separado |
| `npm run test:e2e` contra Admin 5374 y Country 5373 | 24/24 aprobadas |
| `npm run smoke:roles` contra API 3200 | 36/36 aprobadas |
| Docker health | `sigi-ux-v2-frontend-admin-1` saludable |

La primera regresión integral detectó que una recarga Admin evaluaba el redirect antes de hidratar `sessionStorage`. Se cambió la hidratación a síncrona en el inicializador de estado y la repetición completa quedó verde; el hallazgo queda cubierto por los recorridos de deep link y navegación posterior al login.

## Gate de salida SF-2

- [x] Anónimo abre `/administration` sin token.
- [x] Rutas Admin siguen solicitando login.
- [x] Logout limpia la sesión y vuelve a la superficie pública.
- [x] Deep links autorizados se recuperan después del login.
- [x] Recargar una ruta Admin conserva la sesión y la URL.
- [x] El chunk público inicial no descarga pantallas administrativas.
- [x] Country continúa disponible para referencia y rollback.
- [x] Build, E2E, roles y Docker están verdes.

## Próximo gate

SF-3 puede migrar Dashboard y Territorio al `PublicShell`. Debe conservar 5373 como comparación funcional/visual y no llamar endpoints `/admin/*` de forma anónima.
