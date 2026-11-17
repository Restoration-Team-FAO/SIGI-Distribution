# Sprint 2R — Docker, TLS, redes, volúmenes y operación

## Comparación de topología

| Control | Baseline | RC | Decisión |
| --- | --- | --- | --- |
| edge TLS | existe en `demo/Caddyfile`, no integrado al Compose production | Caddy público/interno, ACME y TLS interno | ADAPTAR al producto baseline |
| exposición | servicios productivos enlazados a loopback; GeoServer también | sólo Caddy publica; servicios sin puertos en overlay | ADAPTAR |
| redes | red Compose implícita | `edge`, `backend internal`, `egress` | ADAPTAR; Kobo/Odoo necesitan egress controlado |
| GeoServer público | demo publica WMS/OWS | publica WMS/WFS/OWS y bloquea `/web`/`/rest` | ADAPTAR y probar WFS requerido por GIS |
| usuario DB GeoServer | usuario principal | `geoserver_ro` con acceso limitado | ADAPTAR |
| volúmenes | PostgreSQL, GeoServer y archivos SIGI | PostgreSQL/GeoServer; la RC perdió explorador de archivos | preservar y añadir `sigi_files_data` |
| logs | límites json-file ya presentes | límites configurables para todos los servicios | ADAPTAR sólo parametrización |
| health/readiness | health/readiness y checks Compose | gate prueba degradación 503 y recuperación | PORTAR prueba, conservar implementación baseline |
| backup | DB + archivos + GeoServer + env/manifiesto/checksums | DB a ruta absoluta, checksum, permisos y retención | combinar; no degradar a DB-only |
| restore | restaura DB y dos volúmenes | restaura DB y recrea rol GeoServer | combinar y validar copia completa |

VERIFIED IN CODE: diff `b63be468`, `43c770dc`, `448a18a1`; comparación de
`docker-compose.prod.yml`, `demo/docker-compose.demo.yml`, ambos Caddyfiles y
scripts de backup/restore. VERIFIED BY EXECUTION: el stack baseline está healthy
en Docker con API `3000`, country `5173`, admin `5174` y GeoServer `8081`.

## Adaptación obligatoria

La RC usa un overlay (`docker-compose.yml` + `docker-compose.prod.yml`); el
baseline tiene un Compose production autónomo. Copiar el overlay no funciona
sin reconciliar ambos contratos. La topología objetivo deberá:

1. publicar únicamente Caddy en `80/443`;
2. separar portal y admin por hostname;
3. mantener API, PostgreSQL, Python y administración GeoServer sin exposición;
4. permitir egress sólo al integration-service;
5. conservar healthchecks y los tres volúmenes funcionales;
6. usar credenciales distintas para app, migraciones y GeoServer read-only;
7. versionar estilos y bootstrap GeoServer;
8. fijar imágenes por versión o digest y límites de logs;
9. migrar los volúmenes existentes sin cambiar implícitamente el project name.

## Backup/restore objetivo

Ninguno de los dos scripts es suficiente por sí solo. El baseline cubre los
artefactos funcionales completos; la RC aporta política operativa más segura.
El flujo reconciliado debe producir un directorio externo con:

- dump PostgreSQL custom format;
- `sigi_files_data.tar.gz`;
- `geoserver_data.tar.gz` o bootstrap reproducible validado;
- commit, imágenes y configuración sanitizada;
- checksums, permisos `0600`, escritura atómica y retención;
- prueba automatizada que destruya únicamente un entorno efímero, restaure y
  verifique DB, un archivo descargable, una capa WMS/WFS y el rol read-only.

## Riesgos pendientes

- El `CORS_ALLOWED_ORIGINS="*"` de GeoServer aparece en production baseline;
  el edge reduce superficie, pero debe reemplazarse por política explícita.
- El Caddy interno RC no replica todos los headers del Caddy público; debe
  unificarse la política antes de usarlo.
- No hay evidencia de `read_only`, `cap_drop` o límites de recursos para todos
  los contenedores en ninguna rama. NOT VERIFIED/pendiente de diseño.
- La transición de volúmenes debe ensayarse con copia del proyecto preservado
  `sigi-demo-local`, nunca directamente sobre sus volúmenes.
