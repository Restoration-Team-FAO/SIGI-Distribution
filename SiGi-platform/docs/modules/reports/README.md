# Informes Nacionales e Internacionales

Plan de desarrollo integral: [roadmap.md](./roadmap.md).

Este módulo compone productos de reporte a partir de información gobernada por SIGI. No crea una segunda fuente de datos, un segundo GIS ni un repositorio documental paralelo.

## Alcance implementado

- siete marcos almacenados en base de datos;
- plantillas y secciones versionadas;
- instancias aisladas por EGI e institución;
- wizard administrativo de ocho pasos;
- matriz de cobertura sin datos ficticios;
- validación, workflow, versiones y snapshots;
- trazabilidad hasta dataset/fuente cuando existe la relación;
- exportación JSON de informes y exportación XLSX/iCalendar del cronograma, ambas auditadas;
- correspondencias explícitas de indicadores.
- calendario de referencia 2025–2033 con advertencia metodológica;
- compromisos oficiales administrables por EGI, fechas de corte y aportes por institución.
- aportes con documentos, datasets e indicadores verificados contra el alcance institucional;
- alertas visuales por corte interno vencido, próximo o en plazo.
- vistas de agenda, año y mes con filtros por estado e institución.

La página pública existente `/api/reports` se conserva para compatibilidad. La administración usa `/api/admin/reports` y requiere autenticación y permisos.

## Principio metodológico

Que un dato exista en SIGI no implica que sea reportable. La elegibilidad depende de la versión de plantilla, unidad, período, nivel de validación, regla de transformación y marco. En particular, un mapeo `DIRECT` solo se admite con una regla de elegibilidad explícita.

Los faltantes se presentan como `MISSING`, `MANUAL_REQUIRED` o `PENDING_VALIDATION`; nunca se sustituyen por valores simulados.
