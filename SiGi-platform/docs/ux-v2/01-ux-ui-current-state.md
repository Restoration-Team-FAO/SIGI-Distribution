# UX/UI V2 — Estado actual

Fecha: 2026-09-17

## Baseline protegido

| Elemento | Valor |
| --- | --- |
| rama estable | `integration/sigi-v1-reconciled` |
| commit | `5d18aace38705e92fd75197cb25ff714142ed153` |
| rama UX | `feature/ux-ui-v2` |
| worktree UX | `C:\GIT\SIGI\_ux_ui_v2` |
| worktree baseline | `C:\GIT\SIGI\_main_realign` |

El baseline estaba limpio al crear la rama. No se hizo pull porque la rama
validada contiene commits locales deliberados y no se autorizó integrar otro
historial. Toda comparación usa el commit inmutable anterior.

## Resumen ejecutivo

SIGI ya tiene una identidad institucional reconocible, navegación lateral,
estados funcionales, permisos y recorridos reales. La deuda principal no es la
ausencia de interfaz, sino la acumulación: demasiadas opciones compiten al mismo
nivel, las páginas de alta complejidad mezclan consulta y edición, y cada módulo
reimplementa controles y estilos.

Mediciones del código actual:

- Admin: 1.395 declaraciones `style={{...}}`; `ProjectsModulePage` tiene 2.493
  líneas y `GeoBiModulePage` 4.193;
- Country: 378 estilos inline; `ProjectsPage` tiene 543 líneas y `GeoBiPage`
  2.472;
- el sidebar Admin contiene siete grupos y más de treinta destinos, incluyendo
  duplicados conceptuales como Inicio, Módulos, Resumen regional y Tableros;
- existen dos `section-kit` independientes y solo Country cuenta con estados
  reutilizables explícitos de loading/error/empty;
- `PageLead` en Admin no renderiza contenido: el encabezado depende por completo
  de la topbar global;
- hay breakpoints para laptop/tablet; Admin tiene drawer móvil, mientras Country
  convierte toda la navegación en una grilla larga antes del contenido;
- el foco visible está definido globalmente en Admin, pero no existe una política
  equivalente y completa en Country.

## Hallazgos por categoría

| Categoría | Hallazgo | Impacto | Prioridad |
| --- | --- | --- | --- |
| NAVIGATION | Sidebar Admin demasiado largo y con destinos repetidos | localizar una tarea exige escaneo y memoria | P0 UX |
| DISCOVERABILITY | acciones primarias aparecen dentro de paneles extensos; crear/editar comparte superficie | acciones reales existen pero cuesta encontrarlas | P0 UX |
| INFORMATION ARCHITECTURE | organización actual mezcla dominio, tipo de pantalla y tecnología | Kobo/Odoo/API compiten con proyectos y reportes | P0 UX |
| COGNITIVE LOAD | detalle de proyecto presenta ficha, actores, hitos, entregables, archivos y mapa en una sola secuencia | alta carga y scroll | P0 UX |
| CONSISTENCY | controles, tarjetas, botones y estados se recrean con estilos inline | diferencias visuales y mantenimiento costoso | P0 UX |
| EFFICIENCY | filtros y selección suelen estar separados de tabla/detalle; no hay toolbar estándar | más desplazamiento y cambios de contexto | P1 UX |
| FEEDBACK | varios estados vacíos usan el texto “Cargando” porque vacío y loading comparten condición | el usuario no sabe si esperar o actuar | P0 UX |
| ACCESSIBILITY | foco y labels son desiguales; iconografía y tooltips no siguen un contrato común | teclado/lector de pantalla inconsistentes | P0 UX |
| VISUAL HIERARCHY | tarjetas KPI abundantes y encabezados de página duplican la topbar o desaparecen | no siempre queda clara la tarea principal | P1 UX |
| RESPONSIVENESS | GIS y formularios extensos dependen de grids fluidos, sin patrón drawer/panel móvil | tablet y móvil de consulta son frágiles | P1 UX |

## Evaluación por superficie

### Shell y navegación

- Fortalezas: ruta activa, agrupación, colapso, búsqueda Admin, contexto EGI,
  permisos y drawer Admin.
- Problemas: densidad alta; jerarquía no orientada a tareas; Country no tiene
  navegación móvil compacta; topbar mezcla contexto, recarga, ayuda, sesión y
  fecha con la misma importancia; no hay breadcrumbs.

### Dashboard

- Fortalezas: datos de API, estados y narrativa territorial.
- Problemas: predominan tarjetas y bloques equivalentes; falta separar situación,
  atención requerida, cambios y accesos siguientes; el significado del corte de
  datos no siempre acompaña cada métrica.

### Proyectos

- Fortalezas: búsqueda/filtros, CRUD, permisos, actores, hitos, entregables,
  documentos, territorio e indicadores conectados.
- Problemas: lista y formulario compiten; la ficha maestra es un formulario largo;
  el detalle no tiene navegación local; las acciones de guardar quedan lejos del
  contexto; estilos locales impiden densidad consistente.

### GIS

- Fortalezas: catálogo, múltiples capas, búsqueda territorial, filtros, tabla,
  ficha, metadata, exportación, vistas y fuentes externas reales.
- Problemas: demasiados controles simultáneos; paneles no tienen estados de
  expansión previsibles; el mapa pierde área útil; la relación selección → ficha
  → atributos requiere jerarquía espacial más clara.

### Tablas, filtros y formularios

- No existe un contrato único para cabecera, búsqueda, filtros, limpiar,
  paginación, selección o acciones por fila.
- Formularios extensos usan grids flexibles, pero carecen de secciones,
  descripción de impacto y barra de acciones persistente.
- La validación funcional existe, aunque no siempre se presenta junto al campo.

### Estados y feedback

- Admin usa principalmente `MessageBlock`; Country tiene `LoadingState`,
  `ErrorState` y `EmptyState`.
- Falta distinguir sistemáticamente `EMPTY`, `NO RESULTS`, `NO PERMISSION` y
  `DEPENDENCY ERROR`.
- No hay infraestructura común de toast; el éxito suele ocupar un bloque dentro
  del flujo y desaparecer al navegar.

## Riesgos de regresión

1. ocultar una acción por reorganizar navegación sin replicar el permiso;
2. desmontar componentes GIS y perder estado, selección o caché;
3. separar Project Detail sin conservar formularios y endpoints existentes;
4. confundir “sin datos” con error y alterar pruebas de baseline vacío;
5. cambiar texto/roles accesibles usados por Playwright;
6. mover contexto EGI fuera del ciclo que actualiza `X-SIGI-EGI-ID`.

## Decisión de auditoría

La modernización debe ser incremental. Primero tokens, primitives y shell;
después las cuatro pantallas de referencia. No se modifica backend, rutas,
servicios API, modelos ni reglas de permisos en UX-1.
