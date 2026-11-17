# Sprint 8R — UAT y candidata final

Fecha de cierre técnico: 2026-09-17

Rama: `integration/sigi-v1-reconciled`

Baseline de entrada: `d0ff58490d7787743d6768ca0c5e2cb8bb9ef6d2`

## Resultado

El cierre técnico del Sprint 8R está completo. Se creó el proyecto Docker
aislado `sigi-r8-candidate` desde un volumen productivo vacío, sin editar código
durante el arranque. Se cargó una configuración institucional controlada por
API, se completaron los gates funcionales y se verificó backup/restore.

La decisión global permanece **NO-GO de producción / GO para UAT** porque faltan
tres decisiones externas al cierre técnico: aceptación funcional firmada,
recorrido HTTPS en un VPS con dominios reales y resolución o aceptación formal
de los advisories productivos.

## Cambios incorporados

- comando idempotente `npm run ops:provision` y plantilla institucional;
- alta/actualización gobernada de membresías EGI por API, con permiso, scope y
  auditoría;
- smokes portables sobre una base válida vacía, sin depender de
  `EGI-MARN-OCC`, capas históricas ni fuentes preexistentes;
- fixtures GIS efímeros para visibilidad y Step 2;
- E2E adaptable a datos autorizados y a las variantes de selección territorial
  de los dos frontends;
- edición visible del EGI activo en `Mis espacios`, gobernada por `egi.update`;
- guía de provisión y acta de aceptación UAT.

## Evidencia ejecutada

| Control | Resultado |
| --- | --- |
| despliegue desde volumen productivo vacío | PASS |
| migraciones | PASS, 2/2 |
| provisión inicial | PASS, 3 instituciones y 3 EGI |
| provisión idempotente post-restore | PASS, 0 instituciones/EGI duplicados |
| `npm run release:verify` | PASS |
| Node unit tests | PASS, 88/88 |
| Python unit tests | PASS, 6/6 |
| Playwright | PASS, 20/20, incluida edición y restauración del EGI activo |
| release gate antes del restore | PASS, 13/13 |
| release gate después del restore | PASS, 13/13 |
| roles / identidad / operación / UAT | PASS, 33/33 · 9/9 · 23/23 · 22/22 |
| GIS API / visibilidad | PASS, 60/60 · 4/4 |
| auditoría / métricas / Step 2 | PASS, 8/8 · 10/10 · 16/16 |
| post-deploy antes y después del restore | PASS, 4/4 |
| backup y checksums | PASS |
| restore de DB, archivos, GeoServer y roles | PASS |

El backup de evidencia quedó fuera del checkout en
`C:\GIT\SIGI\_sigi_backups_r8\sigi-backup-20260917T220346Z`.
Los conteos antes y después fueron idénticos: 3 instituciones, 3 EGI, 8
membresías y 2 proyectos.

## Auditoría de dependencias

`npm audit --omit=dev` reportó 12 hallazgos: 3 high, 8 moderate y 1 low. Los
high alcanzan la cadena de uploads de Nest/Multer y `xlsx`. La corrección
automática no es segura: propone un salto mayor de Nest y no ofrece corrección
npm para `xlsx`; además el ensayo `npm audit fix --dry-run` encontró conflicto
de peers con `@nestjs/testing`. No se aplicó `--force` a una candidata validada.

Antes de liberar se debe elegir y documentar una de estas rutas:

1. migrar y revalidar Nest/Multer y sustituir `xlsx` por una dependencia
   mantenida; o
2. aceptar temporalmente el riesgo con controles compensatorios, responsable y
   fecha de vencimiento.

## Docker local para UAT

- portal country: `http://127.0.0.1:5273`;
- consola admin: `http://127.0.0.1:5274`;
- API: `http://127.0.0.1:3100/api`;
- GeoServer: `http://127.0.0.1:8181/geoserver`.

El proyecto `sigi-r8-candidate` queda levantado y no modifica el volumen
aceptado de `sigi-r1-validation`.

## Criterio para GO

Cambiar a **GO** únicamente cuando el acta
`docs/operations/uat-final-acceptance.md` esté completa, el recorrido VPS de
`docs/v1/SIGI-V1-RELEASE-GATE.md` pase con HTTPS real y la decisión sobre los
advisories quede aprobada. Hasta entonces no crear el tag de producción.
