# Descripción de Pantallas y Menú Disponibles en SIGI

## Objetivo

Este documento describe las pantallas y menús actualmente disponibles en los frontends de SIGI, separando la experiencia del portal público o país y la consola administrativa.

## Frontends identificados

SIGI dispone actualmente de dos aplicaciones frontend principales:

- `frontend-country`: portal de visualización país.
- `frontend-sigi`: consola administrativa y operativa.

## 1. Frontend Country

Corresponde al portal de consulta y visualización institucional. Está orientado a monitoreo, análisis territorial, proyectos, indicadores y reportes visibles para usuarios del entorno país.

### Estructura del menú

El menú del portal país está organizado en tres grupos:

#### Visión general

- `Inicio` (`/dashboard`)
  Despliega la portada ejecutiva del SIGI con el resumen general de monitoreo y proyectos.

- `Resumen regional` (`/territory`)
  Presenta una lectura territorial por región o municipio, enfocada en análisis geográfico resumido.

- `Monitoreo territorial` (`/restoration`)
  Muestra seguimiento territorial alineado al monitoreo de restauración y ecosistemas.

#### Operación territorial

- `Proyectos` (`/projects`)
  Permite revisar la cartera de proyectos y su seguimiento territorial.

- `Mapa SIGI` (`/geo-bi`)
  Abre el visor geoespacial con capas, coberturas y análisis territorial.

- `Captura KoboToolbox` (`/integrations`)
  Describe o expone el flujo de captura e integración de datos de campo.

- `Monitoreo satelital` (`/indicators`)
  Presenta indicadores y señales de observación remota para seguimiento territorial.

- `Alertas tempranas` (`/incidents`)
  Permite consultar riesgos operativos y ambientales visibles en el entorno.

#### Control y gestión

- `Calidad de datos` (`/quality`)
  Muestra validación, consistencia y revisión técnica de la información.

- `Reportes` (`/reports`)
  Presenta salidas ejecutivas, informes y trazabilidad documental.

- `Documentos` (`/documents`)
  Expone un explorador público de documentos y metadatos autorizados.

- `Administración` (`/administration`)
  Muestra información de acceso a la consola operativa y lineamientos de gobierno del entorno.

### Resumen de pantallas del portal país

| Pantalla | Ruta | Descripción funcional |
| --- | --- | --- |
| Inicio | `/dashboard` | Tablero ejecutivo con resumen general del SIGI. |
| Resumen regional | `/territory` | Vista territorial por país, región, provincia o municipio. |
| Monitoreo territorial | `/restoration` | Seguimiento de ecosistemas, restauración y proyectos. |
| Proyectos | `/projects` | Consulta de portafolio y avance territorial de proyectos. |
| Mapa SIGI | `/geo-bi` | Visualización geoespacial de capas y coberturas. |
| Captura KoboToolbox | `/integrations` | Seguimiento del flujo de captura y sincronización de campo. |
| Monitoreo satelital | `/indicators` | Consulta de indicadores y señales territoriales. |
| Alertas tempranas | `/incidents` | Visualización de incidentes, alertas y riesgos. |
| Calidad de datos | `/quality` | Monitoreo de calidad y consistencia de la información. |
| Reportes | `/reports` | Informes ejecutivos y salidas institucionales. |
| Documentos | `/documents` | Consulta pública de archivos y metadatos. |
| Administración | `/administration` | Información de acceso al entorno administrativo. |

## 2. Frontend Admin

Corresponde a la consola segura de administración del SIGI. Requiere autenticación y muestra módulos según permisos del usuario y, en muchos casos, según el EGI activo.

### Acceso a la consola

Antes de ingresar a los módulos, la aplicación presenta una pantalla de autenticación para abrir la consola administrativa.

### Estructura del menú

El menú lateral administrativo está organizado en cinco grupos principales.

#### Espacios de gestión

- `Mis espacios` (`/admin/egi`)
  Permite crear, seleccionar y gobernar el EGI activo del SIGI.

#### General

- `Centro de Ayuda` (`/admin/help`)
  Incluye manual, capacitación, preguntas frecuentes y conocimiento listo para IA.

- `Inicio` (`/admin`)
  Presenta el resumen ejecutivo y el estado actual de la consola SIGI.

#### Tableros

- `Resumen regional` (`/admin/modules`)
  Muestra una lectura consolidada del ecosistema y sus capacidades.

- `Mapa SIGI` (`/admin/geobi`)
  Abre el visor territorial, capas y análisis geoespacial administrativo.

- `Visualizador BI` (`/admin/bi-visualizer`)
  Presenta un tablero analítico configurable para gerencia y análisis.

- `Calidad de datos` (`/admin/validations`)
  Ofrece revisión de consistencia, reglas y alertas de calidad.

#### Gestión operativa

- `Módulos` (`/admin/modules`)
  Muestra la cobertura funcional y componentes administrables del SIGI.

- `Flujos` (`/admin/flow`)
  Presenta la trazabilidad entre entrada, validación y publicación.

- `Instituciones` (`/admin/institutions`)
  Administra entidades participantes, estados y coordinación.

- `Proyectos` (`/admin/projects`)
  Muestra cartera, resultados y cobertura transversal de proyectos.

- `Validaciones` (`/admin/validations`)
  Permite revisar reglas, observaciones y seguimiento técnico.

- `Publicaciones` (`/admin/publications`)
  Gestiona canales, salidas y puente institucional de difusión.

#### Datos e integraciones

- `Catálogo geográfico` (`/admin/geospatial-catalog`)
  Gestiona capas, GeoServer, PostGIS y publicación geoespacial.

- `Conectores` (`/admin/connectors`)
  Centraliza puentes técnicos, sincronización y conectividad.

- `Fuentes de datos` (`/admin/sources`)
  Gestiona fuentes activas, lotes e ingestión administrada.

- `Odoo` (`/admin/sources/odoo`)
  Pantalla dedicada para operación de fuentes y sincronización con Odoo.

- `KoboToolbox` (`/admin/sources/kobo`)
  Pantalla dedicada para previsualización, operación y sync de Kobo.

- `Explorador documental` (`/admin/files`)
  Gestiona carpetas, versiones, metadatos y trazabilidad documental.

- `API` (`/admin/api`)
  Presenta la operación y exposición controlada de servicios.

#### Administración

- `Usuarios` (`/admin/users`)
  Administra perfiles, accesos y control administrativo.

- `Bitácora` (`/admin/audit`)
  Permite revisar eventos, trazas y seguimiento de auditoría.

### Resumen de pantallas administrativas

| Pantalla | Ruta | Descripción funcional |
| --- | --- | --- |
| Inicio | `/admin` | Resumen ejecutivo de la consola administrativa. |
| Centro de Ayuda | `/admin/help` | Manual, capacitación y base de conocimiento SIGI. |
| Espacios de gestión | `/admin/egi` | Configuración, selección y gobierno del EGI activo. |
| Módulos | `/admin/modules` | Estado funcional del ecosistema SIGI. |
| Flujos | `/admin/flow` | Recorrido operativo entre fuentes, validación y publicación. |
| Instituciones | `/admin/institutions` | Gobierno institucional y coordinación operativa. |
| Fuentes de datos | `/admin/sources` | Gestión de fuentes, lotes e ingestión trazable. |
| Conector Odoo | `/admin/sources/odoo` | Configuración e interoperabilidad con Odoo. |
| Conector Kobo | `/admin/sources/kobo` | Configuración operativa y sincronización con KoboToolbox. |
| Conectores | `/admin/connectors` | Gestión de conexiones técnicas y sincronización. |
| Proyectos | `/admin/projects` | Cartera de proyectos y cobertura transversal. |
| Mapa SIGI | `/admin/geobi` | Visor territorial y publicaciones geoespaciales. |
| Catálogo geográfico | `/admin/geospatial-catalog` | Administración de capas y servicios geográficos. |
| Visualizador BI | `/admin/bi-visualizer` | Lienzo analítico configurable para gerencia. |
| Validaciones | `/admin/validations` | Revisión de calidad, reglas y observaciones. |
| Publicaciones | `/admin/publications` | Gestión de salidas y canales de difusión. |
| API | `/admin/api` | Operación técnica y exposición segura de servicios. |
| Explorador documental | `/admin/files` | Gestión documental institucional. |
| Usuarios | `/admin/users` | Gestión de usuarios, perfiles y permisos. |
| Alta de usuario | `/admin/users/new` | Creación dedicada de nuevos accesos. |
| Bitácora | `/admin/audit` | Consulta de auditoría y trazabilidad operativa. |

## 3. Consideraciones de acceso

- El `frontend-country` funciona como portal de visualización y consulta.
- El `frontend-sigi` requiere autenticación.
- Varias pantallas administrativas requieren permisos específicos.
- Varias pantallas administrativas también requieren un `EGI` activo para operar.
- El menú del administrador se adapta según los permisos efectivos del usuario.

## 4. Observaciones

- Existen pantallas con funciones similares pero en distintos contextos, por ejemplo `Mapa SIGI` en el portal público y en la consola administrativa.
- Algunas rutas están orientadas a lectura pública y otras a operación, gobierno, validación o integración técnica.
- La estructura actual diferencia claramente visualización país, operación institucional y administración del sistema.

## Referencias internas

- `apps/frontend-country/src/App.tsx`
- `apps/frontend-sigi/src/App.tsx`
- `apps/frontend-country/README.md`
- `apps/frontend-sigi/README.md`
