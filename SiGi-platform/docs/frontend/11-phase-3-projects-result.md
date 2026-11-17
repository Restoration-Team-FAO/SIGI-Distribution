# 11 — Resultado de Fase 3: Proyectos

Fecha: 2026-09-22  
Rama: `feature/ux-ui-v2`

## Resultado

Proyectos quedó organizado en dos recorridos explícitos:

1. **Cartera** mantiene filtros, selección, ficha maestra y todas las mutaciones existentes.
2. **Workspace del proyecto** ofrece lectura progresiva por pestañas y conserva el proyecto activo en `projectId`.

La selección ya no depende únicamente de estado React. Las rutas `?view=<sección>&projectId=<uuid>` se pueden compartir, recargar y abrir directamente. Un `view` desconocido cae de forma segura en `summary`.

## Secciones del workspace

| Vista | Fuente real | Operación |
| --- | --- | --- |
| Resumen | detalle de proyecto + resumen de cartera | contexto y accesos a relaciones |
| Actores | `ProjectDetail.actors` | lectura enfocada; CRUD preservado en Cartera |
| Hitos | `ProjectDetail.milestones` | lectura enfocada; CRUD preservado en Cartera |
| Indicadores | `ProjectDetail.indicators` | línea base, meta, valor y avance |
| Territorio | features territoriales + polígono del proyecto | mapa ejecutivo/operativo y selección contextual |
| Entregables | `ProjectDetail.deliverables` | estado, fecha y salida publicada |
| Documentos | búsqueda de archivos por proyecto + `ProjectDetail.documents` | archivos, evidencia tipada y descarga autorizada |
| Informes | `GET /admin/reports` filtrado por `selection.projects` | relación visible solo con `reports.read` |
| Actividad | incidencias + auditoría del detalle | seguimiento y trazabilidad |

## Permisos y seguridad

- La ruta del módulo sigue protegida por `projects.read`.
- La pestaña Informes y su consulta solo existen con `reports.read`.
- Las acciones conservan sus permisos backend actuales (`projects.create`, `projects.update`, `projects.polygon.update`, `files.*`).
- La interfaz no sustituye las validaciones de API ni expone conteos de Informes a perfiles sin permiso.

## Progressive disclosure

El Resumen muestra primero estado, avance y conteos relacionados. Los detalles extensos se abren en pestañas específicas. Cartera conserva deliberadamente la edición integral existente para evitar una regresión en actores, hitos, territorio, entregables, documentos y auditoría.

## Límites honestos

- Informes permite navegar al historial relacionado, pero el workspace de Informes todavía no interpreta un `reportId`; no se anuncia un deep link de entidad inexistente.
- No existe una entidad separada de “evidencia de proyecto”: se reconoce como evidencia únicamente un archivo cuya asociación real usa `relationType=evidence`.
- Las pestañas enfocadas son de lectura. Las mutaciones siguen concentradas en Cartera hasta extraer formularios reutilizables sin duplicar lógica.

## Pruebas añadidas

El E2E de administración verifica que:

- una pestaña genera URL con `view` y `projectId`;
- recargar esa URL conserva sección y proyecto;
- el retorno a Cartera mantiene el mismo `projectId`.

## Evidencia de validación

Se completa al cerrar la fase:

| Verificación | Resultado |
| --- | --- |
| `npm run typecheck:admin` | PASS |
| `npm run build:admin` | PASS, 109 módulos |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 89 Node + 6 Python |
| `npm run test:e2e` | PASS, 27/27 |
| `npm run smoke:roles` | PASS, 36/36 |
| `npm run smoke:unified-frontend` | PASS, 50/50 |
| Docker `sigi-ux-v2` | servicios saludables |

Docker de revisión:

- aplicación unificada: `http://127.0.0.1:5374`;
- referencia Country: `http://127.0.0.1:5373`;
- API: `http://127.0.0.1:3200/api`;
- GeoServer: `http://127.0.0.1:8281`;
- imagen frontend: `sha256:de3f12fb601c439da0c11c1e7cce35499970a74611898692235f3f65bed06c1c`.
