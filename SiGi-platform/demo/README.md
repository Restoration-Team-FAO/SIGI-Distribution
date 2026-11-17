# Paquete de despliegue SIGI Demo

Este directorio levanta una instancia independiente de SIGI en un servidor
Linux con Docker Compose. Incluye HTTPS, datos de demostración, persistencia,
validación, release gate, respaldo y restauración.

## Requisitos

- Servidor Linux con IP fija y, como referencia, 4 CPU, 8 GB RAM y 80 GB SSD.
- Docker Engine y Docker Compose v2.
- Git, Node.js 20 y npm.
- Puertos TCP 80 y 443 accesibles. UDP 443 es opcional para HTTP/3.
- Para el modo interno temporal, acceso a la IP LAN del servidor y permiso
  para configurar el archivo `hosts` de las computadoras cliente.
- Para publicación definitiva, dos registros DNS apuntando al servidor.

Todos los comandos se ejecutan desde una copia limpia y etiquetada del
repositorio. El paquete combina `docker-compose.prod.yml` con
`demo/docker-compose.demo.yml` y usa el nombre de proyecto `sigi-demo`.
Si fuera imprescindible cambiarlo, exporta `SIGI_DEMO_PROJECT` con el mismo
valor en todos los comandos operativos y de respaldo.

## 1. Preparar configuración

La forma recomendada genera todos los secretos y conserva automáticamente las
coincidencias requeridas:

```bash
chmod +x demo/bin/*.sh
./demo/bin/init-env.sh sigi-demo.internal admin.sigi-demo.internal admin@localhost
```

Revisa después `demo/.env.demo`, especialmente país, límites geográficos y la
configuración opcional de Odoo.

También puedes prepararlo manualmente:

```bash
cp demo/.env.demo.example demo/.env.demo
chmod 600 demo/.env.demo
nano demo/.env.demo
```

Reemplaza todos los valores de ejemplo. Para generar secretos:

```bash
openssl rand -hex 32
```

`POSTGRES_PASSWORD` y la contraseña incluida en `DATABASE_URL` deben ser
idénticas. También deben coincidir `SIGI_INTEGRATION_TOKEN` y
`SIGI_IMPORT_ADMIN_TOKEN`.

No guardes `demo/.env.demo` en Git. El archivo ya está incluido en
`.gitignore`.

### Acceso temporal desde otras computadoras

Obtén la IP LAN del servidor:

```bash
hostname -I
```

En cada computadora autorizada agrega una línea basada en
`demo/hosts.example`:

```text
IP_DEL_SERVIDOR sigi-demo.internal admin.sigi-demo.internal
```

En Windows, el archivo es
`C:\Windows\System32\drivers\etc\hosts` y debe editarse como administrador.
Caddy emitirá certificados con su CA interna para estos nombres. Después del
primer despliegue, exporta la CA:

```bash
./demo/bin/export-local-ca.sh
```

Copia `demo/caddy-local-root.crt` únicamente a las computadoras autorizadas.
En Windows puede instalarse, desde una consola como administrador, con:

```powershell
certutil -addstore -f Root caddy-local-root.crt
```

Sin instalar esa CA, el navegador mostrará una advertencia de certificado.

## 2. Validar y desplegar

Si no lo hiciste durante la preparación, da permiso de ejecución después de
clonar en Linux:

```bash
chmod +x demo/bin/*.sh
```

Instala dependencias de los scripts y valida:

```bash
npm ci
./demo/bin/validate.sh
```

Levanta el stack:

```bash
./demo/bin/deploy.sh
```

El primer arranque crea los volúmenes `sigi-demo_*` y ejecuta todos los SQL de
`infra/postgres/init`, incluido el seed coherente de demostración. Los scripts
de inicialización de PostgreSQL no vuelven a ejecutarse sobre un volumen ya
inicializado.

## 3. Revisar el estado

```bash
./demo/bin/status.sh
./demo/bin/logs.sh
./demo/bin/logs.sh sigi-api geoserver
```

El proxy publica únicamente:

- `https://DEMO_PORTAL_DOMAIN/`;
- `https://DEMO_ADMIN_DOMAIN/`;
- `/api/*` hacia la API;
- `/geoserver/wms*` y `/geoserver/ows*` hacia los servicios cartográficos.

PostgreSQL, los servicios Python, la API, los frontends y la administración de
GeoServer no quedan expuestos directamente a Internet. Sus puertos del host
permanecen ligados a `127.0.0.1`.

## 4. Gate funcional y cuentas iniciales

Ejecuta el gate antes de entregar el demo:

```bash
./demo/bin/release-gate.sh
```

La evidencia queda en `demo/artifacts/`. El gate usa las cuentas iniciales del
seed documentadas en `docs/operations/release-gate.md`. Después de aprobarlo:

1. crea cuentas específicas para quienes harán la demostración;
2. cambia o deshabilita las contraseñas conocidas del seed;
3. crea el respaldo base del demo.

Los smoke tests pueden crear datos de validación; por eso el respaldo base debe
tomarse después de revisar y limpiar el estado final que se presentará.

## 5. Respaldar

```bash
./demo/bin/backup.sh
```

Por defecto crea `demo/backups/FECHA_UTC/` con:

- dump lógico de PostgreSQL;
- documentos cargados en SIGI;
- configuración y datos persistentes de GeoServer;
- variables del entorno;
- commit Git e imágenes resueltas;
- sumas SHA-256.

Para almacenar respaldos fuera del repositorio:

```bash
SIGI_DEMO_BACKUP_DIR=/var/backups/sigi-demo ./demo/bin/backup.sh
```

Copia los respaldos periódicamente a otro servidor o almacenamiento de
objetos. Un respaldo que solo existe en el servidor del demo no protege frente
a la pérdida completa del servidor.

## 6. Restaurar

La restauración reemplaza la base, los documentos y los datos de GeoServer.
Requiere una confirmación literal:

```bash
./demo/bin/restore.sh /var/backups/sigi-demo/20260909T120000Z RESTAURAR-SIGI-DEMO
```

El script verifica primero las sumas SHA-256, detiene el stack, restaura y
espera que los servicios vuelvan a estar saludables.

## 7. Detener sin perder datos

```bash
./demo/bin/stop.sh
```

No uses `docker compose down --volumes` en el servidor del demo: eliminaría la
base, los documentos y la configuración persistente.

## 8. Actualizar a otra versión etiquetada

1. Crea un respaldo.
2. Obtén y selecciona el tag aprobado.
3. Revisa y aplica las migraciones SQL nuevas.
4. Despliega y ejecuta el gate.

```bash
./demo/bin/backup.sh
git fetch --tags
git checkout --detach demo-2026.09.2
npm ci
./demo/bin/deploy.sh
./demo/bin/release-gate.sh
```

Actualmente las migraciones en `infra/postgres/migrations` no tienen un
ejecutor automático. No actualices una instancia con datos sin identificar y
aplicar primero las migraciones correspondientes a la nueva versión.

## Cambiar a los dominios institucionales

Cuando existan los DNS definitivos, edita únicamente estas variables en
`demo/.env.demo`:

```env
DEMO_PORTAL_DOMAIN=sigi.institucion.org
DEMO_ADMIN_DOMAIN=admin.sigi.institucion.org
DEMO_ACME_EMAIL=infra@institucion.org
```

Confirma que ambos DNS resuelvan hacia el servidor y vuelve a ejecutar
`./demo/bin/deploy.sh`. Las rutas de API y GeoServer son relativas, así que el
cambio de dominio no requiere modificar el código de los frontends.

## Operación diaria mínima

- Revisa `./demo/bin/status.sh` antes de cada presentación.
- Mantén al menos siete respaldos diarios y cuatro semanales fuera del host.
- Revisa espacio con `df -h` y `docker system df`.
- No ejecutes `docker system prune --volumes`.
- Conserva `demo/.env.demo` con permisos `600`.
- Instala actualizaciones del sistema en una ventana de mantenimiento.
