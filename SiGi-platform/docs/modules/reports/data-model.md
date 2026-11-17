# Modelo de datos

| Tabla | Propósito |
|---|---|
| `report_frameworks` | Catálogo extensible de marcos. |
| `report_templates` | Cabecera de plantilla existente, extendida con marco, EGI, institución y país. |
| `report_template_versions` | Configuración inmutable por versión. |
| `report_template_sections` | Orden, obligatoriedad y narrativa `AUTO/MANUAL/HYBRID`. |
| `report_template_components` | Componentes estructurados de sección. |
| `report_instances` | Informe en workflow y alcance institucional. |
| `report_versions` | Parámetros y snapshot reproducible. |
| `report_exports` | Formato, estado, usuario y checksum SHA-256 de cada salida. |
| `report_data_requirements` | Variables, fuente esperada y reglas. |
| `report_requirement_status` | Cobertura evaluada de una instancia. |
| `report_indicator_mappings` | Correspondencia expresa entre indicador y marco. |
| `report_reviews` | Acciones de revisión/aprobación/publicación. |
| `report_schedules` | Configuración futura; no ejecuta cron simulado. |
| `report_reference_milestones` | Línea de tiempo orientativa separada de los compromisos oficiales. |
| `report_commitments` | Entrega país administrada por EGI, coordinador, marco y fecha. |
| `report_commitment_contributions` | Asignación, envío y validación de cada institución participante. |
| `report_contribution_documents` | Documentos del EGI aportados como evidencia. |
| `report_contribution_datasets` | Datasets institucionales aportados. |
| `report_contribution_indicators` | Indicadores citados en el aporte. |
| `report_reminder_rules` | Anticipaciones y periodicidad de avisos vencidos por compromiso. |
| `report_notifications` | Bandeja interna por usuario con clave idempotente y estado leído. |

JSONB se limita a configuración variable, selección, parámetros y snapshots. Identidades, relaciones, estados, posiciones y reglas consultables permanecen en columnas tipadas con constraints e índices.
