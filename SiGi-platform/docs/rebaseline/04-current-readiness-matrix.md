# Matriz actual de readiness

Actualizada al cierre técnico de Sprint 8R (2026-09-17).

| Área | Estado | Fundamento |
| --- | --- | --- |
| architecture | READY | baseline reconciliado y reconstruido desde despliegue vacío |
| frontend-country | READY FOR UAT | E2E funcional/visual verde; requiere aceptación institucional |
| frontend-admin | READY FOR UAT | recorridos críticos y navegación EGI verdes |
| backend | READY FOR UAT | build, provisión y gate agregado 13/13 repetible |
| APIs | READY WITH FIXES | auditoría cerrada, CORS configurable y territorio paginado |
| auth | READY WITH FIXES | sesiones/rotación/revocación reales; MFA queda P3 |
| RBAC | READY | matriz 33/33 y permiso global explícito |
| PostgreSQL | READY | bootstrap vacío, migración, backup y restore verificados |
| PostGIS | READY | SRID, índice GiST y migración verificados |
| GIS | READY FOR UAT | E2E mapa/búsqueda/tabla/export y API 60/60 verdes con fixtures efímeros |
| GeoServer | READY FOR UAT | WMS post-deploy y restore verdes con rol read-only |
| projects | READY WITH FIXES | scope EGI verde; registros legacy sin código siguen marcados no publicables |
| indicators | READY WITH FIXES | modelo real; falta UAT institucional no demo |
| imports | READY WITH FIXES | firmas y ZIP endurecidos; fixtures autocontenidos pendientes |
| BI | READY WITH FIXES | datos de API reales y limitaciones rotuladas |
| reports | READY WITH FIXES | plantillas/wizard/historial vacío gobernado pasan E2E |
| interoperability | READY WITH FIXES | SSRF mitigado; Kobo/Odoo externos no validados con tercero real |
| users | READY | identidad real y E2E de administración verde |
| security | RELEASE HOLD | controles de aplicación verdes; `npm audit --omit=dev` reporta 3 high, 8 moderate y 1 low |
| audit | READY | endpoint anónimo eliminado y smoke 8/8 |
| tests | READY | unit 88/88, Python 6/6, E2E 20/20 y gate autocontenido 13/13 |
| Docker | READY FOR VPS | candidata limpia healthy y restaurada; recorrido VPS pendiente |
| deployment | NOT READY | falta HTTPS real en VPS, aceptación humana y resolución/aceptación de advisories |
| backup | READY | backup/restore integral y hashes SHA-256 verificados en 7R y 8R |
| observability | READY WITH FIXES | health/readiness/metrics/request ID/log rotation; falta ensayo operativo |
| multi-institution | READY | UAT multi-EGI 22/22 y scope operacional 23/23 |

Estado general: **NO-GO DE PRODUCCIÓN / GO PARA UAT**. Falta ejecutar el
recorrido HTTPS en VPS, obtener aceptación humana y resolver o aceptar
formalmente los advisories productivos descritos en 8R.

---

## Actualización — 2026-10-02

Verificación independiente puntual (no un re-cierre de sprint completo; ver
`03-current-blockers.md`, sección "Addendum de verificación — 2026-10-02",
para el detalle de evidencia). Cambios respecto a la tabla de arriba:

| Área | Estado 8R (arriba) | Estado verificado 2026-10-02 | Motivo |
| --- | --- | --- | --- |
| security | RELEASE HOLD | **READY WITH FIXES** | `npm audit --omit=dev` en `root`, `apps/sigi-api` y `apps/frontend-sigi`: **0 vulnerabilidades** (antes 3 high/8 moderate/1 low). La retención por advisories ya no aplica; sigue pendiente la decisión sobre MFA (P3) y el resto de condiciones de `deployment`. |
| projects | READY WITH FIXES | READY WITH FIXES (sin cambio de nivel) | Se cerraron 2 brechas de aislamiento EGI no cubiertas por el UAT original (Geo/BI admin, importación masiva — commit `1319ffe5`). No se re-ejecutó el UAT multi-EGI completo tras el fix, por lo que el nivel se mantiene en "WITH FIXES" hasta esa verificación por ejecución. |
| BI | READY WITH FIXES | READY WITH FIXES (sin cambio de nivel) | El panel Geo/BI admin ahora respeta el alcance EGI (antes agregaba todas las instituciones); mismo motivo que `projects` para no subir de nivel todavía. |

`deployment` se mantiene **NOT READY**: de sus 3 condicionantes originales
(HTTPS en VPS, aceptación humana, advisories), solo los advisories quedaron
resueltos hoy. HTTPS en VPS (P0-14) sigue pendiente y no es verificable sin
acceso a infraestructura institucional real.

**Aceptación humana (UAT)**: el responsable de producto confirmó
verbalmente en esta sesión (2026-10-02) que el UAT está aprobado. **No hay
acta de aceptación ni otro artefacto documental** respaldando esto todavía
(pendiente `05-new-v1-backlog.md` P6-02) — se registra como condición
**NOT VERIFIED** según el propio estándar de evidencia de este documento,
no como cerrada. Detalle en `03-current-blockers.md`.

Con esto, el único condicionante de `deployment` sin ninguna forma de
confirmación (ni documental ni verbal) es **P0-14 — HTTPS en VPS
institucional real**. Precisión importante (VERIFIED IN CODE, ver
`03-current-blockers.md` para el detalle): el overlay Caddy/TLS
(`docker-compose.prod.yml` + `infra/caddy/Caddyfile`) y el runbook de
despliegue (`docs/deployment/HETZNER-DEMO.md`) **ya están completos**, con
solo Caddy publicando puertos al host y todo lo demás interno. Lo único que
falta de P0-14 es **ejecutar** ese runbook contra un VPS y dominio reales —
no hay trabajo de diseño/código pendiente, solo de ejecución operativa, y
eso explica por qué `Docker: READY FOR VPS` (arriba) ya anticipaba esto.

También se confirmó mediante barrido exhaustivo de código (no listado como
cambio de estado porque ya estaba implícito en `projects`/`BI`/`reports`
arriba) que el backlog `P1-01` (botones/widgets UI-only) está cerrado para
`frontend-sigi` — ver detalle en `03-current-blockers.md`.
