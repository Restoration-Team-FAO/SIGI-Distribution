# Bloqueadores vigentes de producción

Esta lista contiene únicamente problemas confirmados contra el baseline
`ec40482c`. No hereda automáticamente los 16 bloqueadores históricos.

> Registro histórico de hallazgos. Al cierre técnico de 8R, P0-01 a P0-13
> están corregidos y verificados sobre un volumen productivo vacío. P0-14 sigue
> abierto porque requiere dominios, certificados y un VPS institucional real.
> La auditoría productiva de dependencias además mantiene una retención de
> liberación hasta resolver o aceptar formalmente 3 advisories altos. Véanse
> `04-current-readiness-matrix.md` y `80-sprint-8r-final-candidate.md`.

## R1-P0-01 — Auditoría pública

- Área: seguridad/auditoría.
- Evidencia: VERIFIED BY EXECUTION, `GET /api/audit` anónimo respondió 200 y
  entregó 44 KB; VERIFIED IN CODE, `audit.controller.ts:4-14` no usa guard.
- Riesgo: exposición de correos y metadatos operativos.
- Dependencia: ninguna.
- Solución sugerida: eliminar la ruta duplicada o aplicar auth, permiso y EGI.
- Aceptación: anónimo = 401/403 y pruebas de rol/EGI verdes.

## R1-P0-02 — SSRF en Kobo/Odoo

- Área: interoperabilidad/seguridad.
- Evidencia: `services/integration-service/app/core/http.py:10-23` y
  `kobo_connector.py:227-283` consumen URLs configurables sin política de red.
- Riesgo: acceso desde la red Docker a loopback, servicios internos o metadata.
- Dependencia: definir allowlist institucional.
- Solución sugerida: resolver DNS y bloquear rangos no públicos en cada salto,
  limitar esquemas/puertos y redirecciones.
- Aceptación: suite negativa IPv4/IPv6/DNS rebinding/redirect pasa.

## R1-P0-03 — Seed demo automático en producción

- Área: datos/deployment.
- Evidencia: VERIFIED BY EXECUTION, una DB productiva vacía creó 7
  instituciones, 14 usuarios, 8 proyectos, 6 territorios y 3 export runs;
  `docker-compose.prod.yml` monta todo `infra/postgres/init`.
- Riesgo: datos ficticios y cuentas demo en una institución real.
- Dependencia: definir bootstrap mínimo.
- Solución sugerida: separar schema/bootstrap/seed y hacer demo opt-in.
- Aceptación: volumen vacío productivo contiene solo configuración mínima
  explícita y cero registros demostrativos.

## R1-P0-04 — Aislamiento multi-EGI incompleto

- Área: autorización/proyectos.
- Evidencia: VERIFIED BY EXECUTION, UAT 20/22; `projects.a.separated=false` y
  lectura foránea terminó en HTTP 500 con ID `undefined`.
- Riesgo: lectura o mutación cruzada entre instituciones.
- Dependencia: fixtures UAT deterministas.
- Solución sugerida: aplicar EGI en queries y validar pertenencia en read/write.
- Aceptación: UAT multi-EGI completo, negativo y sin 500.

## R1-P0-05 — Catálogo GIS falla con proyectos válidos sin código

- Área: backend/GIS/datos.
- Evidencia: VERIFIED BY EXECUTION, 8 proyectos tienen `code IS NULL`; logs
  muestran `geospatial-catalog.service.ts:1666` → `sanitizeLayerCode()` →
  `.trim()` en líneas 1737-1742 y HTTP 500.
- Riesgo: roles, importación y catálogo geoespacial quedan rotos.
- Dependencia: decidir si `code` es obligatorio o derivable.
- Solución sugerida: constraint/backfill o normalización null-safe coordinada.
- Aceptación: migración segura, DB limpia sin inconsistencia y smokes GIS verdes.

## R1-P0-06 — Dashboards institucionales muestran datos simulados

- Área: frontend-country/calidad/BI.
- Evidencia: `apps/frontend-country/src/mocks/dashboard-fixtures.ts:1-109` y
  páginas de dashboard, calidad, territorio y restauración.
- Riesgo: presentar cifras ambientales, inversión o calidad ficticias como
  información oficial.
- Dependencia: fuente real o decisión de alcance.
- Solución sugerida: conectar métricas trazables o retirar/rotular demo.
- Aceptación: ninguna cifra productiva proviene de fixtures; pruebas de lineage.

## R1-P0-07 — CORS no admite dominios institucionales

- Área: API/deployment.
- Evidencia: `apps/sigi-api/src/main.ts:24-45` contiene solo localhost y
  127.0.0.1.
- Riesgo: frontend en dominio real bloqueado o cambio de emergencia inseguro.
- Dependencia: inventario de dominios por ambiente.
- Solución sugerida: allowlist validada por configuración.
- Aceptación: dominio autorizado pasa preflight; origen no autorizado falla.

## R1-P0-08 — Rate limiting evadible y rompe el release gate

- Área: seguridad/operación.
- Evidencia: `main.ts:171-183` confía directamente en `X-Forwarded-For`;
  VERIFIED BY EXECUTION, el gate agregado recibió 429 y requirió reiniciar API
  entre smokes.
- Riesgo: evasión externa y pruebas no deterministas.
- Dependencia: topología de proxy y estrategia de estado.
- Solución sugerida: trusted proxies explícitos, buckets coherentes y aislamiento
  de pruebas.
- Aceptación: spoofing negativo pasa y `npm run release:gate` corre de una vez.

## R1-P0-09 — Uploads incompletamente endurecidos

- Área: imports/GIS/seguridad.
- Evidencia: `shapefile_ingest.py:360-410` lee entradas sin límite de tamaño
  descomprimido; import CSV/Excel depende de nombre/extensión.
- Riesgo: agotamiento de memoria y contenido no esperado.
- Dependencia: límites de negocio.
- Solución sugerida: magic bytes, límites por entrada/total/ratio y casos bomba.
- Aceptación: corpus malicioso rechazado sin incremento no acotado de memoria.

## R1-P0-10 — GeoServer usa credenciales amplias de la aplicación

- Área: GeoServer/PostgreSQL.
- Evidencia: `docker-compose.prod.yml:198-205` entrega
  `POSTGRES_USER/POSTGRES_PASSWORD` al inicializador del datastore.
- Riesgo: un compromiso de GeoServer alcanza schemas no geográficos.
- Dependencia: diseño de grants/vistas públicas.
- Solución sugerida: rol read-only limitado a vistas GIS.
- Aceptación: GeoServer sirve WMS/WFS y no puede leer `core.users` ni escribir.

## R1-P0-11 — Endpoint territorial legacy sin límite

- Área: GIS/disponibilidad.
- Evidencia: `territories.controller.ts`/`territories.service.ts` delegan el
  listado completo; la API Geo nueva sí tiene `MAX_PAGE_SIZE=1000`.
- Riesgo: payload y consulta no acotados en un endpoint público.
- Dependencia: compatibilidad del frontend.
- Solución sugerida: paginar o retirar el endpoint legacy.
- Aceptación: límite obligatorio probado con dataset grande.

## R1-P0-12 — Release gate no portable ni autocontenido

- Área: QA/operación.
- Evidencia: VERIFIED BY EXECUTION, 3/12 smokes individuales pasaron;
  `incident-scope-smoke.mjs` fija `sigi-platform-postgres-1`; otros smokes
  requieren `EGI-MARN-TEST` creado por otro recorrido.
- Riesgo: CI verde/rojo depende del orden y nombres locales, no del producto.
- Dependencia: fixtures por test y Compose project dinámico.
- Solución sugerida: setup/teardown independiente y descubrimiento de servicios.
- Aceptación: gate repetible dos veces desde volumen vacío sin reinicios manuales.

Estado 8R: **CERRADO**. El gate completo pasó 13/13 en el despliegue vacío y
volvió a pasar 13/13 después de backup/restore. Los smokes descubren EGI y datos
válidos o crean fixtures efímeros; un código solicitado explícitamente sigue
fallando si no existe.

## R1-P0-13 — E2E crítico falla

- Área: frontend/QA.
- Evidencia: VERIFIED BY EXECUTION tras instalar Chromium: Playwright 2/7; fallan
  usuarios/roles, edición e historial de reportes y ambos recorridos GIS.
- Riesgo: recorridos críticos no están protegidos ni demostrados.
- Dependencia: R1-P0-04/05/12 y fixtures deterministas.
- Solución sugerida: corregir producto/contratos y estabilizar datos de prueba.
- Aceptación: 7/7 desde DB limpia, luego ampliar cobertura institucional.

## R1-P0-14 — Ingreso TLS no definido para producción institucional

- Área: deployment.
- Evidencia: Caddy/TLS existe solo en `demo/docker-compose.demo.yml`; el compose
  productivo base publica en loopback y no define dominio/certificados.
- Riesgo: despliegue manual inconsistente o credenciales sin TLS.
- Dependencia: dominios y terminación TLS institucional.
- Solución sugerida: perfil/overlay productivo documentado, no valores demo.
- Aceptación: instalación VPS nueva sirve solo HTTPS y redirige HTTP.

Resumen vigente: **P0-01 a P0-13 cerrados; P0-14 abierto**. La candidata queda
además retenida por UAT humana y por la decisión de seguridad documentada en 8R.

---

## Addendum de verificación — 2026-10-02

Auditoría independiente post-8R sobre `main`/`v1.0.0` (commit base `d2b5250d`,
antes de los dos commits descritos abajo). Metodología: lectura directa de
código, no re-ejecución del release gate completo. Dos hallazgos nuevos,
ambos sub-casos de R1-P0-04 que el UAT original (fixtures de proyectos) no
ejercitó porque no pasan por un recurso con `:id` en la URL.

### R1-P0-04b — Geo/BI admin sin aislamiento EGI (nuevo, CERRADO el mismo día)

- Área: autorización/Geo-BI.
- Evidencia: VERIFIED IN CODE — `geo-bi.controller.ts`/`geo-bi.service.ts`
  (`AdminGeoBiController.module()`) llamaba `getModule(true)` sin resolver
  EGI; `getModule()` no aceptaba el parámetro. Un `institution_editor` veía
  conteos de proyectos, cobertura, desgloses, auditoría e incidentes de
  **todas** las instituciones/EGI, no solo la propia. No cubierto por el UAT
  de R1-P0-04 (que ejercita rutas `/projects/:id`, no el dashboard agregado).
- Riesgo: fuga de datos operativos entre instituciones vía el panel admin.
- Corrección: `geo-bi.service.ts`/`.controller.ts`/`.module.ts` ahora
  resuelven el EGI con el mismo `AdminService.resolveAdminScopeEgiId` que
  usa el resto de endpoints admin, y acotan las 6 queries relevantes.
- Commit: `1319ffe5` — `fix(security): close EGI scoping gaps in Geo/BI admin
  and bulk import`.
- Verificación: `npm run build` limpio, 147/147 unit tests. No se re-corrió
  el release gate completo (requiere stack Docker levantado) — pendiente de
  verificación por ejecución en un UAT formal posterior.

### R1-P0-04c — Importación masiva reasigna institución (nuevo, CERRADO el mismo día)

- Área: autorización/imports.
- Evidencia: VERIFIED IN CODE — `imports.service.ts::promoteProjects()`,
  `ON CONFLICT (code) DO UPDATE SET institution_id = EXCLUDED.institution_id`.
  Un lote de importación de la institución A podía reasignar silenciosamente
  un proyecto existente de la institución B, sin error ni advertencia.
- Riesgo: mutación cruzada entre instituciones vía el pipeline de
  importación masiva (no cubierto por UAT de API directa).
- Corrección: el `UPSERT` ya no reasigna `institution_id`; si el código de
  proyecto existe bajo otra institución, la fila se omite (no se cuenta como
  promovida) en vez de sobrescribirse.
- Commit: `1319ffe5` (mismo commit que R1-P0-04b).
- Verificación: igual que arriba — build y unit tests verdes; sin ejecución
  del release gate completo todavía.

### Re-verificación de hallazgos previos (sin cambios de código, solo confirmación)

- **P1-01 (botones/widgets UI-only, backlog `05-new-v1-backlog.md`)**: barrido
  exhaustivo de ~150 controles en los 10 módulos de mayor tráfico de
  `frontend-sigi` más el shell y 18 páginas adicionales. **Cero** hallazgos
  genuinos — todo wiring a `workspaceApi` o acciones locales legítimas. Este
  ítem del backlog se considera cerrado para `frontend-sigi` (no se verificó
  `frontend-admin`/`frontend-country`, que ya no forman parte de este app).
- **P3-03 (`npm audit --omit=dev`, 3 high/8 moderate/1 low según 8R)**:
  re-ejecutado el 2026-10-02 en `root`, `apps/sigi-api` y
  `apps/frontend-sigi` — **0 vulnerabilidades** en los tres, con y sin
  `--omit=dev`. El estado `security: RELEASE HOLD` de
  `04-current-readiness-matrix.md` por esta causa específica ya no aplica;
  ver ese documento para el resto de condiciones de liberación.
- **P0-03 (seed demo)**: confirmado que el mecanismo de separación
  dev/prod (`docker-compose.yml` siembra demo explícitamente;
  `docker-compose.prod.yml` monta `production/998_remove_operational_seed.sql`
  que hace `TRUNCATE` de las tablas operativas) sigue vigente y es
  intencional, no una regresión. Sin cambios de código.

Commits de esta verificación: `1319ffe5` (fixes), `a9415ebd` (feature de
presupuesto/planificación de proyecto pre-existente, encontrado sin
commitear durante esta sesión y commiteado por separado — ver
`docs/projects/PROJECTS-IMPLEMENTATION-REPORT.md`) y `61f5de24` (este
addendum).

### Aceptación humana (UAT) — NOT VERIFIED, solo confirmación verbal

- Área: liberación/aceptación institucional.
- Evidencia: **ninguna documental todavía**. Confirmación verbal del
  responsable de producto en esta sesión (2026-10-02), sin acta de
  aceptación, ticket ni otro artefacto de respaldo. No cumple el estándar
  `VERIFIED BY EXECUTION`/`VERIFIED IN CODE` del resto de este documento —
  se registra explícitamente como **NOT VERIFIED** para no inflar el estado
  de liberación con una fuente no documental.
- Dependencia de `05-new-v1-backlog.md` P6-02 ("UAT institucional con datos
  no demo y acta de aceptación"): el acta formal sigue pendiente.
- Acción sugerida: producir el acta de aceptación (quién aprobó, sobre qué
  build/commit, con qué alcance y reservas) antes de considerar este punto
  cerrado para una auditoría externa o de cumplimiento.
- Con esto, de las 3 condiciones de liberación originales (HTTPS en VPS,
  aceptación humana, advisories), queda únicamente **P0-14 (HTTPS en VPS)**
  como bloqueador técnico sin resolver ni confirmar de ninguna forma.

### P0-14 — corrección: el overlay/runbook productivo SÍ existe, solo falta la ejecución

La descripción original de P0-14 (arriba) está desactualizada: afirma que
"Caddy/TLS existe solo en `demo/docker-compose.demo.yml`" y que "el compose
productivo base publica en loopback y no define dominio/certificados". Eso
ya no es cierto contra el código actual. VERIFIED IN CODE (2026-10-02):

- `docker-compose.prod.yml:222-252` define un servicio `caddy` real
  (`caddy:2.8.4-alpine`) que monta `infra/caddy/Caddyfile` (overridable vía
  `SIGI_CADDYFILE`), con `SIGI_ACME_EMAIL`/`SIGI_PUBLIC_DOMAIN`/
  `SIGI_ADMIN_DOMAIN` como variables reales de entorno, no valores demo.
- `infra/caddy/Caddyfile` — HTTPS automático vía ACME, HSTS, headers de
  seguridad, proxy a `sigi-api`/`frontend-sigi`, WMS/WFS/OWS de GeoServer
  permitidos explícitamente y el resto de `/geoserver/*` bloqueado (404).
  Existe además `Caddyfile.internal` (TLS autofirmado) para despliegues
  sin ACME público.
- `docker-compose.prod.yml:230-232` — **únicamente Caddy publica puertos**
  al host (`0.0.0.0:80`/`0.0.0.0:443`); Postgres, GeoServer, sigi-api,
  integration-service y gis-service no tienen `ports:` propio, solo son
  alcanzables vía la red interna de Compose.
- `docs/deployment/HETZNER-DEMO.md` — runbook completo y detallado (creación
  de servidor/DNS/firewall, `deploy-demo.sh` con backup previo, build,
  migraciones, healthchecks, bootstrap de GeoServer y validación HTTPS
  externa; más backup/rotación con systemd timers, restauración y
  rollback).

**Lo que sigue sin resolver, confirmado directamente con el responsable de
producto (2026-10-02): este runbook nunca se ha ejecutado contra un VPS real
con un dominio real apuntado.** Es decir, P0-14 pasa de "nada construido" a
**"construido y documentado, pendiente de primera ejecución real"** —
una diferencia material para quien priorice el trabajo restante: no hace
falta diseñar ni programar nada nuevo, solo ejecutar el runbook existente
contra infraestructura real (Hetzner u otro VPS) y confirmar el resultado
(`curl https://dominio/`, `curl https://dominio/api/health`, `ss -lntup`
mostrando únicamente 22/80/443 públicos, según la sección 6 del runbook).
