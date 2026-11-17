# 10 — Reevaluación SIGI–MIDA sobre la versión aprobada v2.0.1

**Versión evaluada:** `feature/ux-ui-v2` @ `df3cc033` (= contenido funcional de **v2.0.1**; el tag solo agrega control de versiones).
**Línea base:** diagnóstico SIGI–MIDA del 2026-10-13 sobre `release/sigi-v1-rc` @ `b3cbc6a7` (documentos 00–09, rama `feature/sigi-platform-f0-f1`).
**Método:** cuatro auditorías de solo lectura (modelo/API/ingesta; GIS/BI/reportes; seguridad/operación; frontend), con citas `ruta:línea` relativas a `SiGi-platform/` en `df3cc033`. Pruebas offline: 150/150 unitarias Node en v2.0.1 y Python 6/6. **No se ejecutaron** E2E/Playwright ni smokes contra la pila: nada de lo que sigue queda en `REAL_VALIDADO` salvo donde se indica.
Estados: **RESUELTO · MEJORADO · IGUAL · PEOR · NUEVO**.

---

## 1. Conclusión

v2.0.1 es **mejor plataforma para el piloto MIDA en gestión de proyectos**:
- frontend único con permisos y menús filtrados por rol;
- planificación, presupuesto, riesgos e informes de estado por proyecto;
- evidencias con SHA-256;
- importación por `institution_editor` con perfiles de mapeo persistentes;
- mapa con intersección PostGIS;
- respaldos completos (incluido GeoServer).

Pero **no cambia lo esencial para el informe de restauración** (sin entidades de intervención, práctica o beneficiario; sin área única; sin captura de línea base, meta ni observaciones; sin validación por registro). Además **empeora la seguridad** en tres frentes críticos. **Dictamen para el piloto MIDA: se mantiene GO_CON_CONDICIONES**, con tres condiciones nuevas e innegociables antes de cargar cualquier dato MIDA:
1. rotar las credenciales de arranque;
2. cerrar la fuga H-01 (OGC y `/api/geo`);
3. dejar de devolver los secretos de conectores.

## 2. Hallazgos críticos nuevos (bloquean cargar datos MIDA)

| ID | Hallazgo | Evidencia | Mitigación sin código | Corrección de producto (v2.0.2) |
|---|---|---|---|---|
| **V2-01** | **7 cuentas `*@sigi.local` (superadmin, national-admin, editor, …) con contraseñas conocidas en toda instalación productiva**: hashes versionados en `initdb`, y `998_remove_operational_seed.sql` no los elimina | `infra/postgres/init/002_core_schema.sql:133-193`; `infra/postgres/init/009_auth_identity.sql:31-60`; `infra/postgres/production/998_remove_operational_seed.sql:5-20`; las contraseñas por defecto de `scripts/*.mjs` coinciden con esos hashes | Rotar todas las claves tras instalar (lo hace `infra/gcp/remote-install.sh` en GCP); revisar la demo de Hetzner y los entornos locales | Bootstrap sin identidades versionadas (admin inicial con secreto del `.env`, como en la línea v1) |
| **V2-02** | **H-01 ampliada:** además de WMS/WFS anónimo, `/api/geo/layers/:code/features` y `/export` (CSV/XLSX/GeoJSON) son anónimos y exponen polígonos y títulos de proyectos internos; `project_polygons` sigue forzada a pública; visibilidad *fail-open*; **ningún import de capas por la UI permite elegir visibilidad** | `apps/sigi-api/src/modules/geo/geo.controller.ts:27-35,211,247-330`; `geo.service.ts:662-743`; `projects.service.ts:1799-1812,1830`; `geospatial-catalog.service.ts:1727-1729`; `infra/postgres/init/008_geoserver_public_views.sql:1-14`; `GeospatialCatalogPage.tsx` | Bloquear `/geoserver/*` **y** `/api/geo/*` anónimos en Caddy y nginx; cargar capas OSIGA por API con `internal` | Portar F1-01/F1-02 de f0-f1 y extenderlos a `/api/geo` (autenticación + filtro por visibilidad de proyecto) |
| **V2-03** | `credentialSecret` sigue en las respuestas de `/admin/connectors`; además `institution_editor` tiene `connectors.read` y `listAll` no filtra por EGI → ve secretos de **todas** las instituciones | `connectors.service.ts:196`; `admin.service.ts:3269` | Token Kobo de solo lectura; restringir `connectors.*` al rol TI | Portar F1-03 (`redactSecrets`) |
| **V2-04** | Credenciales Odoo **reales** versionadas en `SIGI-FIAES/demo/.env` (raíz del repositorio, ambas ramas) | `SIGI-FIAES/demo/.env` | **Rotar en Odoo ya**; retirar del índice | Política de secretos y escaneo en CI |
| **V2-05** | Escrituras de planificación y finanzas toman el EGI de la cabecera `x-sigi-egi-id` sin validar la membresía; sin cabecera no filtran (posible escritura entre instituciones; **por verificar en la pila**) | `admin.controller.ts:1450-1455`; `projects.service.ts:2248` | Una institución por instancia | Validar la membresía del EGI en el guard |
| **V2-06** | `GET /api/projects/:id` anónimo expone presupuesto, movimientos y riesgos de proyectos públicos | `projects.controller.ts:73-81` | No publicar proyectos MIDA (`visibility=internal`) | Recortar la vista pública |

Otros riesgos de seguridad:
- Bloqueo por intentos fallidos: **PEOR** (ni siquiera existe la columna).
- Reset de BD: **IGUAL**, porque `verify-env` exige la passphrase y la comparación no es de tiempo constante.
- La API y los servicios Python siguen corriendo como root.
- Hay secretos en claro en archivos locales ignorados del worktree ux-v2 (`.env.production`, `.bak`, `.run/*.resolved.yml`).

## 3. Lo que mejoró y sirve al piloto sin desarrollo

| Área | Antes (v1-rc) | v2.0.1 | Uso en el piloto MIDA |
|---|---|---|---|
| Perfiles de mapeo de importación | DISEÑADO | **MEJORADO**: escribibles en `/admin/data/mappings`; importa `institution_editor` | El enlace UAVCC carga sin superadmin; plantillas reutilizables |
| Planificación/PbR (P02, P04, P06) | NO_EXISTE | **MEJORADO**: 9 tablas, 22 endpoints (tareas, partidas, fuentes, versiones de presupuesto, movimientos, riesgos, cierre) | Demostración PAT/PbR acotada por proyecto (estilo PMO). Cobertura estimada de hojas MIDA: 04 ≈30 %, 05 ≈15 %, 06 ≈25 %, 09 ≈45 %, 10 ≈60 %, 12 ≈15 % |
| Evidencia (R17) | DISEÑADO | **MEJORADO**: archivos con SHA-256 y versiones (vínculos sin FK) | Adjuntar actas y fotos a proyecto/intervención |
| Informes (R22, P1-05) | NO_EXISTE | **MEJORADO**: flujo borrador → aprobación → publicación; JSON con SHA-256; XLSX/ICS de compromisos | Trazabilidad de entregas. **Sin PDF ni informe de restauración** |
| Puntos (R05) | NO_EXISTE | **MEJORADO**: geometría mixta (solo vía Kobo) | Coordenadas de intervención desde Kobo |
| Análisis espacial | Demo booleana | **NUEVO**: intersección PostGIS entre capas en el servidor | Cruce de intervenciones con límites y áreas protegidas |
| Roles y menús (G01) | Sin ocultar menús | **RESUELTO** en la UI; EGI y permisos en BD | Perfiles MIDA con menús propios. Revisar que `institution_editor` tiene `connectors.*` y `sources.delete` |
| Respaldos (BK-01..03) | Postgres | **MEJORADO**: Postgres + GeoServer + archivos + configuración, SHA-256, rotación, restore ensayado en CI | Cumple la condición de respaldo del checklist |
| Topología | 8 contenedores sin límites | **MEJORADO**: frontend único, `mem_limit` en 9 servicios, GeoServer con Xmx 3 GB | VM de 16 GB adecuada |
| Usuarios | Solo alta | **MEJORADO**: crear, editar, desactivar y CRUD de roles | Altas y bajas del piloto sin API |

## 4. Lo que sigue igual (brechas vigentes para restauración e informe)

| Necesidad MIDA | Estado v2.0.1 | Evidencia |
|---|---|---|
| Entidades intervención, finca, práctica y beneficiario (R01–R03, R12, P1-02, P1-11) | IGUAL, NO_EXISTE (intervención = proyecto; `theme` libre; sin campo práctica) | — |
| Proyectos importados aparecen en el EGI activo | **NUEVO defecto**: se crean sin `egi_id` | `imports.service.ts:1999-2008` frente a `projects.service.ts:2883-2885` |
| Línea base, meta y observaciones de indicadores capturables (P01, R08) | IGUAL: solo lectura; el catálogo es global y `current_value` es "último valor gana" | `indicators.service.ts`; `imports.service.ts:2115` |
| Observación por territorio | IGUAL, NO_EXISTE | `004_import_pipeline_schema.sql:127-141` |
| Acumulado y área única sin doble conteo (R09, R10, P1-01) | IGUAL, NO_EXISTE (sin `ST_Union`; el KPI suma solapes) | `geo-bi.service.ts:108,140`; `geo.service.ts:437-443` |
| Validación por registro (R18, P1-03) | IGUAL, DISEÑADO (columnas sin uso) | — |
| Importación atómica y con rollback (P1-06) | IGUAL; además `BEGIN`/`COMMIT` se ejecutan sobre el pool (sin transacción real) en perfiles de mapeo | `imports.service.ts:871,957,1021,1092` |
| Fechas (P1-09) | IGUAL; una fecha inválida se guarda como `1970-01-01` sin error | — |
| CRS GeoJSON, `.prj` ausente, KML/GPKG, `ST_MakeValid` (P1-07, P2-03) | IGUAL (solo se cuenta la invalidez en el perfil de capa) | `shapefile_ingest.py:445-473,734`; `geospatial-catalog.service.ts:405` |
| Filtros BI de período y territorio en servidor; tablero compartido | IGUAL (BI en `localStorage`; "Exportar PDF" = `window.print()`) | `geo-bi.controller.ts:23-69`; `BiVisualizerPage.tsx:354-493` |
| Catálogo territorial oficial; país configurable | IGUAL: defaults de CR y SV (`settings.py:72-76`, `.env.production.example:66-67`); centro de mapa en CR; unos 69 `es-CR` | `MultiLayerMap.tsx:254` |
| Configuración por institución y branding | **PEOR**: se eliminó `institution_settings`; logo y colores fijos en el código | `libs/ui/src/tokens.css:6-14`; `AppShell.tsx:322,331` |
| Conectores SIGAP/BPTA (MySQL, SQL Server) | IGUAL, NO_EXISTE | — |
| Bridge/FERM | IGUAL, MOCK; la UI dice "Paquete FERM" y "Puente: Operativo" | `services/bridge/src/index.ts:1-11`; `FlowPage.tsx:113`; `GeoBiModulePage.tsx:4222` |
| Datos demo en la UI | Personas demo y bloque "Taller Guatemala" fijos | `GeoBiModulePage.tsx:192-262` |

## 5. Mejoras priorizadas para v2.0.2 y siguientes

**v2.0.2 (seguridad, antes de cargar cualquier dato MIDA). Esfuerzo estimado: 6–9 días.**
1. V2-01: bootstrap sin credenciales versionadas y rotación obligatoria.
2. V2-02: H-01 completa (vistas, `/api/geo`, *fail-closed*, selector de visibilidad en los imports), portando F1-01/F1-02.
3. V2-03: `redactSecrets` y alcance de `connectors.read`, portando F1-03.
4. Bloqueo por intentos (F1-06) y reset apagado por defecto (F1-05).
5. V2-05 y V2-06: validar la membresía EGI en escrituras y recortar `GET /api/projects/:id` anónimo.
6. Defectos de importación: EGI en los proyectos importados (N-01), transacción real (N-02), error explícito en fechas inválidas.

**v2.1.0 (publicada el 2026-10-14): mejora del módulo Mapa.** Mapa base operativo, Visor unificado (capas, ficha, tabla), enfoque por proyecto y vista compartible. Ver `CHANGELOG.md`. Por este motivo el plan que sigue se renumeró: restauración pasa a v2.2.0 y plataforma institucional a v2.3.0.

**v2.2.0 (restauración, habilita el informe MIDA). Esfuerzo estimado: 30–40 días.**
- Modelo intervención, práctica (N:M) y unidad espacial (F4-01/02).
- Línea base, meta y observaciones capturables por territorio y período (F5-01).
- Área única con traslapes reportados (F5-03).
- Validación por registro (F5-04).
- Informe de restauración exportable (F6-03).

**v2.3.0 (plataforma institucional):** configuración y branding por instancia (sustituye los literales de CR/SV y el logo fijo), conectores SQL de solo lectura (SIGAP/BPTA), y BI persistente compartido.

**Retirar o corregir etiquetas engañosas** ("Paquete FERM", "Puente: Operativo") en v2.0.2. Es una corrección de bajo costo.

## 6. Impacto en el plan del piloto (06)

- **Fase 0:** sumar la rotación de credenciales (V2-01/V2-04) y la regla de bloquear `/api/geo/*` y `/geoserver/*` anónimos.
- **Fase 2:** usar los perfiles de mapeo persistentes en lugar del JSON por carga (ahorra unos 0,5 días). Las capas OSIGA solo se cargan por API con visibilidad `internal` hasta v2.0.2.
- **Fase 5 (PAT/PbR):** la demostración puede usar el espacio de planificación y presupuesto por proyecto (más completo que en el diagnóstico), sin presentarlo como PAT institucional.
- **Duración:** los 29 días siguen siendo válidos para `piloto_minimo` **solo si v2.0.2 está desplegada antes de D0**. En caso contrario aplica `piloto_condicionado` (+6–9 días).
