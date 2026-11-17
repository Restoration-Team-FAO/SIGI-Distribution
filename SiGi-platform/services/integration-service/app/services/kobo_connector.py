from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse, urlunparse
from urllib.request import Request

from app.core.db import dumps_json, execute_returning
from app.core.outbound_http import read_bounded, safe_urlopen
from app.core.settings import settings


def run_kobo_sync(
    *,
    job_id: str,
    institution_id: str,
    connector_id: str,
    source_id: str | None,
    connector_config: dict[str, Any],
    source_config: dict[str, Any],
    mode: str,
    previous_checkpoint: dict[str, Any] | None,
) -> dict[str, Any]:
    token = _resolve_token(connector_config)
    if not token:
        raise RuntimeError(
            'El conector Kobo no tiene token configurado. Define credentialSecret o token en el conector.',
        )

    asset_uid = _resolve_asset_uid(source_config, connector_config)
    if not asset_uid:
        raise RuntimeError(
            'La fuente Kobo no tiene assetUid configurado. Registra el UID del formulario/proyecto Kobo en la fuente.',
        )

    base_url = _resolve_base_url(connector_config)
    if not base_url:
        raise RuntimeError(
            'El conector Kobo no tiene endpoint/baseUrl configurado.',
        )

    data_url = _build_data_url(base_url, asset_uid)
    previous_submission_time = _read_checkpoint_text(previous_checkpoint, 'last_submission_time')
    previous_submission_id = _read_checkpoint_int(previous_checkpoint, 'last_submission_id')

    records: list[dict[str, Any]] = []
    page_count = 0
    total_extracted = 0
    next_url: str | None = data_url
    used_auth_scheme = 'Token'

    while next_url:
        payload, used_auth_scheme = _fetch_json(next_url, token, used_auth_scheme)
        page_count += 1
        page_records, next_url = _extract_records_and_next(payload)
        total_extracted += len(page_records)
        records.extend(page_records)
        _store_raw_kobo_page(
            job_id=job_id,
            institution_id=institution_id,
            connector_id=connector_id,
            source_id=source_id,
            asset_uid=asset_uid,
            page_number=page_count,
            payload=payload,
        )

    if mode != 'full':
        records = [
            record
            for record in records
            if _is_new_submission(
                record,
                previous_submission_time=previous_submission_time,
                previous_submission_id=previous_submission_id,
            )
        ]

    latest_submission_time, latest_submission_id = _compute_latest_cursor(records)
    geojson_preview = _build_geojson_preview(records)

    return {
        'status': 'completed',
        'mockMode': False,
        'connectorType': 'kobo',
        'institutionId': institution_id,
        'sourceId': source_id,
        'mode': mode,
        'assetUid': asset_uid,
        'baseUrl': base_url,
        'authScheme': used_auth_scheme,
        'pagesFetched': page_count,
        'totalRowsExtracted': total_extracted,
        'totalRowsPromoted': 0,
        'totalRowsNew': len(records),
        'lastSubmissionTime': latest_submission_time,
        'lastSubmissionId': latest_submission_id,
        'recordsPreview': records[:5],
        'geojsonPreview': geojson_preview,
        'entities': [
            {
                'entityType': 'kobo_submission',
                'extractedRows': total_extracted,
                'batchId': None,
                'batchStatus': 'not_promoted',
                'validRows': len(records),
                'invalidRows': 0,
                'promotedRows': 0,
                'errors': 0,
                'assetUid': asset_uid,
            }
        ],
    }


def test_kobo_connection(
    *,
    connector_config: dict[str, Any],
    source_config: dict[str, Any],
    source_id: str | None = None,
) -> dict[str, Any]:
    token = _resolve_token(connector_config)
    if not token:
        raise RuntimeError(
            'El conector Kobo no tiene token configurado. Define credentialSecret o token en el conector.',
        )

    asset_uid = _resolve_asset_uid(source_config, connector_config)
    if not asset_uid:
        raise RuntimeError(
            'La fuente Kobo no tiene assetUid configurado. Registra el UID del formulario/proyecto Kobo en la fuente.',
        )

    base_url = _resolve_base_url(connector_config)
    if not base_url:
        raise RuntimeError('El conector Kobo no tiene endpoint/baseUrl configurado.')

    payload, used_auth_scheme = _fetch_json(
        _build_data_url(base_url, asset_uid),
        token,
        'Token',
    )
    records, next_url = _extract_records_and_next(payload)

    return {
        'ok': True,
        'mode': 'live',
        'message': f'Conexion exitosa a KoboToolbox. Se leyeron {len(records)} registros en la primera pagina.',
        'sourceId': source_id,
        'assetUid': asset_uid,
        'baseUrl': base_url,
        'authScheme': used_auth_scheme,
        'recordsOnFirstPage': len(records),
        'hasMore': next_url is not None,
    }


def preview_kobo_sync(
    *,
    connector_config: dict[str, Any],
    source_config: dict[str, Any],
    source_id: str | None = None,
) -> dict[str, Any]:
    token = _resolve_token(connector_config)
    if not token:
        raise RuntimeError(
            'El conector Kobo no tiene token configurado. Define credentialSecret o token en el conector.',
        )

    asset_uid = _resolve_asset_uid(source_config, connector_config)
    if not asset_uid:
        raise RuntimeError(
            'La fuente Kobo no tiene assetUid configurado. Registra el UID del formulario/proyecto Kobo en la fuente.',
        )

    base_url = _resolve_base_url(connector_config)
    if not base_url:
        raise RuntimeError('El conector Kobo no tiene endpoint/baseUrl configurado.')

    payload, used_auth_scheme = _fetch_json(
        _build_data_url(base_url, asset_uid),
        token,
        'Token',
    )
    records, next_url = _extract_records_and_next(payload)
    latest_submission_time, latest_submission_id = _compute_latest_cursor(records)

    return {
        'ok': True,
        'mode': 'live',
        'message': f'Previsualizacion generada con {len(records)} registros de la primera pagina.',
        'sourceId': source_id,
        'assetUid': asset_uid,
        'baseUrl': base_url,
        'authScheme': used_auth_scheme,
        'recordsOnFirstPage': len(records),
        'hasMore': next_url is not None,
        'lastSubmissionTime': latest_submission_time,
        'lastSubmissionId': latest_submission_id,
        'previewRows': records[:5],
        'geojsonPreview': _build_geojson_preview(records),
    }


def _resolve_token(config: dict[str, Any]) -> str | None:
    for key in ('credentialSecret', 'token', 'apiKey', 'password'):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _resolve_asset_uid(
    source_config: dict[str, Any],
    connector_config: dict[str, Any],
) -> str | None:
    for config in (source_config, connector_config):
        for key in ('assetUid', 'asset_uid', 'projectUid', 'formUid'):
            value = config.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _resolve_base_url(config: dict[str, Any]) -> str | None:
    for key in ('baseUrl', 'endpointUrl'):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            normalized = value.strip()
            if '://' not in normalized:
                normalized = f'https://{normalized}'
            return normalized.rstrip('/')
    return None


def _build_data_url(base_url: str, asset_uid: str) -> str:
    parsed = urlparse(base_url)
    base_path = parsed.path.rstrip('/')
    if base_path.endswith('/api/v2'):
        api_path = base_path
    elif base_path.endswith('/api/v2/'):
        api_path = base_path.rstrip('/')
    else:
        api_path = f'{base_path}/api/v2' if base_path else '/api/v2'
    return urlunparse(
        parsed._replace(path=f'{api_path}/assets/{quote(asset_uid)}/data/', params='', query='', fragment=''),
    )


def _fetch_json(url: str, token: str, preferred_auth_scheme: str) -> tuple[dict[str, Any] | list[Any], str]:
    auth_schemes = [preferred_auth_scheme]
    if preferred_auth_scheme == 'Token':
        auth_schemes.append('Bearer')
    elif preferred_auth_scheme == 'Bearer':
        auth_schemes.append('Token')

    last_error: Exception | None = None
    for auth_scheme in auth_schemes:
        try:
            payload = _fetch_json_once(url, token, auth_scheme)
            return payload, auth_scheme
        except HTTPError as exc:
            last_error = exc
            if exc.code not in (401, 403):
                raise
        except URLError as exc:
            last_error = exc
            raise RuntimeError(f'No se pudo conectar a KoboToolbox: {url}') from exc

    raise RuntimeError(f'KoboToolbox rechazó la autenticación para {url}') from last_error


def _fetch_json_once(url: str, token: str, auth_scheme: str) -> dict[str, Any] | list[Any]:
    headers = {
        'Accept': 'application/json',
        'Authorization': f'{auth_scheme} {token}',
        'User-Agent': 'SIGI-Kobo-Connector/1.0',
    }
    request = Request(url, headers=headers)
    with safe_urlopen(request) as response:
        charset = response.headers.get_content_charset() or 'utf-8'
        raw = read_bounded(response).decode(charset)
    return json.loads(raw)


def _extract_records_and_next(
    payload: dict[str, Any] | list[Any],
) -> tuple[list[dict[str, Any]], str | None]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)], None

    results = payload.get('results')
    next_url = payload.get('next')
    if isinstance(results, list):
        return [item for item in results if isinstance(item, dict)], next_url if isinstance(next_url, str) and next_url else None

    if isinstance(payload, dict):
        return [payload], None

    return [], None


def _store_raw_kobo_page(
    *,
    institution_id: str,
    connector_id: str,
    job_id: str,
    source_id: str | None,
    asset_uid: str,
    page_number: int,
    payload: dict[str, Any] | list[Any],
) -> None:
    source_record_key = f'kobo:{asset_uid}:page:{page_number}'
    execute_returning(
        """
        INSERT INTO integration.raw_payloads (
          institution_id,
          connector_id,
          sync_job_id,
          source_record_key,
          payload,
          payload_hash
        )
        VALUES (
          %s,
          %s,
          %s::uuid,
          %s,
          %s::jsonb,
          md5(%s)
        )
        RETURNING id
        """,
        (
            institution_id,
            connector_id,
            job_id,
            source_record_key,
            dumps_json(
                {
                    'sourceId': source_id,
                    'assetUid': asset_uid,
                    'page': page_number,
                    'payload': payload,
                }
            ),
            dumps_json(
                {
                    'sourceId': source_id,
                    'assetUid': asset_uid,
                    'page': page_number,
                    'payload': payload,
                }
            ),
        ),
    )


def _is_new_submission(
    record: dict[str, Any],
    *,
    previous_submission_time: str | None,
    previous_submission_id: int | None,
) -> bool:
    if previous_submission_time is None and previous_submission_id is None:
        return True

    record_time = _extract_submission_time(record)
    record_id = _extract_submission_id(record)

    if previous_submission_time and record_time:
        if record_time > previous_submission_time:
            return True
        if record_time < previous_submission_time:
            return False

    if previous_submission_id is not None and record_id is not None:
        return record_id > previous_submission_id

    if previous_submission_time and record_time:
        return record_time >= previous_submission_time

    return True


def _compute_latest_cursor(records: list[dict[str, Any]]) -> tuple[str | None, int | None]:
    latest_time: str | None = None
    latest_id: int | None = None

    for record in records:
        record_time = _extract_submission_time(record)
        record_id = _extract_submission_id(record)

        if record_time and (latest_time is None or record_time > latest_time):
            latest_time = record_time
        if record_id is not None and (latest_id is None or record_id > latest_id):
            latest_id = record_id

    return latest_time, latest_id


def _extract_submission_time(record: dict[str, Any]) -> str | None:
    for key in ('_submission_time', '_submitted_at', 'submission_time'):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            try:
                normalized = value.replace('Z', '+00:00')
                return (
                    datetime.fromisoformat(normalized)
                    .astimezone(timezone.utc)
                    .isoformat()
                )
            except ValueError:
                return value.strip()
    return None


def _extract_submission_id(record: dict[str, Any]) -> int | None:
    for key in ('_id', 'id'):
        value = record.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def _read_checkpoint_text(
    checkpoint: dict[str, Any] | None,
    key: str,
) -> str | None:
    if not checkpoint:
        return None
    value = checkpoint.get(key)
    if value is None:
        result = checkpoint.get('result')
        if isinstance(result, dict):
            value = result.get(key)
    return value.strip() if isinstance(value, str) and value.strip() else None


def _read_checkpoint_int(
    checkpoint: dict[str, Any] | None,
    key: str,
) -> int | None:
    if not checkpoint:
        return None
    value = checkpoint.get(key)
    if value is None:
        result = checkpoint.get('result')
        if isinstance(result, dict):
            value = result.get(key)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _build_geojson_preview(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    features: list[dict[str, Any]] = []

    for record in records[:100]:
        point = _extract_geopoint(record)
        if point is None:
            continue
        features.append(
            {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [point['lon'], point['lat']],
                },
                'properties': {
                    '_id': record.get('_id'),
                    '_submission_time': record.get('_submission_time'),
                },
            }
        )

    if not features:
        return None

    return {
        'type': 'FeatureCollection',
        'features': features,
    }


def _extract_geopoint(record: dict[str, Any]) -> dict[str, float] | None:
    for value in record.values():
        if isinstance(value, str):
            parts = value.strip().split()
            if len(parts) >= 2:
                try:
                    lat = float(parts[0])
                    lon = float(parts[1])
                except ValueError:
                    continue
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    return {'lat': lat, 'lon': lon}
        elif isinstance(value, dict):
            lat = value.get('latitude') or value.get('lat')
            lon = value.get('longitude') or value.get('lon') or value.get('lng')
            if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                if -90 <= float(lat) <= 90 and -180 <= float(lon) <= 180:
                    return {'lat': float(lat), 'lon': float(lon)}
    return None
