# Auditoría transversal de densidad UI

Fecha: 2026-09-24  
Rama: `feature/ux-ui-v2`

## Método

Se revisaron el catálogo de rutas, las páginas del frontend único y los componentes compartidos. La prioridad combina frecuencia de uso, volumen esperado y costo de lectura. Esta auditoría no propone cambios de API ni de autorización.

| Ruta / área | Componente actual | Información | Patrón actual | Problema | Patrón recomendado | Componente compartido | Prioridad |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/admin` | `AdminHomePage` | Resumen operativo y pendientes | Panels con artículos | Mezcla de resumen y registros; densidad desigual | Métricas + listas compactas | `CompactList`, `StatusBadge` | Media |
| `/projects` | `ProjectsModulePage` | Cartera de proyectos | Cards por proyecto | Comparación limitada cuando crece la cartera | Lista enriquecida responsive | `DataTable`, `StatusBadge`, `RowActions` | Alta |
| `/projects/:id` | `ProjectsModulePage` | Resumen de proyecto | Grid ejecutivo | Patrón adecuado tras refactor; vigilar anidación | `DetailPanel` + navegación compacta | `DetailPanel` | Baja |
| `/projects/:id/actors` | `ProjectsModulePage` | Actores homogéneos | Cards | Exceso de alto por registro | Lista compacta con acciones | `CompactList`, `RowActions` | Alta |
| `/projects/:id/milestones` | `ProjectsModulePage` | Hitos y avance | Cards | Difícil comparar fecha, estado y avance | Lista/tabular compacta | `CompactList`, `StatusBadge`, `RowActions` | Alta |
| `/projects/:id/indicators` | `ProjectsModulePage` | Indicadores | Cards | Valores homogéneos sin comparación por columnas | Tabla compacta | `DataTable`, `StatusBadge` | Alta |
| `/projects/:id/territory` | `ProjectCoverageMap` | Mapa y coberturas | Mapa + cards territoriales | Cards secundarias compiten con el mapa | Mapa completo + lista auxiliar | `CompactList` | Media |
| `/projects/:id/deliverables` | `ProjectsModulePage` | Entregables | Cards | Acciones y metadatos repetidos | Lista compacta | `CompactList`, `RowActions` | Alta |
| `/projects/:id/documents` | `ProjectsModulePage` | Documentos | Cards separadas por origen | No permite comparar nombre, tipo y estado | Tabla/lista unificada | `DataTable`, `RowActions` | Alta |
| `/projects/:id/reports` | `ProjectsModulePage` | Informes asociados | Cards | Registros homogéneos sobredimensionados | Lista compacta | `CompactList`, `StatusBadge` | Media |
| `/projects/:id/activity` | `ProjectsModulePage` | Incidencias y auditoría | Cards en dos panels | Claves técnicas, alto excesivo, cronología débil | Actividad agrupada por fecha | `ActivityList` | Crítica |
| `/admin/indicators` | `IndicatorsModulePage` | Catálogo de indicadores | Lista ad hoc | Falta patrón tabular compartido | Tabla compacta + detalle | `DataTable`, `StatusBadge` | Alta |
| `/admin/files` | `FilesExplorerPage` | Documentos y versiones | Listas/cards ad hoc | Versiones, auditoría y vínculos usan el mismo peso | Tabla para archivos; actividad para auditoría | `DataTable`, `ActivityList` | Alta |
| `/admin/data` | `DataHomePage` | Resumen de datos | Métricas + panel | Adecuado; textos pueden reducirse | Métricas compactas | `MetricCard` | Baja |
| `/admin/data/sources` | `SourcesPage` | Fuentes y datasets | Cards y panels extensos | Alto scroll y comparación difícil | Tabla/lista con detalle bajo demanda | `DataTable`, `DetailDrawer` | Crítica |
| `/admin/data/imports` | `SourcesPage` | Importaciones | Cards de estado | Historial temporal fragmentado | Tabla + actividad | `DataTable`, `ActivityList` | Alta |
| `/admin/data/quality` | `SourcesPage`, `ValidationsPage` | Calidad y validaciones | Cards/panels | Hallazgos simples ocupan demasiado | Tabla/lista compacta | `DataTable`, `StatusBadge` | Alta |
| `/admin/connectors` | `ConnectorsModulePage` | Conectores, fuentes y jobs | PanelGrid + cards | Tres jerarquías visuales equivalentes | Tabla por entidad + drawer | `DataTable`, `RowActions`, `DetailDrawer` | Crítica |
| `/admin/connectors/history` | `ConnectorsModulePage` | Sincronizaciones | Cards | La dimensión temporal no se expresa | Activity list / tabla cronológica | `ActivityList`, `StatusBadge` | Alta |
| `/admin/geobi` | `GeoBiModulePage` | GIS y capas | Mapas + numerosos artículos | Subpaneles operativos se vuelven cajas anidadas | Mapa dominante + listas auxiliares | `CompactList`, `DataTable` | Alta |
| `/admin/geospatial-catalog` | `GeospatialCatalogPage` | Capas y publicaciones | PanelGrid + cards | Catálogo difícil de comparar | Tabla/lista de capas | `DataTable`, `StatusBadge` | Alta |
| `/admin/reports` | `ReportsModulePage` | Plantillas e informes | Cards y tablas propias | Patrones de lista duplicados | Cards solo para plantillas; tabla/lista para historial | `DataTable`, `ActivityList` | Media |
| `/administration/users` | `UsersPage` | Usuarios | Cards/listados ad hoc | Mucho espacio por usuario y acciones visibles | Tabla con menú de fila | `DataTable`, `RowActions`, `StatusBadge` | Crítica |
| `/administration/roles` | `UsersPage` | Roles y permisos | Cards | Comparación difícil | Tabla/lista expandible | `DataTable`, `DetailDrawer` | Alta |
| `/administration/audit` | `AuditPage` | Auditoría | Card por evento | Claves técnicas y metadatos siempre visibles | Actividad agrupada + detalle | `ActivityList`, `DetailDrawer` | Crítica |
| `/administration/operations` | `ApiOpsPage` | Estado técnico y jobs | Panels con cards | Registros simples sobredimensionados | Métricas + listas compactas | `CompactList`, `StatusBadge` | Media |
| Publicaciones | `PublicationsPage` | Publicaciones | Card por registro | Comparación de estado y fecha limitada | Tabla/lista compacta | `DataTable`, `StatusBadge` | Media |
| Mis espacios | `EgiSpacesPage` | EGI y configuración | Panels | Formulario puede competir con lectura | Detalle + edición bajo demanda | `DetailPanel`, `DetailDrawer` | Media |

## Hallazgos transversales

1. `Panel` y `PanelGrid` se utilizan tanto para jerarquía de página como para colecciones, creando cajas anidadas.
2. Existen múltiples estilos locales para filas, artículos, badges y tablas; dificultan mantener densidad y responsive coherentes.
3. Auditoría, versiones, sincronizaciones y actividad repiten estructuras cronológicas sin agrupación por fecha.
4. Varias claves de evento se presentan sin traducción institucional.
5. Las páginas de mayor tamaño (`SourcesPage`, `GeoBiModulePage`, `ConnectorsModulePage`) concentran formularios y resultados, por lo que requieren migración incremental y pruebas por vista.
6. Los mapas y editores justifican ancho completo; sus listas laterales no deben convertirse en nuevas cards.

## Orden de intervención

1. Primitives compartidos y capa de presentación de eventos.
2. Auditoría y actividad de proyecto.
3. Listados maestros y del workspace de proyectos.
4. Administración, fuentes, conectores y sincronizaciones.
5. GIS, reportes y revisión visual responsive.

## Resultado de esta iteración

Migrado a componentes compartidos:

- cartera de proyectos, indicadores, documentos del proyecto, usuarios, roles, fuentes, validaciones, conectores y publicaciones → `DataTable`;
- actores, hitos, entregables, informes del proyecto, incidencias, territorios de indicadores, versiones y alertas GIS → `CompactList`;
- auditoría administrativa, actividad de proyectos e indicadores, auditoría documental, integraciones, informes y GIS → `ActivityList`;
- estados repetitivos → `StatusBadge`;
- acciones repetitivas de actores, hitos, entregables, usuarios y roles → `RowActions`;
- formularios del workspace de proyectos se mantienen bajo demanda en `Drawer`.

Los mapas, visualizadores BI, editores de configuración, plantillas de informes y cards de métricas conservan su patrón porque necesitan identidad propia, ancho completo o representación heterogénea.

## Pendientes identificados

- `SourcesPage` todavía contiene subflujos técnicos extensos de Odoo y batches; el inventario principal ya usa tabla, pero sus editores especializados requieren una iteración propia para no degradar el flujo.
- `GeoBiModulePage` conserva panels especializados alrededor de mapas, perfiles y publicaciones; se migraron bitácora y alertas, mientras el mapa permanece dominante.
- `GeospatialCatalogPage` mantiene fichas técnicas expandibles que contienen geometría y metadatos heterogéneos; su catálogo debe converger al `DataTable` compartido cuando se defina el conjunto mínimo de columnas.
- `ApiOpsPage` conserva diagnósticos técnicos con `DetailList`; no se reemplazaron porque representan inspección de una entidad, no un listado operativo.
