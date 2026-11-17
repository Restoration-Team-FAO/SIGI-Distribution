# SIGI UAT Multi-EGI

## Objetivo

Validar que dos EGI de instituciones distintas operen sin mezcla de datos ni permisos cruzados.

## Cobertura

- selección de dos EGI con distinta `institutionId`;
- creación de dos usuarios `institution_editor` separados por institución;
- creación temporal de fuentes y documentos por EGI;
- verificación de workspace visible por usuario;
- verificación de listados separados en:
  - `sources`
  - `projects`
  - `imports`
  - `files`
- intento de acceso cruzado a resumen EGI;
- intento de modificación cruzada de fuente;
- validación de auditoría para bloqueos y creación por `egi_id`.

## Ejecución

```bash
npm run smoke:uat
```

## Resultado esperado

- usuario del EGI A no ve el EGI B;
- usuario del EGI B no ve el EGI A;
- cada usuario solo visualiza sus fuentes, proyectos y carpetas del EGI propio;
- accesos cruzados a `GET /admin/egi/:id/summary` responden `403`;
- auditoría registra `access.forbidden` con `requestId` y `egiId`;
- artefactos temporales se limpian al finalizar.
