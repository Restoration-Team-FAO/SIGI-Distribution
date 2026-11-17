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


def _parse_bbox(name: str, default: str) -> tuple[float, float, float, float]:
    raw_value = os.getenv(name, default)
    parts = [part.strip() for part in raw_value.split(',')]
    if len(parts) != 4:
        raise RuntimeError(
            f'Invalid bbox for {name}. Expected "minLon,minLat,maxLon,maxLat", got {raw_value}',
        )
    try:
        min_lon, min_lat, max_lon, max_lat = [float(part) for part in parts]
    except ValueError as exc:
        raise RuntimeError(f'Invalid bbox numeric values for {name}: {raw_value}') from exc
    if min_lon >= max_lon or min_lat >= max_lat:
        raise RuntimeError(f'Invalid bbox ordering for {name}: {raw_value}')
    return min_lon, min_lat, max_lon, max_lat


def _is_production_like() -> bool:
    node_env = os.getenv('NODE_ENV', '').strip().lower()
    app_env = os.getenv('APP_ENV', '').strip().lower()
    return node_env == 'production' or app_env == 'production'


def _assert_not_placeholder_in_production(name: str, value: str | None) -> None:
    if not _is_production_like() or value is None:
        return
    placeholders = {
        'sigi-dev-secret',
        'sigi-dev-internal-token',
    }
    if value.strip() in placeholders:
        raise RuntimeError(
            f'Refusing to start with placeholder secret in production: {name}',
        )


class Settings:
    def __init__(self) -> None:
        self.service_name = 'gis-service'
        self.database_url = _require_env('DATABASE_URL')
        self.log_level = os.getenv('LOG_LEVEL', 'info')
        self.http_client_timeout_ms = _parse_positive_int('HTTP_CLIENT_TIMEOUT_MS', 5000)
        self.http_client_max_retries = _parse_positive_int('HTTP_CLIENT_MAX_RETRIES', 2)
        self.internal_service_token = os.getenv(
            'SIGI_INTERNAL_SERVICE_TOKEN',
            os.getenv('SIGI_SECRETS_KEY', 'sigi-dev-secret'),
        )
        self.shapefile_default_country = os.getenv('SHAPEFILE_DEFAULT_COUNTRY', 'El Salvador')
        self.shapefile_national_bbox = _parse_bbox(
            'SHAPEFILE_NATIONAL_BBOX',
            '-90.4,13.0,-87.5,14.9',
        )
        self.shapefile_preview_limit = _parse_positive_int('SHAPEFILE_PREVIEW_LIMIT', 5)
        self.shapefile_archive_max_bytes = _parse_positive_int(
            'SHAPEFILE_ARCHIVE_MAX_BYTES',
            26214400,
        )
        self.shapefile_zip_max_entries = _parse_positive_int('SHAPEFILE_ZIP_MAX_ENTRIES', 100)
        self.shapefile_zip_max_uncompressed_bytes = _parse_positive_int(
            'SHAPEFILE_ZIP_MAX_UNCOMPRESSED_BYTES',
            104857600,
        )
        self.shapefile_zip_max_compression_ratio = _parse_positive_int(
            'SHAPEFILE_ZIP_MAX_COMPRESSION_RATIO',
            100,
        )
        _assert_not_placeholder_in_production(
            'SIGI_INTERNAL_SERVICE_TOKEN',
            self.internal_service_token,
        )


settings = Settings()
