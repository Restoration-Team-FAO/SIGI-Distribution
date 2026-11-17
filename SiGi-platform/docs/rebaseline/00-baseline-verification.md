# Verificación del baseline oficial

## Resultado

**BASELINE VERIFIED**

La igualdad byte por byte se verificó en el commit de integración
`be97889fbd3533934a2ef80de994e65702c73d39`. Los commits posteriores de `main`
añaden exclusivamente evidencia bajo `docs/rebaseline/`; por ello el tree del
HEAD documental ya no es, ni debe interpretarse como, el tree puro de la
aplicación aceptada.

## Identidad y recuperación

| Dato | Valor |
| --- | --- |
| Fecha | 2026-09-17 |
| `main` anterior | `95c3df911ffda0bffcc8d8aec3afcb1d01dd3588` |
| Rama de respaldo | `backup/main-pre-sigi-demo-rebaseline-20260917` |
| Baseline aceptado | `ec40482c34a536db1dc9b53c980f9c848baf6fb5` |
| Commit de integración | `be97889fbd3533934a2ef80de994e65702c73d39` |
| Parent 1 | `95c3df911ffda0bffcc8d8aec3afcb1d01dd3588` |
| Parent 2 | `ec40482c34a536db1dc9b53c980f9c848baf6fb5` |
| Tree de integración | `70e6689a381cfd1e2415ed57873fdab949e69da1` |
| Tree de `ec40482c` | `70e6689a381cfd1e2415ed57873fdab949e69da1` |

## Evidencia ejecutada

- VERIFIED BY EXECUTION: la rama backup apunta exactamente al SHA del `main`
  anterior.
- VERIFIED BY EXECUTION: `git show --pretty=raw be97889` mostró exactamente los
  dos parents registrados arriba.
- VERIFIED BY EXECUTION: `git rev-parse be97889^{tree}` y
  `git rev-parse ec40482c^{tree}` produjeron el mismo hash.
- VERIFIED BY EXECUTION: `git diff --exit-code ec40482c be97889` terminó con
  código `0` y sin diferencias.
- VERIFIED BY EXECUTION: el checkout temporal incompleto fue inspeccionado,
  confirmado sin modificaciones del usuario, retirado y recreado como worktree
  válido. No se ejecutó `git clean` global ni `git reset --hard`.
- VERIFIED BY EXECUTION: el worktree original `release/sigi-v1-rc`, que contiene
  cambios locales del usuario, no fue modificado.
- VERIFIED BY EXECUTION: al iniciar la revalidación, `main` estaba limpio y
  `ahead 11` de `origin/main`. Los artefactos generados usados por los tests son
  ignorados por Git.

## Estado final de interpretación

`ec40482c` es el baseline funcional aceptado. `be97889` es la prueba inmutable
de equivalencia y preserva ambas historias. Todo commit posterior de la serie
R1 es evidencia documental, no una alteración funcional del baseline.
