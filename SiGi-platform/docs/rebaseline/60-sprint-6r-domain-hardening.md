# Sprint 6R — Hardening de dominios y validación funcional

Fecha de cierre: 2026-09-17

Rama: `integration/sigi-v1-reconciled`

## Resultado

Sprint completado. Se cerraron los bloqueadores de conectores, uploads, seed
productivo, territorio legacy y E2E. La pila `sigi-r1-validation` fue
reconstruida sobre sus volúmenes existentes y quedó accesible únicamente por
loopback en 3000, 5173, 5174 y 8081.

## Controles incorporados

- cliente HTTP saliente compartido para Kobo/Odoo: sólo HTTP(S), sin userinfo,
  resolución DNS, bloqueo IPv4/IPv6 no global, validación de cada redirect,
  allowlist explícita, timeout y límite de respuesta;
- Odoo XML-RPC valida el destino antes de crear el cliente;
- política común de upload por extensión, nombre normalizado y firma/contenido
  para documentos, Excel/CSV, GeoJSON y shapefile ZIP;
- shapefile ZIP limita entradas, tamaño expandido y ratio de compresión, y
  rechaza cifrado y traversal;
- `GET /territories` pagina por defecto 250 filas y limita `pageSize` a 500,
  conservando `data.territories` y añadiendo metadata de paginación;
- Compose productivo reemplaza el seed demo y ejecuta una política de bootstrap
  que conserva catálogos/roles/identidades, pero elimina registros operativos;
- overlay local de validación con puertos loopback y credenciales de roles DB
  compatibles con instalaciones previas;
- tests E2E reconciliados con los contratos y datos reales del baseline.

## Evidencia

| Control | Resultado |
|---|---|
| `npm run lint` | PASS |
| `npm run build` | PASS, country/admin/API |
| `npm run test:unit` | PASS, 88/88 Node + 6/6 Python |
| SSRF unitario | PASS, esquema/userinfo/IPv4/IPv6/global/allowlist |
| ZIP adversarial unitario | PASS, conteo/expansión/ratio/traversal/cifrado |
| DB productiva limpia aislada | 1 institución bootstrap, 7 identidades, 0 proyectos/territorios/datasets/conectores |
| migraciones sobre volumen aceptado | 2 aplicadas, checksums registrados |
| Playwright completo | PASS, 17/17 |
| matriz RBAC | PASS, 33/33 |
| identidad | PASS, 9/9 |
| aislamiento operacional | PASS, 23/23 |
| UAT multi-EGI | PASS, 22/22 |
| mutation/audit | PASS, 12/12 y 8/8 |
| export/publication scope | PASS |
| Docker local | 7 servicios healthy; 2 jobs `Exited (0)` |

La prueba de bootstrap se realizó en el proyecto temporal `sigi-r6-empty`; el
contenedor, red y volumen temporal fueron eliminados después de comprobar los
conteos.

## Hallazgos trasladados al Sprint 7R

El release gate agregado todavía mezcla fixtures históricos con el baseline:

- `geo-api-smoke.mjs` exige las capas DNEA/Odoo que ya no son parte del dataset
  aceptado;
- `incident-scope-smoke.mjs` presupone que los dos primeros EGI tienen proyecto;
- `step2-smoke.mjs` presupone un proyecto con `code` no nulo;
- los smokes deben crear y retirar sus propios fixtures para pasar dos veces
  desde una base productiva vacía.

No son fallos del recorrido de navegador ni regresiones del producto desplegado:
la suite E2E completa pasa. Constituyen el alcance principal de 7R
(automatización/release gate autocontenido) y mantienen el estado global en
**NOT READY** hasta completar el recorrido VPS limpio.

## Decisión

Sprint 6R: **DONE**. Siguiente: Sprint 7R, fixtures deterministas, gate completo
repetible, backup/restore y evidencia CI.
