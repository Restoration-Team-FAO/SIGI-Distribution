# UX/UI V2 — Plan de migración

> **Actualización 2026-09-18:** este plan conserva validez para la modernización visual. La consolidación posterior de Country y Admin se ejecutará mediante las olas SF definidas en `14-single-frontend-migration-plan.md`; no se debe eliminar ningún frontend como parte de UX-1 a UX-5.

## Reglas de ejecución

- rama exclusiva `feature/ux-ui-v2`;
- backend, rutas, contratos y modelo de datos fuera de alcance;
- cada ola en commits separados;
- comparar siempre `5d18aace...feature/ux-ui-v2`;
- una pantalla no termina si pierde una acción, permiso, endpoint o resultado;
- no hacer merge sin aprobación explícita.

## UX-0 — Auditoría y arquitectura

Entregables: documentos `01` a `06`, baseline registrado y matriz de riesgo.
Gate: solo documentación y worktree protegido.

## UX-1 — Foundation

1. tokens CSS compartidos y reset accesible;
2. primitives de botón, campo, estado, badge, card, header y breadcrumb;
3. shell Admin y Country con navegación por dominios;
4. topbar centrada en contexto/EGI/usuario;
5. regresión del login, rutas y permisos.

Commits previstos:

```text
ux: introduce design tokens and primitives
ux: redesign application shell
```

## UX-2 — Core

Dashboard, Projects list, Project workspace y territorio relacionado. Extraer
la lógica existente sin cambiar servicios. Gate: crear/editar/leer proyecto,
permisos y deep links verdes.

## UX-3 — GIS/Data

GIS workspace de referencia y luego fuentes, imports, calidad, Kobo/Odoo. Gate:
Playwright mapa/tabla/ficha/export y smokes GIS/API existentes.

## UX-4 — Administration

Instituciones, usuarios, roles, EGI y auditoría usando patrones validados. Gate:
edición EGI, usuarios/roles, aislamiento y trazabilidad.

## UX-5 — Auxiliary

Archivos, reportes, ayuda y vistas restantes. Eliminar duplicación solo después
de migrar cada consumidor y verificar sus flujos.

## Estrategia de pruebas

- mantener los 20 E2E del baseline;
- agregar aserciones por pantalla de referencia, permisos y responsive;
- registrar screenshots de baseline y candidata en viewports definidos;
- ejecutar typecheck/build por frontend en cada commit;
- al cerrar cada ola: unitarias, E2E completo y release gate funcional;
- revisar `git diff 5d18aace...feature/ux-ui-v2` para excluir backend y cambios
  accidentales.

## Definition of Done de primera fase

- UX-0 a UX-3 completos para las cuatro referencias;
- shell y design system reutilizables;
- 20/20 E2E baseline más pruebas UX nuevas;
- sin cambios en `apps/sigi-api`, migraciones ni contratos;
- comparación visual/funcional documentada;
- aprobación explícita antes de merge.
