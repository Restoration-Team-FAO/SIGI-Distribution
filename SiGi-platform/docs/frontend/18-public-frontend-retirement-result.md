# 18 — Retiro del frontend público heredado

## Objetivo

Completar el cutover hacia un único frontend autenticado, gobernado por sesión, permisos y EGI activo. Esta fase retira código muerto; no modifica contratos API, modelos ni permisos backend.

## Cambios

- eliminado `apps/frontend-country` del repositorio y del lockfile;
- eliminados `PublicShell`, `PublicRouter` y `features/public` de `frontend-admin`;
- retiradas las rutas públicas del catálogo y del router autenticado;
- retirado `frontend-country` de Compose local, producción, validación y demo;
- actualizado Caddy para redirigir el dominio histórico al frontend único;
- eliminados puertos y orígenes CORS exclusivos del portal retirado;
- mantenidas las redirecciones de rutas históricas, siempre pasando por login;
- conservados los endpoints públicos del API para integraciones y publicación no interactiva.

## Contrato resultante

1. `/administration` es la única pantalla accesible sin sesión.
2. Toda ruta funcional requiere autenticación.
3. El frontend muestra rutas, tabs, acciones y configuración según capacidades efectivas.
4. Los dominios y enlaces antiguos redirigen al frontend autenticado.
5. No existe un contenedor, paquete, workspace ni suite E2E de portal público.

## Validación

| Gate | Resultado |
| --- | --- |
| Typecheck y lint | PASS |
| Unitarias Node | PASS, 110/110 |
| Unitarias Python | PASS, 6/6 |
| Build frontend + API | PASS |
| Playwright sobre Docker | PASS, 34/34 |
| Compose local y demo | PASS, solo `frontend-admin` |
| Operación de producción | PASS |
| Docker `sigi-ux-v2` | frontend/API/DB/GIS saludables |

Frontend de revisión: `http://127.0.0.1:5374`. El puerto retirado `5373` permanece cerrado. Imagen validada: `sha256:aa0dc44eaaec8f63f50e5b8639f217c93e0fd91dfa34921aad9b481d823db1ea`.
