# Sprint 5R — Identidad y aislamiento

Fecha de cierre: 2026-09-17

Rama: `integration/sigi-v1-reconciled`

## Resultado

Sprint completado. El baseline conserva las identidades individuales y los once
roles aceptados, y endurece la operación productiva de sesiones, permisos y
aislamiento entre institución y EGI.

## Controles incorporados

- TTL de access/refresh token configurable, validado para exigir que refresh
  viva más que access;
- rotación de refresh token dentro de una transacción con bloqueo de fila, de
  modo que un replay concurrente no pueda emitir dos sesiones;
- revocación de sesiones al cambiar la contraseña;
- contraseña nueva de al menos 12 caracteres con letras y números;
- tokens administrativos legacy prohibidos en runtime productivo;
- allowlist CORS del API y número de proxies confiables configurables;
- IP cliente delegada a la política `trust proxy` de Express, sin confiar
  directamente en un `X-Forwarded-For` arbitrario;
- ruta pública `/api/audit` eliminada; la bitácora sigue disponible únicamente
  en `/api/admin/audit` con `audit.read`;
- permiso explícito `scope.global.read`, asignado por migración a
  `superadmin` y `national_admin`;
- política central de capacidad global consumida por administración y
  exportaciones; `technical_integration` no obtiene vista global por nombre de
  rol;
- smoke de login, refresh, replay, logout y cierre de auditoría pública
  integrado al release gate;
- CI con matriz de roles, UAT multiinstitución/multi-EGI y preflight CORS
  positivo/negativo.

## Hallazgos corregidos durante la validación limpia

- el rol productivo `sigi_app` no tenía permisos sobre el esquema `documents`;
  el provisionamiento ahora incluye tablas, secuencias y privilegios futuros;
- el catálogo geoespacial fallaba al listar proyectos históricos sin código;
  ahora genera un identificador seguro de presentación y los marca como no
  elegibles para publicar hasta asignarles código;
- el smoke operacional dependía del código EGI obsoleto `EGI-MARN-TEST` y de
  diferencias de cantidad; ahora usa `EGI-MARN-OCC` y verifica el scope aun
  cuando ambos conjuntos estén vacíos;
- las contraseñas temporales del UAT fueron elevadas a la política de 12
  caracteres.

## Evidencia ejecutada

| Control | Resultado |
|---|---|
| `npm run test:unit` | PASS, 85/85 |
| validadores env/compose/foundation/ops | PASS |
| build productivo en `sigi-5r-validation` | PASS |
| permisos `scope.global.read` | 2/2 roles previstos |
| sesiones individuales | PASS, 9/9 |
| matriz de roles | PASS, 33/33 |
| aislamiento operacional EGI | PASS, 23/23 |
| UAT multiinstitución/multi-EGI | PASS, 22/22 |
| exportaciones por EGI/global | PASS |
| CORS permitido/bloqueado | header presente/ausente según allowlist |
| E2E de rebaseline aceptado | PASS, 10/10 |
| servicios productivos | healthy; jobs de bootstrap `Exited (0)` |

La validación se ejecutó sobre `sigi-5r-validation`. La pila aceptada
`sigi-r1-validation` y el contenedor de referencia `sigi-demo-local` no fueron
modificados.

Como comprobación exploratoria se ejecutó además la suite E2E heredada
completa: 12/17. Sus cinco fallos dependen de datos o selectores históricos
(`Prueba`, encabezado de usuarios y ficha Geo) que no forman parte del gate
aceptado de rebaseline; quedan como insumo para el sprint de validación UI. No
afectaron los 10/10 del inventario funcional ni los gates de identidad de 5R.

## Decisión

Sprint 5R: **DONE**. El siguiente sprint puede concentrarse en el siguiente
bloque del plan de revalidación sin reabrir identidad, salvo que aparezca una
regresión en el release gate completo o en el recorrido VPS limpio.
