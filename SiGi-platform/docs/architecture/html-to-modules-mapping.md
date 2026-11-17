# HTML to Modules Mapping

Este documento consolida el mapeo funcional entre los HTML entregados y la arquitectura tecnica.

## Vista pais

| Seccion | Modulo tecnico |
| --- | --- |
| Resumen ejecutivo | `Core.PublicDashboard` |
| Territorio | `GeoBI.TerritoryReadModel` |
| Indicadores | `Core.Indicators` |
| Proyectos | `Core.Projects` |
| Calidad y trazabilidad | `Core.Validation` + `Core.Audit` |
| Integraciones | `Core.Institutions` + `Connectors.Overview` |
| Incidentes | `Core.Incidents` |
| Informes | `Bridge.Reports` |

## Vista admin

| Modulo HTML | Modulo tecnico |
| --- | --- |
| SIGI Extractor | `Connectors.Runtime` |
| SIGI Cargador de archivos | `Connectors.FileIngestion` |
| SIGI Almacen de datos | `Storage.Staging` |
| SIGI Nucleo | `Core.CanonicalModel` |
| Calidad y trazabilidad | `Core.Validation` + `Core.Audit` |
| OpenAPI / APIs | `Core.ApiContracts` + `Bridge.ApiOps` |
| SIGI Puente | `Bridge.Exports` |
| SIGI Geo/BI | `GeoBI.Publication` |
| Flujo de integracion | `Connectors.SyncJobs` |
| Instituciones | `Core.Institutions` |
| Fuentes | `Core.DataSources` + `Connectors.Registry` |
| Publicacion | `Core.Publications` + `Bridge.Exports` |
| Usuarios y roles | `Core.Auth` |
| Bitacora | `Core.Audit` |

