# Auditoría 360° del módulo de Proyectos

Fecha de corte: 2026-10-01  
Rama: `feature/ux-ui-v2`

## Alcance auditado

- Frontend único: `ProjectsModulePage`, `ProjectPlanningWorkspace`, rutas y cliente API.
- Backend: `ProjectsService`, controladores administrativo y público, guards de roles/permisos y auditoría.
- Persistencia: `core.projects`, portafolios, actores, hitos, entregables, indicadores, territorios, documentos, tareas, presupuesto básico y riesgos.
- Integraciones: Documents, Geo/BI, Reports, datasets, incidencias y auditoría.
- Datos DEMO Costa Rica y pruebas E2E.

## Estado actual real

| Capacidad | Estado | Fuente de verdad |
| --- | --- | --- |
| Ficha y cartera de proyectos | Funcional | `core.projects` / `core.project_portfolios` |
| Actores y responsables | Funcional | `core.project_actors` |
| Fases, actividades, tareas y dependencias | Funcional inicial | `core.project_tasks` / `core.project_task_dependencies` |
| Cronograma | Funcional, calculado desde tareas | API de detalle del proyecto |
| Hitos y entregables | Funcional básico | `core.project_milestones` / `core.project_deliverables` |
| Presupuesto | Funcional inicial | `core.project_budget_items` |
| Riesgos | Funcional inicial | `core.project_risks` |
| Indicadores | Lectura integrada | `core.project_indicators` y módulo Indicators |
| Territorio y mapa | Funcional | `core.project_territories`, geometrías GIS y Mapa SIGI |
| Documentos y evidencias | Funcional a nivel proyecto | dominio Documents y enlaces de archivo |
| Informes y actividad | Funcional | Reports y `core.audit_events` |
| Permisos | Funcional, demasiado agregado | `projects.read/create/update` |
| Datos DEMO | Funcional | `infra/postgres/demo/costa-rica-demo.sql` |

## Qué todavía es parcial o derivado solo en frontend

- El avance ponderado, vencimientos y totales presupuestarios se calculan en la vista; deben centralizarse en backend.
- El presupuesto básico no distingue planificación, ejecución o fuente externa.
- `funding_source` es texto libre; no existe una entidad trazable de fuentes.
- No hay versiones presupuestarias ni conservación formal de reprogramaciones.
- Comprometido y ejecutado están guardados como columnas acumuladas, sin movimientos trazables.
- No existen cortes históricos de seguimiento.
- No existen registros explícitos de problemas, decisiones y solicitudes de cambio.
- Las alertas del proyecto no se derivan mediante reglas centrales.
- El cierre se representa mediante estado general, sin checklist ni advertencias.
- Hitos y entregables no tienen todavía aprobación/evidencia suficientemente estructurada.
- La relación documental llega al proyecto, pero no a todos sus elementos operativos.

## Funcionalidad mock

No se identificaron llamadas simuladas en el flujo principal de Proyectos. Los datos de Costa Rica son deliberadamente DEMO, pero se persisten en PostgreSQL y son servidos por APIs reales. Algunas métricas visuales son derivaciones locales y no deben confundirse con una fuente financiera oficial.

## Inconsistencias y deuda técnica

1. `ProjectDetail` concentra múltiples agregados; es útil para lectura, pero crecerá demasiado si incorpora transacciones completas.
2. Los DTO de escritura están expresados como tipos internos o cuerpos inline del controlador; faltan DTOs reutilizables con validación declarativa.
3. `projects.update` permite hoy todas las mutaciones del workspace; no ofrece separación de funciones financieras.
4. No existe semántica para diferenciar presupuesto cero, desconocido, externo o no administrado.
5. La tabla `project_budget_items` mezcla línea presupuestaria y acumulados de ejecución.
6. No hay detección de ciclos de dependencias; la base solo evita autorreferencia directa.
7. El estado DEMO `planning` de un proyecto no pertenece al normalizador histórico de estados de proyecto.
8. La semilla DEMO tenía un conflicto no idempotente en indicadores; se corrigió para usar la PK estable.

## Riesgos de implementación

- Migrar acumulados financieros sin perder su significado histórico.
- Mostrar cifras comparables entre monedas o fuentes sin una tasa de cambio explícita.
- Cambiar un proyecto a `none` u `external` cuando ya posee datos financieros locales.
- Duplicar operaciones oficiales de un ERP en proyectos `external`.
- Sobrecargar el detalle principal con movimientos y documentos extensos.
- Introducir permisos nuevos sin asignarlos a roles existentes y bloquear recorridos actuales.

## Modelo objetivo consolidado

- Mantener `core.projects` como raíz y agregar configuración financiera ligera directamente allí.
- Mantener `project_tasks`, `project_task_dependencies`, `project_milestones`, `project_deliverables` y `project_risks`.
- Evolucionar `project_budget_items` como líneas presupuestarias compatibles.
- Agregar fuentes de financiamiento, versiones y movimientos financieros normalizados.
- Agregar registros de gobierno (`issue`, `decision`, `change_request`) y cortes de seguimiento.
- Calcular en backend un resumen 360°, resumen financiero y alertas derivadas.
- Mantener Documents, Indicators, Geo/BI y Reports como dominios fuente; Proyectos solo relaciona y navega.

## Plan de migración

1. Añadir configuración financiera nullable y modo `none|planning|execution|external` con valor explícito.
2. Clasificar el DEMO en los cuatro modos sin imponer presupuesto a datos existentes.
3. Agregar tablas financieras y de seguimiento sin eliminar `project_budget_items`.
4. Transformar los acumulados DEMO de partidas en movimientos consistentes para `execution`.
5. Incorporar endpoints anidados, permisos específicos y auditoría.
6. Exponer resumen 360°, alertas y navegación dinámica.
7. Cubrir reglas de modo financiero, integridad y regresión mediante pruebas.

## Decisiones de compatibilidad

- Las APIs y rutas existentes permanecen operativas.
- `projects.update` se conserva para edición general; las nuevas operaciones sensibles exigen permisos especializados.
- Los proyectos existentes se migran inicialmente a `none`, evitando interpretar ausencia de datos como cero financiero.
- Ningún registro histórico se elimina al cambiar de modo; el backend advertirá o bloqueará transiciones incompatibles.
