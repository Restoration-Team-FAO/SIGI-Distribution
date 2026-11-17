# Modelo de datos del ciclo de proyectos

## Núcleo

`core.projects` conserva identidad, institución, portafolio, fechas, estado, avance y geometría relacionada. La migración `20261002_project_full_cycle.sql` agrega configuración financiera, datos externos y cierre sin crear una entidad 1:1 innecesaria.

Campos principales agregados:

- `financial_management_mode`
- `financial_base_currency`
- `financial_source_system`, `external_project_code`, `external_financial_url`
- `financial_data_source`, `financial_update_method`, `financial_sync_status`
- `financial_data_cutoff_date`, `financial_data_last_updated_at`
- totales externos con nulabilidad explícita
- `actual_end_date`, `closure_summary`, `lessons_learned`, `closed_by_user_id`

## Relaciones

```text
projects
├─ project_tasks ──< project_task_dependencies
├─ project_milestones
├─ project_deliverables
├─ project_risks
├─ project_management_records
├─ project_status_updates
├─ project_funding_sources
├─ project_budget_versions
├─ project_budget_items
│    └─< project_financial_movements
├─ project_indicators → indicators / indicator_values
├─ project_territories → PostGIS / Geo-BI
├─ project_files → Documents
└─ audit.events
```

## Entidades nuevas

### `project_funding_sources`

Fuente y financiador, moneda, montos aprobado/recibido, vigencia, restricciones, estado y actor creador/actualizador. Código único dentro del proyecto.

### `project_budget_versions`

Número único, nombre, motivo, fecha efectiva, estado, total, variación, aprobación y documento soporte. Es el histórico presupuestario; nunca se actualiza una versión anterior para simular otra.

### `project_financial_movements`

Movimiento tipado (`allocation`, `commitment`, `accrual`, `payment`, `disbursement`, `adjustment`, `transfer`), partida origen/destino, fuente, tarea, fecha, moneda/tipo de cambio/base, contraparte, concepto, referencias, soporte, estado y aprobadores.

### `project_management_records`

Entidad consolidada y tipada para `issue`, `decision` y `change_request`. Conserva solicitante, responsable, aprobador, fechas, impacto, valor anterior/propuesto, resolución y soporte.

### `project_status_updates`

Corte temporal con avance físico, avance financiero solo cuando aplica, modo del dato, resumen, logros, retrasos, riesgos, problemas, decisiones, próximos pasos, responsable y aprobación.

## Entidades ampliadas

- `project_tasks`: fechas reales, prioridad, restricción, colaboradores, comentarios y origen del avance.
- `project_milestones`: responsable, tarea relacionada, criterios, evidencia, aprobación y observaciones.
- `project_deliverables`: tarea relacionada, aprobación, aprobador, archivo de evidencia y observaciones.
- `project_budget_items`: versión, fuente, dimensiones configurables, periodo, moneda original/tipo de cambio e importe inicial.

## Integridad e índices

Las claves son UUID; las relaciones usan `project_id` y claves foráneas. Hay constraints para modalidad, fechas, porcentajes, tipos de movimiento, efecto presupuestario y montos. Los índices cubren listados por proyecto, estado, fecha y partida. La migración es repetible mediante `IF NOT EXISTS`, bloques que toleran constraints existentes y `ON CONFLICT` para permisos.

## Compatibilidad

Las columnas heredadas de presupuesto se preservan para lectura/migración. La aplicación deja de aceptar compromisos/ejecución directamente sobre la partida y calcula estos totales desde movimientos aprobados. Una migración futura podrá retirar las columnas heredadas después de verificar consumidores externos.
