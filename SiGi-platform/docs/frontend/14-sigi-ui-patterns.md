# Patrones UI de SIGI

Fecha: 2026-09-24

Esta guía define el patrón según la naturaleza de la información. Compacto significa menos ruido, no menor accesibilidad.

## Card

**Usar cuando:** una entidad necesita identidad propia, contiene información heterogénea o existen pocos elementos destacados.  
**No usar cuando:** se repiten registros homogéneos que deben compararse.  
**Ejemplos:** proyecto destacado, módulo de acceso, alerta crítica.

## MetricCard

**Usar cuando:** un valor principal debe interpretarse en segundos.  
Debe contener etiqueta, valor y como máximo una pista breve. Evitar explicaciones decorativas y alturas innecesarias.

## NavigationCard

**Usar cuando:** representa acceso de alto nivel dentro de una entidad o módulo.  
Debe ser compacta, de altura consistente, accesible por teclado y formar un grid balanceado. No usar para registros operativos.

## CompactList

**Usar cuando:** hay registros similares, breves y recorribles, pero no se necesita comparación estricta por columnas.  
La fila presenta título, metadato esencial, estado y acción contextual. El detalle secundario se abre bajo demanda.

## ActivityList

**Usar cuando:** la dimensión principal es temporal: auditoría, trazabilidad, versiones, sincronizaciones o actividad.  
Agrupa por fecha, traduce la acción a lenguaje humano y muestra hora, actor y estado. La clave técnica y metadata quedan en detalle expandible.

## DataTable

**Usar cuando:** existen registros homogéneos y comparar columnas aporta valor.  
Debe admitir únicamente las capacidades necesarias: búsqueda, filtros, orden, paginación, selección o acciones. Mantener pocas columnas y enviar información secundaria a expansión o drawer. En móvil puede transformarse en filas apiladas mediante etiquetas de columna.

## Timeline

**Usar cuando:** además del orden temporal importa la progresión o relación entre hitos.  
Para simples eventos de log, preferir `ActivityList`.

## DetailPanel

**Usar cuando:** se presenta el resumen de una entidad.  
Emplear grid de etiqueta/valor, divisores sutiles y una jerarquía clara. No anidar cards para cada atributo.

## Drawer

**Usar cuando:** una acción secundaria requiere contexto, edición o detalle sin abandonar la lista.  
Debe tener título explícito, cierre accesible y foco controlado. No usar para tareas largas que merecen ruta propia.

## Form

**Usar cuando:** el usuario inició crear, editar o configurar.  
Los formularios operativos aparecen bajo demanda. La configuración puede ocupar una vista propia y debe agrupar campos por propósito, no por decoración.

## EmptyState

**Usar cuando:** una colección no tiene datos o el filtro no devuelve resultados.  
Mensaje breve y, si el permiso lo permite, una acción relevante. Evitar ilustraciones o contenedores altos sin función.

## StatusBadge

Etiqueta compacta con texto y señal visual. El color nunca es el único indicador. Utilizar vocabulario consistente: Activo, Borrador, Pendiente, Error, Exitoso, Validado y Publicado.

## RowActions

Agrupa acciones repetitivas en un menú `…`. Puede mantenerse visible una única acción primaria excepcional. Las acciones destructivas deben distinguirse y conservar su confirmación.

## Densidad y responsive

- Fila simple: objetivo aproximado de 40–56 px en escritorio.
- Targets interactivos: mínimo práctico de 40–44 px.
- Desktop: priorizar comparación y ancho útil.
- Tablet: reducir columnas gradualmente.
- Mobile: las tablas usan etiquetas por celda o migran a lista compacta; no se fuerza scroll horizontal si impide operar.
- Mapas, gráficos y editores conservan ancho completo.

## Jerarquía recomendada

```text
PageHeader: título + conteo/contexto breve + acción principal
Toolbar: búsqueda y filtros relevantes
SectionHeader: título + conteo + acción contextual
Contenido: tabla, lista, actividad, mapa o detalle
Drawer: edición o detalle secundario bajo demanda
```

Evitar `Card > Card > Card`. Usar tipografía, espaciado, fondo y divisores sutiles antes de añadir otro borde.

