# 22 — Renombrado del frontend único

Fecha de cierre: 2026-09-23

## Resultado

El anfitrión autenticado único dejó de usar el nombre físico transitorio `frontend-admin` y ahora se identifica como `frontend-sigi`:

- workspace: `apps/frontend-sigi`;
- paquete npm: `frontend-sigi`;
- servicio Compose: `frontend-sigi`;
- imagen local: `<proyecto>-frontend-sigi`;
- proxy interno: `frontend-sigi:80`.

El cambio es de empaquetado y despliegue. No modifica las rutas funcionales `/admin/*`, porque esas rutas describen áreas autorizadas del producto y no un segundo frontend.

## Superficies actualizadas

- workspaces y lockfile npm;
- Dockerfile y contextos de build;
- Compose local, producción, validación y demo;
- Caddy productivo, interno y demo;
- restore y verificadores de operación/fundación;
- pruebas unitarias que inspeccionan el frontend;
- documentación técnica vigente;
- configuración E2E y smoke post-deploy.

## Compatibilidad temporal

Para no romper automatizaciones externas durante el cutover se conservan aliases:

- comandos `dev:admin`, `typecheck:admin` y `build:admin` delegan a sus equivalentes `*:frontend`;
- `FRONTEND_ADMIN_PORT` sigue aceptándose como fallback de `SIGI_FRONTEND_PORT`;
- `SIGI_E2E_ADMIN_URL` sigue aceptándose como fallback de `SIGI_E2E_URL`;
- `SIGI_SMOKE_ADMIN_URL` sigue aceptándose como fallback de `SIGI_SMOKE_FRONTEND_URL`.

Los nombres nuevos son la interfaz primaria para instalaciones y pipelines nuevos. Los aliases no representan otro frontend y pueden retirarse en una futura versión mayor después de verificar consumidores externos.

## Gate

1. `apps/frontend-admin` no existe y `apps/frontend-sigi` sí existe.
2. No hay servicio Compose ni upstream Caddy llamado `frontend-admin`.
3. El frontend conserva puerto, autenticación, rutas y headers.
4. CI usa los comandos agregados del monorepo, ahora respaldados por `build:frontend` y `typecheck:frontend`.
5. Docker reemplaza el contenedor anterior y queda saludable con el nuevo nombre.
6. Typecheck, build, unitarias, E2E y smokes permanecen verdes.

## Evidencia de cierre

- typecheck y build monorepo: aprobados;
- instalación reproducible del Dockerfile mediante `npm ci`: aprobada;
- verificadores de Compose, fundación reconciliada y operación productiva: aprobados;
- pruebas Node: 126/126;
- pruebas Python: 6/6;
- E2E: 35/35 activas y 2 escenarios opt-in omitidos;
- smoke por roles: 42/42;
- smoke del frontend único: 39/39;
- smoke post-deploy: API, frontend y GeoServer con HTTP 200;
- contenedor activo: `sigi-ux-v2-frontend-sigi-1`, saludable en `127.0.0.1:5374`;
- contenedor reemplazado `sigi-ux-v2-frontend-admin-1`: retirado después del healthcheck;
- imagen validada: `sha256:818c0a7fa0b64bd3024c79b6c90259cb857a5a8d79d312aa8c2b6558b23e1273`.
