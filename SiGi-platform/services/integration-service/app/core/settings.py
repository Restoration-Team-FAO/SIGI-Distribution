from __future__ import annotations

import os


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def _parse_positive_int(name: str, default: int) -> int:
    raw_value = os.getenv(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(f'Invalid integer environment variable: {name}={raw_value}') from exc

    if value <= 0:
        raise RuntimeError(f'Expected a positive integer for {name}, got {raw_value}')

    return value


def _parse_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    normalized = raw_value.strip().lower()
    if normalized in {'1', 'true', 'yes', 'on'}:
        return True
    if normalized in {'0', 'false', 'no', 'off'}:
        return False
    raise RuntimeError(f'Invalid boolean environment variable: {name}={raw_value}')


def _is_production_like() -> bool:
    node_env = os.getenv('NODE_ENV', '').strip().lower()
    app_env = os.getenv('APP_ENV', '').strip().lower()
    return node_env == 'production' or app_env == 'production'


def _assert_not_placeholder_in_production(name: str, value: str | None) -> None:
    if not _is_production_like() or value is None:
        return
    placeholders = {
        'integration-dev-token',
        'sigi-dev-secret',
        'sigi-dev-internal-token',
        'reset-sigi-demo-2026',
    }
    if value.strip() in placeholders:
        raise RuntimeError(
            f'Refusing to start with placeholder secret in production: {name}',
        )


def _assert_not_demo_host_in_production(name: str, value: str | None) -> None:
    if not _is_production_like() or value is None:
        return
    normalized = value.strip().lower()
    if 'odoo.demo.local' in normalized:
        raise RuntimeError(
            f'Refusing to start with demo host in production: {name}',
        )


class Settings:
    def __init__(self) -> None:
        self.service_name = 'integration-service'
        self.database_url = _require_env('DATABASE_URL')
        self.log_level = os.getenv('LOG_LEVEL', 'info')
        self.http_client_timeout_ms = _parse_positive_int('HTTP_CLIENT_TIMEOUT_MS', 5000)
        self.http_client_max_retries = _parse_positive_int('HTTP_CLIENT_MAX_RETRIES', 2)
        self.outbound_http_max_redirects = _parse_positive_int('OUTBOUND_HTTP_MAX_REDIRECTS', 3)
        self.outbound_http_max_response_bytes = _parse_positive_int(
            'OUTBOUND_HTTP_MAX_RESPONSE_BYTES',
            10485760,
        )
        self.outbound_http_allowed_hosts = {
            host.strip().rstrip('.').lower()
            for host in os.getenv('OUTBOUND_HTTP_ALLOWED_HOSTS', '').split(',')
            if host.strip()
        }
        self.sigi_secrets_key = os.getenv('SIGI_SECRETS_KEY', 'sigi-dev-secret')
        self.internal_service_token = os.getenv(
            'SIGI_INTERNAL_SERVICE_TOKEN',
            self.sigi_secrets_key,
        )
        self.sigi_import_api_url = os.getenv('SIGI_IMPORT_API_URL', 'http://sigi-api:3000/api')
        self.sigi_import_admin_token = os.getenv(
            'SIGI_IMPORT_ADMIN_TOKEN',
            os.getenv('SIGI_INTEGRATION_TOKEN', 'integration-dev-token'),
        )
        self.odoo_mock_mode = _parse_bool('ODOO_MOCK_MODE', False)
        self.odoo_url = os.getenv('ODOO_URL')
        self.odoo_db = os.getenv('ODOO_DB')
        self.odoo_user = os.getenv('ODOO_USER')
        self.odoo_password = os.getenv('ODOO_PASS')
        self.odoo_default_country = os.getenv('ODOO_DEFAULT_COUNTRY', 'Costa Rica')
        self.odoo_batch_size = _parse_positive_int('ODOO_BATCH_SIZE', 500)
        if _is_production_like() and self.odoo_mock_mode:
            raise RuntimeError(
                'Refusing to start with ODOO_MOCK_MODE=true in production.',
            )
        _assert_not_placeholder_in_production('SIGI_SECRETS_KEY', self.sigi_secrets_key)
        _assert_not_placeholder_in_production(
            'SIGI_INTERNAL_SERVICE_TOKEN',
            self.internal_service_token,
        )
        _assert_not_placeholder_in_production(
            'SIGI_IMPORT_ADMIN_TOKEN',
            self.sigi_import_admin_token,
        )
        _assert_not_demo_host_in_production('ODOO_URL', self.odoo_url)


settings = Settings()
