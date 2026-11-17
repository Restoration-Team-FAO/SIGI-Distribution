# Baseline de seguridad de dependencias

Fecha de actualización: 2026-09-23

## Alcance

Este baseline cubre las dependencias Node.js del frontend unificado y de `sigi-api`. La comprobación obligatoria para CI y para el release gate es:

```bash
npm run security:audit:prod
```

El comando falla ante vulnerabilidades de severidad alta o crítica que formen parte del árbol desplegado en producción. El audit completo también debe mantenerse sin hallazgos al actualizar el lockfile:

```bash
npm audit
```

## Versiones base

| Componente | Versión base | Motivo |
| --- | ---: | --- |
| NestJS | 11.2.6 | Corrige vulnerabilidades del runtime y actualiza Express/Multer sin adoptar todavía NestJS 12. |
| React Router DOM | 7.18.4 | Corrige vulnerabilidades de redirección, XSS y manejo de rutas presentes en la línea 6. |
| Vite | 7.3.6 | Elimina la línea vulnerable de Vite/esbuild y conserva compatibilidad con React 18. |
| `@vitejs/plugin-react` | 5.2.0 | Plugin compatible con Vite 7. |
| SheetJS CE | 0.20.3 | Distribución oficial corregida; se instala desde el tarball versionado del CDN oficial porque npm publica únicamente 0.18.5. |

El runtime mínimo efectivo para las herramientas actuales es Node.js 20.19.0. Los jobs de CI usan la versión vigente de Node.js 20 y el entorno local validado usa Node.js 22.18.0.

## Reproducibilidad

- `package-lock.json` fija el árbol completo del monorepo.
- `apps/sigi-api/package-lock.json` fija el árbol usado por el contexto Docker independiente del API.
- El origen de SheetJS está versionado explícitamente como `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` y su integridad queda registrada en ambos lockfiles.
- No se permite usar `npm audit fix --force` como parte automática del release.

## Validación ejecutada

- `npm audit`: 0 vulnerabilidades.
- `npm run security:audit:prod`: 0 vulnerabilidades.
- Typecheck de UI, frontend y API.
- Build de producción del frontend y API.
- 126 pruebas unitarias Node.js.
- 6 pruebas Python.
- Pruebas funcionales de lectura y escritura XLSX.
- 35 pruebas E2E activas del frontend unificado; 2 escenarios opt-in de datos demo quedan omitidos por diseño.

Los cambios de dependencias deben repetir estas comprobaciones y reconstruir las imágenes Docker antes de promover una versión.
