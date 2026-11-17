# Matriz de Alineamiento SIGI

Esta matriz compara tres cosas:

- lo que define `SIGI.docx` como arquitectura objetivo
- lo que implementa hoy el backend del repo
- lo que representan hoy los frontends demo de Costa Rica

El objetivo no es solo listar diferencias, sino identificar si la brecha es aceptable para una `country platform` o si contradice el modelo base de `SIGI-Core`.

## Resumen Ejecutivo

Conclusion directa:

- El **backend actual** esta mejor alineado con una **plataforma pais SIGI** que con un `SIGI-Core` puro.
- El **frontend dashboard** y el **frontend admin** estan bien alineados con la vision funcional del documento, pero aun no con la implementacion tecnica real.
- La brecha principal no es de vision, sino de **contrato**: el documento habla en terminos de `SIGI-Core`, `Connectors`, `Bridge` y APIs canonicas; el repo actual habla en terminos de `sigi-api`, `integration-service`, `gis-service`, instituciones, conectores y sync jobs.

## Matriz

| Tema | Documento SIGI | Backend actual | Frontend actual | Alineamiento | Accion recomendada |
| --- | --- | --- | --- | --- | --- |
| Nucleo comun | `SIGI-Core` es obligatorio y comun para todos los paises; no debe modificarse por pais. Ver [_tmp_sigi_doc.txt](/c:/GIT/SIGI/SiGi-platform/_tmp_sigi_doc.txt:1118). | El repo implementa [sigi-api](/c:/GIT/SIGI/SiGi-platform/apps/sigi-api/src/app.module.ts:1) como boundary principal del pais, no un `SIGI-Core` reusable y neutral. | El admin demo ya usa lenguaje modular cercano a Core/Connectors/Bridge. Ver [SIGI_CostaRica_Backend (1).html](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend (1).html:814>). | Parcial | Separar oficialmente `SIGI-Core` del concepto `country platform`, o renombrar este repo como despliegue nacional. |
| Rol de conectores | `SIGI-Connectors` extraen, transforman y entregan payloads estandarizados al Core. Ver [_tmp_sigi_doc.txt](/c:/GIT/SIGI/SiGi-platform/_tmp_sigi_doc.txt:47). | [integration-service](/c:/GIT/SIGI/SiGi-platform/services/integration-service/app/api/routes/sync.py:1) cumple bastante bien ese rol para Kobo/ETL, aunque aun corre en proceso web. | El admin demo refleja bien el concepto de extractor/cargador, pero con datos mock. | Alto | Mantener `integration-service` como capa de conectores, no como servicio de negocio general. |
| Validacion centralizada | La validacion, gobernanza y trazabilidad deben vivir en `SIGI-Core`, no en conectores. Ver [_tmp_sigi_doc.txt](/c:/GIT/SIGI/SiGi-platform/_tmp_sigi_doc.txt:1190). | Hoy la validacion esta repartida: `sigi-api` orquesta, `integration-service` controla syncs, y no existe aun un modulo canonico de validacion de datasets. | El admin demo si comunica validacion y calidad como capacidad central. | Bajo a medio | Crear un dominio canonico de `datasets/validation/schemas/catalogs/audit` en el API principal o extraer un Core real. |
| Persistencia de datos crudos | El documento dice que `SIGI-Core` no persiste datos crudos y no modifica datos fuente. Ver [_tmp_sigi_doc.txt](/c:/GIT/SIGI/SiGi-platform/_tmp_sigi_doc.txt:186). | [002_core_schema.sql](/c:/GIT/SIGI/SiGi-platform/infra/postgres/init/002_core_schema.sql:68) crea `integration.raw_payloads`, lo cual es correcto para una plataforma pais, pero no para presentar esto como `SIGI-Core` puro. | El frontend no modela este detalle tecnico. | Parcial | Documentar que el almacenamiento crudo pertenece a `integration` o `storage`, no al Core conceptual. |
| API canonica del Core | El documento define recursos como `/datasets`, `/datasets/{dataset_id}/validation`, `/schemas`, `/catalogs`, `/audit`, `/exports/{target}`. Ver [_tmp_sigi_doc.txt](/c:/GIT/SIGI/SiGi-platform/_tmp_sigi_doc.txt:235). | Hoy existen endpoints como [institutions.controller.ts](/c:/GIT/SIGI/SiGi-platform/apps/sigi-api/src/modules/institutions/institutions.controller.ts:1), [connectors.controller.ts](/c:/GIT/SIGI/SiGi-platform/apps/sigi-api/src/modules/connectors/connectors.controller.ts:1) y [sync-jobs.controller.ts](/c:/GIT/SIGI/SiGi-platform/apps/sigi-api/src/modules/sync-jobs/sync-jobs.controller.ts:1), pero no la API canonica del documento. | Los demos usan datos estaticos; no consumen ninguna API real. | Bajo | Definir una capa API v1 alineada al documento, aunque internamente siga usando `sigi-api` como facade. |
| Trazabilidad y auditoria | El documento exige trazabilidad completa y auditabilidad. Ver [_tmp_sigi_doc.txt](/c:/GIT/SIGI/SiGi-platform/_tmp_sigi_doc.txt:1267). | Hay buena base con `core.sync_jobs` e `integration.sync_jobs` en [002_core_schema.sql](/c:/GIT/SIGI/SiGi-platform/infra/postgres/init/002_core_schema.sql:42), pero falta un recurso canonico de auditoria y provenance para datasets. | El admin demo comunica bien la idea de flujo y monitoreo, pero no usa datos reales. | Medio | Agregar `audit/provenance` como recurso de primer nivel, no solo como metadata operativa de sync. |
| Bridge internacional | `SIGI-Bridge` exporta datos validados a FERM y otros destinos. Ver [_tmp_sigi_doc.txt](/c:/GIT/SIGI/SiGi-platform/_tmp_sigi_doc.txt:1147). | No existe aun un `bridge` real; el repo se queda en ingestion y estado de sync. | El frontend admin lo sugiere como modulo conceptual. | Bajo | Crear un modulo `bridge` o al menos `exports` en el API principal para no mezclar interoperabilidad saliente con ETL entrante. |
| Geo/BI opcional | El documento trata `Geo/BI` como componente opcional encima del Core. | [gis-service](/c:/GIT/SIGI/SiGi-platform/services/gis-service/app/api/routes/geometry.py:1) existe, pero hoy es solo un placeholder sin PostGIS real. | El dashboard demo es claramente una capa Geo/BI, pero usa iframe de Google Maps en [SIGI_CostaRica_Dashboard_demo.html](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:326>) y datos mock en [SIGI_CostaRica_Dashboard_demo.html](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:523>). | Parcial | Mantener el frontend como capa opcional; conectar mapas y analitica via `sigi-api` y `gis-service`, no con embeds externos. |
| Cooperacion interinstitucional | El documento enfatiza gobernanza y cooperacion entre instituciones. | El backend ya modela [core.institutions](/c:/GIT/SIGI/SiGi-platform/infra/postgres/init/002_core_schema.sql:5) y [core.connectors](/c:/GIT/SIGI/SiGi-platform/infra/postgres/init/002_core_schema.sql:21), pero `sigi-api` aun valida contra listas en memoria en [institutions.service.ts](/c:/GIT/SIGI/SiGi-platform/apps/sigi-api/src/modules/institutions/institutions.service.ts:1) y [connectors.service.ts](/c:/GIT/SIGI/SiGi-platform/apps/sigi-api/src/modules/connectors/connectors.service.ts:1). | El admin demo representa bien la gobernanza interinstitucional. | Medio | Reemplazar los servicios en memoria por lecturas reales de Postgres y luego agregar auth + institution scope. |
| Continuidad institucional | El documento insiste en continuidad, preservacion y no dependencia de personas/equipos. | La existencia de Postgres/PostGIS y jobs durables ayuda, pero no hay todavia migraciones reales ni ownership fuerte por servicio. | El frontend no cubre esto tecnicamente. | Medio | Implementar migraciones por servicio, roles de BD y politicas de respaldo/versionado. |
| Interfaz de usuario | El documento deja claro que el Core no es una plataforma de visualizacion. Ver [_tmp_sigi_doc.txt](/c:/GIT/SIGI/SiGi-platform/_tmp_sigi_doc.txt:16). | El backend respeta eso relativamente bien. | El dashboard y admin demos si tienen sentido, pero deben presentarse como `country UI` o `Geo/BI`, no como Core. | Alto | Mantener frontends desacoplados del Core; que consuman solo `sigi-api` como boundary. |
| Acoplamiento frontend-backend | El documento sugiere fronteras limpias entre componentes. | El backend aun no ofrece contratos funcionales completos para dashboard/admin. | Los HTML no hacen `fetch` ni tienen cliente API; usan mocks en [SIGI_CostaRica_Dashboard_demo.html](</c:/Users/E22431/Downloads/SIGI_CostaRica_Dashboard_demo.html:523>) y [SIGI_CostaRica_Backend (1).html](</c:/Users/E22431/Downloads/SIGI_CostaRica_Backend (1).html:814>). | Bajo | Traducir cada pantalla a DTOs y endpoints reales antes de implementar el frontend productivo. |
| Seguridad y contexto institucional | El documento se apoya en gobernanza, custodios y autorizacion. | `sigi-api` aun no tiene auth ni enforcement multi-institucion real. | El admin demo no muestra sesiones, roles ni permisos reales. | Bajo | Agregar autenticacion, roles y contexto institucional en `sigi-api` antes de abrir el admin real. |

## Lectura Opinada

Lo mas importante no es decidir si el repo actual esta "mal". No lo esta. Lo que ocurre es que hoy mezcla dos niveles:

- el nivel **producto marco SIGI**
- el nivel **implementacion nacional de SIGI**

Eso genera confusion porque el documento pide un `SIGI-Core` relativamente neutro, mientras que el repo implementa una plataforma nacional operativa con:

- gestion de instituciones
- conectores por institucion
- sync jobs
- persistencia de payloads de integracion
- una futura capa GIS

Mi lectura tecnica es esta:

- si el objetivo inmediato es **tener una plataforma pais funcionando**, el camino actual es valido
- si el objetivo es **producir el SIGI-Core reusable para varios paises**, el repo actual todavia no esta separado de forma suficiente

## Gaps Prioritarios

### P1. Gap de contrato

El documento habla en recursos canonicos (`datasets`, `schemas`, `catalogs`, `audit`, `exports`) y el backend actual habla en recursos operativos (`institutions`, `connectors`, `sync-jobs`).

Esto es el gap mas importante porque afecta:

- backend
- frontend
- documentacion
- futura interoperabilidad

### P2. Gap de posicionamiento

Los frontends demo representan una consola pais y un dashboard pais, no el Core. Eso esta bien, pero hoy no esta nombrado asi de manera consistente.

### P3. Gap de implementacion tecnica

Aunque la direccion es buena, faltan varias piezas para alinearse mejor con el documento:

- `datasets` y `validation` como recursos reales
- `bridge` o `exports`
- GIS real sobre PostGIS
- auth y contexto institucional
- frontends conectados a APIs reales

## Recomendacion de Ruta

### Ruta recomendada

1. Mantener este repo como **SIGI Country Platform**.
2. Usar `sigi-api` como facade publica del pais.
3. Crear una capa de contratos v1 alineada con el documento:
   - `/datasets`
   - `/validation`
   - `/schemas`
   - `/catalogs`
   - `/audit`
   - `/exports`
4. Tratar `integration-service` como implementacion de `SIGI-Connectors`.
5. Tratar `gis-service` como implementacion de `SIGI-Geo/BI` o capacidad GIS opcional.
6. Dejar los frontends como:
   - `dashboard pais`
   - `admin/operations console pais`

### Ruta alternativa

Si la meta es construir el producto reusable:

1. Extraer un repo o modulo real `sigi-core`
2. Dejar este repo como `sigi-deploy` o `country-profile`
3. Reestructurar los endpoints y ownership de datos alrededor del Core

## Siguiente entregable recomendado

Despues de esta matriz, el paso mas util es crear una **matriz pantalla -> endpoint -> modulo SIGI -> origen de datos**, para que:

- el frontend deje de trabajar con mocks
- el backend exponga contratos alineados con el documento
- el admin y el dashboard queden correctamente amarrados al backend real
