# Sprint 4R — Infraestructura y operación

Fecha de cierre: 2026-09-17

Rama: `integration/sigi-v1-reconciled`

## Resultado

Sprint completado. El Compose productivo conserva los módulos y volúmenes del
baseline, pero expone únicamente el edge TLS y separa redes, identidades de
base de datos y responsabilidades operativas.

## Controles incorporados

- Caddy `2.8.4-alpine` como único servicio con puertos publicados;
- hostnames independientes para portal y administración;
- TLS ACME para producción y TLS interno para CI/validación aislada;
- publicación exclusiva de API y OGC WMS/WFS/OWS; `/geoserver/web` y
  `/geoserver/rest` quedan bloqueados en el edge;
- redes internas `edge` y `backend`; sólo Caddy y el servicio de integración
  participan también en `egress`;
- PostgreSQL propietario/migrador, `sigi_app` con DML sin DDL y
  `geoserver_ro` limitado a lectura de `gis`;
- CORS GeoServer explícito, sin wildcard, y métodos públicos de solo lectura;
- estilos SLD versionados y actualización idempotente del datastore para
  reemplazar credenciales heredadas del baseline;
- persistencia de PostgreSQL, archivos SIGI, GeoServer y estado Caddy;
- límites configurables de rotación `json-file` para todos los servicios;
- healthchecks, detección del servidor PostgreSQL definitivo y respuesta `503`
  controlada durante indisponibilidad de upstream;
- backup atómico con dump custom, archivos, GeoServer, commit, imágenes y
  checksums;
- restore con confirmación explícita, verificación de checksums y
  reprovisionamiento de roles;
- CI aislado para TLS, superficie GeoServer, permisos, degradación/recuperación
  y backup/restore completo; sólo publica un manifiesto sanitizado.

## Evidencia ejecutada

| Control | Resultado |
|---|---|
| `npm run ops:verify` | PASS, sólo `caddy` publica puertos |
| servicios productivos | healthy; jobs de bootstrap `Exited (0)` |
| portal / admin / API | `200 / 200 / 200` sobre TLS |
| WMS / WFS | `200 / 200` |
| `/geoserver/web` / `/geoserver/rest` | `404 / 404` |
| degradación y recuperación API | `200 → 503 → 200` |
| `geoserver_ro` → GIS | lectura permitida |
| `geoserver_ro` → core | acceso denegado |
| `sigi_app` → core | lectura permitida |
| `sigi_app` → DDL en core | acceso denegado |
| backup | 3 artefactos no vacíos con SHA-256 |
| restore PostgreSQL | marcador restaurado a `original` |
| restore archivos SIGI | marcador restaurado a `original-file` |
| restore GeoServer | marcador restaurado a `original-geoserver` |
| API/WFS después de restore | `200 / 200` |

La prueba destructiva se ejecutó exclusivamente sobre los proyectos efímeros
`sigi-4r-validation` y `sigi-4r-roles-validation`. El entorno aceptado
`sigi-r1-validation` no fue modificado.

## Decisión

Sprint 4R: **DONE**. La base operativa permite iniciar Sprint 5R, dedicado a
identidad individual, sesiones, permisos y aislamiento institución/EGI. Los
límites de CPU/memoria y un stack externo de métricas/alertas requieren valores
de capacidad del entorno destino y se mantienen como configuración de
plataforma previa al go-live, no como supuestos embebidos.
