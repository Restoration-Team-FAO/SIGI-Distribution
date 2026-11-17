# Resultados de gates de producción

Fecha de ejecución: 2026-09-17. Baseline funcional: `ec40482c`. Validación
realizada desde `main`, cuyo código de aplicación proviene del tree exacto del
baseline.

## Gate A — Reproducibilidad: PASS WITH FINDINGS

| Prueba | Resultado | Tipo de evidencia |
| --- | --- | --- |
| `npm ci` | PASS; 509 paquetes; `npm` reportó 34 vulnerabilidades (13 high) | VERIFIED BY EXECUTION |
| `npm run verify:env` | PASS | VERIFIED BY EXECUTION |
| `npm run typecheck` | PASS en todos los workspaces | VERIFIED BY EXECUTION |
| `npm run build` | PASS: country, admin y API | VERIFIED BY EXECUTION |
| `npm run test:unit` | PASS, 81/81 | VERIFIED BY EXECUTION |
| entorno productivo generado y validado | PASS, 73 variables | VERIFIED BY EXECUTION |
| Compose config/verify | PASS | VERIFIED BY EXECUTION |
| imágenes Docker | PASS: API, dos frontends y dos servicios Python | VERIFIED BY EXECUTION |
| arranque limpio | PASS: siete servicios persistentes healthy | VERIFIED BY EXECUTION |
| HTTP/health/readiness/WMS | PASS, HTTP 200 | VERIFIED BY EXECUTION |

La primera reserva de puerto falló porque un contenedor ajeno a SIGI ocupaba
`3000`. El usuario corrigió esa colisión. Los gates funcionales ya iniciados se
ejecutaron de forma aislada en `3300/5273/5274/8181`; al finalizar se reconstruyó
y verificó el mismo proyecto en los puertos solicitados `3000/5173/5174/8081`.
Los cinco endpoints finales respondieron HTTP 200 y los siete servicios
persistentes quedaron healthy.

## Gate B — Funcionalidad: FAIL

| Área | Estado | Evidencia actual |
| --- | --- | --- |
| login/sesiones | REAL/OPERATIVO | login usado por smoke y Playwright; sesiones persistidas |
| usuarios y roles | REAL/PARCIAL | smoke de roles 32/33; E2E no encontró la vista esperada de usuarios |
| instituciones/EGI | REAL/PARCIAL | UAT multi-EGI 20/22; aislamiento de proyectos falló |
| proyectos | REAL/PARCIAL | CRUD existe; lectura cruzada/ID `undefined` falló en UAT |
| indicadores | REAL/OPERATIVO | código, esquema y smoke de exportación relacionados |
| territorios | REAL/PARCIAL | endpoints reales; el endpoint legacy no limita respuesta |
| import Excel/CSV | REAL/PARCIAL | backend real; no se completó un E2E limpio del recorrido institucional |
| shapefile | REAL/PARCIAL | backend real; falta defensa contra zip bomb |
| catálogo GIS | ROTO | `code = NULL` en proyectos provoca `TypeError` y HTTP 500 |
| GeoServer | REAL/OPERATIVO | health, UI y WMS 200; inicializador exit 0 |
| dashboards/calidad/restauración | MOCK/HARDCODED | `dashboard-fixtures.ts` sigue alimentando cifras y filas simuladas |
| Geo/BI | REAL/PARCIAL | API avanzada; smoke y 2 E2E GIS fallaron |
| auditoría | ROTO/INSEGURO | `/api/audit` anónimo devuelve 200 y datos; smoke depende de fixture ausente |
| Kobo/Odoo | REAL/PARCIAL | implementados; SSRF no mitigado; no se usó un sistema externo real |
| reportes/exportaciones | REAL/PARCIAL | scopes export/publication PASS; 2/3 E2E de reportes fallaron |
| documentos | REAL/OPERATIVO EN CÓDIGO | módulo completo y storage persistente; sin E2E específico ejecutado |
| incidentes | NO VERIFICABLE | smoke referencia nombre de contenedor fijo ajeno al proyecto ejecutado |

VERIFIED BY EXECUTION: `role-smoke` 32/33; `uat-multi-egi` 20/22;
`export-scope`, `publication-scope` y `metrics` pasaron; los otros nueve smoke
individuales fallaron. Tras instalar Chromium, Playwright terminó 2/7.

## Gate C — Datos: FAIL

- VERIFIED BY EXECUTION: DB limpia con 52 CHECK, 174 FK, 89 PK, 42 UNIQUE,
  234 índices de aplicación, PostGIS 3.4.3, un GiST y un GIN; cero constraints
  sin validar.
- VERIFIED BY EXECUTION: ocho filas de `core.projects` tienen `code IS NULL`.
  La columna permite NULL y el servicio geoespacial ejecuta `.trim()` sobre el
  valor; esto rompe el catálogo.
- VERIFIED BY EXECUTION: el bootstrap productivo cargó automáticamente 7
  instituciones, 14 usuarios, 8 proyectos, 6 territorios y 3 export runs.
- VERIFIED IN CODE: `infra/postgres/init` mezcla esquema y
  `900_phase5_demo_seed.sql`; no hay selección segura de seed para una
  institución nueva.
- VERIFIED IN CODE: existen 18 scripts init y 14 migraciones, pero no hay un
  runner/version table demostrado para upgrade in-place.

## Gate D — Seguridad: FAIL

- VERIFIED BY EXECUTION: anónimo `GET /api/audit` = 200 y 44 KB; los endpoints
  `/api/admin/audit`, `/api/auth/me`, `/api/metrics` y `/api/admin/users`
  respondieron 401.
- VERIFIED IN CODE: login individual, hash de credenciales, access/refresh
  sessions, expiración y revocación existen. MFA no existe.
- VERIFIED BY EXECUTION: UAT detectó aislamiento de proyectos incorrecto.
- VERIFIED IN CODE: conectores aceptan URL configurable y Python usa
  `urlopen()` sin bloqueo de loopback, rangos privados o link-local: SSRF sigue
  vigente.
- VERIFIED IN CODE: CORS está fijado a localhost/127.0.0.1 y el rate limiter
  confía directamente en `X-Forwarded-For` sin trusted-proxy.
- VERIFIED IN CODE: límites de upload comprimido existen; no se verifica el
  tamaño descomprimido de cada `ZipInfo` antes de `archive.read()`.
- VERIFIED BY EXECUTION: el compose productivo solo publica servicios sobre
  loopback; servicios internos y PostgreSQL no publican puertos.

## Gate E — GIS: FAIL

PostGIS, SRID 4326, GiST, bbox, paginación de la API Geo, filtros, estadísticas,
búsqueda, exportación y WMS existen. El gate falla por: catálogo HTTP 500 ante
`project.code = NULL`; API legacy `/territories/features` sin límite; zip bomb;
credenciales completas de PostgreSQL en el datastore GeoServer; y fallos del
smoke/E2E geoespacial. El E2E country llegó a seleccionar `San Vito`, pero no
abrió la ficha; el admin no encontró el buscador.

## Gate F — Operación: FAIL

- VERIFIED IN CODE: CI, release gate, health/readiness, métricas, request ID,
  log rotation, storage persistente y scripts demo de backup/restore existen.
- VERIFIED BY EXECUTION: unit tests 81/81 y metrics 10/10.
- VERIFIED BY EXECUTION: el release gate no es repetible como conjunto: el
  rate limiter generó 429; pruebas individuales muestran dependencias de orden
  y `incident-scope-smoke.mjs` fija `sigi-platform-postgres-1`.
- VERIFIED IN CODE: Caddy/TLS solo está en el overlay `demo`; el compose
  productivo base no define ingreso institucional TLS.
- NOT VERIFIED: restore completo, upgrade sobre copia del baseline, rollback y
  despliegue Ubuntu/VPS.

## Gate G — Deployment institucional limpio: NOT VERIFIED / NOT READY

| Recorrido | Estado |
| --- | --- |
| checkout → config → build → deploy | VERIFIED en Docker Desktop |
| migrations/bootstrap | PARTIALLY VERIFIED; DB limpia crea schema pero también datos demo |
| login | VERIFIED |
| crear proyecto → Excel → shapefile → mapa → dashboard → publicar | PARTIALLY VERIFIED; fallos funcionales impiden el recorrido completo |
| backup | VERIFIED IN CODE, no ejecutado en este gate |
| restore | NOT VERIFIED |
| Ubuntu/VPS + dominio + TLS | NOT VERIFIED |

Conclusión general: **NOT READY**.
