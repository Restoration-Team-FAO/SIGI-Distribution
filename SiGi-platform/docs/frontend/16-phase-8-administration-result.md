# 16 — Resultado de Fase 8: Administración

Fecha: 2026-09-22  
Rama: `feature/ux-ui-v2`

## Resultado

La administración institucional y técnica se integró como una sola capacidad del AppShell autenticado. El sidebar dejó de presentar EGI, Instituciones, Usuarios, Bitácora y API como módulos globales separados; ahora expone una única entrada `Administración` cuando la sesión tiene al menos una capacidad aplicable.

La nueva puerta de entrada `/admin/administration` calcula las funciones visibles desde los roles y permisos efectivos de la sesión. No presenta tarjetas ficticias ni ofrece enlaces que el usuario no puede abrir.

## Organización funcional

| Grupo | Sección | URL | Capacidad principal |
| --- | --- | --- | --- |
| Institucional | Espacios de gestión | `/admin/egi` | selección para usuarios asignados; edición con `egi.update`; creación por rol backend autorizado |
| Institucional | Instituciones | `/admin/institutions` | `institutions.read` y permisos CRUD específicos |
| Institucional | Usuarios | `/admin/users` | `users.read` y permisos CRUD específicos |
| Institucional | Roles y permisos | `/admin/users?view=roles` | `roles.*` y `permissions.read` |
| Técnica | Conectores | `/admin/connectors` | `connectors.read`, `connectors.update` o `connectors.run` |
| Técnica | Publicaciones | `/admin/publications` | `publications.read`; publicación gobernada por `publications.publish` |
| Técnica | Auditoría | `/admin/audit` | `audit.read` |
| Técnica | API y operación | `/admin/api` | `audit.read`; acciones sensibles conservan su permiso o rol específico |

Las rutas anteriores se conservaron. En consecuencia, marcadores, enlaces contextuales y llamadas existentes siguen funcionando, pero todas las pantallas comparten el encabezado y las tabs de Administración.

## Visibilidad por capacidades

- La entrada global usa coincidencia `any`: aparece si existe al menos una capacidad administrativa relevante o un rol administrativo equivalente.
- Cada tab evalúa sus propios permisos; no hereda visibilidad por el solo hecho de poder abrir el resumen.
- El perfil superadmin revisado ve gobierno institucional y operación técnica.
- El perfil lector real solo ve Espacios y Publicaciones; no ve Instituciones ni Usuarios y recibe `Sin permiso` si intenta abrir `/admin/institutions` directamente.
- La selección de EGI permanece disponible para los usuarios asignados porque determina el scope operativo; crear o editar el EGI no se muestra sin autorización.
- `ModuleWorkspaceHeader` admite ahora coincidencia `all`/`any` y roles por tab, reutilizable por el resto de módulos.

## Deep links y navegación

La vista de Usuarios conserva ahora la sección seleccionada en la URL:

- usuarios: `/admin/users`;
- roles y permisos: `/admin/users?view=roles`;
- lectura de gobernanza: `/admin/users?view=governance`;
- alta dedicada: `/admin/users/new`.

El estado `view` se restaura tras recargar. El item único de Administración permanece activo en sus rutas hijas y las migas de pan continúan derivándose del catálogo de rutas.

## Seguridad backend

La reorganización es exclusivamente de experiencia y navegación. El backend continúa siendo la autoridad y conserva guards independientes para:

- `institutions.*`;
- `users.*`;
- `roles.*` y `permissions.read`;
- `connectors.*`;
- `publications.*`;
- `audit.read`;
- `system.reset_database` y operaciones sensibles de API.

Se añadió un contrato estático que verifica estos decoradores junto con las fronteras del frontend. No se modificaron contratos, base de datos ni políticas de scope EGI.

## Límites honestos

- Publicaciones presenta el inventario y estados reales disponibles; no se añadió un editor de canales porque no existe un contrato frontend/backend completo para ese CRUD.
- API conserva la consola operativa existente. No se expusieron nuevas operaciones destructivas; el reset continúa limitado a superadmin o `system.reset_database`.
- Conectores sigue siendo una pantalla amplia por la cantidad de flujos técnicos heredados. Quedó correctamente ubicada fuera de Datos operativos, pero su extracción interna puede realizarse después sin cambiar las rutas.
- “Espacios” es simultáneamente selector de contexto y función de gobierno. Por eso permanece accesible desde el topbar para usuarios operativos, mientras sus acciones de mutación se filtran por autorización.

## Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `npm run build:admin` | PASS, 118 módulos |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 103 Node + 6 Python |
| `tests/unit/administration-workspace-contract.test.mjs` | PASS, 4/4 |
| Playwright proyecto `admin-chromium` | PASS, 29/29 |
| Docker `sigi-ux-v2` | frontend, API, PostgreSQL y GeoServer saludables |

Docker de revisión:

- aplicación unificada: `http://127.0.0.1:5374`;
- referencia Country: `http://127.0.0.1:5373`;
- API: `http://127.0.0.1:3200/api`;
- GeoServer: `http://127.0.0.1:8281`;
- imagen frontend: `sha256:2b29da543d28738182a8e33583d4b08204f57fe99368d96d548fb38c410488bd`.

El baseline estable permanece sin cambios en `5d18aace`.

## Estado del roadmap

Con esta fase quedan completadas las fases 1 a 8 del roadmap de frontend único. Los trabajos posteriores son capacidades nuevas o el retiro controlado de duplicación: filtros globales, búsqueda global, Ask SIGI, paridad/cutover de Country y renombre del paquete.
