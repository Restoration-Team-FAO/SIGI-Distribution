# Impacto sobre documentos V1 históricos

Los cuatro documentos se revisaron desde el worktree histórico
`release/sigi-v1-rc`. No forman parte del tree `ec40482c`; por tanto no se
copiaron a `main` durante R1. Su contenido queda como referencia histórica con
la marca conceptual **REQUIRES REVALIDATION AGAINST ec40482c**.

| Documento | Decisión | Motivo demostrado | Acción posterior |
| --- | --- | --- | --- |
| `SIGI-V1-FUNCTIONAL-SCOPE.md` | REWRITE REQUIRED | el baseline correcto tiene una superficie funcional mayor, pero también mezcla dashboards mock y recorridos rotos | reconstruir alcance desde matriz Gate B y UAT |
| `SIGI-V1-TARGET-ARCHITECTURE.md` | VALID WITH CHANGES | identidad, EGI, Geo API, Files, Reports, CI y compose productivo existen; seed, TLS y migraciones no cumplen el objetivo | ajustar componentes y estados, no reescribir por estilo |
| `SIGI-V1-RELEASE-GATE.md` | REWRITE REQUIRED | el gate actual no es autocontenido, usa nombres/fixtures dependientes y la ejecución real falla | definir gate determinista desde volumen vacío con A-G |
| `SIGI-V1-P0-IMPLEMENTATION-PLAN.md` | REWRITE REQUIRED | fue construido contra una rama desactualizada y varios P0 ya están resueltos o cambiaron | sustituir por `05-new-v1-backlog.md` tras aceptación |

No se modificaron los originales porque están fuera del baseline aceptado y en
un worktree con cambios del usuario. La reescritura corresponde al sprint de
remediación, no al diagnóstico R1.
