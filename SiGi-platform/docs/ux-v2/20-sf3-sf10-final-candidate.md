# Evidencia SF-3 a SF-10 — Candidata de revisión final

## Resultado

El anfitrión `frontend-admin` resuelve en un solo artefacto las vistas públicas y el workspace autenticado. Country continúa intacto y activo como referencia/rollback. La candidata está lista para revisión funcional; no se ha realizado el cutover de producción ni el retiro destructivo de Country.

## Olas completadas

| Ola | Resultado | Commit principal |
| --- | --- | --- |
| SF-3 | Dashboard y Territorio públicos | `50b15ce6` |
| SF-4 | `publicApi`, `workspaceApi` y prueba de frontera | `e36695de` |
| SF-5 | experiencia pública/operativa de Proyectos | `1d5bc854` |
| SF-6 | experiencia pública/operativa GIS | `d17278bf` |
| SF-7 | Indicadores, Incidentes, Calidad y Restauración | `4b2478e9` |
| SF-8 | Reportes y Documentos | `97e86b6e` |
| SF-9 | Integraciones y landing de administración | `e66369f4` |
| SF-10 | imagen, Nginx, CI, smoke y ejecución paralela | `3cd6aed8` |

## Rutas públicas en el artefacto único

El portal público comienza explícitamente en `/dashboard` y también resuelve `/territory`, `/restoration`, `/projects`, `/geo-bi`, `/integrations`, `/indicators`, `/incidents`, `/quality`, `/reports` y `/documents`.

La raíz `/` es la entrada Admin: sin sesión redirige a `/administration`, que usa un shell de acceso separado y exige login. Con sesión válida, `/` abre el workspace conforme a permisos y EGI.

Las rutas Admin conservan `/admin/*`, sesión obligatoria, permisos y EGI. El workspace se carga de forma lazy y no se solicita desde una navegación anónima.

## Fronteras verificadas

- `publicApi` no adjunta bearer ni encabezado EGI y no permite rutas `/admin/*`.
- `workspaceApi` conserva sesión, refresh y scope EGI.
- las rutas públicas no emitieron requests `/api/admin/*` en Playwright;
- usuarios operativos no ven ni abren configuración sin capacidad;
- el backend mantiene respuestas `403` para acciones no autorizadas;
- GIS público excluye capas restringidas y propiedades sensibles.

## Ejecución de gates — 2026-09-18

| Gate | Resultado |
| --- | --- |
| `npm run typecheck` | PASS, cuatro workspaces TypeScript |
| `npm run build` | PASS, Country + frontend único + API |
| `npm run test:unit` | PASS, 89 Node + 6 Python |
| `npm run test:e2e` | PASS, 25/25 |
| `npm run smoke:unified-frontend` | PASS, 50 checks; 11 rutas públicas y 2 rutas de acceso |
| `npm run smoke:roles` | PASS, 36/36 |
| `npm run smoke:geo-visibility` | PASS, 4/4 |
| `npm run smoke:geo-api` | PASS, 60/60 |
| prueba unitaria de frontera pública | PASS, 1/1 |

El primer pase de E2E detectó que una CSP demasiado restrictiva impedía cargar Leaflet. Se corrigió con una allowlist limitada a `https://unpkg.com`; Leaflet ya estaba fijado en `1.9.4` con SRI. El flujo GIS se repitió y luego se ejecutó nuevamente la suite completa con 25/25.

## Servidor web y CI

- CSP, `Referrer-Policy`, `X-Content-Type-Options` y `X-Frame-Options` activos;
- assets versionados con caché de un año;
- documento SPA sin caché y fallback validado en deep links;
- el release gate ejecuta `smoke:unified-frontend` con ambos frontends activos;
- el proxy de API y GeoServer sigue siendo same-origin desde la candidata.

## Docker de revisión

| Servicio | Estado |
| --- | --- |
| `sigi-ux-v2-frontend-admin-1` | healthy · `127.0.0.1:5374` |
| `sigi-ux-v2-frontend-country-1` | healthy · `127.0.0.1:5373` |
| `sigi-ux-v2-sigi-api-1` | healthy · `127.0.0.1:3200` |
| `sigi-ux-v2-geoserver-1` | healthy · `127.0.0.1:8281` |

Digest de la candidata: `sha256:9e4e9b8779b48c0e7b2183b133a53e02799a799b7f0e5579645358765f1457d1`.

## Alcance de la revisión final

La revisión debe confirmar textos, jerarquía, filtros, mapas, ficha/proyecto, descargas y transiciones público → login → workspace para cada dominio. Los procedimientos de corte y rollback están en `19-unified-frontend-cutover-runbook.md`.

Pendiente de decisión, no de implementación funcional:

1. firma de aceptación por dominio;
2. autorización explícita de SF-11 para conmutar tráfico;
3. periodo de observación;
4. autorización destructiva separada de SF-12 para retirar Country.
