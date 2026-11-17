# Datos de demostración — Costa Rica

## Propósito

Este conjunto permite revisar el frontend unificado con información coherente de Costa Rica en Proyectos, Territorio, Datos, Indicadores y Reportes. La carga es voluntaria, transaccional e idempotente: puede ejecutarse varias veces sin duplicar los registros administrados por la semilla.

> Las geometrías son ilustrativas y fueron creadas exclusivamente para demostración funcional. No representan límites oficiales, catastrales ni administrativos y no deben utilizarse para decisiones territoriales.

## Carga local

Con el proyecto Docker `sigi-ux-v2` en ejecución:

```powershell
npm run demo:seed:costa-rica
```

El comando usa por defecto el contenedor `sigi-ux-v2-postgres-1`. Para indicar otro contenedor:

```powershell
.\scripts\load-costa-rica-demo.ps1 -Container <nombre-contenedor-postgres>
```

La carga falla de forma segura si el contenedor no está disponible o si PostgreSQL rechaza alguna sentencia. Todo el SQL se ejecuta dentro de una única transacción.

## Contenido

| Área | Datos cargados |
| --- | --- |
| Espacio | `SIGI Costa Rica — Demo Nacional`, reutilizando el EGI nacional local |
| Instituciones | MINAE, SINAC, Ministerio de Salud, MAG, AyA y FONAFIFO |
| Proyectos | 4 proyectos de restauración, biodiversidad, producción resiliente y seguridad hídrica |
| Portafolios | 2: Restauración de Paisajes Costa Rica 2030; Agua y Resiliencia Climática |
| Datos | 3 conectores, 3 fuentes, 3 datasets, versiones y resultados de validación |
| Indicadores | 4 indicadores y sus valores por proyecto |
| Operación | Actores, hitos, entregables, 3 publicaciones y 3 incidencias |
| Reportes | Informe NDC Costa Rica 2026, versión, compromiso y notificación de revisión |

### Proyectos

- `CR-OSA-001` — Restauración del paisaje Osa–Golfo Dulce.
- `CR-SJLS-002` — Corredor Biológico San Juan–La Selva.
- `CR-TEMP-003` — Paisajes productivos resilientes del Tempisque.
- `CR-CARIBE-004` — Seguridad hídrica en cuencas del Caribe Sur.

### Capas y polígonos

| Código de capa | Nombre | Elementos |
| --- | --- | ---: |
| `territories` | Regiones de planificación — Costa Rica | 6 |
| `project_polygons` | Polígonos de proyectos — Costa Rica | 4 |
| `corredor_seco` | Corredor Seco de Costa Rica — Demo | 2 |

Las 12 geometrías son válidas en PostGIS (`ST_IsValid = true`) y su extensión conjunta es aproximadamente `BOX(-86.15 8.08,-82.55 11.28)` en `EPSG:4326`.

Para evitar que el visor calcule una extensión entre países, la semilla retira exclusivamente los dos elementos históricos de demostración `sv-centro` y `sv-occidente`, junto con el territorio padre `sv` cuando queda huérfano. No elimina información ajena a esos identificadores.

## Revisión visual

- Administración: <http://127.0.0.1:5374/administration>
- Frontend SIGI: <http://127.0.0.1:5374/administration>
- Visor territorial: <http://127.0.0.1:5374/admin/geobi?view=catalog>
- API: <http://127.0.0.1:3200/>

La semilla no crea ni cambia contraseñas. En el entorno local se utilizan las cuentas existentes; la cuenta de revisión habitual es `superadmin@sigi.local` con la credencial local definida por el stack.

## Validación automatizada

```powershell
node --test tests/unit/costa-rica-demo-seed.test.mjs

$env:SIGI_E2E_ADMIN_URL='http://127.0.0.1:5374'
$env:SIGI_E2E_COSTA_RICA_DEMO='1'
npx playwright test tests/e2e/costa-rica-demo.spec.js --project=admin-chromium
npx playwright test tests/e2e/geo.spec.js --project=admin-chromium
```

La prueba específica se omite si `SIGI_E2E_COSTA_RICA_DEMO` no vale `1`, para que un entorno limpio sin datos opcionales pueda ejecutar el conjunto E2E normal.

## Archivos de implementación

- Semilla: `infra/postgres/demo/costa-rica-demo.sql`.
- Cargador: `scripts/load-costa-rica-demo.ps1`.
- Contrato unitario: `tests/unit/costa-rica-demo-seed.test.mjs`.
- Recorrido de navegador: `tests/e2e/costa-rica-demo.spec.js`.
