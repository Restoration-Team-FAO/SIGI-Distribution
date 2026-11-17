# Operación vs. configuración por módulo

## Propósito

Este documento define la separación entre el trabajo cotidiano y el gobierno técnico de los módulos. La navegación global conserva módulos; las pestañas conservan el contexto dentro de un módulo. La configuración se abre desde `⚙ Configuración` y nunca sustituye la navegación operativa.

## Regla de acceso

El acceso visual se concede a `superadmin`, `admin`, `national_admin` o `egi_admin`, o a quien posea el permiso equivalente indicado en la matriz. La protección frontend es una ayuda de navegación, no una frontera de seguridad.

Los endpoints mutables existentes ya están protegidos en NestJS mediante `BearerAuthGuard` y decoradores `@Roles`, `@Permissions` o `@PermissionsAny`. Por ejemplo:

- proyectos: `projects.create`, `projects.update`, `projects.polygon.update`;
- datos y conectores: `sources.create/update/delete`, `connectors.create/update/delete/run`, `imports.upload`;
- GIS: `imports.upload`, `publications.publish`, `connectors.run`;
- monitoreo: `validations.assign`;
- reportes: `reports.templates.manage`, `reports.mappings.manage`, `reports.commitments.manage`.

Un cliente no autorizado que invoque estos endpoints recibe `403`; ocultar el botón no modifica esa garantía.

## Matriz

| Módulo | Función | Clasificación | Rol o permiso mínimo | Ubicación propuesta |
| --- | --- | --- | --- | --- |
| Proyectos | Consultar situación y KPIs | OPERATIVE | `projects.read` | Proyectos / Resumen |
| Proyectos | Buscar y seleccionar proyecto | OPERATIVE | `projects.read` | Proyectos / Cartera |
| Proyectos | Crear proyecto | OPERATIVE | `projects.create` | Acción primaria `Nuevo proyecto` |
| Proyectos | Editar ficha, actores, hitos y entregables | OPERATIVE | `projects.update` | Workspace del proyecto |
| Proyectos | Consultar indicadores | OPERATIVE | `projects.read` | Proyectos / Indicadores |
| Proyectos | Consultar o editar cobertura | OPERATIVE | `projects.read`; edición `projects.polygon.update` | Proyectos / Territorio |
| Proyectos | Documentos y evidencia | OPERATIVE | `files.read` y permisos de archivo aplicables | Proyectos / Documentos |
| Proyectos | Estados, prioridades y reglas territoriales | CONFIGURATION | rol administrador o `projects.configure` | `/admin/projects/config` |
| Datos | Consultar fuentes | OPERATIVE | `sources.read` | Datos / Fuentes |
| Datos | Ejecutar y revisar importaciones | OPERATIVE | `imports.read` / `imports.upload` | Datos / Importaciones |
| Datos | Revisar calidad y validaciones | OPERATIVE | `validations.read` | Datos / Calidad |
| Datos | Configurar fuentes | CONFIGURATION | `sources.update` | `/admin/data/config` |
| Datos | Credenciales, mapeos y conectores | CONFIGURATION | `connectors.update` / `connectors.run` | `/admin/data/config` → Conectores, Odoo, Kobo |
| Datos | Crear o eliminar conectores | ADMINISTRATION | `connectors.create/delete` | Configuración de Datos |
| GIS | Explorar mapa y seleccionar elementos | OPERATIVE | permiso de lectura Geo/BI | GIS / Mapa |
| GIS | Activar, filtrar e inspeccionar capas | OPERATIVE | permiso de lectura Geo/BI | GIS / Capas |
| GIS | Importar información geográfica | OPERATIVE | `imports.upload` | GIS / Catálogo operativo |
| GIS | Publicar una capa preparada | OPERATIVE | `publications.publish` | GIS / Publicaciones |
| GIS | Workspaces, CRS, estilos y GeoServer | CONFIGURATION | rol administrador, `gis.configure` o `publications.publish` | `/admin/geobi/config` |
| GIS | Retirar o gobernar visibilidad | ADMINISTRATION | `publications.publish` | Configuración de GIS / Catálogo geográfico |
| Monitoreo | Revisar situación de calidad | OPERATIVE | `validations.read` | Monitoreo / Resumen |
| Monitoreo | Atender casos y alertas | OPERATIVE | `validations.read` | Monitoreo / Casos y Alertas |
| Monitoreo | Asignar responsables | CONFIGURATION | `validations.assign` | `/admin/monitoring/config` |
| Monitoreo | Reglas, severidades y umbrales | CONFIGURATION | rol administrador o `monitoring.configure` | Configuración de Monitoreo |
| Reportes | Ver disponibles y generados | OPERATIVE | `reports.read` | Reportes / Disponibles y Generados |
| Reportes | Crear o editar borradores | OPERATIVE | `reports.create` / `reports.edit` | Acción `Nuevo informe` y Reportes / Borradores |
| Reportes | Validar, aprobar y publicar | OPERATIVE | permisos de workflow correspondientes | Detalle del informe |
| Reportes | Plantillas y frameworks | CONFIGURATION | `reports.templates.manage` | `/admin/reports/templates` desde Configuración |
| Reportes | Mapeos metodológicos | CONFIGURATION | `reports.mappings.manage` / `reports.config.manage` | `/admin/reports/config` |
| Reportes | Programación y compromisos | CONFIGURATION | `reports.commitments.manage` | `/admin/reports/schedules` desde Configuración |
| Todos | Ayuda contextual | HELP | acceso al módulo | Centro de Ayuda y ayuda de la topbar |

## Navegación aplicada

- La barra lateral contiene únicamente entradas operativas o administrativas de primer nivel.
- Proyectos, Datos, GIS, Monitoreo y Reportes muestran un encabezado consistente y pestañas locales.
- Los enlaces técnicos retirados de la barra lateral permanecen disponibles dentro de la configuración autorizada.
- Las URLs existentes se conservan. Las nuevas URLs `/config` son contenedores de navegación y no alteran endpoints ni contratos.
- Las vistas de configuración muestran solo capacidades reales del baseline. Cuando no existe una pantalla mutable, se informa que la regla continúa gobernada por backend; no se simula funcionalidad.

## Verificación de no regresión

Para cada módulo se debe comprobar:

1. un usuario operativo ve las acciones y pestañas necesarias, pero no `⚙ Configuración`;
2. un administrador ve el botón y puede abrir la ruta;
3. una URL de configuración sin rol o permiso muestra acceso restringido;
4. una llamada directa a un endpoint mutable sin permiso devuelve `403`;
5. las rutas, respuestas y acciones operativas previas conservan su comportamiento.
