# Sprint 2R — Identidad, autorización y scope

## Estado comparado

| Control | Baseline `ec40482c` | RC `b3cbc6a7` | Decisión |
| --- | --- | --- | --- |
| credenciales individuales | scrypt + DB | scrypt + DB | conservar baseline |
| sesiones | access/refresh persistidos y revocables | equivalente con TTL configurables | ADAPTAR TTL y validaciones de producción |
| roles/permisos | 6 roles globales, permisos granulares y 5 roles EGI | roles globales reducidos; sin modelo EGI final | conservar baseline |
| institución | representada y aplicada en varios servicios | `InstitutionScopeGuard` central + lookup de recursos | REIMPLEMENTAR guard combinado institución/EGI |
| EGI | espacios, membresías, selección, resumen y scope backend | eliminado de la RC final | no portar regresión |
| legacy tokens | opcionales; el baseline no fuerza `false` en production | prohibidos en production | ADAPTAR usando `SIGI_ALLOW_LEGACY_ADMIN_TOKENS` |
| CORS | allowlist localhost hardcoded | allowlist validada por entorno, sin wildcard | ADAPTAR |
| proxy | cliente/IP sin lista explícita de proxies confiables | CIDR obligatorio en production; rechaza trust-all | ADAPTAR |
| passwords de infraestructura | rechaza varios placeholders | además valida password DB y servicios Python | ADAPTAR |
| auditoría pública | `GET /api/audit` responde anónimo | controller público removido; `/api/admin/audit` protegido | ADAPTAR sin perder bitácora admin |

VERIFIED IN CODE: `auth.crypto.ts`, `auth.service.ts`, `roles.guard.ts`,
`admin.service.ts:2279-2468` del baseline y el diff de `97917804`,
`81df11b0`, `4674573b`. VERIFIED BY EXECUTION: Sprint 1R login PASS; el smoke
de roles previo fue 32/33 y las pruebas de separación de fuentes/archivos
pasaron. La consulta anónima a `/api/audit` devolvió 200 y debe cerrarse.

## Por qué no se puede copiar `InstitutionScopeGuard`

El guard RC considera globales a `superadmin`, `national_admin` y
`technical_integration`. También resuelve recursos sólo por `institution_id`.
El baseline permite membresías EGI independientes de la institución y exige
filtrar `egi_id` en fuentes, proyectos, archivos, publicaciones, exports y
reportes. Copiarlo produciría al menos estos problemas:

- elevaría `technical_integration` a scope global;
- validaría institución sin validar membresía EGI;
- no reconoce archivos, reportes, capas y otras entidades añadidas;
- competiría con `resolveOperationalEgi` y podría crear decisiones distintas
  entre guard y service.

La intención sí es válida: centralizar la resolución de recursos y probar
acceso cruzado. Sprint 5R deberá implementar un `OperationalScopeService`
único que devuelva institución + EGI + capacidad global, y que sea consumido
por guards y servicios.

## Controles portables

| Prioridad | Control | Forma de integración |
| --- | --- | --- |
| P0 | retirar ruta pública de auditoría | mantener sólo controller admin protegido y pruebas anónimas 401/404 |
| P0 | deshabilitar tokens legacy en production | validación fail-closed en `env.ts` y Compose |
| P0 | CORS por variable validada | preservar headers EGI/export expuestos por el baseline |
| P0 | trusted proxy explícito | usar CIDR RC; no confiar `X-Forwarded-For` fuera del edge |
| P0 | pruebas negativas de scope | ampliar `auth-scope-smoke` a institución + EGI + archivos/reportes/GIS |
| P1 | TTL access/refresh configurables | conservar defaults actuales y exigir refresh > access |
| P1 | rechazo de passwords débiles | aplicar en Node, Python, PostgreSQL y GeoServer |
| P1 | lookup central de recursos | incluir todas las entidades del baseline |

## Criterios de no regresión

- Los 11 roles inventariados en Sprint 1R no pueden desaparecer por adoptar la RC.
- El backend, no sólo el menú, debe negar institución o EGI ajenos.
- La vista global debe depender de permiso explícito; un rol técnico no debe
  obtenerla implícitamente.
- Login, refresh, logout, revocación, rotación y auditoría deben conservarse.
- La suite R1 10/10 y las pruebas de separación EGI deben ejecutarse después de
  cada integración de identidad.
