# UX/UI V2 — Arquitectura de información

> **Actualización 2026-09-18:** la arquitectura objetivo pasa a un frontend único con vistas determinadas por sesión y permisos. Este inventario de dominios y URLs continúa vigente; consultar `12-single-frontend-architecture-decision.md` y `14-single-frontend-migration-plan.md` para la estrategia de consolidación.

## Modelo conceptual aprobado para prototipo

```text
Inicio
Proyectos
Territorio y monitoreo
Datos
GIS
Reportes
Archivos
Administración
Ayuda
```

Los nombres son etiquetas de navegación, no rutas nuevas. En la primera fase se
validarán visualmente antes de aplicarlos al resto del producto.

## Mapeo sin cambiar URLs

| Dominio | Destinos existentes |
| --- | --- |
| Inicio | `/admin`, `/dashboard` |
| Proyectos | `/admin/projects`, `/projects` |
| Territorio y monitoreo | `/territory`, `/restoration`, `/indicators`, `/incidents`, `/admin/bi-visualizer`, `/admin/validations` |
| Datos | `/admin/sources*`, `/admin/connectors`, `/admin/flow`, `/quality`, `/integrations` |
| GIS | `/admin/geobi`, `/admin/geospatial-catalog`, `/geo-bi` |
| Reportes | `/admin/reports/*`, `/reports` |
| Archivos | `/admin/files`, `/documents` |
| Administración | `/admin/egi`, `/admin/institutions`, `/admin/users`, `/admin/audit`, `/admin/api` |
| Ayuda | `/admin/help`, `/admin/ayuda`, `/admin/capacitacion` |

## Navegación primaria Admin

- máximo ocho dominios visibles;
- subsecciones del dominio en navegación secundaria, no como treinta enlaces
  permanentes;
- filtrar ambos niveles por los mismos permisos actuales;
- `Mis espacios` se conserva accesible desde el selector EGI de topbar y desde
  Administración;
- búsqueda Admin sigue encontrando destinos aunque estén en segundo nivel.

## Topbar

Orden de prioridad:

1. breadcrumb y título/contexto de página;
2. EGI/institución y alcance global/activo;
3. búsqueda contextual cuando exista;
4. ayuda;
5. usuario/sesión.

Recarga y fecha pasan a acciones secundarias. Nunca se oculta el contexto EGI
durante una mutación.

## Breadcrumbs

Se derivan de metadata de rutas, con overrides para entidad:

```text
Proyectos / <proyecto> / Indicadores
GIS / Catálogo / <capa>
Administración / Espacios / <EGI>
Reportes / Historial / <versión>
```

No crean rutas artificiales; cada segmento enlazable usa una URL existente.

## Arquitectura interna de referencias

- Dashboard: Situación → Atención → Cambios → Próximas acciones.
- Projects list: Page header → Filter bar → Summary → Table/list → Pagination.
- Project workspace: Entity header → Tabs → Sección → acciones contextuales.
- GIS: Toolbar superior → Catálogo → Mapa → Detalles/atributos.
