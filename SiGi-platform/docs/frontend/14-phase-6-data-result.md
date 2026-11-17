# 14 — Resultado de Fase 6: Datos

Fecha: 2026-09-22  
Rama: `feature/ux-ui-v2`

## Resultado

Datos dispone de una única entrada autenticada en `/admin/data`. El menú global ya no expone por separado fuentes, calidad, documentos, flujos y estado técnico; el workspace presenta solamente las funciones que permite la sesión.

| Vista | URL | Función real |
| --- | --- | --- |
| Inicio de Datos | `/admin/data` | destinos disponibles según permisos y EGI activo |
| Fuentes | `/admin/sources?view=sources` | inventario institucional y estado de ingestión |
| Importar | `/admin/sources?view=imports` | asistente existente de carga CSV/XLSX, análisis, mapeo, validación e incorporación |
| Calidad | `/admin/validations` | casos, reglas, responsables y balance de calidad |
| Pendientes | `/admin/sources?view=pending` | lotes fallidos o con observaciones, filtrados automáticamente |
| Documentos | `/admin/files` | archivos, versiones, metadatos, asociaciones y auditoría |
| Historial | `/admin/sources?view=history` | lotes, reglas, errores, correcciones y trazabilidad |

Las vistas usan un encabezado y pestañas comunes. Cada pestaña se oculta si falta su permiso. La URL conserva la vista y, para Pendientes/Historial, los filtros de entidad, estado, atención y búsqueda; estos filtros sobreviven navegación entre ambas vistas y recarga directa.

## Operación frente a configuración

- El registro técnico de conectores salió de la vista operativa Fuentes.
- Odoo, KoboToolbox y Conectores están catalogados como rutas de configuración y protegidos por rol administrativo o permisos técnicos equivalentes.
- La creación, edición, activación y selección predeterminada de perfiles reutilizables vive en `/admin/data/mappings`.
- El asistente de importación permite aplicar un perfil existente, pero remite su administración a Configuración de Datos.
- `/admin/modules` y `/admin/flow` se conservan por compatibilidad y diagnóstico, pero dejaron de ser navegación operativa principal.

No se reemplazaron endpoints ni se inventaron datos. Fuentes, batches, errores, reglas, perfiles de mapeo, validaciones, documentos y auditoría continúan usando los contratos reales existentes.

## Seguridad y alcance

- `/admin/data` acepta cualquiera de las capacidades operativas `sources.read`, `imports.read`, `imports.upload`, `validations.read` o `files.read`.
- Cada destino mantiene además su Route Guard específico y exige EGI activo.
- Configuración de Datos exige rol administrativo o `data.configure`, `sources.update` o `connectors.update`.
- Los endpoints de mutación de perfiles mantienen las comprobaciones backend de rol y `imports.upload`; ocultar controles no constituye la barrera de seguridad.
- El scope de datos continúa resolviéndose mediante el EGI activo y la política global existente.

## Reutilización y deuda

Se reutilizaron `SourcesPage`, `ValidationsPage`, `FilesExplorerPage`, los servicios API, `ModuleWorkspaceHeader` y el asistente real de importación. Se añadieron `DataWorkspaceHeader`, `DataHomePage` y `DataMappingsPage` como capa incremental; no se reescribió el módulo.

`SourcesPage` continúa siendo un componente grande. La separación actual reduce densidad visible y habilita una extracción posterior por feature sin arriesgar el pipeline de importación. Los jobs y logs técnicos aún no cuentan con una pantalla administrativa independiente: su trazabilidad real permanece en batches/auditoría y se documenta como separación futura, no como función simulada.

## Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `npm run build:admin` | PASS, 115 módulos |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 95 Node + 6 Python |
| `tests/unit/data-workspace-contract.test.mjs` | PASS, 3/3 |
| Playwright proyecto `admin-chromium` | PASS, 27/27; navegación, filtros persistentes y denegación RBAC incluidos |
| Docker `sigi-ux-v2` | frontend actualizado y saludable en `127.0.0.1:5374` |

Docker de revisión:

- aplicación unificada: `http://127.0.0.1:5374`;
- referencia Country: `http://127.0.0.1:5373`;
- API: `http://127.0.0.1:3200/api`;
- GeoServer: `http://127.0.0.1:8281`;
- imagen frontend: `sha256:95bdfa770b05bc5dba03d9fe261900b827e58a81aa046c495e1f99fea912b42b`.

## Siguiente fase

Fase 7 — Informes: consolidar catálogo, generación guiada, detalle, compromisos e historial dentro del mismo patrón de workspace, preservando contratos y permisos `reports.*`.
