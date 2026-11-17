# Inventario global de mapas y superficies geográficas

Fecha: 2026-09-24  
Rama: `feature/ux-ui-v2`

## Método

Se buscaron rutas, componentes y textos asociados a Leaflet, GeoJSON, WMS/WFS, GeoServer, PostGIS, mapas base, geometrías, polígonos, shapefiles, extensiones, features, coordenadas, previews y edición. El inventario distingue entre un mapa renderizado, una preview técnica y un simple enlace espacial.

## Mapas renderizados

| Ruta | Componente | Clase | Uso | Librería | Fuente de datos | Tamaño anterior | Controles/paneles/filtros | Permisos | Problemas detectados | Duplicación | Acción aplicada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/admin/geobi?view=viewer` | `GeoBiLayerMap` | A. Visor principal | Consulta transversal de capa activa y overlays | Leaflet | Geo/BI API, GeoJSON, GeoServer WMS/WFS | 700 px dentro de paneles | capa, escala, búsqueda, filtros DNEA, mapas base, leyenda, selección | lectura GIS equivalente; configuración separada | mapa subordinado a controles extensos; sin fullscreen real; runtime duplicado | carga Leaflet y mapas base repetidos | `MapWorkspace` global, sidebar, toolbar flotante, fullscreen, estados compartidos y runtime común |
| `/admin/geobi?view=catalog` | `MultiLayerMap` | A/E. Visor multicapa analítico | Activación simultánea, identificación, tabla, cercanía y exportación | Leaflet | catálogo GIS, GeoJSON paginado, WMS externo | 560 px | catálogo, opacidad, filtros, mapas base, tabla, ficha, vistas guardadas | `connectors.read` y permisos de export/publicación aplicables | toolbar propia; mapas base duplicados; fullscreen ausente | runtime y `TileLayer` base repetidos | `MapWorkspace` analítico, toolbar/basemap/fullscreen compartidos, resize seguro |
| `/projects/:projectId/map` (ruta interna conservada: `territory`) | `ProjectCoverageMap` | B. Mapa de entidad | Cobertura del proyecto o portafolio | Leaflet | proyectos, territorios del detalle, GeoJSON, overlay GeoServer | 420 px + cards | mapa base, overlay, selección de proyecto, detalle | `projects.read`; edición separada por `projects.polygon.update` | mapa pequeño dentro de card; resultados grandes debajo; ficha permanente | runtime y estilos cartográficos propios | canvas 65vh, contexto compacto, resultados colapsables, detalle solo con selección, fullscreen compartido |
| `/projects/:projectId/map`, modo `Capa SSP` | `OperationalLayerMap` | E. Mapa analítico | Análisis de geometrías importadas por proyecto, departamento y ejecutora | Leaflet | capa operativa SSP/GeoJSON real | 420 px + cards | filtros, selección, mapa base, detalle técnico | `projects.read` y scope EGI | filtros separados del patrón global; resultados en cards; ficha sin selección | runtime, mapas base y toolbar propios | canvas 65vh, `MapWorkspace`, toolbar uniforme, resultados colapsables y panel contextual |

## Superficies geográficas sin mapa renderizado

| Ruta / superficie | Componente | Clase | Qué existe realmente | Fuente | Problema / gap | Acción recomendada |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin/indicators?view=territory` | `IndicatorsModulePage` | E, enlace analítico | lista de coberturas y enlaces al mapa por proyecto; no hay canvas | detalle de indicador/proyectos | backend no entrega todavía una colección espacial consolidada filtrada por indicador | conservar enlace `Ver en mapa`; añadir `indicator` al contrato cuando backend soporte filtro espacial transversal |
| `/admin/geospatial-catalog` | `GeospatialCatalogPage` | C/D, preview técnica | preview de estructura, CRS, bbox, geometrías y validación; no renderiza mapa | GIS service, GeoJSON/Shapefile | preview espacial visual ausente | futuro `MiniMap` solo cuando el backend entregue geometría de preview segura y acotada |
| `/admin/data/sources` | `SourcesPage` | C, preview técnica | resumen de shapefile, tipo, bbox y validaciones; no renderiza mapa | Odoo/shapefile pipeline | no existe payload geométrico de preview | no crear mapa ficticio; documentar contrato de preview geométrica antes de usar `MiniMap` |
| `/projects/:projectId/map` → `Editar geometría` | `ProjectsModulePage` | D. Edición | editor avanzado de GeoJSON en drawer | endpoint de polígono existente | no existen draw/edit/delete geométricos ni contrato de vértices en frontend/backend | GeoJSON queda bajo “Más · Edición avanzada”; implementar herramientas de dibujo solo con contrato y validación acordados |
| `/admin/bi-visualizer` | `BiVisualizerPage` | E. Dashboard | widgets agregados con dimensión geográfica, sin mapa Leaflet | proyectos/GeoBI | el preset “mapa” no es un visor | mantener como BI; enlazar al mapa principal cuando requiera exploración espacial |
| Informes y Documentos | módulos respectivos | navegación | relaciones a proyecto/entidad, sin mapa embebido | APIs de informes/documentos | no hay necesidad de canvas propio | usar enlace al Mapa con contexto; no duplicar `MapWorkspace` |
| Restauración | sin ruta cartográfica dedicada | navegación/datos | no existe visor propio verificable en el frontend único | — | falta contrato/ruta si se requiere experiencia específica | consumir el mapa principal mediante capa autorizada, no crear un frontend paralelo |
| Portal público | retirado | F | no existe frontend público activo | — | no aplica en arquitectura de frontend único autenticado | mantener retiro; una futura vista pública requerirá boundary y permisos explícitos |

## Componentes auxiliares cartográficos

| Componente | Función | Estado |
| --- | --- | --- |
| `GeoLayerCatalogPanel` | activa capas, opacidad y filtros | conservado; panel operacional del catálogo |
| `GeoLayerFilterControls` | filtros por esquema de capa | conservado |
| `GeoLayerAttributeTable` | tabla, orden, paginación, exportación y gráfico | conservado |
| `FeatureIdentificationPanel` | metadata, entidad asociada y cercanía | conservado como detalle contextual |
| `map-runtime.ts` | carga única de Leaflet, mapas base y resize | creado; sustituye cuatro copias |
| `map-system.tsx` | composición visual y de interacción cartográfica | creado |

## Rendimiento y riesgos encontrados

1. `ensureLeafletReady` y la definición de mapas base estaban duplicados cuatro veces; ahora existe una promesa compartida y un catálogo único.
2. Fullscreen podía dejar el canvas con tamaño anterior; el runtime compartido invalida Leaflet tras `fullscreenchange` y resize.
3. Cada componente recrea sus overlays cuando cambia su firma de datos. Se conserva porque la lógica de selección difiere; una unificación del renderer requiere pruebas de equivalencia WMS/GeoJSON.
4. `GeoBiModulePage` puede solicitar colecciones de hasta 500 features para el catálogo. La paginación de atributos existe, pero la generalización/teselado vectorial sigue siendo un gap para volúmenes masivos.
5. Las capas externas GeoJSON se cargan en cliente. Deben mantenerse acotadas; no existe streaming ni vector tiles.
6. Los efectos actuales limpian mapas y layers al desmontar. El runtime compartido evita además cuatro intervalos simultáneos de espera de Leaflet.
7. No se encontraron instancias reales de mapas en modales, Informes, Documentos, Restauración o el portal público retirado.

