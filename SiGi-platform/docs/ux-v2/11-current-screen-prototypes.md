# SIGI — Prototipos técnicos de las pantallas actuales

## 1. Estado del documento

| Campo | Valor |
| --- | --- |
| Tipo | Documentación técnica **as-built** |
| Rama documentada | `feature/ux-ui-v2` |
| Commit de referencia | `14dc75dd` |
| Frontends | `frontend-admin` y `frontend-country` |
| Baseline funcional de comparación | `integration/sigi-v1-reconciled` · `5d18aace` |
| Fecha | 2026-09-18 |

Este documento describe las pantallas que existen actualmente, su composición, lo que hace cada módulo, sus rutas y sus límites de acceso. Los diagramas son prototipos textuales de implementación; no representan pantallas futuras ni sustituyen el código.

## 2. Convenciones

- **Portal país:** consulta pública, sin autenticación administrativa.
- **Consola administrativa:** requiere una sesión válida.
- **EGI activo:** contexto obligatorio para la mayoría de operaciones administrativas. El frontend lo envía al API en `X-SIGI-EGI-ID`.
- **Operación:** trabajo cotidiano del usuario.
- **Configuración:** catálogos, parámetros, mapeos e integraciones técnicas.
- **Administración:** usuarios, roles, instituciones, auditoría y gobierno transversal.
- **Deep link:** URL que conserva una vista o filtro, por ejemplo `/admin/projects?view=territory`.

## 3. Shell común

### 3.1 Consola administrativa

```text
┌───────────────────┬─────────────────────────────────────────────────────┐
│ SIGI Admin        │ Migas / título / contexto EGI / ayuda / usuario     │
│ Buscar módulo     ├─────────────────────────────────────────────────────┤
│                   │ PageHeader                                          │
│ Inicio            │ título + contexto + acción primaria + configuración │
│ Proyectos y       │                                                     │
│ territorio        │ Tabs locales del módulo                             │
│ Datos y operación ├─────────────────────────────────────────────────────┤
│ Reportes          │ Contenido operativo                                 │
│ Administración    │ loading / empty / error / success / resultados      │
│                   │                                                     │
│ Sesión + EGI      │                                                     │
└───────────────────┴─────────────────────────────────────────────────────┘
```

Responsabilidades del shell:

- navegación global por dominios;
- búsqueda de módulos;
- menú colapsable y drawer móvil;
- indicación de ruta activa;
- selección y visualización del EGI;
- breadcrumb;
- ayuda y sesión del usuario;
- ocultamiento de entradas no autorizadas.

La barra lateral no contiene configuración interna de módulos. Esa configuración se abre mediante `⚙ Configuración` desde el encabezado del módulo y solo aparece cuando el rol o permiso lo permite.

### 3.2 Portal país

```text
┌───────────────────┬─────────────────────────────────────────────────────┐
│ Portal SIGI       │ Migas / título / modo del portal / actualización    │
│                   ├─────────────────────────────────────────────────────┤
│ Visión general    │ Narrativa pública y filtros                         │
│ Operación         │                                                     │
│ territorial       │ KPIs / mapas / gráficos / listados                  │
│ Control y gestión │                                                     │
│                   │ Solo datos autorizados para publicación             │
└───────────────────┴─────────────────────────────────────────────────────┘
```

El portal utiliza endpoints públicos y no debe exponer registros internos, credenciales ni acciones administrativas.

## 4. Mapa general de pantallas administrativas

| Módulo/pantalla | Ruta | Qué hace | Acceso mínimo |
| --- | --- | --- | --- |
| Inicio | `/admin` | Resume la situación del EGI, asuntos que requieren atención y accesos rápidos. | Sesión válida |
| Centro de Ayuda | `/admin/help` | Manual, capacitación, preguntas frecuentes y contenido de soporte. | Sesión válida |
| Mis espacios | `/admin/egi` | Lista, selecciona, crea y edita el EGI activo y sus membresías según permiso. | Sesión válida; mutaciones gobernadas por permisos EGI |
| Resumen regional | `/admin/modules` | Presenta cobertura funcional y estado agregado de módulos. | Cualquiera de los permisos de fuentes, conectores, validaciones, publicaciones, incidentes o auditoría |
| Flujos | `/admin/flow` | Explica y rastrea el recorrido fuente → importación → validación → publicación. | Cualquiera de los permisos operativos asociados |
| Instituciones | `/admin/institutions` | Consulta y administra instituciones participantes. | `institutions.read`; mutaciones con permisos específicos |
| Proyectos | `/admin/projects` | Opera cartera, fichas, territorio, indicadores, documentos y actividad. | `projects.read` + EGI |
| Configuración de Proyectos | `/admin/projects/config` | Separa estados, prioridades, tipos y reglas territoriales del flujo diario. | rol administrador o `projects.configure` |
| Mapa SIGI / Geo-BI | `/admin/geobi` | Explora capas, mapas, atributos, filtros, metadatos y salidas geográficas. | Cualquiera de `validations.read`, `connectors.read`, `sources.read`, `imports.read`, `audit.read` + EGI |
| Configuración GIS | `/admin/geobi/config` | Centraliza catálogo técnico, GeoServer, CRS, visibilidad y permisos. | rol administrador, `gis.configure` o `publications.publish` |
| Catálogo geográfico | `/admin/geospatial-catalog` | Importa, publica, exporta o retira capas administradas. | `connectors.read`; mutaciones con `imports.upload` o `publications.publish` |
| Visualizador BI | `/admin/bi-visualizer` | Construye una lectura analítica con dimensiones, indicadores y visualizaciones. | Algún permiso de proyectos, instituciones, conectores, publicaciones o incidentes |
| Fuentes e importaciones | `/admin/sources` | Opera fuentes, archivos CSV/XLSX, lotes, errores y trazabilidad de importación. | `sources.read` + EGI |
| Configuración de Datos | `/admin/data/config` | Agrupa conectores, Odoo, Kobo, mapeos y reglas técnicas. | rol administrador o permisos equivalentes de fuentes/conectores |
| Odoo | `/admin/sources/odoo` | Configura conexión, prueba acceso, previsualiza alcance y ejecuta sincronización. | `sources.read`; acciones con permisos de fuente/conector |
| KoboToolbox | `/admin/sources/kobo` | Prueba conexión, previsualiza submissions y ejecuta sincronización o promoción. | `sources.read`; acciones con `connectors.run`/`imports.upload` |
| Conectores | `/admin/connectors` | Gestiona conectores y ejecución de puentes técnicos. | `connectors.read`; mutaciones con permisos específicos |
| Monitoreo y validaciones | `/admin/validations` | Presenta calidad, casos, responsables, hallazgos y alertas. | `validations.read` + EGI |
| Configuración de Monitoreo | `/admin/monitoring/config` | Separa reglas, asignaciones y umbrales del seguimiento diario. | rol administrador, `monitoring.configure` o `validations.assign` |
| Publicaciones | `/admin/publications` | Consulta salidas, canales y estado de publicación. | `publications.read` + EGI |
| Archivos | `/admin/files` | Explora carpetas, archivos, versiones, vínculos, metadatos y auditoría. | `files.read` + EGI |
| Reportes | `/admin/reports/*` | Consulta, genera, revisa, versiona, aprueba, publica y exporta informes. | `reports.read` + EGI; cada acción exige su permiso |
| Configuración de Reportes | `/admin/reports/config` | Mantiene mapeos y perfil metodológico. | `reports.config.manage` o `reports.mappings.manage` |
| Plantillas | `/admin/reports/templates` | Mantiene estructuras versionadas de reportes. | `reports.templates.manage` |
| Programaciones | `/admin/reports/schedules` | Administra calendario, compromisos, aportes y recordatorios. | `reports.commitments.manage` |
| Usuarios | `/admin/users` | Lista usuarios, roles, permisos, estado y alcance. | `users.read` |
| Alta de usuario | `/admin/users/new` | Crea un usuario y asigna alcance/roles permitidos. | `users.create` |
| Bitácora | `/admin/audit` | Consulta eventos auditables del contexto activo. | `audit.read` + EGI |
| API | `/admin/api` | Presenta estado y exposición operativa de servicios. | `audit.read` + EGI |

## 5. Prototipos de los módulos administrativos principales

### 5.1 Inicio / Dashboard

```text
┌ Panel principal · {EGI} ─────────────────────── [{código EGI}] ┐
│ Lectura priorizada de situación y acciones                     │
├ Atención requerida ────────────────────────────────────────────┤
│ validaciones pendientes / alertas       [Validar] [Proyectos] │
├────────────┬────────────┬────────────┬─────────────────────────┤
│ Usuarios   │ Fuentes    │ Documentos │ Actividad últimos 7 días│
├─────────────────────────┬──────────────────────────────────────┤
│ Contexto activo         │ Capacidad operativa                 │
├─────────────────────────┴──────────────────────────────────────┤
│ Ruta operativa: usuarios / fuentes / proyectos / archivos ... │
└────────────────────────────────────────────────────────────────┘
```

Hace lo siguiente:

- consulta el resumen del EGI activo;
- prioriza validaciones y alertas antes de los KPIs;
- muestra usuarios, fuentes, documentos, proyectos, importaciones y publicaciones;
- ofrece enlaces a las siguientes tareas;
- presenta estados explícitos de carga, error y ausencia de EGI.

### 5.2 Proyectos

Rutas de pestañas:

- `?view=summary`: situación ejecutiva;
- `?view=portfolio`: cartera y ficha editable;
- `?view=indicators`: indicadores del proyecto enfocado;
- `?view=territory`: mapa y cobertura;
- `?view=documents`: documentos y evidencia;
- `?view=activity`: incidencias y auditoría.

```text
┌ Gestión de proyectos y portafolios ─ [Nuevo] [⚙ Configuración] ┐
│ [Resumen] [Cartera] [Indicadores] [Territorio] [Documentos]    │
│ [Actividad]                                                     │
├─────────────────────────────────────────────────────────────────┤
│ Resumen: contexto EGI + situación + KPIs                        │
│ Cartera: filtros + lista      │ ficha maestra y acciones         │
│ Indicadores: valor / línea base / meta / avance                 │
│ Territorio: mapa ejecutivo u operativo + polígono               │
│ Documentos: evidencia declarada y archivos vinculados           │
│ Actividad: incidencias y eventos auditables                      │
└─────────────────────────────────────────────────────────────────┘
```

Operaciones preservadas:

- filtro por visibilidad, estado e institución;
- selección y deep link de proyecto mediante `projectId`;
- creación y edición de ficha maestra;
- actores, hitos, indicadores, territorio, entregables e incidencias;
- polígono propio en GeoJSON;
- carga, vínculo, versión, descarga y auditoría de archivos;
- vista por EGI o global cuando el backend lo autoriza.

### 5.3 Datos

```text
┌ Fuentes e importaciones ──────────────────── [⚙ Configuración] ┐
│ [Fuentes] [Importaciones] [Calidad] [Validaciones]             │
├────────────────────────────────────────────────────────────────┤
│ KPIs de fuentes / lotes / errores / filas procesadas           │
├───────────────────────────┬────────────────────────────────────┤
│ Fuentes y selección       │ Detalle / carga / mapping / preview│
├───────────────────────────┴────────────────────────────────────┤
│ Historial de batches + errores + trazabilidad                  │
└────────────────────────────────────────────────────────────────┘
```

El flujo operativo permite consultar fuentes, cargar archivos, detectar entidad, mapear columnas, previsualizar, importar y revisar errores por lote. La configuración técnica de conectores, Odoo y Kobo se abre desde `/admin/data/config`.

### 5.4 GIS / Geo-BI

```text
┌ SIGI Geo/BI ──────────────────────────────── [⚙ Configuración] ┐
│ [Mapa] [Capas] [Catálogo] [Publicaciones]                     │
├──────────────┬──────────────────────────┬──────────────────────┤
│ Catálogo     │ MAPA                     │ Ficha / atributos    │
│ búsqueda     │ base / zoom / selección  │ metadata / fuente    │
│ visibilidad  │ capas activas / leyenda  │ calidad / descarga   │
│ opacidad     │                          │                      │
├──────────────┴──────────────────────────┴──────────────────────┤
│ Tabla de atributos / filtros / paginación / exportación       │
└───────────────────────────────────────────────────────────────┘
```

Funciones principales:

- catálogo y activación simultánea de capas;
- búsqueda territorial por nombre o código;
- fondos cartográficos y overlays WMS;
- identificación sincronizada mapa ↔ tabla ↔ ficha;
- filtros por campo, ordenamiento, paginación y exportación CSV/GeoJSON;
- metadatos, esquema y perfil de calidad;
- vistas guardadas en el navegador;
- importación y publicación cuando el permiso lo autoriza;
- configuración técnica separada en `/admin/geobi/config` y `/admin/geospatial-catalog`.

### 5.5 Monitoreo y validaciones

```text
┌ Calidad y trazabilidad técnica ────────────── [⚙ Configuración] ┐
│ [Resumen] [Casos] [Indicadores] [Alertas]                       │
├─────────────────────────────────────────────────────────────────┤
│ Aprobadas │ Advertencias │ Fallidas │ Asignadas │ Trazadas      │
├───────────────────────────────┬─────────────────────────────────┤
│ Bandeja de casos              │ Caso enfocado                   │
│ estado / regla / severidad    │ responsable / evidencia / fecha│
└───────────────────────────────┴─────────────────────────────────┘
```

Permite revisar señales de calidad y asignar casos cuando existe `validations.assign`. Las reglas, umbrales y asignaciones administrativas se documentan y agrupan en `/admin/monitoring/config`.

### 5.6 Reportes

```text
┌ Reportes ───────────────────────────── [Nuevo informe] [⚙ Configuración] ┐
│ [Disponibles] [Borradores] [Generados]                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ KPIs / compromisos / notificaciones / plantillas habilitadas            │
├──────────────────────────────┬──────────────────────────────────────────┤
│ Historial y filtros          │ Detalle, cobertura, versiones y acciones │
└──────────────────────────────┴──────────────────────────────────────────┘

Configuración autorizada:
[Mapeos] [Plantillas] [Programación]
```

Subrutas operativas:

- `/admin/reports/new`: asistente de ocho pasos;
- `/admin/reports/national`, `/regional`, `/btr`, `/ndc`, `/gbf-target-2`, `/ldn`, `/custom`: workspace por marco;
- `/admin/reports/history`: historial, búsqueda, estado y versión.

El workflow conserva permisos separados para crear, editar, generar, revisar, solicitar cambios, aprobar, publicar y exportar.

### 5.7 Archivos

```text
┌ Explorador documental ─────────────────────────────────────────┐
│ búsqueda / carpeta / tipo / institución / proyecto / estado    │
├──────────────────┬─────────────────────┬───────────────────────┤
│ Árbol de carpetas│ Lista de archivos   │ Detalle y preview     │
│                  │                     │ versiones / vínculos  │
│                  │                     │ auditoría / descarga  │
└──────────────────┴─────────────────────┴───────────────────────┘
```

Administra archivos reales, metadatos, versiones y asociaciones con entidades. Las acciones visibles dependen de permisos como lectura, carga, actualización, descarga y compartir.

### 5.8 EGI, instituciones, usuarios y auditoría

| Pantalla | Responsabilidad técnica |
| --- | --- |
| Mis espacios | Define el contexto de aislamiento de datos; selecciona y edita el EGI activo. |
| Instituciones | Mantiene entidades participantes, estado y datos institucionales. |
| Usuarios | Mantiene identidad, roles y alcance autorizado. |
| Bitácora | Expone eventos de seguridad y operación con actor, entidad, acción, resultado y fecha. |
| API | Presenta el estado de la superficie de servicios para operación técnica. |

## 6. Mapa de pantallas del portal país

| Pantalla | Ruta | Qué presenta al público |
| --- | --- | --- |
| Tablero Ejecutivo | `/dashboard` | KPIs, filtros, mapa, estado, tendencia y distribuciones del corte público. |
| Resumen regional | `/territory` | Lectura por región, provincia o municipio. |
| Monitoreo territorial | `/restoration` | Seguimiento de restauración, ecosistemas y proyectos alineado a FERM. |
| Proyectos | `/projects` | Cartera publicada, cobertura, portafolios y ficha pública. |
| Mapa SIGI | `/geo-bi` | Capas publicables, búsqueda, mapa, atributos, metadata y exportación permitida. |
| Captura KoboToolbox | `/integrations` | Estado narrativo del flujo de captura y sincronización de campo. |
| Monitoreo satelital | `/indicators` | Indicadores y señales públicas de observación territorial. |
| Alertas tempranas | `/incidents` | Incidentes y riesgos autorizados para exposición. |
| Calidad de datos | `/quality` | Puntajes, validaciones y consistencia de la información publicada. |
| Reportes | `/reports` | Informes y salidas institucionales publicadas. |
| Documentos | `/documents` | Archivos públicos y metadatos autorizados. |
| Administración | `/administration` | Explica gobierno y ofrece acceso a la consola administrativa. |

### 6.1 Dashboard público

```text
┌ Tablero Ejecutivo ───────────────────────────── [Modo] [Actualizar] ┐
│ Año │ Institución │ Tipo │ Ecosistema/capa │ Fuente visible        │
├──────────┬──────────┬──────────┬──────────┬────────────────────────┤
│ Área     │ Proyectos│ Instituc.│ Indicad.  │ Alertas / calidad      │
├────────────────────────────────┬──────────────────────────────────┤
│ Mapa de coberturas y proyectos │ Estado general del corte         │
├───────────────┬────────────────┬───────────────────────────────────┤
│ Tendencia     │ Intervención   │ Cobertura por institución        │
└───────────────┴────────────────┴───────────────────────────────────┘
```

Responde qué está ocurriendo, dónde ocurre, qué requiere atención y qué subconjunto producen los filtros.

### 6.2 Proyectos públicos

```text
┌ Cartera nacional ───────────────────────────────────────────────┐
│ KPIs + narrativa ejecutiva + resumen                           │
├────────────────────────────────────────────────────────────────┤
│ Mapa territorial del portafolio                                │
├──────────────────────────┬─────────────────────────────────────┤
│ Lista de proyectos       │ Portafolios                         │
├──────────────────────────┴─────────────────────────────────────┤
│ Ficha: resumen / indicadores / territorio / entregables        │
└────────────────────────────────────────────────────────────────┘
```

Acepta `projectId` en la URL para abrir una ficha concreta desde GIS u otro módulo.

### 6.3 GIS público

La estructura replica el patrón profesional de GIS administrativo, pero solo carga capas y atributos publicables. No muestra importación, credenciales, administración de GeoServer ni opciones internas.

## 7. Estados de interfaz

Toda pantalla nueva o migrada debe utilizar estos estados:

| Estado | Cuándo aparece | Respuesta esperada |
| --- | --- | --- |
| `LOADING` | La consulta aún no termina. | Mantener contexto y anunciar carga. |
| `EMPTY` | No existen datos en el alcance. | Explicar el estado y ofrecer una acción válida. |
| `NO_RESULTS` | Los filtros no producen coincidencias. | Conservar filtros y permitir limpiarlos. |
| `ERROR` | Falla una operación o dependencia. | Mensaje comprensible y opción de reintento cuando aplica. |
| `SUCCESS` | Una mutación termina correctamente. | Confirmación visible y datos actualizados. |
| `NO_PERMISSION` | Falta rol o permiso. | No renderizar controles protegidos y mostrar acceso restringido en URL directa. |
| `DEPENDENCY_ERROR` | API, GeoServer o integración no responde. | Identificar la dependencia sin inventar datos. |

## 8. Seguridad y autorización

```text
Ruta frontend
  → PermissionRouteGate
  → sesión + EGI + rol/permiso
  → pantalla
  → llamada API con bearer token + X-SIGI-EGI-ID
  → BearerAuthGuard + Roles/Permissions
  → política de alcance
  → servicio / base de datos
```

Reglas:

- ocultar un botón no concede ni revoca seguridad;
- las mutaciones se autorizan nuevamente en backend;
- una URL de configuración directa sin autorización muestra acceso restringido;
- un endpoint protegido sin permiso devuelve `403`;
- los endpoints públicos filtran visibilidad y nunca dependen de la UI administrativa.

La regresión vigente valida 21 escenarios Playwright y 36 verificaciones de roles/API, incluidos accesos `403` a configuración.

## 9. Dependencias técnicas

| Capa | Responsabilidad |
| --- | --- |
| `apps/frontend-admin` | Operación autenticada, configuración y administración. |
| `apps/frontend-country` | Consulta pública del SIGI. |
| `libs/ui` | Tokens y componentes compartidos de interfaz. |
| `apps/sigi-api` | Contratos HTTP, autenticación, autorización y orquestación. |
| PostgreSQL/PostGIS | Persistencia operativa y geoespacial. |
| GeoServer | WMS y publicación de capas cuando está habilitado. |
| Integration service | Procesos de integración técnica. |
| GIS service | Capacidades geoespaciales auxiliares. |

## 10. Referencias de código

- Shell y rutas admin: `apps/frontend-admin/src/App.tsx`
- Shell y rutas públicas: `apps/frontend-country/src/App.tsx`
- Encabezado estándar: `apps/frontend-admin/src/components/ModuleWorkspaceHeader.tsx`
- Configuración modular: `apps/frontend-admin/src/pages/ModuleConfigurationPage.tsx`
- Primitivas UI: `libs/ui/src/index.tsx`
- Tokens: `libs/ui/src/tokens.css`
- Matriz operación/configuración: `docs/ux-v2/10-module-operation-vs-configuration.md`

## 11. Mantenimiento del documento

Actualizar este archivo cuando ocurra cualquiera de estos cambios:

1. se agrega, elimina o renombra una ruta;
2. cambia el permiso mínimo de una pantalla o acción;
3. una función se mueve entre operación y configuración;
4. se agrega una pestaña o deep link;
5. cambia un contrato API visible para el usuario;
6. una pantalla de referencia modifica su estructura principal.

La actualización debe indicar el commit de referencia y conservar la diferencia entre comportamiento implementado y trabajo futuro.
