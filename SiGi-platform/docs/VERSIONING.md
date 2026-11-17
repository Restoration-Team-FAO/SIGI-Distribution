# Política de versionado SIGI

## Esquema

SIGI usa **SemVer `MAJOR.MINOR.PATCH`**, a partir de **v2.0.1** (2026-10-14, base `feature/ux-ui-v2` @ `df3cc033`).

| Cambio | Incremento | Ejemplos |
|---|---|---|
| Incompatible con instancias o integraciones existentes (contratos API, esquema no aditivo, configuración obligatoria nueva) | MAJOR | Eliminar un endpoint; renombrar variables de entorno obligatorias |
| Funcionalidad nueva compatible (migraciones aditivas, endpoints nuevos, módulos nuevos) | MINOR | Motor de reportes; modelo de intervenciones |
| Correcciones compatibles (seguridad, bugs, documentación operativa) | PATCH | Fuga OGC, redacción de secretos |

Las prerelease usan sufijo: `2.1.0-rc.1`.

## Fuente única

- `SiGi-platform/VERSION` define la versión.
- `node scripts/release/bump-version.mjs <x.y.z>` la propaga a `package.json` (raíz, `apps/frontend-sigi`, `apps/sigi-api`) y a los lockfiles.
- `npm run version:check` y `tests/unit/version-consistency.test.mjs` fallan si algún manifiesto no coincide.
- La versión se expone en `GET /api/version`, en `GET /api/health` y en el pie de la barra lateral de la interfaz. El commit de build (`SIGI_GIT_SHA`) aparece en `/api/version` y en el tooltip de la versión.

## Procedimiento de release

1. Rama `release/vX.Y.Z` desde la rama aprobada.
2. `node scripts/release/bump-version.mjs X.Y.Z` y la entrada en `CHANGELOG.md`.
3. Pruebas: `npm run version:check`, la suite unitaria y el release gate que corresponda.
4. Commit `chore(release): vX.Y.Z` y **tag anotado** `vX.Y.Z` sobre ese commit (`git tag -a vX.Y.Z -m "SIGI vX.Y.Z"`).
5. Despliegue desde el tag (nunca desde un árbol de trabajo con cambios), exportando `SIGI_GIT_SHA=$(git rev-parse HEAD)`.
6. Los tags publicados no se mueven ni se reescriben. Una corrección se publica como versión nueva.
