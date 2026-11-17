# Arquitectura

## Flujo

```text
React admin
  → /api/admin/reports (Bearer + permiso + X-SIGI-EGI-ID)
  → ReportsModule
  → resolución de EGI accesible existente
  → PostgreSQL core.report_*
  → datasets / fuentes / indicadores / instituciones existentes
```

`ReportsModule` reutiliza `AdminService.resolveAdminScopeEgiId` para impedir seleccionar un EGI ajeno. Además, las lecturas de usuarios no globales filtran por su institución. Los controladores aplican permisos por operación, no solo visibilidad de botones.

Los mapas futuros deben referenciar capas del módulo Geo/BI existente. Las evidencias deben enlazar archivos del explorador documental. Esta fase no duplica ninguno de esos motores.

## Reproducibilidad

Una generación crea `report_versions` con parámetros y snapshot de la cobertura evaluada. Una aprobación crea una versión mayor `vN.0`. Los históricos no consultan silenciosamente cifras actuales para reemplazar ese snapshot.

La exportación de cada informe conserva el formato JSON UTF-8 y se registra como `REPORT_EXPORTED`. El cronograma administrable ofrece XLSX e iCalendar tras `reports.export`, aplica los filtros y el alcance de la consulta, y registra `REPORT_CALENDAR_EXPORTED`. PDF y DOCX se mantienen como adaptadores futuros del servicio de informes.
