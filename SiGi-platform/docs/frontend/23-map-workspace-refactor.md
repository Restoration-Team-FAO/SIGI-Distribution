# Refactor integral de vistas geográficas

Fecha: 2026-09-24  
Rama: `feature/ux-ui-v2`

## Decisión técnica

SIGI conserva **Leaflet** como motor cartográfico. La implementación existente ya integra GeoJSON, WMS/WFS, GeoServer, selección de features, ajuste de extensión, mapas base, filtros, búsqueda y tabla de atributos. Cambiar de librería no aportaría una capacidad necesaria para esta iteración y elevaría el riesgo sobre contratos GIS que ya funcionan.

No se modificaron endpoints, modelos, permisos ni nombres internos como `territory`, `territories`, `territory_code` o `project_territories`.

## Modelo de experiencia

La entrada visible pasa de **Territorio** a **Mapa**. El visor autenticado adopta esta composición:

```text
Encabezado compacto / contexto / configuración autorizada
┌──────────────────┬──────────────────────────────────────────┐
│ búsqueda         │ herramientas flotantes                   │
│ capas            │                                          │
│ filtros          │                 MAPA                     │
│ opacidad         │                                          │
│ vistas guardadas │                      leyenda / selección │
└──────────────────┴──────────────────────────────────────────┘
```

El mapa es la superficie de trabajo principal. La información secundaria deja de competir mediante cards previas o posteriores.

## Capacidades preservadas

- control de acceso de la ruta y botón de configuración por permisos;
- contexto de proyecto mediante `projectId` y deep links existentes;
- búsqueda real entre capas y selección del resultado;
- activación simultánea de capas y control de opacidad;
- mapas base Claro, OpenStreetMap, Satélite y Sin fondo;
- capas GeoJSON, WMS y GeoServer existentes;
- filtros de la capa operativa y simbología por atributo;
- leyenda, coordenadas, zoom, extensión completa y limpieza de selección;
- identificación de entidades, análisis de cercanía y vínculos a proyecto;
- catálogo, tabla de atributos, exportaciones y vistas guardadas.

## Vistas intervenidas

| Vista | Cambio UX | Compatibilidad |
| --- | --- | --- |
| Navegación global | `Territorio SIGI` → `Mapa` | conserva `/admin/geobi` |
| Mapa principal | sidebar de búsqueda/capas/filtros + mapa dominante + controles flotantes | conserva APIs Geo/BI y GeoServer |
| Catálogo multicapa | mayor altura cartográfica y layout responsive | conserva tabla, exportación y vistas guardadas |
| Mapa de proyecto | tab `Mapa`, canvas de 620 px e inspector lateral | conserva ruta interna `territory` y CRUD de geometría |
| Capa operativa SSP | canvas dominante e inspector contextual | conserva filtros y selección real |
| Indicadores | tab y enlace visibles como `Mapa` | conserva `view=territory` por compatibilidad |

## Responsive

- **Desktop:** controles a la izquierda, mapa ocupando el ancho restante e inspector contextual sobre el visor.
- **Tablet:** sidebar reducida y canvas cartográfico prioritario.
- **Mobile:** búsqueda visible antes del mapa; capas y filtros complejos se simplifican para evitar una columna inutilizable. El mapa conserva altura operable y herramientas flotantes compactas.

## Límites conocidos

- Los nombres de capas provenientes del backend pueden incluir la palabra “territorio”; son nombres de datos y no navegación UX.
- El catálogo geoespacial administrativo sigue siendo una ruta separada por su función de publicación y gobierno técnico.
- Leaflet se carga mediante el mecanismo ya existente; una migración a MapLibre u OpenLayers necesitaría una ADR y pruebas de equivalencia WMS/WFS.

