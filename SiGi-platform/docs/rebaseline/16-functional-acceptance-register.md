# Registro de aceptación funcional

La afirmación disponible del usuario es que `sigi-demo-local` corresponde a la
versión probada y casi lista para producción. Se registra como revisión general
del baseline, no como aceptación individual de todas las funciones.

| Capacidad | Clasificación | Evidencia |
| --- | --- | --- |
| Baseline visual/funcional general `sigi-demo-local` | USER REVIEWED | declaración explícita del usuario; no acredita cada módulo por separado |
| Reproducción de manifiestos/runtime en Docker | TECHNICALLY VERIFIED | hashes comparados, build y runtime smoke PASS |
| Rutas country y admin | TECHNICALLY VERIFIED | código + HTTP de todas las rutas declaradas |
| Login y sesión | TECHNICALLY VERIFIED | R1-03 PASS + implementación DB |
| Archivos y aislamiento EGI | TECHNICALLY VERIFIED | UAT de carpeta/upload/separación PASS |
| Publicaciones y exports por EGI | TECHNICALLY VERIFIED | smokes de scope PASS |
| GeoServer WMS/PostGIS | TECHNICALLY VERIFIED | health/capabilities HTTP PASS |
| Navegación admin y country principal | TECHNICALLY VERIFIED | suite Sprint 1R final: 10/10 PASS |
| Dashboard, Calidad y Restauración | NEEDS USER CONFIRMATION | mezcla de API real, fixture y datos demo; confirmar cifras/narrativa oficiales |
| Proyectos e indicadores | NEEDS USER CONFIRMATION | confirmar proceso, estados, campos obligatorios y lectura por EGI/institución |
| GIS multicapas y catálogo | NEEDS USER CONFIRMATION | confirmar interacción esperada, capas oficiales y resultado de import/publicación |
| Reportes oficiales | NEEDS USER CONFIRMATION | confirmar formatos, workflow, calendario, builder y entregables aceptables |
| Kobo real | NEEDS USER CONFIRMATION | falta instancia/credenciales y dataset representativo aprobados |
| Odoo real | NEEDS USER CONFIRMATION | falta instancia/credenciales y mapeo funcional aprobados |
| Archivos | NEEDS USER CONFIRMATION | implementación técnica verificada; falta validar permisos, versionado y asociaciones desde negocio |
| Usuarios, roles, institución y EGI | NEEDS USER CONFIRMATION | confirmar que la matriz actual expresa la gobernanza deseada |
| Terminología y navegación country/admin | NEEDS USER CONFIRMATION | confirmar que encabezados y nombres actuales son la terminología oficial de negocio |
| Bootstrap con datos demo | NEEDS USER CONFIRMATION | una instalación nueva conserva seed demo; confirmar política esperada para producción |

## Evidencia Playwright Sprint 1R

VERIFIED BY EXECUTION: `npx playwright test tests/e2e/rebaseline` creó y ejecutó
10 protecciones. La primera corrida pasó 6/10: proyectos, archivos, Kobo y
usuarios renderizaron contenido, pero las aserciones usaban rótulos internos o
un selector `main` ambiguo. La suite se corrigió contra los encabezados de ruta
observados y se volvió a ejecutar sin cambiar el producto: **10/10 PASS**.

## Criterio para Sprint 2R

El inventario técnico permite iniciar Sprint 2R, siempre que éste use estas
brechas como línea base y no declare aceptación de negocio. Las diez áreas
marcadas `NEEDS USER CONFIRMATION` deben convertirse en sesiones o casos de UAT
antes de la decisión final de producción.
