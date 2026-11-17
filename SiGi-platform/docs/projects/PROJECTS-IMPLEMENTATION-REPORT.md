# Reporte de implementación — Proyectos y presupuesto v2

Fecha de validación: 2026-10-01  
Rama: `feature/ux-ui-v2`

## Resultado

El workspace de Proyectos fue ampliado a planificación, cronograma, finanzas opcionales, seguimiento histórico, salud, gobernanza y cierre. La API, persistencia, permisos y demo diferencian `none`, `planning`, `execution` y `external` sin interpretar “no gestionado” como cero.

## Cambios principales

- Navegación dinámica y compacta por modalidad financiera.
- Panel de salud con alertas navegables derivadas de hechos persistentes.
- Fuentes de financiamiento, versiones y aprobación presupuestaria.
- Movimientos de compromiso, devengo, pago, desembolso, ajuste y transferencia.
- Fórmulas centralizadas en backend.
- Problemas, decisiones y solicitudes de cambio.
- Cortes periódicos de seguimiento.
- Flujo de cierre con checklist, advertencia de pendientes y auditoría.
- Permisos especializados y redacción de información financiera en lectura.
- Datos Costa Rica para los cuatro modos.

## Migraciones

- `20261001_project_planning_workspace.sql`: tareas, dependencias, partidas y riesgos.
- `20261002_project_full_cycle.sql`: configuración financiera, fuentes, versiones, movimientos, gobernanza, cortes, cierre y permisos.
- Réplicas de inicialización: `018_project_planning_workspace.sql` y `019_project_full_cycle.sql`.
- `infra/postgres/migrations/manifest.txt` actualizado.

## API

Recursos nuevos o reforzados bajo `/api/admin/projects/:id`:

- `/tasks`, `/budget-items`, `/risks`
- `PATCH /financial-settings`
- `/funding-sources`
- `/budget-versions` y `/:versionId/approve`
- `/financial-movements`
- `/management-records`
- `/status-updates`
- `POST /close`

El detalle del proyecto incluye configuración/resumen financiero, fuentes, versiones, movimientos, registros de gestión, cortes y alertas. Las reglas críticas se ejecutan en el servicio y las rutas están protegidas por permisos específicos.

## Demo verificable

| Proyecto | Modo | Cobertura |
| --- | --- | --- |
| CR-SJLS-002 | `none` | gestión funcional sin cifras financieras falsas |
| CR-TEMP-003 | `planning` | fuente, versión y partidas; sin movimientos |
| CR-OSA-001 | `execution` | dos fuentes, versiones, ajuste, compromisos, pagos, riesgos y tres cortes |
| CR-CARIBE-004 | `external` | Odoo institucional, referencia, totales, fuente, sincronización y corte |

Totales de CR-OSA-001: presupuesto inicial USD 1.590.000; ajuste +USD 160.000; vigente USD 1.750.000; comprometido USD 890.000; pagado USD 640.000. Los proyectos `none` y `external` no tienen transacciones locales.

## Validaciones ejecutadas

- `npm run typecheck`: correcto para UI, frontend y API.
- Pruebas unitarias de política financiera: 4/4 correctas.
- Build Docker de `sigi-api`: correcto.
- Build Docker de `frontend-sigi`: correcto.
- `project-planning.spec.js` y `project-finance-api.spec.js`: 6/6 correctas; regresión BI incluida: 8/8 E2E correctas.
- Reglas cubiertas: modalidades, `null` vs cero, permisos, sobrecompromiso, cambio de modo con historial y cierre con pendientes.
- Migración y seed ejecutados con `ON_ERROR_STOP=1`.
- Stack local `sigi-ux-v2`: servicios saludables; frontend `http://127.0.0.1:5374`, API `http://127.0.0.1:3200/api`.

## Rutas de revisión manual

- `/projects/30000000-0000-4000-8000-000000000001/summary` — ejecución completa.
- `/projects/30000000-0000-4000-8000-000000000002/summary` — sin finanzas.
- `/projects/30000000-0000-4000-8000-000000000003/budget` — planificación.
- `/projects/30000000-0000-4000-8000-000000000004/budget` — fuente externa.

## Archivos de implementación relevantes

- `ProjectPlanningWorkspace.tsx`, `ProjectLifecycleWorkspace.tsx`, `ProjectsModulePage.tsx`
- `project-workspace.ts`, `services/api.ts`, `styles.css`
- `projects.service.ts`, `admin.controller.ts`
- `libs/domain/src/index.ts`
- migraciones y `costa-rica-demo.sql`
- pruebas E2E de proyectos y reglas financieras

## Deuda técnica explícita

- Los campos avanzados agregados a tareas, hitos y entregables aún necesitan exposición completa en formularios y endpoints tipados.
- Los DTO se expresan todavía como tipos de controlador/`Record<string, unknown>` en los recursos recientes; conviene migrarlos a clases validadas y actualizar OpenAPI.
- Falta la vinculación documental granular a cada tarea, hito, riesgo o movimiento; hoy se reutiliza la relación documental a nivel de proyecto y `support_file_id` preparado.
- No se implementaron PV/EV/AC, SPI o CPI porque no existe todavía una programación de costo temporal con semántica suficiente; mostrarlos ahora sería decorativo.
- Exportaciones específicas CSV/XLSX por subtabla deben integrarse al sistema de reportes existente, no duplicarse en el workspace.
- La ruta crítica y la programación presupuestaria por periodo requieren cálculo adicional; dependencias y periodos ya quedan modelados.
- Los agregados institucionales financieros deben adoptar la misma clasificación por modalidad en una iteración del portafolio.

Estas limitaciones no son mocks: se mantuvieron fuera para evitar una segunda fuente de verdad o cálculos sin base suficiente.
