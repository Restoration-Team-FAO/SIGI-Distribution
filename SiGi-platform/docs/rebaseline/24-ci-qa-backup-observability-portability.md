# Sprint 2R — CI, pruebas, backup y observabilidad

## CI comparado

| Área | Baseline | RC | Decisión |
| --- | --- | --- | --- |
| ubicación workflows | `SiGi-platform/.github/workflows/*` | `.github/workflows/sigi-v1-p0a.yml` en raíz | PORTAR ubicación raíz; GitHub no descubre workflows anidados |
| build | npm ci, lint, unit y 3 builds | build + backend/data/security especializados | combinar |
| DB limpia/migrada | release gate baseline | job dedicado con clean DB, legacy migration e idempotencia | ADAPTAR a todos los módulos baseline |
| seguridad | smokes dispersos | CORS, auth, SSRF, upload, GeoServer password, edge | ADAPTAR |
| browser | suite baseline amplia + R1 | suite RC P0 reducida | conservar y sumar; no reemplazar |
| producción | Compose productivo y release gate | TLS edge, exposición y readiness recovery | ADAPTAR |
| artefactos | logs, métricas y `.env.production` | evidencia sin publicar env productivo | eliminar secreto/config completa de artefactos |

La RC tiene siete jobs: `build`, `security-config`, `service-hardening`,
`docker-api`, `database`, `api-audit` y `production-release-smoke`. VERIFIED IN
CODE: `.github/workflows/sigi-v1-p0a.yml` en `b3cbc6a7`. El baseline tiene dos
workflows, pero están dentro del subdirectorio de la plataforma; desde la raíz
real del repositorio no se ejecutan automáticamente.

## Cobertura que no debe perderse

La RC elimina suites unitarias de geo, exports, visibilidad y reportes, además
de los E2E country/admin/geo. El pipeline reconciliado deberá ejecutar como
conjunto mínimo:

1. `npm ci` desde checkout limpio;
2. typecheck, lint y builds de tres workspaces;
3. las 81 unitarias baseline y las nuevas pruebas RC;
4. pruebas Python de GIS, ZIP y SSRF;
5. DB limpia sin demo seed;
6. migración sobre dump baseline y verificación de todos los módulos;
7. smokes de roles, EGI, archivos, exports, publicaciones, métricas y GIS;
8. Playwright rebaseline 10/10 más recorridos funcionales existentes;
9. Compose productivo TLS y exposición edge-only;
10. backup/destrucción efímera/restore de DB + archivos + GeoServer;
11. artifacts sanitizados, sin `.env`, tokens ni dumps sensibles.

## Backup y restore

VERIFIED IN CODE: el baseline respalda DB, `sigi_files_data`, `geoserver_data`,
commit, imágenes y checksums. La RC agrega ruta externa absoluta, escritura
`.partial`, `chmod 600`, retención y test destructivo aislado, pero sólo respalda
PostgreSQL. La implementación objetivo debe ser la unión de ambas, nunca el
reemplazo del backup baseline por el DB-only de la RC.

## Observabilidad

| Capacidad | Situación | Portabilidad |
| --- | --- | --- |
| health/readiness | existe y consulta dependencias | preservar; portar prueba 503/recovery |
| request ID | generado y devuelto por API | preservar y propagar a Python/edge |
| métricas | API y Python exponen contadores in-memory | preservar; proteger endpoints y definir scraper |
| logs | estructurados parcialmente; Docker con rotación | parametrizar límites RC y sanitizar secretos |
| alertas/dashboards | no hay stack externo versionado | NOT VERIFIED; definir fuera de 2R |
| auditoría | existe DB + filtro HTTP, pero hay ruta pública | cerrar exposición sin perder trazabilidad |

## Hallazgos críticos

- **CI inactivo por ubicación:** mover/adaptar los workflows a `.github/workflows`
  en la raíz del repositorio.
- **Exposición de configuración:** `release-gate.yml` baseline incluye
  `.env.production` en el artifact. Debe retirarse antes de ejecutar con secretos
  reales y debe añadirse un test que rechace artifacts sensibles.
- **Gate RC incompleto funcionalmente:** un PASS RC no prueba archivos, EGI,
  reportes ni GIS multicapas porque esos módulos no existen en su árbol final.
- **Migración RC path-dependent:** tres wrappers `\ir` requieren que init y
  migrations estén montados con el layout esperado.

## Decisión

El workflow RC se clasifica **ADAPTAR**, no PORTAR: su estructura y controles
son el punto de partida, pero el contenido debe ejecutarse contra el catálogo
Sprint 1R y el esquema reconciliado.
