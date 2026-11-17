# Inventario de autenticación, roles, permisos y EGI

Baseline auditado: `ec40482c34a536db1dc9b53c980f9c848baf6fb5`.
Este documento registra el comportamiento actual; no propone un modelo objetivo.

## Identidad y sesión

| Elemento | Comportamiento observado | Evidencia |
| --- | --- | --- |
| Usuarios | Entidades persistidas, vinculables a institución, estado y uno o más roles globales. | VERIFIED IN CODE — `infra/postgres/init/002_core_schema.sql:186`; `apps/sigi-api/src/modules/admin/admin.controller.ts:927-1024` |
| Credenciales | Contraseñas derivadas con `scrypt`; la comparación usa tiempo constante. | VERIFIED IN CODE — `apps/sigi-api/src/modules/auth/auth.crypto.ts:1-52` |
| Sesiones | Access y refresh tokens se representan mediante registros revocables y expirables en `core.user_sessions`. | VERIFIED IN CODE — `infra/postgres/init/009_auth_identity.sql:9-29`; `apps/sigi-api/src/modules/auth/auth.service.ts:352-431` |
| Cliente admin | La sesión se guarda en `sessionStorage`; no es una identidad simulada en `localStorage`. | VERIFIED IN CODE — `apps/frontend-admin/src/services/api.ts:136-215` |
| Login/logout/refresh/me | Los cuatro recorridos están conectados a API y base de datos. | VERIFIED BY EXECUTION — login de la suite R1 PASS; VERIFIED IN CODE — `apps/sigi-api/src/modules/auth/auth.service.ts` |
| Datos iniciales | El bootstrap instala usuarios y hashes demo reproducibles. | VERIFIED IN CODE — `infra/postgres/init/009_auth_identity.sql:39-45`; `infra/postgres/init/900_phase5_demo_seed.sql` |

## Capas de autorización

1. `BearerAuthGuard` identifica una sesión o token aceptado.
2. `RolesGuard` evalúa `@Roles` y `@Permissions` en backend.
3. Los controllers declaran permisos por acción, no sólo por pantalla.
4. `PermissionRouteGate` oculta o bloquea módulos en el cliente admin.
5. `resolveOperationalEgi` resuelve el EGI solicitado contra los espacios accesibles y sólo admite vista global para actores con privilegio global.

VERIFIED IN CODE: `apps/sigi-api/src/modules/auth/roles.guard.ts:18-86`,
`apps/sigi-api/src/modules/admin/admin.controller.ts:162-1222`,
`apps/sigi-api/src/modules/admin/admin.service.ts:2279-2468` y
`apps/frontend-admin/src/App.tsx`. El scope no es solamente visual: fuentes,
proyectos, archivos, publicaciones y reportes incorporan EGI en consultas o
validaciones de servicio. VERIFIED BY EXECUTION: las pruebas UAT de separación
de fuentes y archivos pasaron; el recorrido multi-EGI global obtuvo 20/22.

## Roles globales y acciones efectivas

Leyenda: `S` concedido, `—` no concedido como permiso base, `según permiso`
indica que la acción se resuelve por el grant concreto del módulo.

| Rol | Módulo | Leer | Crear | Editar | Eliminar | Publicar | Scope |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `superadmin` | todos | S | S | S | S | S | global; incluye reset y configuración de reportes |
| `national_admin` | instituciones, usuarios, roles, proyectos, integraciones, archivos, reportes | S | S | S | S | S | global operativo; sin reset y con límites en configuración/borrado de reportes |
| `institution_editor` | fuentes, conectores, proyectos, imports, archivos, reportes | S | S | S | según permiso | — | institución y EGI accesible |
| `technical_integration` | fuentes, conectores, proyectos, imports, GIS; reportes | S | S | S | según permiso | — | institución y EGI accesible |
| `technical_validator` | validaciones, archivos y reportes | S | — | revisión/asignación | — | — | institución y EGI accesible |
| `read_consumer` | proyectos, publicaciones, incidentes, reportes y archivos | S | — | — | — | — | lectura de EGI accesible |

VERIFIED IN CODE: grants base en `infra/postgres/init/002_core_schema.sql:70-315`,
permisos de reportes en `infra/postgres/init/013_reports_module.sql:499-514`,
archivos en `infra/postgres/init/004_documents_schema.sql:229-257` y uso por
acción en los controllers. VERIFIED BY EXECUTION: smoke de roles 32/33; la
única respuesta 500 fue catálogo geoespacial, no una denegación de rol.

## Membresías EGI

| Rol de membresía | Leer/seleccionar | Actualizar EGI | Gestionar miembros | Resumen | Scope |
| --- | ---: | ---: | ---: | ---: | --- |
| `egi_owner` | S | S | S | S | EGI de la membresía |
| `egi_admin` | S | S | S | S | EGI de la membresía |
| `egi_editor` | S | — | — | S | EGI de la membresía |
| `egi_validator` | S | — | — | S | EGI de la membresía |
| `egi_viewer` | S | — | — | S | EGI de la membresía |

Las membresías viven en `core.egi_memberships`, incluyen estado y permisos JSON,
y se combinan con el rol global del usuario. VERIFIED IN CODE:
`infra/postgres/init/006_egi_workspace.sql:1-136` y
`apps/sigi-api/src/modules/admin/admin.service.ts:2408-2468`.

## Límites verificados

- Institución y EGI son dimensiones distintas: un usuario puede pertenecer a
  una institución y tener membresías explícitas en uno o más EGI. VERIFIED IN CODE.
- La selección del EGI activo se conserva en `localStorage` y la vista global en
  `sessionStorage`; son preferencias de alcance, no sustitutos del control del
  backend. VERIFIED IN CODE — `apps/frontend-admin/src/contexts/EgiContext.tsx:66-153`.
- El entorno ejecutado contenía 11 roles globales/EGI y datos adicionales creados
  por UAT; esas cantidades no representan un bootstrap limpio. VERIFIED BY EXECUTION.
- No se verificó con identidades reales de producción ni con un proveedor SSO.
  NOT VERIFIED.
