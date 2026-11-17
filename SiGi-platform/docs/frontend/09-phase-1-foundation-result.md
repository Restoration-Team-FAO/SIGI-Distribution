# 09 — Resultado de Fase 1: Fundación

Fecha de cierre: 2026-09-21  
Rama: `feature/ux-ui-v2`  
Alcance: frontend autenticado `frontend-admin`, sin cambios de contratos API, backend o base de datos.

## Resultado

La aplicación autenticada dispone ahora de una fundación única y explícitamente orientada a capacidades. El shell dejó de presentarse como un producto administrativo separado: muestra la marca `SIGI`, organiza la navegación por dominios funcionales y mantiene Administración como una sección del mismo producto visible solo cuando corresponde.

`frontend-country` se conserva sin modificaciones como referencia temporal del portal público y mecanismo de rollback. Su retirada no forma parte de esta fase.

## Qué cambió

- `WorkspaceShell` fue renombrado a `AppShell` y continúa alojando sesión, EGI activo, navegación, contexto de usuario y contenido lazy.
- La identidad visible cambió de “SIGI Admin” a “SIGI”.
- El catálogo de rutas agrupa la navegación en `Inicio`, `Proyectos`, `Territorio`, `Indicadores`, `Datos`, `Informes` y `Administración`.
- Los dominios sin ruta real, como `Indicadores`, no producen entradas vacías ni enlaces simulados.
- `canAccessCapability` es la evaluación común para menú y protección de rutas.
- `PermissionGate` normaliza el estado `Sin permiso` y reutiliza componentes de `@sigi/ui`.
- Los estados de carga y EGI requerido usan componentes compartidos en lugar de estilos inline duplicados.
- Las migas de pan derivadas del catálogo muestran `Inicio / dominio / página`; `Inicio` es navegable.
- Los tests E2E verifican la nueva arquitectura de menú, breadcrumb y denegación directa por URL.

## Qué se reutilizó

- autenticación y restauración de deep links existentes;
- `EgiContext`, selector de espacio y scope activo;
- `route-catalog.ts` como fuente de rutas, metadatos y navegación;
- páginas y carga diferida existentes;
- servicios `workspaceApi` y `publicApi`;
- estados compartidos de `@sigi/ui`;
- guards backend basados en roles y permisos.

No se duplicaron pantallas ni se creó una tercera aplicación.

## Qué se eliminó

- el concepto y nombre interno `WorkspaceShell`;
- el branding de “consola administrativa” en el shell autenticado;
- la duplicación de lógica de permisos entre menú y router;
- el estado de acceso restringido implementado localmente con estilos inline;
- las agrupaciones heredadas `Proyectos y territorio`, `Datos y operación` y `Reportes`.

No se eliminó `frontend-country`, ninguna ruta funcional, endpoint ni contrato.

## Estado funcional

### Real

- login, logout y restauración de ruta protegida;
- selección y edición de EGI según capacidad;
- proyectos, fuentes, Kobo/Odoo, validaciones, publicaciones y archivos;
- catálogo/servicios GIS y flujos mapa–ficha–filtros–exportación;
- informes, plantillas, generación, historial y compromisos según permiso;
- administración de usuarios, roles, instituciones, auditoría y configuración autorizada;
- enforcement backend de 401/403 y visibilidad geográfica.

### Mixto o estático

- Home autenticado: agrega datos reales, pero aún no es el Home 360 objetivo;
- Visualizador BI y Estado de módulos: combinan datos reales con presentación técnica/estática;
- páginas públicas migradas de Dashboard, Calidad, Restauración, Informes e Integraciones: consumen datos públicos donde existe contrato, pero conservan bloques editoriales/estáticos;
- `frontend-country` mantiene fixtures en `mocks/dashboard-fixtures.ts` y no se considera fuente funcional del frontend autenticado.

### Pendiente, sin mock compensatorio

- Home 360 orientado a trabajo y atención;
- “Mi trabajo” con agregación backend;
- búsqueda global multi-entidad;
- Ask SIGI;
- módulo autenticado de Indicadores;
- filtros globales persistentes;
- relaciones navegables entre proyecto, indicador, territorio, evidencia e informe;
- extracción de componentes públicos/GIS duplicados;
- retirada posterior de `frontend-country`.

## Permisos aplicados

- El menú y las rutas usan la misma semántica: permisos `all`/`any`, roles equivalentes y bypass explícito de `superadmin`.
- Una ruta directa no autorizada renderiza `Sin permiso`; ocultar el menú no se trata como control de seguridad.
- El backend continúa siendo la autoridad final para datos y mutaciones.
- Los códigos UI sin decorador backend confirmado (`projects.configure`, `gis.configure`, `data.configure`, `monitoring.configure`, `reports.config.manage`) se mantienen como aliases de experiencia junto con roles/permisos backend equivalentes; no se presentan como autorización backend autónoma.
- Las rutas que requieren EGI bloquean la operación hasta seleccionar o crear un espacio.

## Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `npm run typecheck:admin` | PASS |
| `npm run build:admin` | PASS, 108 módulos |
| `npm run lint` | PASS, incluye typecheck global y verificaciones de entorno/Compose |
| `npm run test:unit` | PASS, 89 Node + 6 Python |
| `npm run test:e2e` | PASS, 25/25 |
| `npm run smoke:roles` | PASS, 36/36 |
| `npm run smoke:unified-frontend` | PASS, 50/50; 11 rutas públicas y 2 de acceso |
| `npm run smoke:geo-visibility` | PASS, 4/4 |
| `npm run smoke:geo-api` | PASS, 60/60 |

## Docker de revisión

- proyecto Compose: `sigi-ux-v2`;
- candidato unificado: `http://127.0.0.1:5374`;
- referencia Country: `http://127.0.0.1:5373`;
- API: `http://127.0.0.1:3200/api`;
- GeoServer: `http://127.0.0.1:8281/geoserver`;
- imagen del candidato: `sha256:ddc05dd5a19371db5a681b0bca26a2d55ae5ed4544943e886d06d4ce2db37964`;
- servicios del proyecto comprobados en estado saludable.

## Riesgos y siguiente gate

- La unificación de experiencia no equivale todavía a retirar el artefacto Country.
- Los aliases de permisos UI requieren consolidación backend antes de ampliar configuraciones.
- La duplicación física de vistas públicas y GIS debe resolverse solo después de pruebas de equivalencia.
- Home 360 y “Mi trabajo” necesitan contratos reales; no deben construirse con fixtures.

El siguiente incremento autorizado por el roadmap es la Fase 2. Su gate previo es mapear cada widget a una fuente real y acordar el endpoint agregador de pendientes.
