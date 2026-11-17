# Sprint UAT-1 — Proyectos y Mapa

Fecha: 2026-09-30  
Rama: `feature/ux-ui-v2`  
Ambiente: Docker local `sigi-ux-v2`, frontend `http://127.0.0.1:5374`

## Alcance

- cartera y workspace de Proyectos;
- permisos de edición y solo lectura;
- deep links y contexto de proyecto;
- visor, catálogo, capas, filtros, ficha, tabla, exportación y fullscreen;
- responsive de resumen de proyecto y catálogo cartográfico;
- autorización GIS y aislamiento multi-EGI de proyectos.

## Matriz de aceptación técnica

| Caso | Perfil | Resultado | Evidencia |
| --- | --- | --- | --- |
| Cartera Costa Rica muestra los cuatro proyectos y permite abrir su ficha | superadmin | PASS | `costa-rica-demo.spec.js` |
| Ficha conserva tabs y deep links tras recarga | superadmin | PASS | `admin.spec.js` |
| Resumen responde en desktop, tablet y móvil | superadmin | PASS | `admin.spec.js` |
| Edición reversible de proyecto, actores e hitos | superadmin | PASS | `admin.spec.js` |
| Editor ve operación de edición; lector conserva solo lectura | editor / lector | PASS | `uat-projects-map.spec.js` |
| Configuración de Proyectos permanece oculta y protegida | lector | PASS | `admin.spec.js` |
| Catálogo GIS carga las capas Costa Rica | superadmin | PASS | `costa-rica-demo.spec.js` |
| Búsqueda, activación, filtros, tabla, ficha y exportación | superadmin | PASS | `geo.spec.js` |
| Fullscreen entra y sale sin bloquearse con la ficha abierta | superadmin | PASS | `geo.spec.js` |
| Catálogo usa dos columnas en desktop y una en viewport móvil | validador | PASS | `uat-projects-map.spec.js` |
| Validador accede a GIS sin configuración; lector recibe acceso denegado | validador / lector | PASS | `uat-projects-map.spec.js` |
| Visibilidad de capas públicas/restringidas | anónimo técnico / autorizado | PASS 4/4 | `npm run smoke:geo-visibility` |
| Contrato GIS, filtros, exportación, búsqueda, estadísticas y cercanía | autorizado | PASS 60/60 | `npm run smoke:geo-api` |
| Matriz de roles | seis perfiles | PASS 42/42 | `npm run smoke:roles` |
| Operación acotada al EGI activo | editor / validador | PASS 23/23 | `npm run smoke:operational` |
| Separación de proyectos y acceso cruzado entre dos EGI | dos editores institucionales | PASS 22/22 | `npm run smoke:uat` |
| Regresión E2E completa | perfiles y rutas críticas | PASS 39/39; 2 opt-in omitidos | `npm run test:e2e` |
| Datos demo Costa Rica opt-in | superadmin | PASS 2/2 | `SIGI_E2E_COSTA_RICA=1 npm run test:e2e -- tests/e2e/costa-rica-demo.spec.js` |
| Pruebas unitarias | frontend / API / scripts | PASS 140 Node + 6 Python | `npm run test:unit` |
| Build, tipos, lint y post-deploy | aplicación completa | PASS | `npm run typecheck:frontend`, `npm run lint`, build Docker y gate post-deploy |

## Hallazgos resueltos

1. La prueba opt-in de la cartera Costa Rica todavía esperaba cards con rol `button`; la cartera vigente es una tabla accesible con enlaces `Ver proyecto`. El contrato E2E se actualizó al patrón real.
2. El smoke multi-EGI no desempaquetaba la respuesta `{ project }` del alta de proyecto. Esto producía IDs `undefined` y falsos `500`. Se corrigió el fixture y se confirmó que el acceso cruzado real responde `404` para ambos EGI.
3. La página de Mapa resolvía autorización desde el usuario básico de la sesión de login, pero el menú utilizaba el usuario efectivo del contexto EGI. Un validador podía ver el módulo y recibir después `Sin permiso`. La página ahora usa el mismo `currentUser` efectivo que la navegación; frontend y backend mantienen sus controles de permiso.

## Límites de esta aceptación

- Es una aceptación técnica reproducible sobre Docker local, no sustituye la firma del responsable funcional.
- No se ejecutó HTTPS/VPS ni backup/restore; pertenecen al release gate final.
- Dibujo por vértices, medición persistente y vector tiles siguen siendo capacidades futuras porque no existe contrato backend aprobado.

## Decisión

**PASS técnico / pendiente aprobación funcional del usuario.** No hay bloqueantes abiertos de Proyectos o Mapa en el alcance de UAT-1.
