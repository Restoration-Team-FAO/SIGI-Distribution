# SF-4 — Frontera entre API pública y workspace

## Contrato

El frontend único utiliza dos fachadas explícitas:

| Fachada | Consumidores | Sesión | EGI | Endpoints `/admin/*` |
| --- | --- | --- | --- | --- |
| `publicApi` | rutas públicas | no | no | prohibidos |
| `workspaceApi` | rutas `/admin/*` | bearer + refresh | EGI activo cuando aplica | permitidos según backend |

`publicApi` vive en `features/public/services/public-api.ts`. `workspaceApi` y las funciones de sesión permanecen en `services/api.ts` para no alterar contratos backend durante esta ola.

## Variables Vite permitidas en el bundle público

| Variable | Uso |
| --- | --- |
| `VITE_SIGI_API_URL` | base pública `/api` |
| `VITE_SIGI_PORTAL_MODE` | etiqueta demo/prod |
| `VITE_GEOSERVER_ENABLED` | habilitación visual de WMS público |
| `VITE_GEOSERVER_WMS_URL` | proxy WMS público |
| `VITE_GEOSERVER_PUBLIC_LAYER` | capa pública por defecto |

No se permiten tokens, passwords, secretos de cliente, IDs privados de EGI ni URLs administrativas con credenciales.

## Verificación

- `tests/unit/public-api-boundary.test.mjs` impide bearer, header EGI y paths `/admin/*` en `publicApi`.
- Playwright observa las requests anónimas de las rutas públicas y falla si aparece `/api/admin/*`.
- El backend sigue siendo la autoridad final de visibilidad; esta separación evita mezclas accidentales en el cliente.
