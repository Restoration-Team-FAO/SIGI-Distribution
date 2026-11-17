# Arquitectura objetivo del módulo de Proyectos

## Propósito

Proyectos es la ficha 360° desde la cual SIGI relaciona planificación, seguimiento, indicadores, mapa, documentos, informes y auditoría. La gestión financiera es una capacidad opcional del proyecto y no una precondición para usarlo.

```text
Frontend SIGI único
  └─ Workspace de proyecto (navegación por permisos y modo)
       └─ sigi-api /admin/projects/:id/*
            ├─ core.projects y relaciones actuales
            ├─ planificación y dependencias
            ├─ presupuesto y movimientos
            ├─ seguimiento y gobernanza
            ├─ Documents / Indicators / Geo-BI existentes
            └─ audit.events
```

## Fronteras y fuentes de verdad

- `sigi-api` aplica alcance EGI, permisos, validaciones, cálculos y auditoría.
- PostgreSQL/PostGIS conserva estado e integridad. No se introdujo otra tecnología.
- `core.projects.financial_management_mode` determina las capacidades financieras.
- `core.project_budget_versions` conserva el histórico aprobado del presupuesto.
- `core.project_financial_movements` es la fuente de compromisos y pagos. Los campos heredados `committed_amount` y `actual_amount` se mantienen por compatibilidad, pero la interfaz ya no los edita ni los usa como fuente de verdad.
- Indicators, Documents y Geo-BI siguen siendo dominios existentes; Proyectos enlaza o navega a ellos y no los duplica.
- `audit.events` continúa como bitácora transversal.

## Áreas del workspace

| Área | Responsabilidad |
| --- | --- |
| Resumen | identidad, métricas funcionales, salud, alertas y configuración financiera |
| Planificación | EDT/WBS de fase, actividad y tarea; responsables, fechas, avance y dependencias |
| Cronograma | representación temporal de la misma planificación |
| Presupuesto / Finanzas | contenido dinámico según modalidad financiera |
| Seguimiento | hitos, entregables, alertas, cortes históricos y cierre |
| Riesgos y cambios | riesgos, problemas, decisiones y solicitudes de cambio |
| Indicadores | reutiliza indicadores y observaciones existentes |
| Mapa | abre el visor SIGI filtrado por proyecto |
| Documentos | reutiliza el explorador documental y relaciones existentes |
| Informes | reutiliza el motor de reportes/BI |
| Actividad | auditoría del proyecto |

## Modalidades financieras

| Modo | Presupuesto local | Movimientos locales | Resumen financiero |
| --- | --- | --- | --- |
| `none` | No | No | No aplica; valores `null` |
| `planning` | Sí | No | inicial, vigente y variación |
| `execution` | Sí | Sí | vigente, comprometido, ejecutado, disponible y porcentajes |
| `external` | No transaccional | No | totales informados, fuente y corte externo |

La pestaña financiera no existe para `none`; se denomina Presupuesto, Finanzas o Finanzas externas en los otros modos. La API rechaza operaciones incompatibles aunque se invoque directamente la URL.

## Seguridad

Los recursos anidados conservan `project_id` y alcance EGI. La escritura utiliza permisos especializados:

- `projects.planning.manage`
- `projects.budget.read`, `projects.budget.manage`, `projects.budget.approve`
- `projects.finance.read`, `projects.finance.manage`
- `projects.risks.manage`
- `projects.close`

La lectura del detalle redacta fuentes, versiones, movimientos y resumen financiero cuando el usuario no tiene permisos financieros. Las operaciones sensibles registran actor, recurso, resultado y detalle en la auditoría existente.

## Evolución compatible

Las migraciones son aditivas. Los datos heredados permanecen, `initial_amount` se inicializa desde `planned_amount` y ningún cambio de modalidad elimina registros. El cambio hacia una modalidad no transaccional exige una confirmación cuando ya existen datos locales.

## Extensiones siguientes

La arquitectura deja campos para fechas reales, colaboradores, aprobación de hitos/entregables y documentos soporte. Su exposición completa en formularios debe continuar sobre estas entidades, sin crear tablas o visores paralelos.
