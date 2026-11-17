# Resumen de refactor cartográfico transversal

Fecha: 2026-09-24

## Resultado

SIGI dispone de una base cartográfica compartida para sus cuatro mapas Leaflet. Los contextos cambian, pero la interacción aprendida se conserva: toolbar flotante, selector compacto de mapa base, fullscreen, estados, resultados colapsables y panel contextual.

## Rutas revisadas

- `/admin/geobi?view=viewer`
- `/admin/geobi?view=catalog`
- `/admin/geobi?view=analysis`
- `/projects/:projectId/map` y su alias técnico `territory`
- `/admin/indicators?view=territory`
- `/admin/geospatial-catalog`
- `/admin/data/sources`
- `/admin/bi-visualizer`
- Informes, Documentos, Restauración, administración GIS y frontend público retirado.

## Design system creado

`map-system.tsx` exporta:

- `MapWorkspace`, `MapCanvas`, `MapToolbar`;
- `MapLayerPanel`, `MapLegend`, `MapFilterPanel`;
- `MapFeatureDrawer`, `MapResultsPanel`;
- `MapBasemapSelector`, `MapSearch`, `MapFullscreenButton`;
- `MapMeasurementTools`, `MapEditTools`;
- `MapLoadingState`, `MapErrorState`, `MapEmptyState`;
- `MiniMap`.

Las herramientas de medición y edición solo se muestran cuando reciben una operación real. No se exponen botones simulados.

`map-runtime.ts` centraliza:

- disponibilidad de Leaflet mediante una única promesa;
- catálogo de mapas base;
- invalidación de tamaño al cambiar viewport o fullscreen.

## Mapas migrados

| Mapa | Contexto | Patrón resultante |
| --- | --- | --- |
| Visor principal | `global` | 70–85% de superficie útil, búsqueda/capas/filtros laterales, toolbar y detalle sobre mapa |
| Catálogo multicapa | `analysis` | canvas dominante, basemap/fullscreen común, identificación y tabla sincronizadas |
| Cobertura de proyecto | `project` | contexto mínimo, canvas 65vh, detalle solo con selección y resultados colapsables |
| Capa SSP | `analysis` | canvas 65vh, filtros reales, selección y resultados colapsables |

## Componentes eliminados o consolidados

- eliminadas cuatro implementaciones de `ensureLeafletReady`;
- eliminados cuatro catálogos duplicados de mapas base;
- sustituidas toolbars de botones grandes por `MapToolbar` y `MapBasemapSelector`;
- sustituidas cards permanentes de resultados por `MapResultsPanel` colapsable;
- retirados contenedores `Panel` alrededor de los mapas de proyecto y SSP;
- GeoJSON dejó de mostrarse por defecto en la edición de proyecto.

## Diferencias por tipo

- **Visor principal:** búsqueda transversal, capas múltiples, filtros, leyenda y fullscreen.
- **Entidad/proyecto:** geometría priorizada, fitBounds y regreso a la entidad; edición solo con permiso.
- **Analítico:** filtros y simbología tienen prioridad; tabla y selección permanecen sincronizadas.
- **MiniMap/preview:** el patrón existe, pero no se usa donde el backend solo entrega bbox o metadata.
- **Edición:** modo explícito con Guardar/Cancelar. Dibujo y vértices permanecen como gap real.
- **Público:** no aplica porque el portal público fue retirado en favor del frontend autenticado único.

## Gaps backend

1. No hay endpoint espacial consolidado por indicador; hoy se navega por proyectos relacionados.
2. Shapefile/GeoJSON preview entrega validación y bbox, pero no una geometría simplificada segura para `MiniMap`.
3. Edición de polígonos no expone comandos de dibujo, vértices, borrado parcial ni validación interactiva.
4. No hay vector tiles/generalización para colecciones masivas.
5. Medición no cuenta con persistencia ni auditoría; por eso el control no se muestra todavía.

## Validación ejecutada

| Control | Resultado |
| --- | --- |
| Lint, typecheck y build de producción | PASS |
| Unitarias | PASS: 139 Node + 6 Python |
| E2E sobre el frontend servido por Docker | PASS: 37; 2 escenarios opt-in del dataset demo omitidos |
| Búsqueda, capas, filtros, selección y exportación GIS | PASS |
| Entrada y salida de fullscreen mediante el control del visor | PASS |
| Navegación, autenticación y permisos operativos/configuración | PASS |
| Contratos responsive desktop, tablet y mobile | PASS |
| Smoke frontend único | PASS: 39 controles |
| Salud de frontend, API y GeoServer | PASS: HTTP 200 |

La revisión visual de fullscreen se realizó con las geometrías de demostración de Costa Rica y confirmó mapa base, polígonos, atribución y controles flotantes. La validación no modificó endpoints ni contratos backend.
