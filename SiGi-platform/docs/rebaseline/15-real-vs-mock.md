# Inventario real, mock y hardcoded

Se buscaron `mock`, `fixture`, `fake`, `demo`, `hardcoded`, `TODO`, `FIXME`,
`localStorage`, `sample` y `placeholder` en apps, servicios, infraestructura,
scripts y pruebas. La búsqueda produjo 680 coincidencias brutas; cada grupo se
clasificó por su efecto, no por el nombre. Baseline:
`ec40482c34a536db1dc9b53c980f9c848baf6fb5`.

| Caso | Tipo real | ¿Afecta runtime? | Evidencia / efecto |
| --- | --- | ---: | --- |
| `apps/frontend-country/src/mocks/dashboard-fixtures.ts` | fixture runtime | sí | alimenta partes del dashboard y recorridos de Calidad/Restauración; VERIFIED IN CODE |
| Calidad country | mock runtime | sí | problemas/series visibles provienen de fixtures; VERIFIED IN CODE |
| Presets y narrativa Geo/BI | hardcoded de UI | sí, configuración | las vistas guiadas son TS estático sobre APIs reales; VERIFIED IN CODE |
| Catálogos/schemas parciales | hardcoded técnico | sí | valores y esquemas no son todos administrables; VERIFIED IN CODE |
| `900_phase5_demo_seed.sql` | dato demo persistido | sí | se ejecuta en bootstrap normal y crea instituciones, usuarios, proyectos y ejemplos; VERIFIED BY EXECUTION en una base nueva; VERIFIED IN CODE |
| `999_empty_demo.sql` | supuesto saneamiento | sí, por ausencia | archivo vacío; una inicialización nueva conservó 7 instituciones, 14 usuarios, 8 proyectos, 6 territorios y 3 export runs; VERIFIED BY EXECUTION |
| `ODOO_MOCK_MODE` | mock runtime opcional | sólo si se habilita fuera de producción | default `false`; el servicio rechaza iniciarlo en production cuando es `true`; VERIFIED IN CODE — `settings.py:86-96`, `odoo_connector.py:305` |
| `_run_sample_sync` | ejecución sample backend | sí, para el modo/ruta que la invoque | genera un resultado de sincronización de muestra; no se encontró recorrido principal directo desde UI; VERIFIED IN CODE — `sync_jobs.py:392-445` |
| Country `getSources` | acción desconectada deliberadamente | sí | rechaza porque la administración autenticada de fuentes vive en admin; no finge respuesta; VERIFIED IN CODE |
| Country import Excel | acción desconectada deliberadamente | sí | cliente rechaza el upload y dirige el proceso a admin; VERIFIED IN CODE |
| `localStorage` country | preferencia de presentación | sí | guarda selección/preferencias del portal; no reemplaza persistencia de negocio; VERIFIED IN CODE — `utils/portal.ts:53-65` |
| `localStorage` EGI | preferencia de alcance | sí | recuerda EGI activo; backend vuelve a validar membresía/scope; VERIFIED IN CODE |
| `sessionStorage` admin | sesión y vista global | sí | sesión del navegador, no mock; VERIFIED IN CODE — `services/api.ts:136-215` |
| `tests/**` y datos de scripts smoke/UAT | fixture de test | no en build productivo | sólo preparan verificaciones; VERIFIED IN CODE |
| placeholders de formularios | ejemplo de UI | sí, visual | ayudas de captura, no datos enviados automáticamente; VERIFIED IN CODE |
| ayuda/capacitación | contenido local | sí, contenido | documentación estática intencional; no se clasifica como mock funcional; VERIFIED IN CODE |
| scripts/documentos `demo` | empaquetado operativo | no por sí solo | el nombre demo no prueba simulación; se evaluó cada componente por separado |
| endpoint heredado build-demo-analysis | función deshabilitada | no en producción | la configuración productiva lo desactiva; VERIFIED IN CODE |

## Resultado funcional consolidado

El inventario por pantalla contiene **1 MOCK + 3 HARDCODED**. Los datos demo
persistidos y el modo Odoo opcional se registran adicionalmente aquí porque son
condiciones transversales, no pantallas separadas. No se debe reinterpretar
como mock lo que sí usa API/DB sólo porque el bootstrap contenga ejemplos.

## Archivos, reportes y GIS

- **Archivos:** árbol, upload/download, metadata, versiones, auditoría, permisos
  y asociaciones son implementaciones reales; el binario persiste en volumen.
  VERIFIED IN CODE y VERIFIED BY EXECUTION.
- **Reportes:** templates, builder, instancias, workflow, calendario y exports
  son reales. Los fixtures de Playwright no son datos del producto. El flujo se
  mantiene PARCIAL porque no se verificó de punta a punta, no por ser mock.
- **GIS:** PostGIS, API geoespacial y GeoServer son reales. Presets narrativos
  son hardcoded y el catálogo tiene una falla ejecutable; ninguna de esas dos
  condiciones convierte el stack GIS completo en mock.
- **Kobo/Odoo:** sus clientes y persistencia son reales, pero la interoperabilidad
  con servidores reales queda NOT VERIFIED sin credenciales/instancias externas.
