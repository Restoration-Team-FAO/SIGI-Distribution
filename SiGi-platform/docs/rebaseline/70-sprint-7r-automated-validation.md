# Sprint 7R — Validación automatizada

Fecha de cierre: 2026-09-17

Rama: `integration/sigi-v1-reconciled`

## Resultado

Sprint completado. El release gate dejó de depender de las capas DNEA/Odoo y
del orden accidental de EGI/proyectos del volumen histórico. Los controles de
integración son repetibles sobre el baseline aceptado y la automatización de CI
ya incluye migración, smoke post-deploy, backup, restore y smoke post-restore.

## Cambios del gate

- `geo-api-smoke` crea dos capas GIS efímeras y deterministas, ejecuta sus 60
  contratos y elimina capas, features, perfiles y territorios en `finally`;
- incidentes selecciona dos EGI que realmente tengan proyecto en lugar de
  asumir que son los dos primeros del workspace;
- Step 2 selecciona un proyecto con código o asigna/restaura un código efímero;
- el catálogo `countries` admite el estado productivo vacío sin dejar de
  verificar que el contrato sea DB-backed y tipado;
- backup y restore aceptan múltiples archivos Compose mediante el separador de
  rutas del sistema operativo;
- el smoke post-deploy valida API, ambos frontends y WMS de GeoServer;
- Playwright incorpora contratos visuales de jerarquía, viewport y overflow
  para el login admin y el dashboard country.

## Evidencia ejecutada

| Control                            | Resultado                                                   |
| ---------------------------------- | ----------------------------------------------------------- |
| checkout limpio: `npm ci` + build | PASS                                                        |
| `npm run release:verify`           | PASS                                                        |
| Node unit tests                    | 88/88                                                       |
| Python unit tests                  | 6/6                                                         |
| release gate agregado, ejecución 1 | PASS, 13/13 gates                                           |
| release gate agregado, ejecución 2 | PASS, 13/13 gates                                           |
| GIS API en cada gate               | PASS, 60/60                                                 |
| Playwright funcional + visual      | PASS, 19/19                                                 |
| smoke post-deploy                  | PASS, API/country/admin/GeoServer                           |
| backup completo                    | PASS, dump DB + archivos SIGI + datos GeoServer con SHA-256 |
| restore completo                   | PASS, checksums, DB, archivos, GeoServer y roles runtime    |
| smoke post-restore                 | PASS                                                        |
| reconstrucción Docker              | PASS                                                        |

El backup de validación quedó fuera del checkout en
`C:\GIT\SIGI\_sigi_backups\sigi-backup-20260917T212012Z`.

## Docker local

El proyecto `sigi-r1-validation` fue restaurado y reconstruido. Los accesos de
prueba siguen siendo:

- API: `http://127.0.0.1:3000/api`;
- portal country: `http://127.0.0.1:5173`;
- consola admin: `http://127.0.0.1:5174`;
- GeoServer: `http://127.0.0.1:8081/geoserver`.

## Decisión

Sprint 7R: **DONE**. El siguiente paso es Sprint 8R: desplegar una candidata
limpia, cargar la configuración institucional real, ejecutar UAT con el usuario
y documentar la decisión final de liberación. Hasta esa aceptación humana y el
recorrido del VPS, el estado general permanece **NOT READY**.
