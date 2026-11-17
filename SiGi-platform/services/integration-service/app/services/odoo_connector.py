from __future__ import annotations

import csv
import io
import json
import time
import xmlrpc.client
from datetime import date, datetime
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request
from uuid import uuid4

from app.core.settings import settings
from app.core.outbound_http import read_bounded, safe_urlopen, validate_outbound_url

ImportEntityType = Literal[
    'institutions',
    'projects',
    'project_indicators',
    'project_territories',
]

OdooSelectionOptions = dict[str, Any]


ENTITY_ORDER: tuple[ImportEntityType, ...] = (
    'institutions',
    'projects',
    'project_indicators',
    'project_territories',
)

CSV_HEADERS_BY_ENTITY: dict[ImportEntityType, list[str]] = {
    'institutions': [
        'institution_code',
        'institution_name',
        'country',
    ],
    'projects': [
        'project_code',
        'project_name',
        'lead_institution_code',
        'start_date',
        'end_date',
        'total_area_ha',
        'status',
        'project_aliases_json',
    ],
    'project_indicators': [
        'project_code',
        'indicator_code',
        'indicator_name',
        'unit',
        'value_numeric',
        'value_text',
        'category',
        'observed_at',
    ],
    'project_territories': [
        'project_code',
        'territory_code',
        'territory_name',
        'territory_level',
        'country',
        'area_ha',
    ],
}


class OdooSyncError(RuntimeError):
    pass


class OdooClient:
    def __init__(self, *, url: str, database: str, user: str, password: str):
        normalized_url = url.rstrip('/')
        validate_outbound_url(normalized_url)
        self._url = normalized_url
        self._db = database
        self._user = user
        self._password = password
        self._common = xmlrpc.client.ServerProxy(f'{normalized_url}/xmlrpc/2/common')
        self._uid = self._common.authenticate(self._db, self._user, self._password, {})
        if not self._uid:
            raise OdooSyncError('No fue posible autenticar contra Odoo.')
        self._models = xmlrpc.client.ServerProxy(f'{normalized_url}/xmlrpc/2/object')

    def fields_get(self, model: str) -> dict[str, dict[str, Any]]:
        return self._models.execute_kw(
            self._db,
            self._uid,
            self._password,
            model,
            'fields_get',
            [],
            {'attributes': ['type', 'string', 'relation']},
        )

    def search_read(
        self,
        *,
        model: str,
        domain: list[Any],
        fields: list[str],
        limit: int,
        offset: int,
    ) -> list[dict[str, Any]]:
        return self._models.execute_kw(
            self._db,
            self._uid,
            self._password,
            model,
            'search_read',
            [domain],
            {'fields': fields, 'limit': limit, 'offset': offset},
        )

    def create(self, *, model: str, values: dict[str, Any]) -> int:
        return self._models.execute_kw(
            self._db,
            self._uid,
            self._password,
            model,
            'create',
            [values],
        )


def upsert_odoo_projects(
    *,
    source_id: str,
    connector_config: dict[str, Any] | None,
    credentials: dict[str, Any] | None,
    projects: list[dict[str, Any]],
    dry_run: bool = False,
) -> dict[str, Any]:
    if not isinstance(projects, list):
        raise OdooSyncError('projects debe ser una lista.')

    if settings.odoo_mock_mode:
        return {
            'ok': True,
            'mode': 'mock',
            'sourceId': source_id,
            'model': _resolve_model_by_entity(connector_config or {})['projects'],
            'totals': {
                'received': len(projects),
                'created': len(projects),
                'existing': 0,
                'failed': 0,
            },
            'createdProjectCodes': [
                _clean_value(item.get('projectCode') or item.get('project_code')) or ''
                for item in projects
            ],
            'existingProjectCodes': [],
            'failedRows': [],
        }

    resolved_credentials = _resolve_odoo_credentials(credentials)
    if not resolved_credentials:
        raise OdooSyncError('Faltan credenciales Odoo para upsert de proyectos.')

    model = _resolve_model_by_entity(connector_config or {})['projects']
    client = OdooClient(
        url=resolved_credentials['base_url'],
        database=resolved_credentials['database_name'],
        user=resolved_credentials['username'],
        password=resolved_credentials['password'],
    )

    field_meta = client.fields_get(model)
    code_field = _find_existing_field(
        field_meta,
        [
            'project_code',
            'cod_finca',
            'code',
            'codigo',
            'id_finca',
            'name',
            'display_name',
            'x_project_code',
        ],
    )
    if not code_field:
        raise OdooSyncError(
            f'No se encontró campo de código de proyecto en modelo Odoo {model}.',
        )

    name_field = _find_existing_field(
        field_meta,
        ['project_name', 'id_finca', 'name', 'display_name', 'nombre'],
    )
    start_field = _find_existing_field(
        field_meta,
        ['start_date', 'fecha_inicio', 'x_start_date'],
    )
    end_field = _find_existing_field(
        field_meta,
        ['end_date', 'fecha_fin', 'x_end_date'],
    )
    area_field = _find_existing_field(
        field_meta,
        ['total_area_ha', 'area_ha', 'area', 'restored_area_ha'],
    )
    status_field = _find_existing_field(
        field_meta,
        ['status', 'state', 'project_status'],
    )

    created_codes: list[str] = []
    existing_codes: list[str] = []
    failed_rows: list[dict[str, Any]] = []

    for raw_project in projects:
        project_code = _clean_value(
            raw_project.get('projectCode') or raw_project.get('project_code'),
        )
        if not project_code:
            failed_rows.append(
                {'projectCode': None, 'error': 'project_code requerido para upsert Odoo.'},
            )
            continue

        existing = client.search_read(
            model=model,
            domain=[[code_field, '=', project_code]],
            fields=[code_field],
            limit=1,
            offset=0,
        )
        if existing:
            existing_codes.append(project_code)
            continue

        payload: dict[str, Any] = {code_field: project_code}
        if name_field:
            payload[name_field] = (
                _clean_value(raw_project.get('projectName') or raw_project.get('project_name'))
                or f'Proyecto {project_code}'
            )
        if start_field:
            start_value = _clean_value(raw_project.get('startDate') or raw_project.get('start_date'))
            if start_value:
                payload[start_field] = start_value
        if end_field:
            end_value = _clean_value(raw_project.get('endDate') or raw_project.get('end_date'))
            if end_value:
                payload[end_field] = end_value
        if area_field:
            area_value = _pick_number(
                raw_project,
                ['totalAreaHa', 'total_area_ha', 'area_ha'],
            )
            if area_value is not None:
                payload[area_field] = area_value
        if status_field:
            status_value = _clean_value(raw_project.get('status')) or 'draft'
            payload[status_field] = status_value

        if dry_run:
            created_codes.append(project_code)
            continue

        try:
            client.create(model=model, values=payload)
            created_codes.append(project_code)
        except Exception as error:
            failed_rows.append(
                {
                    'projectCode': project_code,
                    'error': str(error),
                },
            )

    return {
        'ok': len(failed_rows) == 0,
        'mode': 'live',
        'sourceId': source_id,
        'model': model,
        'totals': {
            'received': len(projects),
            'created': len(created_codes),
            'existing': len(existing_codes),
            'failed': len(failed_rows),
        },
        'createdProjectCodes': created_codes,
        'existingProjectCodes': existing_codes,
        'failedRows': failed_rows,
    }


def test_odoo_connection(
    *,
    credentials: dict[str, Any] | None,
    source_id: str | None = None,
) -> dict[str, Any]:
    resolved_credentials = _resolve_odoo_credentials(credentials)
    use_mock_mode = _should_use_mock_mode(resolved_credentials)

    if use_mock_mode:
        return {
            'ok': True,
            'mode': 'mock',
            'message': 'ODOO_MOCK_MODE activo. Conexión simulada para demo.',
            'sourceId': source_id,
        }

    started_at = time.perf_counter()
    OdooClient(
        url=resolved_credentials['base_url'],
        database=resolved_credentials['database_name'],
        user=resolved_credentials['username'],
        password=resolved_credentials['password'],
    )
    latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
    return {
        'ok': True,
        'mode': 'live',
        'message': 'Conexión Odoo validada correctamente.',
        'latencyMs': latency_ms,
        'sourceId': source_id,
    }


def run_odoo_sync(
    *,
    institution_id: str,
    connector_id: str,
    source_id: str | None,
    connector_config: dict[str, Any] | None,
    odoo_credentials: dict[str, Any] | None,
    mapping_profile_id: str | None,
    mode: str,
    selection_options: OdooSelectionOptions | None = None,
) -> dict[str, Any]:
    resolved_credentials = _resolve_odoo_credentials(odoo_credentials)
    use_mock_mode = _should_use_mock_mode(resolved_credentials)
    normalized_selection = _normalize_selection_options(selection_options)
    selection_applied = _is_selection_applied(normalized_selection)
    records_by_entity = (
        _build_mock_records()
        if use_mock_mode
        else _extract_records_from_odoo(
            connector_config or {},
            credentials=resolved_credentials,
            mode=mode,
        )
    )

    all_institution_rows = _map_institutions(
        records_by_entity['institutions'],
        default_country=settings.odoo_default_country,
    )
    selected_institution_rows = _select_institution_rows(
        all_institution_rows,
        normalized_selection,
    )
    all_institution_alias_map = _build_alias_map(
        all_institution_rows,
        code_key='institution_code',
        name_key='institution_name',
    )
    selected_institution_codes = {
        _normalize_key(str(row.get('institution_code') or ''))
        for row in selected_institution_rows
        if row.get('institution_code')
    }

    all_project_rows = _map_projects(
        records_by_entity['projects'],
        institution_alias_map=all_institution_alias_map,
    )
    project_rows = _select_projects_by_institutions(
        all_project_rows,
        selected_institution_codes=selected_institution_codes,
        apply_filter=selection_applied,
    )
    project_alias_map = _build_project_alias_map(project_rows)

    all_indicator_rows = _map_project_indicators(
        records_by_entity['project_indicators'],
        project_alias_map=project_alias_map,
    )
    all_territory_rows = _map_project_territories(
        records_by_entity['project_territories'],
        project_alias_map=project_alias_map,
        default_country=settings.odoo_default_country,
    )
    if not selection_applied:
        project_rows = _augment_projects_from_related_rows(
            project_rows=project_rows,
            indicator_rows=all_indicator_rows,
            territory_rows=all_territory_rows,
            default_lead_institution_code=_default_lead_institution_code(
                selected_institution_rows,
            ),
        )
        project_alias_map = _build_project_alias_map(project_rows)
        all_indicator_rows = _map_project_indicators(
            records_by_entity['project_indicators'],
            project_alias_map=project_alias_map,
        )
        all_territory_rows = _map_project_territories(
            records_by_entity['project_territories'],
            project_alias_map=project_alias_map,
            default_country=settings.odoo_default_country,
        )

    selected_project_codes = {
        _normalize_key(str(row.get('project_code') or ''))
        for row in project_rows
        if row.get('project_code')
    }
    indicator_rows = _filter_rows_by_project_codes(
        all_indicator_rows,
        selected_project_codes=selected_project_codes,
        apply_filter=selection_applied,
    )
    territory_rows = _filter_rows_by_project_codes(
        all_territory_rows,
        selected_project_codes=selected_project_codes,
        apply_filter=selection_applied,
    )

    canonical_rows: dict[ImportEntityType, list[dict[str, Any]]] = {
        'institutions': selected_institution_rows,
        'projects': project_rows,
        'project_indicators': indicator_rows,
        'project_territories': territory_rows,
    }

    entity_results: list[dict[str, Any]] = []
    total_rows_extracted = 0
    total_rows_promoted = 0
    completed_entities = 0
    failed_entities = 0

    for entity_type in ENTITY_ORDER:
        rows = canonical_rows[entity_type]
        total_rows_extracted += len(rows)
        if len(rows) == 0:
            completed_entities += 1
            entity_results.append(
                {
                    'entityType': entity_type,
                    'extractedRows': 0,
                    'batchId': None,
                    'batchStatus': 'skipped_empty',
                    'validRows': 0,
                    'invalidRows': 0,
                    'promotedRows': 0,
                    'errors': 0,
                }
            )
            continue
        file_name = f'odoo_{entity_type}_{_timestamp_for_file_name()}.csv'
        csv_payload = _encode_rows_as_csv(entity_type, rows)
        upload_response = _upload_import_batch(
            entity_type=entity_type,
            file_name=file_name,
            payload=csv_payload,
            source_id=source_id,
            mapping_profile_id=mapping_profile_id,
        )
        batch = upload_response.get('data', {}).get('batch', {})
        errors_count = upload_response.get('data', {}).get('errors', 0)
        batch_status = str(batch.get('status') or 'unknown')
        promoted_rows = _safe_int(batch.get('promotedRows'))
        total_rows_promoted += promoted_rows
        is_success = batch_status in ('completed', 'completed_with_errors')
        if is_success:
            completed_entities += 1
        else:
            failed_entities += 1

        entity_results.append(
            {
                'entityType': entity_type,
                'extractedRows': len(rows),
                'batchId': batch.get('id'),
                'batchStatus': batch_status,
                'validRows': _safe_int(batch.get('validRows')),
                'invalidRows': _safe_int(batch.get('invalidRows')),
                'promotedRows': promoted_rows,
                'errors': _safe_int(errors_count),
            }
        )

    status = 'completed' if failed_entities == 0 else 'partial_failed'
    return {
        'status': status,
        'mockMode': use_mock_mode,
        'institutionId': institution_id,
        'connectorId': connector_id,
        'sourceId': source_id,
        'completedEntities': completed_entities,
        'failedEntities': failed_entities,
        'totalRowsExtracted': total_rows_extracted,
        'totalRowsPromoted': total_rows_promoted,
        'institutionsFound': len(all_institution_rows),
        'institutionsSelected': len(selected_institution_rows),
        'selectionApplied': selection_applied,
        'entities': entity_results,
    }


def preview_odoo_sync(
    *,
    source_id: str | None,
    connector_config: dict[str, Any] | None,
    credentials: dict[str, Any] | None,
    selection_options: OdooSelectionOptions | None = None,
) -> dict[str, Any]:
    resolved_credentials = _resolve_odoo_credentials(credentials)
    use_mock_mode = _should_use_mock_mode(resolved_credentials)
    normalized_selection = _normalize_selection_options(selection_options)

    records_by_entity = (
        {
            'institutions': _build_mock_records()['institutions'],
            'projects': _build_mock_records()['projects'],
        }
        if use_mock_mode
        else _extract_records_from_odoo(
            connector_config or {},
            credentials=resolved_credentials,
            mode='incremental',
            entities=('institutions', 'projects'),
        )
    )

    all_institutions = _map_institutions(
        records_by_entity['institutions'],
        default_country=settings.odoo_default_country,
    )
    selected_institutions = _select_institution_rows(
        all_institutions,
        normalized_selection,
    )
    selected_codes = [
        str(row.get('institution_code'))
        for row in selected_institutions
        if row.get('institution_code')
    ]
    alias_map = _build_alias_map(
        all_institutions,
        code_key='institution_code',
        name_key='institution_name',
    )
    all_projects = _map_projects(
        records_by_entity['projects'],
        institution_alias_map=alias_map,
    )
    selected_code_set = {_normalize_key(code) for code in selected_codes}
    selected_projects = _select_projects_by_institutions(
        all_projects,
        selected_institution_codes=selected_code_set,
        apply_filter=_is_selection_applied(normalized_selection),
    )

    return {
        'ok': True,
        'mode': 'mock' if use_mock_mode else 'live',
        'sourceId': source_id,
        'institutionsFound': len(all_institutions),
        'institutionsSelected': len(selected_institutions),
        'institutionCodesSelected': selected_codes,
        'projectsEstimated': len(selected_projects),
        'selectionApplied': _is_selection_applied(normalized_selection),
        'message': (
            'Previsualización calculada correctamente.'
            if selected_institutions
            else 'No se encontraron instituciones con los filtros seleccionados.'
        ),
    }


def _should_use_mock_mode(credentials: dict[str, str] | None) -> bool:
    if settings.odoo_mock_mode:
        return True

    required = []
    if credentials:
        required = [
            credentials.get('base_url'),
            credentials.get('database_name'),
            credentials.get('username'),
            credentials.get('password'),
        ]
    else:
        required = [
            settings.odoo_url,
            settings.odoo_db,
            settings.odoo_user,
            settings.odoo_password,
        ]
    return any(not value for value in required)


def _extract_records_from_odoo(
    connector_config: dict[str, Any],
    credentials: dict[str, str] | None,
    *,
    mode: str,
    entities: tuple[ImportEntityType, ...] = ENTITY_ORDER,
) -> dict[ImportEntityType, list[dict[str, Any]]]:
    resolved_credentials = _resolve_odoo_credentials(credentials)
    if not resolved_credentials:
        raise OdooSyncError(
            'Faltan credenciales Odoo para ejecutar el sync.',
        )

    client = OdooClient(
        url=resolved_credentials['base_url'],
        database=resolved_credentials['database_name'],
        user=resolved_credentials['username'],
        password=resolved_credentials['password'],
    )

    model_by_entity = _resolve_model_by_entity(connector_config)
    domain = [] if mode == 'full' else []

    result: dict[ImportEntityType, list[dict[str, Any]]] = {
        'institutions': [],
        'projects': [],
        'project_indicators': [],
        'project_territories': [],
    }
    for entity_type in entities:
        model = model_by_entity[entity_type]
        result[entity_type] = _export_model(
            client=client,
            model=model,
            domain=domain,
            batch_size=settings.odoo_batch_size,
        )
    return result


def _normalize_selection_options(
    selection_options: OdooSelectionOptions | None,
) -> dict[str, Any]:
    if not selection_options:
        return {}

    normalized: dict[str, Any] = {}
    institution_codes_raw = selection_options.get('institutionCodes')
    if isinstance(institution_codes_raw, list):
        institution_codes = [
            str(value).strip()
            for value in institution_codes_raw
            if str(value).strip()
        ]
        if institution_codes:
            normalized['institutionCodes'] = institution_codes

    institution_limit_raw = selection_options.get('institutionLimit')
    if institution_limit_raw is not None:
        try:
            institution_limit = int(institution_limit_raw)
        except (TypeError, ValueError) as error:
            raise OdooSyncError('institutionLimit debe ser numérico.') from error
        if institution_limit <= 0:
            raise OdooSyncError('institutionLimit debe ser mayor que 0.')
        normalized['institutionLimit'] = institution_limit

    return normalized


def _select_institution_rows(
    rows: list[dict[str, Any]],
    selection_options: dict[str, Any],
) -> list[dict[str, Any]]:
    if not rows:
        return []

    selected = list(rows)
    selected_codes = selection_options.get('institutionCodes')
    if isinstance(selected_codes, list) and selected_codes:
        allowed_codes = {_normalize_key(code) for code in selected_codes}
        selected = [
            row
            for row in selected
            if _normalize_key(str(row.get('institution_code') or '')) in allowed_codes
        ]

    institution_limit = selection_options.get('institutionLimit')
    if isinstance(institution_limit, int):
        selected = selected[:institution_limit]

    return selected


def _select_projects_by_institutions(
    rows: list[dict[str, Any]],
    *,
    selected_institution_codes: set[str],
    apply_filter: bool,
) -> list[dict[str, Any]]:
    if not rows:
        return []
    if not apply_filter:
        return list(rows)
    if not selected_institution_codes:
        return []

    selected: list[dict[str, Any]] = []
    for row in rows:
        lead_code = _normalize_key(str(row.get('lead_institution_code') or ''))
        if lead_code in selected_institution_codes:
            selected.append(row)
    return selected


def _filter_rows_by_project_codes(
    rows: list[dict[str, Any]],
    *,
    selected_project_codes: set[str],
    apply_filter: bool,
) -> list[dict[str, Any]]:
    if not rows:
        return []
    if not apply_filter:
        return list(rows)
    if not selected_project_codes:
        return []

    selected: list[dict[str, Any]] = []
    for row in rows:
        project_code = _normalize_key(str(row.get('project_code') or ''))
        if project_code in selected_project_codes:
            selected.append(row)
    return selected


def _is_selection_applied(selection_options: dict[str, Any]) -> bool:
    return bool(
        selection_options.get('institutionLimit')
        or selection_options.get('institutionCodes')
    )


def _find_existing_field(
    field_meta: dict[str, dict[str, Any]],
    candidates: list[str],
) -> str | None:
    for candidate in candidates:
        if candidate in field_meta:
            return candidate
    return None


def _resolve_model_by_entity(
    connector_config: dict[str, Any],
) -> dict[ImportEntityType, str]:
    defaults: dict[ImportEntityType, str] = {
        'institutions': 'fiaes.productores',
        'projects': 'fiaes.proyecto_parcela',
        'project_indicators': 'fiaes.proyecto_parcela_um',
        'project_territories': 'fiaes.proyecto_parcela',
    }

    models_config = connector_config.get('models')
    if isinstance(models_config, dict):
        for entity_type in ENTITY_ORDER:
            candidate = models_config.get(entity_type)
            if isinstance(candidate, str) and candidate.strip():
                defaults[entity_type] = candidate.strip()

    legacy_pairs = {
        'institutions': connector_config.get('model_institutions'),
        'projects': connector_config.get('model_projects'),
        'project_indicators': connector_config.get('model_project_indicators'),
        'project_territories': connector_config.get('model_project_territories'),
    }
    for entity_type, candidate in legacy_pairs.items():
        if isinstance(candidate, str) and candidate.strip():
            defaults[entity_type] = candidate.strip()

    return defaults


def _export_model(
    *,
    client: OdooClient,
    model: str,
    domain: list[Any],
    batch_size: int,
) -> list[dict[str, Any]]:
    metadata = client.fields_get(model)
    fields = list(metadata.keys())

    records: list[dict[str, Any]] = []
    offset = 0

    while True:
        page = client.search_read(
            model=model,
            domain=domain,
            fields=fields,
            limit=batch_size,
            offset=offset,
        )
        if not page:
            break
        normalized = _normalize_many2one(page, metadata)
        records.extend(normalized)
        offset += len(page)
        if len(page) < batch_size:
            break

    return records


def _normalize_many2one(
    records: list[dict[str, Any]],
    field_meta: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    normalized_rows: list[dict[str, Any]] = []
    for record in records:
        normalized_record: dict[str, Any] = {}
        for key, value in record.items():
            field_type = field_meta.get(key, {}).get('type')
            if (
                field_type == 'many2one'
                and isinstance(value, (list, tuple))
                and len(value) == 2
            ):
                normalized_record[f'{key}_id'] = value[0]
                normalized_record[f'{key}_name'] = value[1]
            else:
                normalized_record[key] = value
        normalized_rows.append(normalized_record)
    return normalized_rows


def _map_institutions(
    records: list[dict[str, Any]],
    *,
    default_country: str,
) -> list[dict[str, Any]]:
    mapped: list[dict[str, Any]] = []
    used_codes: set[str] = set()

    for index, record in enumerate(records, start=1):
        code = _pick_text(
            record,
            ['institution_code', 'id_productor', 'code', 'codigo', 'id'],
        )
        name = _pick_text(
            record,
            ['institution_name', 'name', 'opciones', 'display_name', 'nombre'],
        )
        country = _pick_text(record, ['country', 'pais', 'provincia']) or default_country

        if not code and name:
            code = f"inst-{_slugify(name)}"
        if not code:
            code = f'inst-{index}'
        if not name:
            name = f'Institución {code}'

        normalized_code = _normalize_key(code)
        if normalized_code in used_codes:
            code = f'{code}-{index}'
            normalized_code = _normalize_key(code)
        used_codes.add(normalized_code)

        mapped.append(
            {
                'institution_code': code,
                'institution_name': name,
                'country': country,
            }
        )
    return mapped


def _map_projects(
    records: list[dict[str, Any]],
    *,
    institution_alias_map: dict[str, str],
) -> list[dict[str, Any]]:
    mapped: list[dict[str, Any]] = []
    used_codes: set[str] = set()

    for index, record in enumerate(records, start=1):
        project_code = _pick_text(
            record,
            [
                'project_code',
                'proyecto_code',
                'cod_finca',
                'code',
                'codigo',
                'id_finca',
                'name',
                'display_name',
                'id',
            ],
        )
        project_name = _pick_text(
            record,
            ['project_name', 'name', 'id_finca', 'display_name', 'nombre'],
        )
        lead_code_candidate = _pick_text(
            record,
            [
                'lead_institution_code',
                'id_productor',
                'productor_id',
                'productor_id_name',
                'producer_id',
                'producer_id_name',
            ],
        )
        lead_institution_code = _resolve_alias(lead_code_candidate, institution_alias_map)
        if not lead_institution_code:
            lead_institution_code = lead_code_candidate or 'mag'

        start_date = _pick_date(record, ['start_date', 'fecha_inicio', 'ano', 'year'])
        end_date = _pick_date(record, ['end_date', 'fecha_fin', 'ano_fin', 'year'])
        if not start_date:
            start_date = '2025-01-01'
        if not end_date:
            end_date = '2025-12-31'

        total_area_ha = _pick_number(
            record,
            ['total_area_ha', 'area_ha', 'area', 'restored_area_ha'],
        )
        status = _pick_text(record, ['status', 'state', 'project_status']) or 'draft'

        if not project_code and project_name:
            project_code = f"prj-{_slugify(project_name)}"
        if not project_code:
            project_code = f'prj-{index}'
        if not project_name:
            project_name = f'Proyecto {project_code}'

        normalized_code = _normalize_key(project_code)
        if normalized_code in used_codes:
            project_code = f'{project_code}-{index}'
            normalized_code = _normalize_key(project_code)
        used_codes.add(normalized_code)

        mapped.append(
            {
                'project_code': project_code,
                'project_name': project_name,
                'lead_institution_code': lead_institution_code,
                'start_date': start_date,
                'end_date': end_date,
                'total_area_ha': total_area_ha if total_area_ha is not None else 0,
                'status': status,
                '_source_aliases': _collect_project_aliases(record),
                'project_aliases_json': json.dumps(
                    _collect_project_aliases(record),
                    ensure_ascii=False,
                ),
            }
        )
    return mapped


def _map_project_indicators(
    records: list[dict[str, Any]],
    *,
    project_alias_map: dict[str, str],
) -> list[dict[str, Any]]:
    mapped: list[dict[str, Any]] = []

    for index, record in enumerate(records, start=1):
        project_code_candidate = _pick_text(
            record,
            [
                'project_code',
                'proyecto_code',
                'cod_finca',
                'proyecto_parcela_id',
                'proyecto_parcela_id_id',
                'proyecto_parcela_id_name',
                'project_id',
                'project_id_id',
                'project_id_name',
            ],
        )
        project_code = _resolve_alias(project_code_candidate, project_alias_map)
        if not project_code:
            project_code = project_code_candidate or f'prj-{index}'

        indicator_code = _pick_text(
            record,
            ['indicator_code', 'code', 'id', 'name'],
        )
        if not indicator_code:
            indicator_code = f'odoo-ind-{index}'

        indicator_name = _pick_text(record, ['indicator_name', 'name', 'opciones']) or indicator_code
        unit = _pick_text(record, ['unit', 'unidad', 'uom', 'activa']) or 'unit'
        value_numeric = _pick_number(
            record,
            ['value_numeric', 'value', 'area', 'restored_area_ha'],
        )
        value_text = _pick_text(record, ['value_text', 'valor_texto', 'notes'])
        category = _pick_text(record, ['category', 'categoria']) or 'governance'
        observed_at = _pick_date(record, ['observed_at', 'fecha', 'date', 'ano'])

        mapped.append(
            {
                'project_code': project_code,
                'indicator_code': indicator_code,
                'indicator_name': indicator_name,
                'unit': unit,
                'value_numeric': value_numeric,
                'value_text': value_text,
                'category': category,
                'observed_at': observed_at,
            }
        )
    return mapped


def _map_project_territories(
    records: list[dict[str, Any]],
    *,
    project_alias_map: dict[str, str],
    default_country: str,
) -> list[dict[str, Any]]:
    mapped: list[dict[str, Any]] = []

    for index, record in enumerate(records, start=1):
        project_code_candidate = _pick_text(
            record,
            [
                'project_code',
                'proyecto_code',
                'cod_finca',
                'id',
                'proyecto_parcela_id',
                'proyecto_parcela_id_id',
                'proyecto_parcela_id_name',
                'project_id',
                'project_id_id',
                'project_id_name',
            ],
        )
        project_code = _resolve_alias(project_code_candidate, project_alias_map)
        if not project_code:
            project_code = project_code_candidate or f'prj-{index}'

        territory_code = _pick_text(
            record,
            ['territory_code', 'distrito', 'district_code', 'canton_code'],
        )
        territory_name = _pick_text(
            record,
            ['territory_name', 'canton', 'distrito', 'provincia', 'region'],
        )
        territory_level = _pick_text(
            record,
            ['territory_level', 'level', 'provincia'],
        ) or 'region'
        country = _pick_text(record, ['country', 'pais', 'provincia']) or default_country
        area_ha = _pick_number(record, ['area_ha', 'area', 'total_area_ha']) or 0

        if not territory_code and territory_name:
            territory_code = f"ter-{_slugify(territory_name)}"
        if not territory_code:
            territory_code = f'ter-{index}'
        if not territory_name:
            territory_name = f'Territorio {territory_code}'

        mapped.append(
            {
                'project_code': project_code,
                'territory_code': territory_code,
                'territory_name': territory_name,
                'territory_level': territory_level,
                'country': country,
                'area_ha': area_ha,
            }
        )
    return mapped


def _build_alias_map(
    rows: list[dict[str, Any]],
    *,
    code_key: str,
    name_key: str,
) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for row in rows:
        code = _pick_text(row, [code_key])
        name = _pick_text(row, [name_key])
        if not code:
            continue
        aliases[_normalize_key(code)] = code
        if name:
            aliases[_normalize_key(name)] = code
    return aliases


def _default_lead_institution_code(rows: list[dict[str, Any]]) -> str:
    for row in rows:
        code = _pick_text(row, ['institution_code'])
        if code:
            return code
    return 'mag'


def _augment_projects_from_related_rows(
    *,
    project_rows: list[dict[str, Any]],
    indicator_rows: list[dict[str, Any]],
    territory_rows: list[dict[str, Any]],
    default_lead_institution_code: str,
) -> list[dict[str, Any]]:
    existing_codes = {
        _normalize_key(str(row.get('project_code') or ''))
        for row in project_rows
        if row.get('project_code')
    }
    augmented = list(project_rows)

    for row in indicator_rows + territory_rows:
        project_code = _pick_text(row, ['project_code'])
        if not project_code:
            continue
        normalized_project_code = _normalize_key(project_code)
        if not normalized_project_code or normalized_project_code in existing_codes:
            continue

        existing_codes.add(normalized_project_code)
        inferred_name = _infer_project_name_from_related_row(row, project_code)
        inferred_area = _pick_number(row, ['area_ha', 'value_numeric']) or 0
        augmented.append(
            {
                'project_code': project_code,
                'project_name': inferred_name,
                'lead_institution_code': default_lead_institution_code,
                'start_date': '2025-01-01',
                'end_date': '2025-12-31',
                'total_area_ha': inferred_area,
                'status': 'active',
                '_source_aliases': [project_code],
            }
        )
    return augmented


def _infer_project_name_from_related_row(row: dict[str, Any], project_code: str) -> str:
    candidate = _pick_text(row, ['indicator_name', 'project_name', 'territory_name', 'value_text'])
    if candidate and ' - ' in candidate:
        return candidate.split(' - ')[0].strip() or f'Proyecto {project_code}'
    return candidate or f'Proyecto {project_code}'


def _build_project_alias_map(rows: list[dict[str, Any]]) -> dict[str, str]:
    aliases = _build_alias_map(
        rows,
        code_key='project_code',
        name_key='project_name',
    )
    for row in rows:
        project_code = _pick_text(row, ['project_code'])
        if not project_code:
            continue
        source_aliases = row.get('_source_aliases')
        if not isinstance(source_aliases, list):
            continue
        for alias in source_aliases:
            if not isinstance(alias, str):
                continue
            normalized_alias = _normalize_key(alias)
            if normalized_alias:
                aliases[normalized_alias] = project_code
    return aliases


def _collect_project_aliases(record: dict[str, Any]) -> list[str]:
    aliases: list[str] = []
    candidates = [
        'project_code',
        'proyecto_code',
        'cod_finca',
        'code',
        'codigo',
        'id',
        'id_finca',
        'name',
        'display_name',
    ]
    seen: set[str] = set()
    for candidate in candidates:
        alias = _pick_text(record, [candidate])
        if not alias:
            continue
        normalized = _normalize_key(alias)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        aliases.append(alias)
    return aliases


def _resolve_alias(value: str | None, alias_map: dict[str, str]) -> str | None:
    if not value:
        return None
    return alias_map.get(_normalize_key(value))


def _encode_rows_as_csv(entity_type: ImportEntityType, rows: list[dict[str, Any]]) -> bytes:
    headers = CSV_HEADERS_BY_ENTITY[entity_type]
    buffer = io.StringIO(newline='')
    writer = csv.DictWriter(buffer, fieldnames=headers, extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        serialized = {
            header: _serialize_csv_value(row.get(header))
            for header in headers
        }
        writer.writerow(serialized)
    return buffer.getvalue().encode('utf-8')


def _upload_import_batch(
    *,
    entity_type: ImportEntityType,
    file_name: str,
    payload: bytes,
    source_id: str | None,
    mapping_profile_id: str | None,
) -> dict[str, Any]:
    endpoint = f"{settings.sigi_import_api_url.rstrip('/')}/admin/imports/upload"
    fields = {
        'entityType': entity_type,
    }
    if source_id:
        fields['sourceId'] = source_id
    if mapping_profile_id:
        fields['mappingProfileId'] = mapping_profile_id

    multipart_body, content_type = _encode_multipart_form_data(
        fields=fields,
        file_field='file',
        file_name=file_name,
        file_payload=payload,
        file_content_type='text/csv',
    )

    headers = {
        'Authorization': f'Bearer {settings.sigi_import_admin_token}',
        'Content-Type': content_type,
        'Content-Length': str(len(multipart_body)),
    }
    return _request_json(
        method='POST',
        url=endpoint,
        headers=headers,
        body=multipart_body,
    )


def _resolve_odoo_credentials(
    credentials: dict[str, Any] | None,
) -> dict[str, str] | None:
    if credentials:
        base_url = _clean_value(credentials.get('base_url') or credentials.get('baseUrl'))
        database_name = _clean_value(
            credentials.get('database_name') or credentials.get('databaseName')
        )
        username = _clean_value(credentials.get('username'))
        password = _clean_value(credentials.get('password'))
        if base_url and database_name and username and password:
            return {
                'base_url': base_url,
                'database_name': database_name,
                'username': username,
                'password': password,
            }

    base_url = _clean_value(settings.odoo_url)
    database_name = _clean_value(settings.odoo_db)
    username = _clean_value(settings.odoo_user)
    password = _clean_value(settings.odoo_password)
    if base_url and database_name and username and password:
        return {
            'base_url': base_url,
            'database_name': database_name,
            'username': username,
            'password': password,
        }

    return None


def _clean_value(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    normalized = value.strip()
    return normalized or None


def _encode_multipart_form_data(
    *,
    fields: dict[str, str],
    file_field: str,
    file_name: str,
    file_payload: bytes,
    file_content_type: str,
) -> tuple[bytes, str]:
    boundary = uuid4().hex
    chunks: list[bytes] = []

    for key, value in fields.items():
        chunks.append(f'--{boundary}\r\n'.encode('utf-8'))
        chunks.append(
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode('utf-8')
        )
        chunks.append(f'{value}\r\n'.encode('utf-8'))

    chunks.append(f'--{boundary}\r\n'.encode('utf-8'))
    chunks.append(
        (
            f'Content-Disposition: form-data; name="{file_field}"; '
            f'filename="{file_name}"\r\n'
        ).encode('utf-8')
    )
    chunks.append(f'Content-Type: {file_content_type}\r\n\r\n'.encode('utf-8'))
    chunks.append(file_payload)
    chunks.append(b'\r\n')
    chunks.append(f'--{boundary}--\r\n'.encode('utf-8'))

    body = b''.join(chunks)
    return body, f'multipart/form-data; boundary={boundary}'


def _request_json(
    *,
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None = None,
) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(settings.http_client_max_retries + 1):
        request = Request(url=url, data=body, headers=headers, method=method)
        try:
            with safe_urlopen(request) as response:
                raw = read_bounded(response).decode('utf-8')
                if not raw.strip():
                    return {}
                return json.loads(raw)
        except HTTPError as exc:
            details = ''
            try:
                details = exc.read().decode('utf-8')
            except Exception:
                details = ''
            raise OdooSyncError(
                f'Error al subir lote {method} {url}: {exc.code} {details}',
            ) from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt >= settings.http_client_max_retries:
                break
            time.sleep(0.25 * (attempt + 1))

    raise OdooSyncError(
        f'No fue posible completar {method} {url} después de reintentos.',
    ) from last_error


def _pick_text(record: dict[str, Any], candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate not in record:
            continue
        value = record.get(candidate)
        if value is None:
            continue
        if isinstance(value, str):
            text = value.strip()
            if text:
                return text
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return str(value)
    return None


def _pick_number(record: dict[str, Any], candidates: list[str]) -> float | None:
    for candidate in candidates:
        if candidate not in record:
            continue
        value = record.get(candidate)
        if value is None:
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        if isinstance(value, str):
            normalized = value.strip().replace(' ', '').replace(',', '.')
            if not normalized:
                continue
            try:
                return float(normalized)
            except ValueError:
                continue
    return None


def _pick_date(record: dict[str, Any], candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate not in record:
            continue
        value = record.get(candidate)
        parsed = _parse_date(value)
        if parsed:
            return parsed
    return None


def _parse_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        year = int(value)
        if 1900 <= year <= 2200:
            return f'{year:04d}-01-01'
        return None
    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None
    if len(text) == 4 and text.isdigit():
        return f'{int(text):04d}-01-01'

    formats = (
        '%Y-%m-%d',
        '%Y/%m/%d',
        '%d/%m/%Y',
        '%m/%d/%Y',
        '%Y-%m-%d %H:%M:%S',
    )
    for fmt in formats:
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.date().isoformat()
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(text.replace('Z', '+00:00')).date().isoformat()
    except ValueError:
        return None


def _serialize_csv_value(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _normalize_key(value: str) -> str:
    return _slugify(value).replace('-', '_')


def _slugify(value: str) -> str:
    return ''.join(
        character.lower() if character.isalnum() else '-'
        for character in value.strip()
    ).strip('-')


def _timestamp_for_file_name() -> str:
    return datetime.utcnow().strftime('%Y%m%d%H%M%S')


def _safe_int(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return 0
    return 0


def _build_mock_records() -> dict[ImportEntityType, list[dict[str, Any]]]:
    return {
        'institutions': [
            {'id_productor': 'mag', 'opciones': 'Ministerio de Agricultura y Ganadería', 'provincia': 'Costa Rica'},
            {'id_productor': 'sinac', 'opciones': 'Sistema Nacional de Áreas de Conservación', 'provincia': 'Costa Rica'},
            {'id_productor': 'minae', 'opciones': 'Ministerio de Ambiente y Energía', 'provincia': 'Costa Rica'},
        ],
        'projects': [
            {
                'cod_finca': 'odoo-mag-001',
                'id_finca': 'Recuperación de Suelos en Región Huetar Norte',
                'id_productor': 'mag',
                'ano': '2025',
                'area': 420.5,
                'status': 'active',
            },
            {
                'cod_finca': 'odoo-mag-002',
                'id_finca': 'Manejo Agroforestal de Cuencas Productivas',
                'id_productor': 'mag',
                'ano': '2025',
                'area': 315.0,
                'status': 'active',
            },
            {
                'cod_finca': 'odoo-mag-003',
                'id_finca': 'Manejo Productivo de Bosque Seco',
                'id_productor': 'sinac',
                'ano': '2024',
                'area': 260.75,
                'status': 'completed',
            },
        ],
        'project_indicators': [
            {
                'cod_finca': 'odoo-mag-001',
                'id': 'restored_area_ha',
                'opciones': 'Área restaurada reportada',
                'activa': 'ha',
                'area': 420.5,
                'ano': '2025',
            },
            {
                'cod_finca': 'odoo-mag-002',
                'id': 'beneficiary_households',
                'opciones': 'Hogares beneficiados',
                'activa': 'hogares',
                'area': 1800,
                'ano': '2025',
            },
            {
                'cod_finca': 'odoo-mag-003',
                'id': 'co2e_captured',
                'opciones': 'CO2e estimado capturado',
                'activa': 'tCO2e',
                'area': 2450.3,
                'ano': '2024',
            },
        ],
        'project_territories': [
            {
                'cod_finca': 'odoo-mag-001',
                'distrito': 'cr-north',
                'canton': 'Región Huetar Norte',
                'provincia': 'Costa Rica',
                'area': 210.25,
            },
            {
                'cod_finca': 'odoo-mag-002',
                'distrito': 'cr-central',
                'canton': 'Valle Central',
                'provincia': 'Costa Rica',
                'area': 315.0,
            },
            {
                'cod_finca': 'odoo-mag-003',
                'distrito': 'cr-chorotega',
                'canton': 'Región Chorotega',
                'provincia': 'Costa Rica',
                'area': 260.75,
            },
        ],
    }
