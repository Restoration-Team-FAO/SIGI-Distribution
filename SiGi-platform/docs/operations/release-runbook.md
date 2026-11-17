# SIGI — Runbook productivo

## Precondiciones

- Docker Engine y Docker Compose v2;
- Node.js 20 para gates y operaciones;
- DNS de `SIGI_PUBLIC_DOMAIN` y `SIGI_ADMIN_DOMAIN` apuntando al edge;
- puertos 80/TCP, 443/TCP y 443/UDP disponibles;
- directorio de backup absoluto, externo al checkout y con política de copia
  remota;
- `.env.production` creado desde `.env.production.example`, sin placeholders.

El propietario PostgreSQL indicado por `POSTGRES_USER` se reserva para
bootstrap y migraciones. Las aplicaciones usan `sigi_app` mediante
`DATABASE_URL`; GeoServer usa `geoserver_ro`.

## Validación y despliegue

```bash
npm run verify:env:prod
npm run verify:compose
npm run ops:verify
npm run release:verify
docker compose --project-name sigi-platform \
  --env-file .env.production -f docker-compose.prod.yml up -d --build
npm run db:migrate
```

No cambie `--project-name` en despliegues posteriores: identifica los volúmenes
persistentes. Sólo Caddy debe mostrar puertos en `docker compose ps`.

## Superficie pública

- `https://${SIGI_PUBLIC_DOMAIN}/`: portal country;
- `https://${SIGI_ADMIN_DOMAIN}/`: consola administrativa;
- `/api/*`: API compartida;
- `/geoserver/wms*`, `/geoserver/wfs*`, `/geoserver/ows*`: OGC público;
- `/geoserver/web*` y `/geoserver/rest*`: deben devolver 404 desde el edge.

Los healthchecks de API, frontends, Python, PostgreSQL, GeoServer y Caddy se
observan mediante:

```bash
docker compose --project-name sigi-platform \
  --env-file .env.production -f docker-compose.prod.yml ps -a
```

## Backup completo

Linux/macOS:

```bash
export SIGI_BACKUP_DIR=/mnt/backup/sigi
export SIGI_COMPOSE_PROJECT_NAME=sigi-platform
npm run ops:backup
```

PowerShell:

```powershell
$env:SIGI_BACKUP_DIR = 'D:\Backups\SIGI'
$env:SIGI_COMPOSE_PROJECT_NAME = 'sigi-platform'
npm run ops:backup
```

El resultado `sigi-backup-<UTC>` contiene `postgres.dump`,
`sigi_files_data.tar.gz`, `geoserver_data.tar.gz`, `manifest.json` y
`SHA256SUMS.json`. La escritura usa un directorio `.partial` y sólo lo renombra
al completar. `SIGI_BACKUP_RETENTION_DAYS` controla la retención local; una
copia remota/inmutable sigue siendo obligatoria.

Los volúmenes Caddy no se respaldan: contienen certificados y caché
regenerables. La configuración Caddy está versionada y el certificado se
reobtiene mediante ACME.

## Restauración

La restauración reemplaza base y volúmenes persistentes. Requiere una ruta
absoluta y confirmación literal:

```bash
npm run ops:restore -- \
  --backup=/mnt/backup/sigi/sigi-backup-YYYYMMDDTHHMMSSZ \
  --confirm=RESTORE-SIGI-PLATFORM \
  --start=true
```

Antes de restaurar:

1. confirme el proyecto Compose correcto;
2. conserve otra copia del estado actual;
3. anuncie la ventana de indisponibilidad;
4. verifique espacio disponible.

El comando comprueba SHA-256, detiene consumidores, recrea la base, reemplaza
los volúmenes SIGI/GeoServer y reprovisiona roles. Sin `--start=true`, deja los
servicios de aplicación detenidos para inspección.

Después del restore valide portal, admin, `/api/health`, WMS/WFS, descarga de
un archivo y permisos negativos de `geoserver_ro`.

## Logs y diagnóstico

```bash
docker compose --project-name sigi-platform \
  --env-file .env.production -f docker-compose.prod.yml logs --tail 200 caddy sigi-api
```

`LOG_MAX_SIZE` y `LOG_MAX_FILES` parametrizan la rotación. No publique
`.env.production`, dumps, archivos ni logs con tokens como artefactos CI; el
workflow sólo conserva el manifiesto sanitizado del ejercicio operativo.
