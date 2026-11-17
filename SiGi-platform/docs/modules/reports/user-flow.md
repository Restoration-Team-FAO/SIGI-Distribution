# Flujo de usuario

1. Seleccionar EGI.
2. Abrir **Informes → Generar informe**.
3. Elegir una plantilla almacenada en DB.
4. Definir país/alcance y período.
5. Seleccionar fuentes reales disponibles.
6. Aplicar calidad (por defecto, nivel aprobado).
7. Revisar contenido, vista previa y advertencias.
8. Crear la instancia `DRAFT`.
9. Consultar la matriz de cobertura y resolver `MISSING`, `MANUAL_REQUIRED` o `PENDING_VALIDATION`.
10. Generar `v0.x`, enviar a revisión, aprobar como `v1.0` y publicar solo si no existen errores bloqueantes.

Mientras la instancia esté en `DRAFT`, `IN_PROGRESS` o `CHANGES_REQUESTED`, la persona con `reports.edit` puede abrirla desde **Historial e instancias** y pulsar **Editar informe**. El formulario permite corregir nombre, país, período, fecha de corte, visibilidad y seleccionar fuentes, datasets, indicadores y proyectos. Guardar estos cambios recalcula la matriz de cobertura. Las acciones **Configurar** y **Editar selección** de la matriz abren el mismo editor. Una instancia en revisión, aprobada, publicada o archivada queda bloqueada para preservar la versión sometida.

## Calendario y consolidación institucional

1. Consultar la línea 2025–2033 únicamente como referencia.
2. Registrar el compromiso real del país, su fecha de corte interno y la institución coordinadora.
3. Seleccionar las instituciones obligadas a aportar información.
4. Asignar un usuario responsable de cada institución y configurar los días de recordatorio.
5. Abrir la recepción; cada institución verá solamente sus asignaciones dentro del EGI.
6. Adjuntar observaciones y seleccionar documentos, datasets e indicadores elegibles.
7. Enviar, validar o devolver cada aporte con trazabilidad en auditoría.
8. Cerrar la recepción y crear una instancia consolidada que conserve las referencias a los aportes validados.

El cronograma puede consultarse como agenda, año completo o mes. Los filtros de año, estado e institución se aplican también a las descargas: Excel genera una fila por aporte institucional e iCalendar genera un evento de día completo por compromiso. Las salidas respetan el EGI y el alcance institucional del usuario y requieren `reports.export`.

Los avisos internos se actualizan al abrir el módulo y también pueden procesarse para todo el EGI desde la coordinación. La clave diaria idempotente impide duplicados. El canal de correo no se activa hasta configurar un proveedor externo.

La fecha almacenada en `report_commitments` prevalece operativamente. El hito de referencia no se presenta como obligación oficial.

## Estados

```text
DRAFT → IN_PROGRESS → READY_FOR_REVIEW → UNDER_REVIEW
      → CHANGES_REQUESTED → IN_PROGRESS
UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED
```

Un borrador no es oficial. La aprobación y publicación son endpoints separados con permisos propios y auditoría central.
