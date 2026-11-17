# Sprint 0R — Rebaseline — Resultados

## Objetivo

Congelar la última versión funcional revisada, demostrar su relación con el
código y preparar una auditoría nueva sin modificar el producto demo.

El usuario confirmó que `sigi-demo-local` es la versión probada y considerada
casi lista para producción. Por ello queda registrada como baseline de aceptación,
no como entorno demostrativo descartable.

## Entorno

- Fecha: 2026-09-17.
- Rama: `audit/sigi-v1-rebaseline`.
- SHA inicial: `ec40482c34a536db1dc9b53c980f9c848baf6fb5`.
- Docker Server: `28.4.0`.
- Docker Compose: `2.39.4-desktop.1`.
- Node: `22.18.0`.
- npm: `11.6.1`.
- Git: `2.51.0.windows.1`.

## Gates

| Gate | Resultado | Evidencia |
| --- | --- | --- |
| Worktree aislado | PASS | rama creada desde `ec40482c` |
| Imágenes identificadas | PASS | cinco IDs completos registrados |
| Frontends reproducibles | PASS | diferencia de manifiesto `0` |
| API/servicios reproducibles | PASS | diferencia de manifiesto `0` |
| Build Docker | PASS | cinco imágenes construidas |
| Backup de DB | PASS | dump y esquema con SHA-256 |
| Runtime smoke | PASS | HTTP y health checks verdes |
| Volúmenes preservados | PASS | no se ejecutó `down -v` |
| Rama RC intacta | PASS | worktree original no modificado |
| Recreación Compose completa | BLOCKED | falta `.env.production` local |

El bloqueo de recreación no invalida el baseline: las imágenes reconstruyen y
los contenedores preservados pasan smoke. Sí obliga a reconstruir y verificar el
contrato de entorno antes de una candidata de integración.

## Hallazgos

1. Demo y RC son ramas divergentes.
2. El demo contiene una superficie funcional sustancialmente mayor.
3. La RC aporta controles técnicos valiosos, pero también contiene artefactos
   generados versionados y no puede usarse como base mediante merge completo.
4. El commit demo reproduce byte por byte los artefactos revisados.
5. La base de datos revisada fue preservada para futuras pruebas de migración.

## Definition of Done

- Baseline inequívoco: cumplido.
- Evidencia preservada: cumplido.
- Estrategia de comparación: cumplida.
- Plan de auditoría/validación: cumplido.
- Integración de código: deliberadamente no iniciada.

## Decisión

`Sprint 1R — Inventario funcional verificable` puede comenzar.
