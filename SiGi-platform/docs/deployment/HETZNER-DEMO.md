# SIGI en Hetzner CX43 — demo pública controlada

## Alcance

Este procedimiento despliega la rama `feature/ux-ui-v2` en un Hetzner CX43
`x86_64/amd64` con Ubuntu 24.04 LTS y Docker Compose v2. Mantiene PostGIS
16/3.4, GeoServer 2.28.0, el frontend único, las APIs existentes y Caddy. No
incluye ni requiere una migración ARM64.

La topología pública es deliberadamente pequeña:

```text
Internet :80/:443
        |
      Caddy
        |
  frontend-sigi + /api + WMS/WFS/OWS permitidos
        |
  redes edge/backend internas
        |
  PostgreSQL, GeoServer, integration-service y gis-service
```

`frontend-sigi` es el único frontend. El dominio legado configurado en
`SIGI_PUBLIC_DOMAIN` únicamente redirige al dominio principal
`SIGI_ADMIN_DOMAIN`; no publica un segundo portal.

## Capacidad y presupuesto

El Compose reserva un máximo agregado de 12.75 GiB para los contenedores y
deja aproximadamente 3 GiB para Ubuntu, Docker y caché de archivos:

| Servicio               | Límite predeterminado |
| ---------------------- | --------------------: |
| PostgreSQL/PostGIS     |                 4 GiB |
| GeoServer              |                 4 GiB |
| SIGI API               |               1.5 GiB |
| GIS service            |               1.5 GiB |
| Integration service    |               768 MiB |
| Frontend               |               256 MiB |
| Caddy                  |               256 MiB |
| Jobs de inicialización |      256 MiB cada uno |

GeoServer inicia con `-Xms1g -Xmx3g`. Los límites pueden ajustarse en el archivo
de entorno, pero el verificador rechaza una suma superior a 14 GiB.

El CX43 es una instancia de CPU compartida adecuada para una demo y cargas
bajas o medias. Confirmar el precio vigente, IPv4, impuestos, snapshots y
volúmenes en la [página oficial de Hetzner](https://www.hetzner.com/cloud/cost-optimized/)
antes de contratar. No añadir servicios de pago si el tope total debe mantenerse
por debajo de USD 30 mensuales.

## 1. Crear el servidor y el DNS

Crear el servidor con:

- tipo CX43;
- Ubuntu 24.04 LTS;
- arquitectura x86/amd64;
- una clave SSH, sin autenticación SSH por contraseña;
- región adecuada para los usuarios de la demo.

Crear dos registros DNS `A` hacia la IPv4 del servidor:

```text
demo.sigi.example.org       -> IP_DEL_CX43
www.demo.sigi.example.org   -> IP_DEL_CX43
```

El primer nombre será `SIGI_ADMIN_DOMAIN`; el segundo será un alias de
redirección en `SIGI_PUBLIC_DOMAIN`. Caddy necesita que ambos resuelvan al VPS
para emitir certificados automáticamente.

En el firewall de Hetzner permitir únicamente:

```text
22/tcp  desde las IP administrativas autorizadas
80/tcp  desde Internet
443/tcp desde Internet
443/udp desde Internet, para HTTP/3
```

## 2. Preparar Ubuntu

Conectarse como `root` o como usuario con `sudo`:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nodejs ufw

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Crear el usuario operativo. La pertenencia al grupo `docker` equivale a acceso
administrativo sobre el host y debe limitarse a este usuario:

```bash
sudo useradd --system --create-home --shell /bin/bash sigi
sudo usermod -aG docker sigi
sudo install -d -m 0755 -o sigi -g sigi /opt/sigi
sudo install -d -m 0750 -o root -g sigi /etc/sigi
sudo install -d -m 0700 -o sigi -g sigi /var/backups/sigi
sudo install -d -m 0700 -o sigi -g sigi /var/lib/sigi/rollbacks
```

Verificar:

```bash
docker --version
docker compose version
node --version
uname -m
```

`uname -m` debe devolver `x86_64`.

## 3. Instalar SIGI

Clonar mediante una credencial de solo lectura o una deploy key:

```bash
sudo -u sigi git clone --branch feature/ux-ui-v2 --single-branch \
  URL_DEL_REPOSITORIO /opt/sigi
sudo chmod 0750 /opt/sigi/deploy-demo.sh
```

El checkout de producción debe permanecer limpio. Datos, backups y secretos no
se guardan dentro de `/opt/sigi`.

## 4. Configurar secretos

Crear el archivo partiendo de la plantilla, fuera del repositorio:

```bash
sudo cp /opt/sigi/.env.production.example /etc/sigi/sigi-demo.env
sudo chown root:sigi /etc/sigi/sigi-demo.env
sudo chmod 0640 /etc/sigi/sigi-demo.env
sudoedit /etc/sigi/sigi-demo.env
```

Reemplazar todos los valores `<change-me>`. Se pueden generar secretos sin
caracteres que requieran codificación URL mediante:

```bash
openssl rand -hex 32
```

Configurar al menos:

```dotenv
POSTGRES_PASSWORD=VALOR_UNICO
SIGI_APP_DB_PASSWORD=VALOR_UNICO
DATABASE_URL=postgresql://sigi_app:EL_MISMO_SIGI_APP_DB_PASSWORD@postgres:5432/sigi_db
GEOSERVER_ADMIN_PASSWORD=VALOR_UNICO
GEOSERVER_DB_PASSWORD=VALOR_UNICO
SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN=CLAVE_FUERTE_16+_CON_LETRAS_Y_NUMEROS

SIGI_ACME_EMAIL=operaciones@example.org
SIGI_ADMIN_DOMAIN=demo.sigi.example.org
SIGI_PUBLIC_DOMAIN=www.demo.sigi.example.org
SIGI_CORS_ALLOWED_ORIGINS=https://demo.sigi.example.org
GEOSERVER_CORS_ALLOWED_ORIGINS=https://demo.sigi.example.org
```

También deben reemplazarse las claves y tokens `SIGI_*`, además de credenciales
Odoo si la integración estará activa. Si Odoo no está disponible para la demo,
usar únicamente el modo expresamente soportado por la aplicación; no publicar
Odoo ni abrir puertos adicionales.

Las identidades de arranque `*@sigi.local` nacen con hashes versionados en el repositorio. Desde v2.0.2 la API, al arrancar en producción, rota cada una con `SIGI_BOOTSTRAP_PASSWORD_<ROL>` (`SUPERADMIN`, `ADMIN`, `NATIONAL_ADMIN`, `EDITOR`, `VALIDATOR`, `READER`, `INTEGRATION`) o la deshabilita si la variable no existe. `SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN` es obligatoria.

Nunca ejecutar `source /etc/sigi/sigi-demo.env`: el archivo es consumido por
Docker Compose como datos, no como script de shell.

## 5. Primer despliegue

Confirmar primero que el DNS apunta al servidor y que 80/443 son alcanzables.
Luego ejecutar:

```bash
sudo -u sigi env \
  SIGI_ENV_FILE=/etc/sigi/sigi-demo.env \
  SIGI_COMPOSE_PROJECT_NAME=sigi-demo \
  SIGI_BACKUP_DIR=/var/backups/sigi \
  /opt/sigi/deploy-demo.sh
```

El script realiza, en orden:

1. backup previo cuando ya existe una instalación;
2. snapshot etiquetado de las imágenes anteriores;
3. `git pull --ff-only` de la rama actual;
4. validación del entorno y la topología;
5. pull de imágenes externas y build de las imágenes SIGI;
6. inicio y healthcheck de PostgreSQL;
7. recreación de roles de ejecución;
8. migraciones incrementales e idempotentes;
9. inicio y healthchecks de API, FastAPI, GeoServer y frontend;
10. bootstrap idempotente de GeoServer;
11. inicio de Caddy y validación HTTPS externa.

En una instalación preparada previamente por otro mecanismo puede omitirse el
pull de Git con `--no-source-pull`. `--no-backup` debe reservarse para el primer
despliegue, cuando todavía no existen datos.

## 6. Verificación

```bash
cd /opt/sigi
sudo -u sigi env SIGI_ENV_FILE=/etc/sigi/sigi-demo.env \
  SIGI_COMPOSE_PROJECT_NAME=sigi-demo \
  docker compose --project-name sigi-demo \
    --env-file /etc/sigi/sigi-demo.env \
    -f docker-compose.prod.yml ps

curl -fsS https://demo.sigi.example.org/ >/dev/null
curl -fsS https://demo.sigi.example.org/api/health
sudo ss -lntup
```

Todos los servicios permanentes deben estar `healthy`. En `ss` solamente deben
aparecer públicamente SSH, 80 y 443. PostgreSQL 5432, GeoServer 8080, las APIs
3000/8001/8002 y Nginx 80 no deben estar publicados por Docker.

Comprobar el límite y el heap de GeoServer:

```bash
docker inspect sigi-demo-geoserver-1 --format '{{.HostConfig.Memory}}'
docker exec sigi-demo-geoserver-1 printenv EXTRA_JAVA_OPTS
```

## 7. Backups automáticos y rotación

Cada backup contiene:

- `postgres.dump`, generado con `pg_dump -Fc`;
- `geoserver_data.tar.gz`;
- `sigi_files_data.tar.gz`;
- `configuration.tar.gz`, creado desde una lista explícita que excluye
  `.env.production` y `/etc/sigi`;
- manifiesto, versiones de imágenes y checksums SHA-256.

La rotación elimina copias que superen siete días y conserva como máximo siete
copias válidas. Ajustar ambos valores según el crecimiento real del volumen.
Estos parámetros se configuran en `/etc/sigi/backup.env`, separado del entorno
de aplicación.

Instalar el timer diario:

```bash
sudo cp /opt/sigi/infra/systemd/sigi-demo-backup.service /etc/systemd/system/
sudo cp /opt/sigi/infra/systemd/sigi-demo-backup.timer /etc/systemd/system/
sudo cp /opt/sigi/infra/systemd/backup.env.example /etc/sigi/backup.env
sudo chown root:sigi /etc/sigi/backup.env
sudo chmod 0640 /etc/sigi/backup.env
sudo systemctl daemon-reload
sudo systemctl enable --now sigi-demo-backup.timer
sudo systemctl start sigi-demo-backup.service
sudo systemctl status sigi-demo-backup.service
sudo systemctl list-timers sigi-demo-backup.timer
```

Revisar regularmente espacio y resultados:

```bash
df -h / /var/backups/sigi
sudo journalctl -u sigi-demo-backup.service --since '7 days ago'
sudo -u sigi find /var/backups/sigi -maxdepth 2 -type f -printf '%TY-%Tm-%Td %s %p\n'
```

Para una demo pública, copiar periódicamente al menos una copia cifrada fuera
del VPS. La rotación local no protege frente a pérdida completa del servidor.

## 8. Restauración

La restauración reemplaza la base y el contenido de los volúmenes, por lo que
requiere confirmación explícita:

```bash
cd /opt/sigi
sudo -u sigi env \
  SIGI_ENV_FILE=/etc/sigi/sigi-demo.env \
  SIGI_COMPOSE_PROJECT_NAME=sigi-demo \
  node scripts/ops/restore-platform.mjs \
    --backup=/var/backups/sigi/sigi-backup-YYYYMMDDTHHMMSSZ \
    --confirm=RESTORE-SIGI-PLATFORM \
    --start=true
```

Después de restaurar, repetir las verificaciones HTTPS y funcionales.

## 9. Rollback y recuperación

Si falla el build, un healthcheck, el bootstrap o la verificación HTTPS,
`deploy-demo.sh` vuelve a levantar las imágenes de aplicación que estaban en
ejecución antes del despliegue. Los manifiestos quedan en
`/var/lib/sigi/rollbacks`.

Las migraciones de base no se revierten automáticamente porque una reversión
destructiva puede descartar datos escritos durante el despliegue. Si la versión
anterior no funciona con el esquema migrado, restaurar explícitamente el backup
previo siguiendo la sección anterior.

Todos los servicios permanentes usan `restart: unless-stopped`; PostgreSQL y
GeoServer tienen 60 segundos de gracia para apagado. Los jobs
`database-roles-init` y `geoserver-init` usan `restart: "no"` intencionalmente y
son recreados por el script en cada despliegue.

Después de reiniciar el VPS:

```bash
sudo systemctl status docker
cd /opt/sigi
sudo -u sigi docker compose --project-name sigi-demo \
  --env-file /etc/sigi/sigi-demo.env \
  -f docker-compose.prod.yml ps
```

## 10. Operación cotidiana

Actualizar la demo:

```bash
sudo -u sigi env \
  SIGI_ENV_FILE=/etc/sigi/sigi-demo.env \
  SIGI_COMPOSE_PROJECT_NAME=sigi-demo \
  SIGI_BACKUP_DIR=/var/backups/sigi \
  /opt/sigi/deploy-demo.sh
```

Consultar logs con rotación activa:

```bash
cd /opt/sigi
sudo -u sigi docker compose --project-name sigi-demo \
  --env-file /etc/sigi/sigi-demo.env \
  -f docker-compose.prod.yml logs --tail=200
```

La configuración predeterminada conserva cinco archivos de log de 10 MiB por
contenedor. Vigilar además disco, memoria, reinicios y latencia de GeoServer. Si
la carga GIS o BI se vuelve sostenida, el siguiente paso debe ser medir antes de
aumentar heap o añadir servicios: el CX43 usa CPU compartida.
