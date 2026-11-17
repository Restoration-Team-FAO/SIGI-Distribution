# Plan de auditoría, integración y validación

## Sprint 1R — Inventario funcional verificable

Objetivo: registrar el comportamiento del baseline antes de tocarlo.

Entregables:

- catálogo de rutas y pantallas de ambos frontends;
- matriz pantalla → acción → endpoint → tabla → resultado;
- clasificación `REAL`, `PARCIAL`, `MOCK`, `ROTO`, `NO CONECTADO`;
- catálogo de roles, permisos y visibilidad EGI/institución;
- flujos dorados para proyectos, indicadores, GIS, archivos, reportes,
  Kobo, Odoo, importaciones y publicaciones;
- casos Playwright iniciales usados como protección contra regresiones.
- registro de aceptación que identifique qué comportamientos ya fueron probados
  por el usuario y cuáles aún necesitan confirmación.

El Sprint 1R no integra todavía código de la RC.

## Sprint 2R — Auditoría técnica y mapa de portabilidad

Objetivo: revisar archivo por archivo los controles de la RC contra la
arquitectura funcional demo.

Entregables:

- comparación de esquema y migraciones;
- análisis de autenticación, autorización y tenant scope;
- análisis Docker/TLS/redes/volúmenes;
- análisis GIS, GeoServer y uploads;
- análisis CI, pruebas, backup/restore y observabilidad;
- matriz por commit: `PORTAR`, `ADAPTAR`, `REIMPLEMENTAR`, `DESCARTAR`.

## Sprint 3R — Fundación de integración

Crear `integration/sigi-v1-reconciled` desde el baseline aprobado e incorporar:

- higiene del repositorio;
- build reproducible;
- configuración sin secretos inseguros;
- migraciones base e índice GiST;
- gates mínimos que no alteren la funcionalidad.

## Sprint 4R — Infraestructura y operación

- Compose de producción;
- Caddy/TLS;
- redes y exposición mínima;
- roles PostgreSQL/GeoServer;
- volúmenes, backup y restore;
- health, readiness y límites de logs.

## Sprint 5R — Identidad y aislamiento

- usuarios individuales;
- sesiones, expiración y revocación;
- roles y permisos reales;
- aislamiento por institución y EGI;
- cuentas de servicio;
- pruebas negativas de acceso cruzado.

## Sprint 6R — Endurecimiento por dominio

- archivos y uploads;
- conectores y SSRF;
- proyectos e indicadores;
- importaciones;
- GIS y GeoServer;
- reportes y dashboards;
- auditoría y calidad.

Cada dominio debe pasar sus flujos del Sprint 1R antes de integrarse.

## Sprint 7R — Validación automatizada

Estado: **DONE** (2026-09-17). Evidencia: `70-sprint-7r-automated-validation.md`.

- builds desde checkout limpio;
- unitarias e integración;
- migraciones sobre DB limpia y copia del baseline;
- API contracts;
- Playwright E2E;
- regresión visual;
- smoke post-deploy;
- backup y restauración completa.

## Sprint 8R — UAT y candidata final

Estado: **CIERRE TÉCNICO COMPLETO / ACEPTACIÓN EXTERNA PENDIENTE**
(2026-09-17). Evidencia: `80-sprint-8r-final-candidate.md`.

- despliegue nuevo sin editar código;
- carga de configuración institucional;
- validación funcional del usuario;
- resolución de hallazgos;
- evidencia y decisión de liberación.

## Release gate de rebaseline

Una candidata falla si ocurre cualquiera de los siguientes casos:

- desaparece una capacidad aceptada del demo;
- una función real se convierte en mock;
- frontend y API dejan de compartir contrato;
- falla aislamiento institucional o EGI;
- el despliegue necesita editar TypeScript, Python, SQL o Dockerfile;
- no se puede migrar una copia de la base baseline;
- no se puede reconstruir, respaldar y restaurar desde documentación.

La equivalencia se evaluará contra `sigi-demo-local` como producto candidato a
producción, no contra una expectativa simplificada derivada del nombre `demo`.
