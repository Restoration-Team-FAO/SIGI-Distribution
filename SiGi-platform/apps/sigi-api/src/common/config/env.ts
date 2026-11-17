type ValidatedEnv = {
  appEnv: string;
  databaseUrl: string;
  gisServiceUrl: string;
  integrationServiceUrl: string;
  geoserverInternalUrl: string;
  geoserverAdminUser: string;
  geoserverAdminPassword: string;
  geoserverWorkspace: string;
  geoserverDatastore: string;
  internalServiceToken: string;
  apiUploadMaxBytes: number;
  importMaxRows: number;
  integrationServiceTimeoutMs: number;
  gisServiceTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  sensitiveRateLimitMaxRequests: number;
  authAccessTokenTtlSeconds: number;
  authRefreshTokenTtlSeconds: number;
  authMaxFailedAttempts: number;
  authLockoutSeconds: number;
  corsAllowedOrigins: string[];
  trustProxyHops: number;
  allowLegacyAdminTokens: boolean;
  sigiEnableDbReset: boolean;
  sigiDbResetPassphrase: string | null;
  sigiSuperadminToken: string | null;
  sigiNationalAdminToken: string | null;
  sigiEditorToken: string | null;
  sigiValidatorToken: string | null;
  sigiReaderToken: string | null;
  sigiIntegrationToken: string | null;
  sigiSecretsKey: string;
  logLevel: string;
  httpClientTimeoutMs: number;
  httpClientMaxRetries: number;
  sigiApiPort: number;
  fileStorageRoot: string;
  fileMaxUploadMb: number;
  fileAllowedExtensions: string[];
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parsePositiveInt(name: string, fallback?: number): number {
  const rawValue = process.env[name];
  const value = rawValue ?? (fallback !== undefined ? String(fallback) : undefined);

  if (!value) {
    throw new Error(`Missing required numeric environment variable: ${name}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable: ${name}=${value}`);
  }

  return parsed;
}

function parseNonZeroInt(name: string, fallback: number): number {
  return parsePositiveInt(name, fallback);
}

function parseNonNegativeInt(name: string, fallback: number): number {
  const value = process.env[name] ?? String(fallback);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative numeric environment variable: ${name}=${value}`);
  }
  return parsed;
}

function parseBoolean(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${name}=${value}`);
}

function parseUrl(name: string): string {
  const value = requireEnv(name);
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`Invalid URL environment variable: ${name}=${value}`);
  }
}

function isProductionLikeEnv() {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  return nodeEnv === 'production' || appEnv === 'production';
}

function assertNotPlaceholderInProduction(name: string, value: string) {
  if (!isProductionLikeEnv()) {
    return;
  }

  const normalized = value.trim();
  const placeholders = new Set([
    'superadmin-dev-token',
    'national-admin-dev-token',
    'editor-dev-token',
    'validator-dev-token',
    'reader-dev-token',
    'integration-dev-token',
    'sigi-dev-secret',
    'sigi-dev-internal-token',
    'reset-sigi-demo-2026',
    'geoserver',
  ]);

  if (placeholders.has(normalized)) {
    throw new Error(
      `Refusing to start with placeholder secret in production: ${name}`,
    );
  }
}

let cachedEnv: ValidatedEnv | undefined;

export function getValidatedEnv(): ValidatedEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = {
    appEnv: process.env.APP_ENV?.trim().toLowerCase() || process.env.NODE_ENV?.trim().toLowerCase() || 'local',
    databaseUrl: requireEnv('DATABASE_URL'),
    gisServiceUrl: parseUrl('GIS_SERVICE_URL'),
    integrationServiceUrl: parseUrl('INTEGRATION_SERVICE_URL'),
    geoserverInternalUrl: parseUrl('GEOSERVER_INTERNAL_URL'),
    geoserverAdminUser: requireEnv('GEOSERVER_ADMIN_USER'),
    geoserverAdminPassword: requireEnv('GEOSERVER_ADMIN_PASSWORD'),
    geoserverWorkspace: requireEnv('GEOSERVER_WORKSPACE'),
    geoserverDatastore: requireEnv('GEOSERVER_DATASTORE'),
    internalServiceToken:
      process.env.SIGI_INTERNAL_SERVICE_TOKEN?.trim() ||
      process.env.SIGI_SECRETS_KEY?.trim() ||
      'sigi-dev-internal-token',
    apiUploadMaxBytes: parsePositiveInt('API_UPLOAD_MAX_BYTES', 10485760),
    importMaxRows: parsePositiveInt('IMPORT_MAX_ROWS', 5000),
    integrationServiceTimeoutMs: parsePositiveInt(
      'INTEGRATION_SERVICE_TIMEOUT_MS',
      8000,
    ),
    gisServiceTimeoutMs: parsePositiveInt('GIS_SERVICE_TIMEOUT_MS', 20000),
    rateLimitWindowMs: parseNonZeroInt('RATE_LIMIT_WINDOW_MS', 60000),
    rateLimitMaxRequests: parseNonZeroInt('RATE_LIMIT_MAX_REQUESTS', 240),
    sensitiveRateLimitMaxRequests: parseNonZeroInt(
      'SENSITIVE_RATE_LIMIT_MAX_REQUESTS',
      60,
    ),
    authAccessTokenTtlSeconds: parsePositiveInt('AUTH_ACCESS_TOKEN_TTL_SECONDS', 1800),
    authRefreshTokenTtlSeconds: parsePositiveInt('AUTH_REFRESH_TOKEN_TTL_SECONDS', 604800),
    authMaxFailedAttempts: parsePositiveInt('AUTH_MAX_FAILED_ATTEMPTS', 5),
    authLockoutSeconds: parsePositiveInt('AUTH_LOCKOUT_SECONDS', 900),
    corsAllowedOrigins: (
      process.env.SIGI_CORS_ALLOWED_ORIGINS ??
      'http://127.0.0.1:5174,http://127.0.0.1:5274,http://localhost:5174,http://localhost:5274'
    ).split(',').map((origin) => origin.trim()).filter(Boolean),
    trustProxyHops: parseNonNegativeInt('SIGI_TRUST_PROXY_HOPS', 0),
    allowLegacyAdminTokens: parseBoolean('SIGI_ALLOW_LEGACY_ADMIN_TOKENS', false),
    sigiEnableDbReset: parseBoolean('SIGI_ENABLE_DB_RESET', false),
    sigiDbResetPassphrase: process.env.SIGI_DB_RESET_PASSPHRASE?.trim() || null,
    sigiSuperadminToken: process.env.SIGI_SUPERADMIN_TOKEN?.trim() || null,
    sigiNationalAdminToken: process.env.SIGI_NATIONAL_ADMIN_TOKEN?.trim() || null,
    sigiEditorToken: process.env.SIGI_EDITOR_TOKEN?.trim() || null,
    sigiValidatorToken: process.env.SIGI_VALIDATOR_TOKEN?.trim() || null,
    sigiReaderToken: process.env.SIGI_READER_TOKEN?.trim() || null,
    sigiIntegrationToken: process.env.SIGI_INTEGRATION_TOKEN?.trim() || null,
    sigiSecretsKey: process.env.SIGI_SECRETS_KEY ?? 'sigi-dev-secret',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    httpClientTimeoutMs: parsePositiveInt('HTTP_CLIENT_TIMEOUT_MS', 5000),
    httpClientMaxRetries: parsePositiveInt('HTTP_CLIENT_MAX_RETRIES', 2),
    sigiApiPort: parsePositiveInt('SIGI_API_PORT', 3000),
    fileStorageRoot: process.env.FILE_STORAGE_ROOT?.trim() || '/var/sigi-files',
    fileMaxUploadMb: parsePositiveInt('FILE_MAX_UPLOAD_MB', 25),
    fileAllowedExtensions: (
      process.env.FILE_ALLOWED_EXTENSIONS ??
      'pdf,doc,docx,xls,xlsx,csv,txt,jpg,jpeg,png,geojson,json,zip'
    )
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
  };

  if (cachedEnv.allowLegacyAdminTokens) {
    if (
      !cachedEnv.sigiSuperadminToken ||
      !cachedEnv.sigiNationalAdminToken ||
      !cachedEnv.sigiEditorToken ||
      !cachedEnv.sigiValidatorToken ||
      !cachedEnv.sigiReaderToken ||
      !cachedEnv.sigiIntegrationToken
    ) {
      throw new Error(
        'Legacy admin tokens are enabled but one or more SIGI_*_TOKEN variables are missing.',
      );
    }

    assertNotPlaceholderInProduction(
      'SIGI_SUPERADMIN_TOKEN',
      cachedEnv.sigiSuperadminToken,
    );
    assertNotPlaceholderInProduction(
      'SIGI_NATIONAL_ADMIN_TOKEN',
      cachedEnv.sigiNationalAdminToken,
    );
    assertNotPlaceholderInProduction('SIGI_EDITOR_TOKEN', cachedEnv.sigiEditorToken);
    assertNotPlaceholderInProduction(
      'SIGI_VALIDATOR_TOKEN',
      cachedEnv.sigiValidatorToken,
    );
    assertNotPlaceholderInProduction('SIGI_READER_TOKEN', cachedEnv.sigiReaderToken);
    assertNotPlaceholderInProduction(
      'SIGI_INTEGRATION_TOKEN',
      cachedEnv.sigiIntegrationToken,
    );
  }
  if (isProductionLikeEnv() && cachedEnv.sigiEnableDbReset) {
    throw new Error('SIGI_ENABLE_DB_RESET must be false in production.');
  }
  if (isProductionLikeEnv() && cachedEnv.allowLegacyAdminTokens) {
    throw new Error('SIGI_ALLOW_LEGACY_ADMIN_TOKENS must be false in production.');
  }
  if (cachedEnv.authRefreshTokenTtlSeconds <= cachedEnv.authAccessTokenTtlSeconds) {
    throw new Error('AUTH_REFRESH_TOKEN_TTL_SECONDS must exceed AUTH_ACCESS_TOKEN_TTL_SECONDS.');
  }
  if (cachedEnv.corsAllowedOrigins.length === 0) {
    throw new Error('SIGI_CORS_ALLOWED_ORIGINS must contain at least one origin.');
  }
  if (cachedEnv.corsAllowedOrigins.includes('*')) {
    throw new Error('SIGI_CORS_ALLOWED_ORIGINS cannot contain wildcard origins.');
  }
  assertNotPlaceholderInProduction('SIGI_SECRETS_KEY', cachedEnv.sigiSecretsKey);
  assertNotPlaceholderInProduction(
    'SIGI_INTERNAL_SERVICE_TOKEN',
    cachedEnv.internalServiceToken,
  );
  assertNotPlaceholderInProduction(
    'GEOSERVER_ADMIN_PASSWORD',
    cachedEnv.geoserverAdminPassword,
  );
  if (cachedEnv.sigiDbResetPassphrase) {
    assertNotPlaceholderInProduction(
      'SIGI_DB_RESET_PASSPHRASE',
      cachedEnv.sigiDbResetPassphrase,
    );
  }

  return cachedEnv;
}
