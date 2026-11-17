# 13 — Resultado de Fase 5: Indicadores

Fecha: 2026-09-22  
Rama: `feature/ux-ui-v2`

## Resultado

Se cerró el gap que impedía iniciar esta fase: Indicadores dispone ahora de un contrato autenticado, permiso backend y scope EGI explícito. El catálogo público `/indicators` se conserva sin cambios; la operación interna vive en `/admin/indicators` dentro del AppShell único.

| Vista | URL | Información real |
| --- | --- | --- |
| Catálogo | `/admin/indicators?view=catalog` | definiciones, último valor y conteos del EGI |
| Ficha | `?view=detail&indicator=<code>` | identidad, unidad, estado y resumen |
| Metas | `?view=targets&indicator=<code>` | línea base, meta y avance por proyecto |
| Resultados | `?view=results&indicator=<code>` | observaciones, datasets de evidencia y validación declarada |
| Territorio | `?view=territory&indicator=<code>` | territorios de los proyectos que reportan el indicador |
| Actividad | `?view=activity&indicator=<code>` | auditoría de indicadores/proyectos vinculados |

Las pestañas conservan el código del indicador en la URL, admiten recarga y no sustituyen la navegación global. Proyectos enlaza a la ficha del indicador; Indicadores enlaza de regreso al proyecto y abre su cobertura en Territorio SIGI.

## Seguridad y alcance

- Se creó el permiso `indicators.read` y se asignó a los seis perfiles operativos existentes.
- `GET /api/admin/indicators` y `GET /api/admin/indicators/:code` exigen bearer token y `indicators.read`.
- El scope se resuelve con la misma política `active/global` del resto de la consola.
- Valores, metas, resultados, territorios, evidencia y auditoría se filtran mediante `projects.egi_id`.
- Las definiciones de `core.indicators` continúan siendo catálogo global; nunca exponen por sí mismas resultados internos de otro EGI.
- La vista global solo se habilita cuando el backend autoriza `scope.global.read`.

La migración es idempotente y existe tanto para instalaciones limpias como para bases ya desplegadas:

- `infra/postgres/init/016_indicators_workspace_permissions.sql`;
- `infra/postgres/migrations/20260922_indicators_workspace_permissions.sql`.

## Límites honestos del modelo

Esta fase no añadió edición de definiciones, metas ni observaciones porque no existe aún un contrato de escritura gobernado para esas entidades. “Validación” presenta exclusivamente `validation_status` y evidencia de datasets ya vinculados al proyecto. Cuando no existe una relación, la interfaz muestra un estado vacío en lugar de inferir datos.

## Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `npm run build:admin` | PASS, 112 módulos |
| `npm run build:api` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 92 Node + 6 Python |
| `npm run smoke:roles` | PASS, 42/42; Indicadores 200 en los seis perfiles |
| `npm run test:e2e` | PASS, 29/29 (25 admin + 4 portal de referencia) |
| `npm run smoke:unified-frontend` | PASS, 50/50 |
| Docker `sigi-ux-v2` | frontend, API, PostgreSQL, GIS y GeoServer saludables |

Docker de revisión:

- aplicación unificada: `http://127.0.0.1:5374`;
- referencia Country: `http://127.0.0.1:5373`;
- API: `http://127.0.0.1:3200/api`;
- GeoServer: `http://127.0.0.1:8281`;
- imagen frontend: `sha256:2672319b34e30669241375c6466a25577265c2e92e2bf0d90e2b3c7927bd251e`.
