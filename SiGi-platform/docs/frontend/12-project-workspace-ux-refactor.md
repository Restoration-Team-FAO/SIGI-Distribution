# Refactor UX del workspace de Proyectos

Fecha: 2026-09-23  
Rama: `feature/ux-ui-v2`

## Decisión de experiencia

Proyectos se divide en dos contextos:

1. `/projects`: cartera para buscar, filtrar y seleccionar.
2. `/projects/:projectId[/sección]`: workspace dedicado al proyecto.

La consulta es el estado normal. Los permisos habilitan acciones; no convierten la pantalla en un formulario. Crear o editar abre un drawer contextual. Las rutas históricas `/admin/projects?view=...&projectId=...` se conservan como entrada compatible y redirigen al nuevo deep link.

## Auditoría y transformación

| Componente actual | Problema UX | Nuevo patrón | Componente reutilizable | Backend utilizado | Permiso | Impacto |
| --- | --- | --- | --- | --- | --- | --- |
| Cartera y ficha en dos columnas | Lista, detalle y formularios compiten por atención | Cartera independiente con búsqueda, filtros y cards compactas | `ModuleWorkspaceHeader` | `GET /admin/projects` | `projects.read` | Selección clara y retorno estable a cartera |
| Cabecera genérica | El proyecto no domina la jerarquía | Cabecera con identidad, estado, contexto, KPIs y acciones | `ProjectHeader` | Detalle existente | `projects.read`; acción con `projects.update` | Contexto inequívoco |
| Query `view` + `projectId` | URL difícil de leer y compartir | Rutas `/projects/:id/:section` | `projectWorkspacePath` | Sin cambio | Según sección | Deep links semánticos con compatibilidad |
| Ficha maestra editable permanente | Consulta presentada como formulario | Resumen de solo lectura + drawer “Editar proyecto” | `Drawer`, campos UI | `PATCH /admin/projects/:id` | `projects.update` | Menos ruido; edición intencional |
| Formulario de alta embebido | Crear ocupa la pantalla de cartera | Drawer “Nuevo proyecto” | `Drawer` | `POST /admin/projects` | `projects.create` | La cartera permanece enfocada |
| Actores con formulario siempre visible | Campos administrativos preceden a los actores | Listado + “Agregar actor” + menú contextual | `Drawer` | Endpoints de actores existentes | `projects.update` | View mode predeterminado |
| Hitos con formulario siempre visible | Cronograma difícil de explorar | Cards de hito, progreso y edición contextual | `Drawer` | Endpoints de hitos existentes | `projects.update` | Seguimiento visible antes que captura |
| Entregables con formulario siempre visible | Productos mezclados con captura | Listado + alta/edición bajo demanda | `Drawer` | Endpoints de entregables existentes | `projects.update` | Menor densidad visual |
| GeoJSON visible | Detalle técnico domina Territorio | Mapa y cobertura primero; GeoJSON en “Editar geometría” | `ProjectCoverageMap`, `Drawer` | Endpoint de polígono existente | `projects.polygon.update` | Operación institucional accesible |
| Controles documentales extensos | La carga desplaza el inventario | Documentos primero; carga mediante acción | `Drawer` | API de archivos existente | `files.create` | Consulta documental inmediata |
| Todas las áreas en una página | Scroll largo sin propósito único | Tabs con URL por dominio | Tabs del design system | Lecturas existentes | Permission Driven UI | Una tarea por vista |

## Rutas

| Propósito | Ruta canónica |
| --- | --- |
| Cartera | `/projects` |
| Resumen | `/projects/:projectId` |
| Actores | `/projects/:projectId/actors` |
| Hitos | `/projects/:projectId/milestones` |
| Indicadores | `/projects/:projectId/indicators` |
| Territorio | `/projects/:projectId/territory` |
| Entregables | `/projects/:projectId/deliverables` |
| Documentos | `/projects/:projectId/documents` |
| Informes | `/projects/:projectId/reports` |
| Actividad | `/projects/:projectId/activity` |

`/admin/projects` continúa disponible. Los enlaces históricos con query se traducen a la ruta canónica. La configuración queda separada en `/projects/config` y mantiene el gate `projects.configure`.

## Permisos y estados

- `projects.read`: cartera y workspace en modo consulta.
- `projects.create`: acción “Nuevo proyecto”.
- `projects.update`: edición del proyecto, actores, hitos y entregables.
- `projects.polygon.update`: edición avanzada de geometría.
- `files.create`: “Subir documento”.
- `files.download`: descarga documental.
- `reports.read`: tab Informes.

El backend sigue siendo la autoridad. La UI solamente decide qué acciones presentar.

## Implementación por fases

- Fase 1: cartera y workspace separados.
- Fase 2: `ProjectHeader` reutilizable.
- Fase 3: navegación secundaria con deep links.
- Fase 4: resumen en view mode.
- Fase 5: edición general en drawer.
- Fase 6: actores, hitos, entregables y documentos bajo demanda.
- Fase 7: mapa primero y GeoJSON como edición avanzada.
- Fase 8: eliminación de microcopy demostrativa visible y simplificación de etiquetas.

No se modificaron endpoints, contratos, validaciones ni reglas de autorización del backend.
