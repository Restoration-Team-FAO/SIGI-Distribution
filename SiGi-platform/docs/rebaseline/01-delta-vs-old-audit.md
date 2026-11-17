# Delta frente a la auditoría histórica

Fuente histórica: documentos `docs/audit` y `docs/v1` del worktree anterior.
Esos documentos se conservan sin modificación y se consideran
**REQUIRES REVALIDATION AGAINST ec40482c**. Esta tabla clasifica los 159 IDs
históricos encontrados y añade tres regresiones descubiertas en R1.

## Hallazgos confirmados

| Hallazgo anterior | Estado nuevo | Evidencia actual | Cambio | Acción |
| --- | --- | --- | --- | --- |
| GAP-01, GAP-02, GAP-03, GAP-04, GAP-05, GAP-06, GAP-07, GAP-08, GAP-09, GAP-10, GAP-11, GAP-12, GAP-13, GAP-14 | CONFIRMED | VERIFIED IN CODE: `frontend-country/src/mocks/dashboard-fixtures.ts`, páginas country, catálogos/schemas | persisten mocks, cifras/controles hardcoded | P0-06/P1-01/P1-04 |
| GAP-16 | CONFIRMED | VERIFIED IN CODE: `projects.controller.ts:125-132` sigue devolviendo `audit: []` | sin cambio sustancial | retirar o implementar con guard |
| GAP-17 | CONFIRMED | VERIFIED BY EXECUTION: DB limpia creó export runs demo | seed cambió de archivo, no de riesgo | P0-03 |
| GAP-19, GAP-20, GAP-21, GAP-22, GAP-23, GAP-25, GAP-28 | CONFIRMED | VERIFIED IN CODE: fixtures, `ActionButton` sin acción y stubs/duplicación presentes | sin resolución demostrada | consolidación P1 |
| JSON-1, JSON-2 | CONFIRMED | VERIFIED IN CODE: JSONB heterogéneo sin schema DB uniforme | persiste dependencia de aplicación | P2-03 |
| SEED-1 | CONFIRMED | VERIFIED BY EXECUTION: datos demo automáticos | volumen limpio lo reprodujo | P0-03 |
| AUTH-03 | CONFIRMED | VERIFIED IN CODE: no TOTP/WebAuthn/MFA | ahora hay login individual, pero no MFA | P3-01 |
| AUTHZ-01 | CONFIRMED | VERIFIED BY EXECUTION: `/api/audit` anónimo = 200 | exactamente vigente | P0-01 |
| AUTHZ-05 | CONFIRMED | VERIFIED IN CODE: audit público de proyecto es array vacío | exactamente vigente | P1 |
| API-03 | CONFIRMED | VERIFIED IN CODE: CORS solo localhost/127.0.0.1 | exactamente vigente | P0-07 |
| API-08 | CONFIRMED | VERIFIED IN CODE: URL configurable llega a `urlopen` sin control de red | exactamente vigente | P0-02 |
| CFG-03 | CONFIRMED | VERIFIED IN CODE: GeoServer permite CORS `*` en compose | mitigado por loopback, no eliminado | P3-02 |
| GIS-2, GIS-3, GIS-4 | CONFIRMED | VERIFIED IN CODE: endpoint legacy de territorios sigue sin límite/paginación | coexistente con API Geo nueva | P0-11 |
| GIS-22 | CONFIRMED | VERIFIED IN CODE: datastore recibe credenciales PostgreSQL completas | exactamente vigente | P0-10 |
| DEPLOY-08, DEPLOY-10, DEPLOY-11, DEPLOY-12, DEPLOY-19 | CONFIRMED | VERIFIED IN CODE/EXECUTION: faltan firewall/upgrade/rollback demostrados y seed sigue automático | algunos controles nuevos no cierran el recorrido | P0-03, P4 |
| INST-01, INST-02, INST-03, INST-04, INST-05, INST-06, INST-07, INST-08, INST-09, INST-10, INST-11, INST-12, INST-13 | CONFIRMED | VERIFIED IN CODE: seed/topónimos/textos, sin i18n ni branding institucional configurable | baseline conserva orientación demo/país | P0-03/P0-06 y decisión de producto |
| BLK-02, BLK-06, BLK-09, BLK-13, BLK-14 | CONFIRMED | VERIFIED BY EXECUTION/IN CODE: seed, audit, SSRF, credenciales GeoServer y endpoint legacy | permanecen materialmente iguales | P0-01/02/03/10/11 |

## Resueltos en el baseline

| Hallazgo anterior | Estado nuevo | Evidencia actual | Cambio | Acción |
| --- | --- | --- | --- | --- |
| GAP-24, GAP-26 | RESOLVED IN BASELINE | VERIFIED IN CODE: permisos UI/API y SQL parametrizado en rutas revisadas | controles incorporados | mantener tests |
| FK-1, FK-2, FK-3, FK-4, FK-5 | RESOLVED IN BASELINE | VERIFIED BY EXECUTION: 174 FK, cero constraints sin validar | integridad añadida | prueba de migración P2 |
| IDX-1, IDX-2, IDX-3, IDX-4 | RESOLVED IN BASELINE | VERIFIED BY EXECUTION: 234 índices de aplicación | índices operativos presentes | benchmark P2 |
| GIS-1 | RESOLVED IN BASELINE | VERIFIED BY EXECUTION: índice GiST presente | índice espacial añadido | prueba de escala |
| CHK-1, CHK-2 | RESOLVED IN BASELINE | VERIFIED BY EXECUTION: 52 CHECK | dominios controlados añadidos | mantener migraciones |
| NN-1 | RESOLVED IN BASELINE | VERIFIED IN CODE: migración de fechas de indicadores presente | centinela retirado | prueba upgrade |
| ORPH-1, ORPH-2 | RESOLVED IN BASELINE | VERIFIED IN CODE y 174 FK | FKs/limpieza incorporadas | prueba delete/cascade |
| SQLI-1, SQLI-2, SQLI-3 | RESOLVED IN BASELINE | VERIFIED IN CODE: valores parametrizados y nombres controlados | riesgo original eliminado en rutas auditadas | análisis SAST continuo |
| CAS-1, CAS-2, CAS-3, CAS-4 | RESOLVED IN BASELINE | VERIFIED IN CODE: políticas FK/cascade explícitas | comportamiento definido | tests de borrado |
| AUTH-01, AUTH-02, AUTH-05, AUTH-06, AUTH-07 | RESOLVED IN BASELINE | VERIFIED IN CODE/EXECUTION: login individual, hashes, access/refresh sessions, TTL/revocación; legacy deshabilitado en prod | modelo estático reemplazado | MFA queda separado |
| AUTHZ-03 | RESOLVED IN BASELINE | VERIFIED IN CODE/EXECUTION: datasets protegidos y anónimo = 401 | guards añadidos | mantener negativo |
| CFG-02, CFG-05 | RESOLVED IN BASELINE | VERIFIED BY EXECUTION: env productivo obligatorio/validado, placeholders rechazados | defaults inseguros fuera del compose prod | secret manager P3 |
| GIS-5, GIS-6, GIS-7, GIS-8, GIS-9, GIS-10, GIS-11, GIS-12, GIS-13, GIS-14, GIS-15, GIS-16, GIS-17, GIS-18, GIS-19, GIS-20, GIS-21, GIS-28 | RESOLVED IN BASELINE | VERIFIED IN CODE/EXECUTION: Geo API con bbox/página/límites/filtros/stats/search/export, GeoServer operativo y decisión de escala | nueva implementación geoespacial | cerrar fallos actuales P0-05/13 |
| DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-05, DEPLOY-07, DEPLOY-13, DEPLOY-16, DEPLOY-17, DEPLOY-18, DEPLOY-20, DEPLOY-21 | RESOLVED IN BASELINE | VERIFIED BY EXECUTION/IN CODE: builds, env, prod compose, health, loopback, volúmenes, logs, métricas, request ID y CI | controles incorporados | mantener gate reproducible |
| BLK-01, BLK-04, BLK-08, BLK-10, BLK-11, BLK-12, BLK-15, BLK-16 | RESOLVED IN BASELINE | VERIFIED BY EXECUTION/IN CODE: Docker build, puertos internos, identidad, secretos, Geo password validada, GiST y workflows | problemas originales corregidos | regresión automática |

## Hallazgos cambiados

| Hallazgo anterior | Estado nuevo | Evidencia actual | Cambio | Acción |
| --- | --- | --- | --- | --- |
| GAP-15 | CHANGED | exports/publications smoke PASS; E2E de reportes 1/3 | ya no es solo cola, pero el flujo no está consolidado | P1-02 |
| GAP-18 | CHANGED | VERIFIED IN CODE: modos live/mock; prod puede forzar live | mock ahora es opción controlada | verificar externo real |
| AUTH-04 | CHANGED | login por contraseña existe; recuperación sigue ausente | ahora sí aplica al modelo real | decisión SSO/recovery |
| AUTHZ-02, API-01 | CHANGED | AuthPrincipal ya porta institución/EGI, pero UAT 20/22 falla | pasó de ausencia universal a scoping incompleto | P0-04 |
| AUTHZ-04 | CHANGED | permisos DB-driven y guards existen; role smoke 32/33 | riesgo es matriz/implementación puntual | P0-04/05 |
| API-02 | CHANGED | DTOs y clientes internos crecieron; no se ejecutó fuzz de mass assignment | superficie distinta | P3/test contrato |
| CFG-01 | CHANGED | `.env.production` está ignorado en el repo actual; defensa sigue ligada a estructura del repo | exposición actual no reproducida | hardening repo |
| IDX-5 | CHANGED | VERIFIED BY EXECUTION: existe un GIN, pero la cobertura de todas las consultas JSONB no se probó | índice parcial respecto al hallazgo | benchmark P2 |
| SEED-2 | CHANGED | existe `999_empty_demo.sql`, pero compose productivo ejecuta también `900_phase5_demo_seed.sql` | mecanismo nuevo no evita seed | P0-03 |
| GIS-23, GIS-24, GIS-25, GIS-26, GIS-27 | CHANGED | Geo API/BI fue ampliada; smokes/E2E GIS fallan | arquitectura distinta, readiness aún no demostrada | P0-05/09/13 |
| DEPLOY-04 | CHANGED | imágenes base fijadas y apps construidas localmente; publicación inmutable/SBOM no demostrada | riesgo residual diferente | P4-04 |
| DEPLOY-06, DEPLOY-09 | CHANGED | Caddy/TLS existe solo en overlay demo | ya hay implementación, no perfil institucional | P0-14 |
| DEPLOY-14, DEPLOY-15 | CHANGED | scripts de backup/restore existen bajo `demo/bin`; restore no ejecutado en R1 | dejó de ser ausencia total | P4-01 |
| DEPLOY-22 | CHANGED | unit 81/81, smokes y E2E presentes; gate falla | de ausencia de tests a tests no verdes | P0-12/13 |
| DEP-01, DEP-02 | CHANGED | compose/config productivo y demo overlay existen; flujo VPS no ejecutado | topología nueva | P0-14/P6-01 |
| BLK-03 | CHANGED | TLS/proxy existe solo como overlay demo | no es ausencia total, falta producto institucional | P0-14 |
| BLK-05 | CHANGED | backup/restore existe para demo; restore R1 no verificado | alcance operativo incompleto | P4-01 |
| BLK-07 | CHANGED | identidad/EGI implementadas, pero UAT detecta separación de proyectos fallida | causa y alcance cambiaron | P0-04 |

## Ya no aplicables y no verificados

| Hallazgo anterior | Estado nuevo | Evidencia actual | Cambio | Acción |
| --- | --- | --- | --- | --- |
| GAP-27 | NO LONGER APPLICABLE | progreso derivado está documentado como decisión, no defecto | no requiere persistencia para V1 | ninguna |
| FK-6 | NO LONGER APPLICABLE | `audit_events.entity_id` es polimórfico por diseño | una FK única no es expresable | mantener validación de aplicación |
| API-04 | NO LONGER APPLICABLE | auth usa Bearer, no cookies; CSRF de cookie no aplica | `credentials:true` queda como hardening | P3-02 |
| INST-14 | NO LONGER APPLICABLE | el hallazgo histórico ya era una aclaración sin defecto | catálogos genéricos no bloquean multi-país | tratar GAP-13/14 aparte |
| FK-7 | NOT VERIFIED | no se ejecutó una prueba completa de lineage proyecto→publicación sobre datos reales | evidencia insuficiente | P2-03 |

## Regresiones nuevas encontradas

| Hallazgo nuevo | Estado nuevo | Evidencia actual | Cambio | Acción |
| --- | --- | --- | --- | --- |
| R1-NR-01 | NEW REGRESSION | 8 proyectos con `code = NULL`; catálogo llama `.trim()` y retorna 500 | inconsistencia schema/servicio no inventariada antes | P0-05 |
| R1-NR-02 | NEW REGRESSION | release gate depende de orden, rate bucket y nombre fijo `sigi-platform-postgres-1` | arnés nuevo no portable | P0-12 |
| R1-NR-03 | NEW REGRESSION | Playwright instalado y ejecutado: 2/7; contratos/selectores de usuarios, reportes y GIS no coinciden | cobertura nueva revela recorridos rotos | P0-13 |

## Conteo

| Clasificación | Cantidad |
| --- | ---: |
| CONFIRMED | 59 |
| RESOLVED IN BASELINE | 69 |
| CHANGED | 26 |
| NO LONGER APPLICABLE | 4 |
| NEW REGRESSION | 3 |
| NOT VERIFIED | 1 |
| **Total** | **162** |
