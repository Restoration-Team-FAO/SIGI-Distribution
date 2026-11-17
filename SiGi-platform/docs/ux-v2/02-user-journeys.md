# UX/UI V2 — User journeys

Cada recorrido conserva rutas, permisos y endpoints actuales. “Éxito UX” mide
claridad y esfuerzo; no redefine el resultado funcional.

## Técnico de proyectos

**Objetivo:** actualizar un proyecto y comprobar sus dependencias.

1. Inicio muestra proyectos que requieren atención.
2. `Proyectos` abre una lista buscable con estado, institución, tema y avance.
3. Seleccionar una fila abre `/admin/projects?projectId=<id>` sin perder filtros.
4. El workspace presenta `Resumen`, `Territorio`, `Indicadores`, `Actores`,
   `Hitos`, `Documentos` y `Actividad`.
5. `Editar` convierte solo la sección necesaria en formulario.
6. Guardar confirma resultado y conserva pestaña/contexto.

Permisos: `projects.read/create/update`, `projects.polygon.update`, archivos y
acciones específicas existentes. Éxito: localizar y editar sin recorrer toda la
ficha vertical.

## Especialista SIG

1. `GIS` abre el mapa con catálogo a la izquierda y detalles a la derecha.
2. Busca capa o territorio y activa visibilidad.
3. Filtra, inspecciona mapa/tabla y abre metadata.
4. Si tiene permiso, carga shapefile o fuente externa.
5. Revisa calidad y publica por la acción existente.

Éxito: el mapa conserva protagonismo; cada selección tiene una ficha inequívoca
y los controles avanzados aparecen bajo demanda.

## Monitoreo

1. Inicio responde qué cambió y qué requiere atención.
2. Filtra por territorio/proyecto desde un toolbar persistente.
3. Revisa indicadores con fecha, fuente y alcance.
4. Abre el detalle desde la anomalía, no desde navegación genérica.

Éxito: toda alerta enlaza una acción o entidad; ninguna KPI queda sin contexto.

## Administrador institucional

1. Confirma institución y EGI en topbar.
2. Entra a `Administración` y elige usuarios, instituciones, roles, EGI o
   auditoría según permisos.
3. Ejecuta el cambio en página estándar de lista/detalle/formulario.
4. Recibe confirmación y puede abrir el evento de auditoría.

Éxito: las opciones técnicas no compiten con las operativas y el alcance activo
siempre es visible antes de mutar datos.

## Gestión de datos

1. `Datos` abre fuentes/importaciones con estado del pipeline.
2. Selecciona fuente y carga lote.
3. Revisa validación/calidad y corrige observaciones.
4. Publica o deriva al responsable.

Éxito: se entiende la etapa actual `fuente → importación → validación → calidad
→ publicación`, con errores y reintentos asociados al paso correcto.

## Reglas transversales

- conservar EGI y filtros al volver de un detalle;
- una acción primaria por contexto;
- no mostrar acciones sin permiso;
- loading, vacío, sin resultados, sin permiso y dependencia caída son estados
  distintos;
- teclado y foco siguen el orden visual;
- móvil se optimiza para consulta, no para formularios GIS complejos.
