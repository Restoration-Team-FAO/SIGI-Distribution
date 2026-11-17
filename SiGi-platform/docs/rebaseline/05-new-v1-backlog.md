# Backlog V1 reconstruido desde el baseline correcto

## P0 blocker

Cada P0 referencia el bloqueador homónimo de `03-current-blockers.md` y hereda
su evidencia y riesgo.

Estado tras el cierre técnico de 8R: P0-01 a P0-13 están cerrados en código y
en una candidata reconstruida desde volumen vacío. P0-14 conserva pendiente la
ejecución HTTPS en un VPS institucional limpio, aunque el overlay y runbook ya
existen. La liberación también espera UAT humana y decisión sobre advisories.

| ID | Problema | Implementación | Dependencias | Aceptación y tests | Riesgo |
| --- | --- | --- | --- | --- | --- |
| P0-01 | auditoría pública | proteger/eliminar `/api/audit`, permission + EGI | ninguna | anónimo 401/403; matriz RBAC negativa | fuga PII |
| P0-02 | SSRF Kobo/Odoo | política de egress, DNS/IP/redirect validation | allowlist institucional | IPv4/IPv6/rebinding/redirect suite | compromiso red interna |
| P0-03 | seed demo productivo | separar schema/bootstrap/demo opt-in | bootstrap mínimo | DB limpia sin demo; demo explícito conserva fixtures | integridad/reputación |
| P0-04 | aislamiento multi-EGI | scoping uniforme en reads/writes | fixtures deterministas | UAT completo y pruebas IDOR | fuga/mutación cruzada |
| P0-05 | `project.code` nullable rompe GIS | migración/backfill o null-safe contract | decisión de dominio | migration + role/geo smoke | catálogo inoperante |
| P0-06 | dashboards ficticios | conectar datos reales o retirar/rotular demo | alcance V1 | cero fixtures en build productivo | cifras oficiales falsas |
| P0-07 | CORS local | allowlist por entorno validada | dominios | preflight positivo/negativo | app inutilizable/insegura |
| P0-08 | rate limiter/proxy | trusted proxy y buckets compatibles con gates | topología | spoof negativo + gate completo | evasión/CI no determinista |
| P0-09 | uploads | firmas y límites zip descomprimidos | límites negocio | corpus adversarial | DoS/parsing inseguro |
| P0-10 | credencial GeoServer | rol read-only GIS | grants/vistas | WMS funciona; acceso core denegado | escalamiento DB |
| P0-11 | territorio legacy sin límite | paginar/retirar | frontend | carga masiva acotada | DoS |
| P0-12 | smokes no autocontenidos | setup/teardown y Compose project dinámico | P0-03/04/05 | dos ejecuciones verdes desde cero | gate no confiable |
| P0-13 | E2E 2/7 | resolver contratos y fixtures | P0-04/05/12 | 7/7 y artefactos CI | regresiones críticas |
| P0-14 | TLS institucional | overlay productivo y runbook | dominios/certs | VPS HTTPS-only | credenciales en claro |

## P1 functional consolidation

- P1-01: sustituir widgets/botones UI-only o conectarlos a acciones reales.
- P1-02: completar reportes (edición, historial, artefactos) y su lineage.
- P1-03: cerrar flujos dorados de proyectos, indicadores, Excel, shapefile,
  mapa, publicación y documentos.
- P1-04: decidir y documentar catálogos/schemas públicos hoy hardcoded.

## P2 data/integrity

- P2-01: reconciliar `init` y `migrations` con una tabla/ruta de versiones.
- P2-02: probar upgrade desde copia del baseline y downgrade/rollback.
- P2-03: revisar JSONB schemas, cascades y FKs de lineage aún no demostradas.
- P2-04: prueba de escala de índices PostgreSQL/PostGIS con datos realistas.

## P3 hardening

- P3-01: MFA o integración OIDC/SSO según política institucional.
- P3-02: CORS GeoServer, headers de seguridad, CSP y gestión de sesión frontend.
- P3-03: resolver o aceptar formalmente la auditoría productiva actual: 3 high,
  8 moderate y 1 low (`npm audit --omit=dev`, 2026-09-17).
- P3-04: política de secretos/rotación y pruebas de credenciales cifradas.

## P4 operations

- P4-01: ejecutar backup/restore completo y definir retención/off-site.
- P4-02: runbooks de deploy, upgrade, rollback y recuperación de desastre.
- P4-03: alertas/SLO a partir de métricas, health, logs y correlation ID.
- P4-04: publicación/versionado inmutable de imágenes y SBOM.

## P5 QA

- P5-01: tests Python y contratos API (actualmente no se encontró pytest).
- P5-02: E2E por rol y EGI, uploads adversariales y datasets grandes.
- P5-03: pruebas visuales/accessibility y navegadores soportados.
- P5-04: ensayo de carga de GIS, imports, reportes y rate limiting.

## P6 release

- P6-01: ensayo completo Gate G en Ubuntu/VPS limpio.
- P6-02: UAT institucional con datos no demo y acta de aceptación.
- P6-03: freeze, tag firmado, artefactos, hashes y plan de rollback.
- P6-04: decisión Go/No-Go basada en todos los P0 cerrados y gates verdes.
