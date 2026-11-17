# 21 — Resultado de Ask SIGI gobernado

Fecha de cierre: 2026-09-23
Rama: `feature/ux-ui-v2`

## Resultado

Ask SIGI queda disponible dentro del frontend autenticado único como una primera capacidad de recuperación de evidencia. No utiliza un modelo generativo externo ni presenta inferencias como hechos: busca entidades que el usuario ya puede consultar, resume las coincidencias y devuelve enlaces navegables como citas.

## Contrato funcional

- ruta UI: `/admin/ask`;
- endpoint: `POST /api/admin/assistant/ask`;
- permiso requerido en UI y backend: `assistant.use`;
- alcance: EGI activo o vista global cuando el perfil posee `scope.global.read`;
- fuentes actuales: proyectos, indicadores, informes y documentos disponibles mediante la búsqueda autenticada;
- respuesta: texto determinista, estado de evidencia, citas, límites, identificador de auditoría y fecha;
- una ausencia de coincidencias produce `no_evidence`, no una respuesta inventada.

## Seguridad y privacidad

El endpoint usa `BearerAuthGuard`, valida `assistant.use` y resuelve el EGI con la misma política del workspace. La búsqueda subyacente conserva los permisos de lectura por familia de entidad y omite informes y documentos en vista global cuando no existe un scope seguro.

La pregunta se devuelve al cliente durante la solicitud, pero no se almacena en auditoría. El evento registra únicamente SHA-256, longitud, alcance, estado y tipos de resultados. Esto permite trazabilidad sin conservar el texto potencialmente sensible.

## Límites explícitos

- no interpreta el contenido interno de archivos;
- las coincidencias no son conteos exhaustivos;
- no sustituye validación técnica;
- no hay proveedor ni modelo de IA externo en esta versión;
- la recuperación es léxica y limitada a metadatos autorizados.

## Pruebas de aceptación

1. Un usuario sin sesión no puede invocar el endpoint.
2. UI y backend requieren `assistant.use`.
3. La consulta respeta EGI activo y vista global autorizada.
4. Cada fuente apunta a una ruta autenticada `/admin/...`.
5. La respuesta declara su modo y limitaciones.
6. El evento de auditoría contiene `questionHash` y no contiene la pregunta.
7. Typecheck, build, unitarias, E2E y smokes aplicables permanecen verdes.

## Evolución segura

Una futura síntesis generativa deberá ser otro incremento explícito: proveedor aprobado, clasificación de datos, política de retención, defensa contra prompt injection, citas obligatorias, observabilidad, límites de costo y pruebas de evaluación. El contrato actual permite añadir esa capa sin retirar los controles de permisos, scope, fuentes y auditoría.

## Evidencia de cierre

- typecheck monorepo: verde;
- build local y builds Docker de frontend/API: verdes;
- pruebas Node: 122/122;
- pruebas Python: 6/6;
- E2E: 35/35 activas, con 2 escenarios opt-in omitidos;
- smoke de roles: 42/42;
- smoke de frontend único: 39/39;
- endpoint sin autenticación: HTTP 401;
- auditoría real: evento exitoso, sin `question`, con `questionHash` SHA-256 de 64 caracteres;
- Docker `sigi-ux-v2`: frontend en `127.0.0.1:5374` y API en `127.0.0.1:3200`, ambos saludables.
