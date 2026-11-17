# 19 — Resultado de filtros globales

Fecha: 2026-09-23  
Rama: `feature/ux-ui-v2`

## Resultado

Se incorporó un contexto de filtros independiente del selector de EGI. El primer filtro global habilitado es **Proyecto**, porque es la única dimensión cuyo contrato ya coincide entre módulos y está respaldado por comportamiento real.

El valor se serializa como `projectId` en la URL. Esto permite recargar, compartir y enlazar una vista sin crear estado oculto en `localStorage` o `sessionStorage`.

## Cobertura funcional

| Ruta | Semántica existente de `projectId` | Resultado |
| --- | --- | --- |
| `/admin/projects` | abre la ficha y sus tabs | habilitado |
| `/admin/geobi` | carga el contexto territorial del proyecto | habilitado |
| `/admin/reports/history` | limita el historial a informes que incluyen el proyecto | habilitado |
| Inicio, Indicadores y Datos | no existe aún un contrato homogéneo | no se muestra |
| Configuración y Administración | el contexto operativo no aplica | no se muestra |

La navegación del `AppShell` conserva el proyecto cuando el destino está en la lista anterior. Nunca agrega el parámetro a una pantalla que lo ignoraría, para no prometer un filtrado inexistente.

## Scope y permisos

- Las opciones se obtienen desde `GET /admin/projects` con el alcance actual (`active` o `global`).
- La carga requiere `projects.read` o equivalencia de superadministración mediante el evaluador común de capacidades.
- Un cambio de EGI o alcance vuelve a consultar las opciones.
- Los deep links históricos conservan su `projectId`; la pantalla destino y el backend resuelven visibilidad y autorización sin que el selector cliente reescriba silenciosamente la URL.
- El backend continúa siendo autoridad de alcance y autorización; el selector no amplía permisos.

## Dimensiones aún no habilitadas

| Dimensión | Motivo |
| --- | --- |
| Territorio | GIS y proyectos todavía usan identificadores y granularidades diferentes |
| Periodo | informes usan año; proyectos e indicadores manejan rangos y cortes diferentes |
| Institución | no todos los módulos aceptan o aplican el mismo filtro |
| Estado | los catálogos de estado son propios de cada entidad |

Estas dimensiones solo deben incorporarse después de definir contrato, serialización URL, alcance backend y pruebas de autorización para todos los consumidores.

## Verificación

| Verificación | Resultado |
| --- | --- |
| typecheck y build del frontend | aprobado |
| pruebas Node | 113/113 aprobadas |
| pruebas Python | 6/6 aprobadas |
| E2E completo | 33 aprobadas, 2 demos opt-in omitidas |
| E2E del filtro global, incluida recarga e historial | aprobado |
| smoke del frontend único | 39/39 comprobaciones aprobadas |
| Docker `sigi-ux-v2` | frontend, API, PostgreSQL, GIS y GeoServer saludables |

La candidata actualizada está disponible en `http://127.0.0.1:5374`; la API permanece en `http://127.0.0.1:3200/api`. Imagen frontend validada: `sha256:92aca983f7d2d4cb832c62726ec7d527dc3185c7194a0bb974b433e5919ac5f0`.
