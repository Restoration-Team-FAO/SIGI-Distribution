# 15 — Resultado de Fase 7: Informes

Fecha: 2026-09-22  
Rama: `feature/ux-ui-v2`

## Resultado

Informes dispone ahora de una única entrada global y un workspace operativo dividido por tarea. Se eliminó del sidebar la navegación por cada marco metodológico; esas categorías permanecen dentro del catálogo del módulo.

| Vista | URL | Función real |
| --- | --- | --- |
| Catálogo | `/admin/reports` | resumen del EGI y plantillas activas por marco |
| Generar | `/admin/reports/new?templateId=<id>` | asistente real de ocho pasos con fuentes, datasets, indicadores y proyectos |
| Compromisos | `/admin/reports/commitments` | calendario, avisos, aportes institucionales y consolidación |
| Historial | `/admin/reports/history` | búsqueda, estados, marcos e instancias reproducibles |
| Detalle | `/admin/reports/detail?reportId=<id>` | cobertura, trazabilidad, workflow, exportación y versiones |

Los filtros de Historial y Compromisos se serializan en la URL y sobreviven una recarga. El detalle dejó de depender exclusivamente de un modal: tiene URL propia y puede abrirse desde Historial, un compromiso consolidado o el workspace del proyecto.

## Navegación contextual

- Proyectos enlaza directamente al detalle del informe relacionado.
- Si un proyecto no tiene informes, ofrece Historial filtrado por `projectId`.
- Documentos ofrece Historial filtrado por `documentId`.
- Inicio 360 conduce ahora a `/admin/reports/commitments` preservando urgencia y año.
- Las categorías Acápite Nacional, Informe Regional, BTR, NDC, Meta 2, LDN y Personalizado permanecen como rutas profundas del catálogo, no como módulos globales.

## Operación frente a configuración

Operación utiliza las pestañas Catálogo, Generar, Compromisos e Historial. Configuración mantiene rutas separadas para:

- Mapeos: `/admin/reports/config`;
- Plantillas: `/admin/reports/templates`;
- Programación: `/admin/reports/schedules`.

Crear compromisos, abrir convocatorias, coordinar instituciones y procesar recordatorios solo aparece en Programación. La vista operativa conserva las acciones de aporte, revisión y consulta que corresponden al trabajo diario.

## Seguridad y alcance

- Todas las rutas operativas exigen EGI activo y el permiso `reports.read`; Generar exige `reports.create`.
- Las pestañas y acciones se adaptan a permisos `reports.*` sin duplicar frontends.
- Las rutas de configuración mantienen Route Guards administrativos o permisos equivalentes.
- El backend continúa validando de forma independiente lectura, creación, edición, generación, revisión, aprobación, publicación, plantillas, mapeos y compromisos.
- La información continúa limitada por el scope EGI e institucional resuelto por backend.

## Reutilización y rendimiento

Se reutilizaron `ReportsModulePage`, el asistente, las tarjetas de compromisos, calendarios, cobertura, servicios API y componentes visuales existentes. Se añadió `ReportsWorkspaceHeader` y se reorganizó la carga de datos: calendario, compromisos, avisos, catálogo y datasets solo se solicitan en las vistas que los necesitan.

No se crearon endpoints, datos ficticios ni workflows paralelos. Los estados y acciones se presentan con etiquetas consistentes sobre el workflow real `DRAFT → IN_PROGRESS → READY_FOR_REVIEW → UNDER_REVIEW → APPROVED → PUBLISHED`.

## Límites honestos

- Plantillas y mapeos muestran configuración persistida, pero todavía no existe una experiencia completa y segura de edición/versionado en frontend; no se simuló un CRUD.
- El EGI de revisión está vacío de instancias de informe. El deep link de detalle se validó mediante contrato, compilación y la respuesta real existente, sin sembrar información antes de la fase prevista de datos demo.
- `ReportsModulePage` sigue concentrando subcomponentes del dominio; la separación de rutas permite extraerlos por feature posteriormente sin reescribir el workflow.

## Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `npm run build:admin` | PASS, 116 módulos |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 99 Node + 6 Python |
| `tests/unit/reports-workspace-contract.test.mjs` | PASS, 4/4 |
| Playwright proyecto `admin-chromium` | PASS, 28/28 |
| Docker `sigi-ux-v2` | frontend, API, PostgreSQL y GeoServer saludables |

Docker de revisión:

- aplicación unificada: `http://127.0.0.1:5374`;
- referencia Country: `http://127.0.0.1:5373`;
- API: `http://127.0.0.1:3200/api`;
- GeoServer: `http://127.0.0.1:8281`;
- imagen frontend: `sha256:7352e58cdc695dfb484f37dc4a2bf0089da69b63c5e0b8e27ebd9490c7b9fdeb`.

## Siguiente fase

Fase 8 — Administración: consolidar usuarios, roles, permisos, institución, catálogos, integraciones y auditoría como capacidades del mismo frontend, manteniendo acceso exclusivamente por permisos.
