# Permisos y aislamiento

| Permiso | Uso |
|---|---|
| `reports.read` | Listado, detalle, cobertura, trazabilidad y versiones. |
| `reports.create`, `reports.edit`, `reports.delete` | Ciclo de autoría. |
| `reports.generate` | Validar y generar versiones. |
| `reports.review`, `reports.approve`, `reports.publish` | Separación del workflow. |
| `reports.export` | Descargar salidas. |
| `reports.templates.read/manage` | Consulta/gestión de plantillas. |
| `reports.mappings.read/manage` | Correspondencias metodológicas. |
| `reports.config.manage` | Configuración avanzada. |
| `reports.commitments.manage` | Crear, abrir y cerrar compromisos del país. |
| `reports.contributions.submit` | Enviar el aporte de la institución del usuario. |
| `reports.contributions.review` | Validar aportes o solicitar cambios. |

`superadmin` recibe todos. `national_admin` gestiona el ciclo nacional, salvo borrado/configuración global. `institution_editor` crea y edita dentro de su institución. `technical_validator` revisa. `technical_integration` tiene lectura técnica. `read_consumer` solo lectura.

Cada consulta administrativa resuelve el encabezado `X-SIGI-EGI-ID` contra los EGI accesibles al usuario. Para roles no globales se añade el filtro de institución. Las fuentes no se copian a snapshots públicos: el snapshot conserva únicamente valores estructurados autorizados y referencias necesarias.
