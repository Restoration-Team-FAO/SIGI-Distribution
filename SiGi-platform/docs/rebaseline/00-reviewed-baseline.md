# Baseline funcional revisado

## Decisión

El baseline funcional y de aceptación de la nueva auditoría es el contenido
ejecutado por `sigi-demo-local`, correlacionado con el commit `ec40482c`. Esta es
la versión probada por el usuario y considerada casi lista para producción. El
término `demo` forma parte del nombre técnico del proyecto Docker y no reduce el
nivel de madurez atribuido al producto. No se usará `release/sigi-v1-rc` como
base funcional.

Ante una diferencia no explicada entre la RC y este stack, prevalece inicialmente
el comportamiento de `sigi-demo-local`. Solo podrá cambiarse mediante un hallazgo
documentado y una decisión explícita de aceptación.

## Correlación entre Docker y Git

Se extrajeron los artefactos de los contenedores originales y se reconstruyeron
las cinco imágenes de aplicación desde un worktree limpio en `ec40482c`.

| Componente | Imagen revisada | Resultado del manifiesto |
| --- | --- | --- |
| frontend-admin | `d9e64f559a22` | idéntico |
| frontend-country | `a5f80e4d53ca` | idéntico |
| sigi-api | `42b985912720` | idéntico |
| integration-service | `1b48f561cfa7` | idéntico |
| gis-service | `a1e89e4c32d3` | idéntico |

Resultados:

- diferencias frontend: `0`;
- diferencias de runtime API/Python, excluyendo bytecode: `0`;
- build Docker de las cinco imágenes: `PASS`.

Esto demuestra que el código del commit elegido reproduce los artefactos
revisados. La diferencia temporal entre el build de imágenes y el último commit
corresponde a cambios de despliegue, no a diferencias de aplicación.

## Estado de datos preservado

Se creó un dump PostgreSQL custom y una exportación del esquema, sin modificar
datos. La instancia contenía:

- PostgreSQL/PostGIS con extensiones `postgis 3.4.3` y `pgcrypto 1.3`;
- 90 tablas de usuario registradas;
- 7 instituciones y 14 usuarios;
- 8 proyectos, 6 indicadores y 6 territorios;
- 3 espacios EGI y 7 membresías EGI;
- 11 plantillas y 7 frameworks de reportes;
- 1 capa y 5 features GIS.

Hashes:

- dump: `EB526451BBC0FFE601E0024E498DD1140F3CF2349D1781FEEFF18864DDC6B150`;
- esquema: `704BE11E033C6DCF812DF51DC517E33FB455F39387B189AAF767341D7A2EC5A8`.

Los archivos permanecen fuera de Git en
`C:\GIT\SIGI\_audit_evidence\sigi-demo-local-2026-09-17` porque pueden contener
datos y no forman parte del código fuente.

## Smoke de la instancia revisada

Se arrancaron temporalmente los contenedores existentes y se restauró su estado
detenido al finalizar.

| Check | Resultado |
| --- | --- |
| frontend-country | HTTP 200 |
| frontend-admin | HTTP 200 |
| API `/api/health` | HTTP 200 |
| API `/api/ready` | HTTP 200 |
| GeoServer WMS GetCapabilities | HTTP 200 |
| PostgreSQL | healthy |
| integration-service | healthy |
| gis-service | healthy |
| GeoServer | healthy |

## Riesgo de recreación detectado

Los contenedores existentes conservan la configuración con la que fueron
creados, pero el archivo local `.env.production` referenciado por
`docker-compose.prod.yml` ya no está presente en el worktree demo. Por tanto:

- reconstruir imágenes es reproducible;
- recrear el stack original con el mismo comando aún no es reproducible;
- no debe copiarse ni publicarse un archivo con secretos reales;
- el siguiente ciclo deberá generar una configuración de prueba segura a partir
  del contrato de variables y comprobar un despliegue nuevo.

## Estado al cierre

Los volúmenes originales se conservaron y todos los contenedores de
`sigi-demo-local` quedaron detenidos, igual que al inicio de la captura.
