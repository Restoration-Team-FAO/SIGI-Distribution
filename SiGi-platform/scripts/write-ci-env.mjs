import fs from 'node:fs';
import crypto from 'node:crypto';

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, value = 'true'] = entry.split('=');
    return [key, value];
  }),
);

const outputFile = args.get('--file') ?? '.env.production';
const forceWrite = args.get('--force') === 'true';

const values = {
  POSTGRES_DB: 'sigi_db',
  POSTGRES_USER: 'sigi_user',
  POSTGRES_PASSWORD: secret('pg'),
  POSTGRES_PORT: '5432',
  SIGI_APP_DB_USER: 'sigi_app',
  SIGI_APP_DB_PASSWORD: secret('app-db'),
  SIGI_API_PORT: '3000',
  INTEGRATION_SERVICE_PORT: '8001',
  GIS_SERVICE_PORT: '8002',
  GEOSERVER_PORT: '8081',
  GEOSERVER_BIND_HOST: '127.0.0.1',
  GEOSERVER_ADMIN_USER: 'admin',
  GEOSERVER_ADMIN_PASSWORD: secret('geoserver'),
  GEOSERVER_DB_USER: 'geoserver_ro',
  GEOSERVER_DB_PASSWORD: secret('geoserver-ro'),
  GEOSERVER_CORS_ALLOWED_ORIGINS: 'https://portal.sigi.test,https://admin.sigi.test',
  GEOSERVER_WORKSPACE: 'sigi',
  GEOSERVER_DATASTORE: 'sigi_postgis',
  GEOSERVER_DB_SCHEMA: 'gis',
  GEOSERVER_PUBLISH_PUBLIC_TERRITORIES: 'true',
  GEOSERVER_PUBLIC_FEATURE_NAME: 'public_territories',
  GEOSERVER_PUBLIC_VIEW_NAME: 'v_public_territories',
  GEOSERVER_PUBLISH_PUBLIC_PROJECT_POLYGONS: 'true',
  GEOSERVER_PUBLIC_PROJECT_FEATURE_NAME: 'public_project_polygons',
  GEOSERVER_PUBLIC_PROJECT_VIEW_NAME: 'v_public_project_polygons',
  GEOSERVER_PUBLISH_PUBLIC_PROJECT_CENTROIDS: 'true',
  GEOSERVER_PUBLIC_PROJECT_CENTROID_FEATURE_NAME: 'public_project_centroids',
  GEOSERVER_PUBLIC_PROJECT_CENTROID_VIEW_NAME: 'v_public_project_centroids',
  GEOSERVER_INTERNAL_URL: 'http://geoserver:8080/geoserver',
  VITE_SIGI_PORTAL_MODE: 'prod',
  VITE_GEOSERVER_ENABLED: 'true',
  VITE_GEOSERVER_PUBLIC_LAYER: 'sigi:public_territories',
  VITE_GEOSERVER_TERRITORIES_LAYER: 'sigi:public_territories',
  VITE_GEOSERVER_PROJECT_LAYER: 'sigi:public_project_polygons',
  INTEGRATION_SERVICE_URL: 'http://integration-service:8001',
  GIS_SERVICE_URL: 'http://gis-service:8002',
  LOG_LEVEL: 'info',
  HTTP_CLIENT_TIMEOUT_MS: '5000',
  HTTP_CLIENT_MAX_RETRIES: '2',
  OUTBOUND_HTTP_ALLOWED_HOSTS: 'odoo.internal',
  OUTBOUND_HTTP_MAX_REDIRECTS: '3',
  OUTBOUND_HTTP_MAX_RESPONSE_BYTES: '10485760',
  INTEGRATION_SERVICE_TIMEOUT_MS: '8000',
  GIS_SERVICE_TIMEOUT_MS: '20000',
  API_UPLOAD_MAX_BYTES: '10485760',
  FILE_STORAGE_ROOT: '/var/sigi-files',
  FILE_MAX_UPLOAD_MB: '25',
  FILE_ALLOWED_EXTENSIONS: 'pdf,doc,docx,xls,xlsx,csv,txt,jpg,jpeg,png,geojson,json,zip',
  IMPORT_MAX_ROWS: '5000',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX_REQUESTS: '240',
  SENSITIVE_RATE_LIMIT_MAX_REQUESTS: '60',
  SIGI_ALLOW_LEGACY_ADMIN_TOKENS: 'false',
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '1800',
  AUTH_REFRESH_TOKEN_TTL_SECONDS: '604800',
  SIGI_CORS_ALLOWED_ORIGINS: 'https://portal.sigi.test,https://admin.sigi.test',
  SIGI_TRUST_PROXY_HOPS: '1',
  SHAPEFILE_ARCHIVE_MAX_BYTES: '26214400',
  SHAPEFILE_ZIP_MAX_ENTRIES: '100',
  SHAPEFILE_ZIP_MAX_UNCOMPRESSED_BYTES: '104857600',
  SHAPEFILE_ZIP_MAX_COMPRESSION_RATIO: '100',
  SHAPEFILE_DEFAULT_COUNTRY: 'El Salvador',
  SHAPEFILE_NATIONAL_BBOX: '-90.4,13.0,-87.5,14.9',
  SHAPEFILE_PREVIEW_LIMIT: '5',
  SIGI_FRONTEND_PORT: '5174',
  BRIDGE_PORT: '3010',
  SIGI_ACME_EMAIL: 'ci@sigi.test',
  SIGI_PUBLIC_DOMAIN: 'portal.sigi.test',
  SIGI_ADMIN_DOMAIN: 'admin.sigi.test',
  SIGI_PUBLIC_BIND_HOST: '127.0.0.1',
  SIGI_HTTP_PORT: '18080',
  SIGI_HTTPS_PORT: '18443',
  SIGI_CADDYFILE: './infra/caddy/Caddyfile.internal',
  LOG_MAX_SIZE: '10m',
  LOG_MAX_FILES: '3',
  SIGI_SUPERADMIN_TOKEN: secret('legacy-superadmin'),
  SIGI_NATIONAL_ADMIN_TOKEN: secret('legacy-national'),
  SIGI_EDITOR_TOKEN: secret('legacy-editor'),
  SIGI_VALIDATOR_TOKEN: secret('legacy-validator'),
  SIGI_READER_TOKEN: secret('legacy-reader'),
  SIGI_INTEGRATION_TOKEN: secret('legacy-integration'),
  SIGI_SECRETS_KEY: secret('secrets'),
  SIGI_INTERNAL_SERVICE_TOKEN: secret('internal'),
  SIGI_DB_RESET_PASSPHRASE: secret('db-reset'),
  SIGI_IMPORT_API_URL: 'http://sigi-api:3000/api',
  SIGI_IMPORT_ADMIN_TOKEN: secret('import-admin'),
  ODOO_MOCK_MODE: 'false',
  ODOO_URL: 'http://odoo.internal:8069',
  ODOO_DB: 'sigi_ci',
  ODOO_USER: 'ci@sigi.local',
  ODOO_PASS: secret('odoo'),
  ODOO_DEFAULT_COUNTRY: 'El Salvador',
  ODOO_BATCH_SIZE: '500',
  SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN: `Ci1${secret('bootstrap-superadmin')}`,
  SIGI_BOOTSTRAP_PASSWORD_ADMIN: `Ci1${secret('bootstrap-admin')}`,
  SIGI_BOOTSTRAP_PASSWORD_NATIONAL_ADMIN: `Ci1${secret('bootstrap-national_admin')}`,
  SIGI_BOOTSTRAP_PASSWORD_EDITOR: `Ci1${secret('bootstrap-editor')}`,
  SIGI_BOOTSTRAP_PASSWORD_VALIDATOR: `Ci1${secret('bootstrap-validator')}`,
  SIGI_BOOTSTRAP_PASSWORD_READER: `Ci1${secret('bootstrap-reader')}`,
  SIGI_BOOTSTRAP_PASSWORD_INTEGRATION: `Ci1${secret('bootstrap-integration')}`,
  NODE_ENV: 'production',
  APP_ENV: 'production',
};

values.DATABASE_URL = `postgresql://${values.SIGI_APP_DB_USER}:${values.SIGI_APP_DB_PASSWORD}@postgres:5432/${values.POSTGRES_DB}`;

const content = Object.entries(values)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

if (fs.existsSync(outputFile) && !forceWrite) {
  throw new Error(
    `El archivo ${outputFile} ya existe. Usa --force=true para sobrescribirlo de forma explícita.`,
  );
}

fs.writeFileSync(outputFile, `${content}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      generated: outputFile,
      keys: Object.keys(values).length,
      portalMode: values.VITE_SIGI_PORTAL_MODE,
      nodeEnv: values.NODE_ENV,
      appEnv: values.APP_ENV,
    },
    null,
    2,
  ),
);

function secret(prefix) {
  return `${prefix}-${crypto.randomBytes(18).toString('base64url')}`;
}
