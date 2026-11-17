# Manual de instalación local — SIGI v2.1.3

Este documento permite instalar una instancia independiente de SIGI en infraestructura de la institución. Cada instalación utiliza sus propios contenedores, base PostgreSQL/PostGIS, archivos, configuración, usuarios y respaldos.

## 1. Arquitectura instalada

El instalador levanta mediante Docker Compose:

- PostgreSQL 16 + PostGIS 3.4;
- API SIGI;
- frontend SIGI;
- GeoServer 2.28;
- servicios GIS e integración;
- Caddy como único punto público para HTTP/HTTPS.

La base de datos, GeoServer y las APIs internas no publican sus puertos directamente.

## 2. Servidor requerido

Sistema probado:

- Ubuntu Server 22.04 o 24.04 LTS;
- arquitectura `x86_64` / `amd64`;
- acceso administrativo mediante `sudo`;
- conexión a Internet durante la instalación;
- 40 GB libres como mínimo;
- 16 GB de RAM recomendados para producción o demo estable;
- 8 GB de RAM admitidos para pruebas mediante el perfil reducido.

Puertos:

- `22/tcp`: administración SSH, restringida a las IP autorizadas;
- `80/tcp`: HTTP y emisión de certificados;
- `443/tcp`: HTTPS;
- `443/udp`: HTTP/3, opcional.

No se recomienda instalar SIGI directamente en Windows. Para una computadora Windows, utilizar una máquina virtual Ubuntu con los recursos anteriores.

## 3. Archivos de la Release

Descargar desde la Release privada `v2.1.3`:

- `install-sigi-ubuntu.sh`: instalador y actualizador autocontenido;
- `sigi-v2.1.3-docker.tar.gz`: código, Dockerfiles y archivos Compose de la versión;
- `SHA256SUMS.txt`: checksums de integridad;
- este manual.

Con GitHub CLI:

```bash
gh release download v2.1.3 \
  --repo Restoration-Team-FAO/SIGI-Distribution \
  --pattern 'install-sigi-ubuntu.sh' \
  --pattern 'sigi-v2.1.3-docker.tar.gz' \
  --pattern 'SHA256SUMS.txt' \
  --pattern 'MANUAL-INSTALACION-LOCAL.md'
```

La cuenta de GitHub utilizada debe tener acceso de lectura al repositorio privado de distribución `Restoration-Team-FAO/SIGI-Distribution`. No necesita acceso al repositorio fuente de desarrollo.

Verificar la descarga:

```bash
sha256sum --check SHA256SUMS.txt
```

## 4. Elegir el modo de acceso

### Opción A: dominio público y certificado Let's Encrypt

Crear registros DNS antes de instalar:

```text
sigi.institucion.org      -> IP pública del servidor
www.sigi.institucion.org  -> IP pública del servidor
```

Los puertos 80 y 443 deben llegar al servidor. El instalador obtiene y renueva el certificado automáticamente.

### Opción B: red institucional sin exposición a Internet

Crear un nombre en el DNS interno, por ejemplo:

```text
sigi.institucion.test -> IP privada del servidor
```

Se utiliza `SIGI_TLS_MODE=internal`. Caddy generará una autoridad certificadora interna. Los equipos cliente deben confiar en esa CA para evitar advertencias del navegador.

## 5. Copiar el instalador al servidor

Desde el equipo del administrador:

```bash
scp install-sigi-ubuntu.sh administrador@SERVIDOR:/tmp/
```

Conectarse al servidor:

```bash
ssh administrador@SERVIDOR
chmod 750 /tmp/install-sigi-ubuntu.sh
```

## 6. Primera instalación

### Servidor de 16 GB, dominio público

```bash
sudo env \
  SIGI_DOMAIN=sigi.institucion.org \
  SIGI_ACME_EMAIL=operaciones@institucion.org \
  bash /tmp/install-sigi-ubuntu.sh v2.1.3
```

### Servidor de prueba con 8 GB

```bash
sudo env \
  SIGI_DOMAIN=sigi.institucion.org \
  SIGI_ACME_EMAIL=operaciones@institucion.org \
  SIGI_MEMORY_PROFILE=8g \
  bash /tmp/install-sigi-ubuntu.sh v2.1.3
```

### Red interna

```bash
sudo env \
  SIGI_DOMAIN=sigi.institucion.test \
  SIGI_ACME_EMAIL=operaciones@institucion.org \
  SIGI_TLS_MODE=internal \
  bash /tmp/install-sigi-ubuntu.sh v2.1.3
```

El instalador:

1. instala Docker Engine, Docker Compose v2, Node.js 20 y dependencias;
2. configura firewall, swap y el usuario operativo `sigi`;
3. solicita una autorización de GitHub mediante código de dispositivo;
4. descarga el tag exacto `v2.1.3`;
5. genera secretos aleatorios en `/etc/sigi/sigi.env`;
6. construye las imágenes Docker y ejecuta migraciones;
7. valida los healthchecks y HTTPS;
8. configura respaldos diarios con rotación.

La primera construcción puede tardar entre 15 y 30 minutos.

## 7. Autorización de GitHub

Durante la primera instalación se mostrará un código y la dirección:

```text
https://github.com/login/device
```

Abrir esa dirección desde un equipo autorizado, ingresar el código y aprobar el acceso con una cuenta que tenga lectura sobre `Restoration-Team-FAO/SIGI-Distribution`.

No enviar tokens, contraseñas ni archivos de configuración por correo o mensajería.

## 8. Acceso inicial

Al terminar, el instalador muestra la URL. La identidad administrativa inicial es:

```text
superadmin@sigi.local
```

La clave generada se consulta únicamente en el servidor:

```bash
sudo cat /etc/sigi/sigi-admin.txt
```

Cambiarla después del primer ingreso. El archivo `/etc/sigi/sigi.env` contiene secretos y debe conservar permisos restringidos; nunca debe copiarse al repositorio.

## 9. Verificación

```bash
cd /opt/sigi/SiGi-platform

sudo -u sigi docker compose \
  --project-name sigi \
  --env-file /etc/sigi/sigi.env \
  -f docker-compose.prod.yml ps

curl -fsS https://sigi.institucion.org/api/version
curl -fsS https://sigi.institucion.org/api/health
```

Los servicios permanentes deben mostrar estado `healthy`.

Para TLS interno, agregar temporalmente `-k` a `curl` solamente para diagnóstico. En los equipos de usuario se debe instalar la CA interna, no desactivar permanentemente la validación TLS.

## 10. Actualización

Descargar el instalador de la nueva Release y ejecutar:

```bash
sudo bash /tmp/install-sigi-ubuntu.sh vX.Y.Z
```

El proceso conserva secretos y volúmenes, crea un respaldo previo, ejecuta migraciones y revierte las imágenes de aplicación si falla una comprobación. No elimina automáticamente los datos.

## 11. Respaldos

El instalador crea un timer diario:

```bash
sudo systemctl status sigi-backup.timer
sudo systemctl list-timers sigi-backup.timer
sudo systemctl start sigi-backup.service
sudo journalctl -u sigi-backup.service -n 100
```

Los respaldos se guardan en:

```text
/var/backups/sigi
```

Incluyen PostgreSQL, archivos SIGI, datos de GeoServer, manifiesto y checksums. La institución debe copiar periódicamente un respaldo cifrado a un almacenamiento externo al servidor.

## 12. Restauración

La restauración reemplaza los datos actuales. Validar primero el respaldo y coordinar una ventana de mantenimiento:

```bash
cd /opt/sigi/SiGi-platform

sudo -u sigi env \
  SIGI_ENV_FILE=/etc/sigi/sigi.env \
  SIGI_COMPOSE_PROJECT_NAME=sigi \
  node scripts/ops/restore-platform.mjs \
    --backup=/var/backups/sigi/sigi-backup-YYYYMMDDTHHMMSSZ \
    --confirm=RESTORE-SIGI-PLATFORM \
    --start=true
```

Después de restaurar, repetir las pruebas de salud y acceso HTTPS.

## 13. Operación y diagnóstico

Estado:

```bash
cd /opt/sigi/SiGi-platform
sudo -u sigi docker compose -p sigi --env-file /etc/sigi/sigi.env -f docker-compose.prod.yml ps
```

Logs recientes:

```bash
sudo -u sigi docker compose -p sigi --env-file /etc/sigi/sigi.env -f docker-compose.prod.yml logs --tail=200
```

Espacio y memoria:

```bash
df -h /
free -h
docker system df
```

Detener SIGI sin borrar datos:

```bash
sudo -u sigi docker compose -p sigi --env-file /etc/sigi/sigi.env -f docker-compose.prod.yml stop
```

Iniciar nuevamente:

```bash
sudo -u sigi docker compose -p sigi --env-file /etc/sigi/sigi.env -f docker-compose.prod.yml up -d
```

No utilizar `docker compose down -v`: la opción `-v` elimina los volúmenes de datos.

## 14. Información para soporte

Al reportar un incidente, adjuntar sin secretos:

- versión mostrada por `/api/version`;
- salida de `docker compose ps`;
- servicio afectado y hora aproximada;
- últimas líneas de log del servicio;
- uso de disco y memoria.

No adjuntar `/etc/sigi/sigi.env`, `/etc/sigi/sigi-admin.txt`, dumps de base de datos ni tokens de GitHub.
