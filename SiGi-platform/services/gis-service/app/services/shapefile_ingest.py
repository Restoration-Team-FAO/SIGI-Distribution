from __future__ import annotations

import io
import json
import re
import zipfile
from collections.abc import Iterable
from typing import Any

import shapefile
from pyproj import CRS, Geod, Transformer
from shapely.geometry import MultiPolygon, Polygon, shape as shape_geometry
from shapely.ops import transform as transform_geometry
from shapely.wkt import dumps as dump_wkt

from app.core.db import fetch_all
from app.core.settings import settings
from app.core.zip_policy import ZipPolicyError, validate_zip_entries

CANONICAL_FIELDS = (
    'project_code',
    'territory_code',
    'territory_name',
    'territory_level',
    'country',
    'area_ha',
)

REQUIRED_FIELDS = (
    'project_code',
    'country',
    'area_ha',
)

PROJECT_LINKED_IMPORT_MODE = 'project-linked'
REFERENCE_LAYER_IMPORT_MODE = 'reference-layer'
SUPPORTED_IMPORT_MODES = (
    PROJECT_LINKED_IMPORT_MODE,
    REFERENCE_LAYER_IMPORT_MODE,
)

CANDIDATES_BY_FIELD: dict[str, tuple[str, ...]] = {
    'project_code': (
        'project_code',
        'proyecto_code',
        'cod_proy',
        'cod_finca',
        'cod_proyecto',
        'codigo_proyecto',
        'project_id',
        'project_id_id',
        'id_proyecto',
        'project',
        'codigo',
        'id',
    ),
    'territory_code': (
        'territory_code',
        'cod_territorio',
        'codigo_territorio',
        'cod_parcela',
        'objectid',
        'id',
    ),
    'territory_name': (
        'territory_name',
        'nombre_territorio',
        'name',
        'nombre',
        'parcela',
        'distrito',
        'sector',
    ),
    'territory_level': (
        'territory_level',
        'nivel_territorio',
        'territory_level_name',
        'level',
        'nivel',
    ),
    'country': (
        'country',
        'pais',
        'country_name',
    ),
    'area_ha': (
        'area_ha',
        'area',
        'ha',
        'hectareas',
        'area_ha_asignada',
    ),
}


class ShapefileIngestError(RuntimeError):
    pass


def parse_mapping_json(raw_mapping: str | None) -> dict[str, str]:
    if raw_mapping is None or raw_mapping.strip() == '':
        return {}
    try:
        parsed = json.loads(raw_mapping)
    except json.JSONDecodeError as exc:
        raise ShapefileIngestError(
            'mappingJson debe ser JSON válido.',
        ) from exc

    if not isinstance(parsed, dict):
        raise ShapefileIngestError('mappingJson debe ser un objeto JSON.')

    normalized: dict[str, str] = {}
    for raw_key, raw_value in parsed.items():
        if not isinstance(raw_key, str) or not isinstance(raw_value, str):
            continue
        key = normalize_key(raw_key)
        value = raw_value.strip()
        if key and value:
            normalized[key] = value
    return normalized


def preview_shapefile_zip(
    *,
    archive_bytes: bytes,
    file_name: str,
    mapping: dict[str, str] | None,
    country: str | None,
    import_mode: str | None = None,
) -> dict[str, Any]:
    result = _process_archive(
        archive_bytes=archive_bytes,
        file_name=file_name,
        mapping=mapping or {},
        country=country,
        import_mode=normalize_import_mode(import_mode),
        include_rows=False,
    )
    result.pop('rows', None)
    return result


def transform_shapefile_zip(
    *,
    archive_bytes: bytes,
    file_name: str,
    mapping: dict[str, str] | None,
    country: str | None,
    import_mode: str | None = None,
) -> dict[str, Any]:
    return _process_archive(
        archive_bytes=archive_bytes,
        file_name=file_name,
        mapping=mapping or {},
        country=country,
        import_mode=normalize_import_mode(import_mode),
        include_rows=True,
    )


def _process_archive(
    *,
    archive_bytes: bytes,
    file_name: str,
    mapping: dict[str, str],
    country: str | None,
    import_mode: str,
    include_rows: bool,
) -> dict[str, Any]:
    if not archive_bytes:
        raise ShapefileIngestError('El archivo está vacío.')
    if len(archive_bytes) > settings.shapefile_archive_max_bytes:
        raise ShapefileIngestError(
            'El shapefile excede el tamaño máximo permitido para procesamiento.',
        )
    if not file_name.lower().endswith('.zip'):
        raise ShapefileIngestError('El shapefile debe enviarse como archivo .zip.')

    components = _extract_zip_components(archive_bytes)
    encoding = _resolve_encoding(components.get('cpg'))
    crs_info = _resolve_crs(components.get('prj'))
    territory_reference_map = _load_territory_reference_map()
    processing_result = None
    last_unicode_error: UnicodeDecodeError | None = None

    for candidate_encoding in _candidate_encodings(encoding):
        try:
            reader = shapefile.Reader(
                shp=io.BytesIO(components['shp']),
                shx=io.BytesIO(components['shx']),
                dbf=io.BytesIO(components['dbf']),
                encoding=candidate_encoding,
            )

            field_names = [field[0] for field in reader.fields[1:]]
            mapping_suggested = _suggest_mapping(field_names)
            mapping_applied = _resolve_mapping(field_names, mapping, mapping_suggested)

            feature_rows: list[dict[str, Any]] = []
            issues: list[dict[str, Any]] = []
            geometry_types: set[str] = set()
            error_row_numbers: set[int] = set()
            warning_rows: set[int] = set()
            outside_national_bounds_rows: set[int] = set()
            detected_countries: set[str] = set()
            detected_territory_levels: set[str] = set()
            dataset_bounds: tuple[float, float, float, float] | None = None
            processed_rows = 0

            for index, shape_record in enumerate(reader.iterShapeRecords(), start=1):
                processed_rows = index
                row_number = index + 1
                raw_props = _record_to_dict(field_names, shape_record.record)
                row_issues: list[dict[str, Any]] = []

                try:
                    geometry = shape_geometry(shape_record.shape.__geo_interface__)
                except Exception:
                    row_issues.append(
                        _issue(row_number, 'geometry_parse_error', 'No se pudo leer la geometría.'),
                    )
                    geometry = None

                normalized_geometry: MultiPolygon | None = None
                if geometry is not None:
                    normalized_geometry = _normalize_geometry(
                        geometry=geometry,
                        transformer=crs_info['transformer'],
                        row_number=row_number,
                        row_issues=row_issues,
                    )
                    if normalized_geometry is not None:
                        geometry_types.add(normalized_geometry.geom_type)
                        dataset_bounds = _merge_bounds(dataset_bounds, normalized_geometry.bounds)
                        _validate_national_bounds(
                            geometry=normalized_geometry,
                            row_number=row_number,
                            row_issues=row_issues,
                        )

                canonical = _build_canonical_row(
                    row_number=row_number,
                    raw_props=raw_props,
                    mapping_applied=mapping_applied,
                    country_override=country,
                    geometry=normalized_geometry,
                    row_issues=row_issues,
                    source_crs=crs_info['label'],
                    import_mode=import_mode,
                )

                has_error = any(issue['severity'] == 'error' for issue in row_issues)
                _validate_territory_catalog_alignment(
                    row_number=row_number,
                    canonical=canonical,
                    territory_reference_map=territory_reference_map,
                    row_issues=row_issues,
                )
                has_error = any(issue['severity'] == 'error' for issue in row_issues)
                if has_error:
                    error_row_numbers.add(row_number)
                if any(issue['severity'] == 'warning' for issue in row_issues):
                    warning_rows.add(row_number)
                if any(issue['code'] == 'geometry_outside_national_bounds' for issue in row_issues):
                    outside_national_bounds_rows.add(row_number)
                if canonical['country']:
                    detected_countries.add(canonical['country'])
                if canonical['territory_level']:
                    detected_territory_levels.add(canonical['territory_level'])

                issues.extend(row_issues)
                if include_rows and not has_error:
                    feature_rows.append(canonical)
        except UnicodeDecodeError as exc:
            last_unicode_error = exc
            continue

        processing_result = {
            'field_names': field_names,
            'mapping_suggested': mapping_suggested,
            'mapping_applied': mapping_applied,
            'feature_rows': feature_rows,
            'issues': issues,
            'geometry_types': geometry_types,
            'error_row_numbers': error_row_numbers,
            'warning_rows': warning_rows,
            'outside_national_bounds_rows': outside_national_bounds_rows,
            'detected_countries': detected_countries,
            'detected_territory_levels': detected_territory_levels,
            'dataset_bounds': dataset_bounds,
            'processed_rows': processed_rows,
        }
        break

    if processing_result is None:
        raise ShapefileIngestError(
            f'No se pudo decodificar el DBF del shapefile con las codificaciones soportadas: {last_unicode_error}',
        ) from last_unicode_error

    field_names = processing_result['field_names']
    mapping_suggested = processing_result['mapping_suggested']
    mapping_applied = processing_result['mapping_applied']
    feature_rows = processing_result['feature_rows']
    issues = processing_result['issues']
    geometry_types = processing_result['geometry_types']
    error_row_numbers = processing_result['error_row_numbers']
    warning_rows = processing_result['warning_rows']
    outside_national_bounds_rows = processing_result['outside_national_bounds_rows']
    detected_countries = processing_result['detected_countries']
    detected_territory_levels = processing_result['detected_territory_levels']
    dataset_bounds = processing_result['dataset_bounds']
    processed_rows = processing_result['processed_rows']

    feature_count = processed_rows
    valid_rows = max(0, feature_count - len(error_row_numbers))
    invalid_rows = len(error_row_numbers)
    warning_count = sum(1 for item in issues if item['severity'] == 'warning')
    error_count = sum(1 for item in issues if item['severity'] == 'error')
    preview_rows = feature_rows[: settings.shapefile_preview_limit] if include_rows else []

    geometry_type = 'Unknown'
    if len(geometry_types) == 1:
        geometry_type = list(geometry_types)[0]
    elif len(geometry_types) > 1:
        geometry_type = 'Mixed'

    return {
        'ok': True,
        'fileName': file_name,
        'importMode': import_mode,
        'recordCount': feature_count,
        'featureCount': feature_count,
        'geometryType': geometry_type,
        'crs': crs_info['label'],
        'detectedColumns': field_names,
        'requiredFields': list(required_fields_for_mode(import_mode)),
        'mappingSuggested': mapping_suggested,
        'mappingApplied': mapping_applied,
        'bbox': _serialize_bounds(dataset_bounds),
        'countries': sorted(detected_countries),
        'territoryLevels': sorted(detected_territory_levels),
        'geographicSummary': {
            'insideNationalBoundsRows': max(0, feature_count - len(outside_national_bounds_rows)),
            'outsideNationalBoundsRows': len(outside_national_bounds_rows),
            'configuredNationalBBox': _serialize_bounds(settings.shapefile_national_bbox),
        },
        'validationSummary': {
            'validRows': valid_rows,
            'invalidRows': invalid_rows,
            'warningRows': len(warning_rows),
            'errorCount': error_count,
            'warningCount': warning_count,
        },
        'validationIssues': issues[:200],
        'previewRows': preview_rows,
        'rows': feature_rows if include_rows else [],
    }


def _extract_zip_components(archive_bytes: bytes) -> dict[str, bytes]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
    except zipfile.BadZipFile as exc:
        raise ShapefileIngestError('El archivo no es un .zip válido.') from exc

    entries = archive.infolist()
    try:
        validate_zip_entries(
            entries,
            max_entries=settings.shapefile_zip_max_entries,
            max_uncompressed_bytes=settings.shapefile_zip_max_uncompressed_bytes,
            max_compression_ratio=settings.shapefile_zip_max_compression_ratio,
        )
    except ZipPolicyError as exc:
        raise ShapefileIngestError(str(exc)) from exc

    by_extension: dict[str, list[zipfile.ZipInfo]] = {}
    for item in entries:
        if item.is_dir():
            continue
        name = item.filename.rsplit('/', 1)[-1]
        if '.' not in name:
            continue
        extension = name.rsplit('.', 1)[-1].lower()
        by_extension.setdefault(extension, []).append(item)

    shp_files = by_extension.get('shp', [])
    shx_files = by_extension.get('shx', [])
    dbf_files = by_extension.get('dbf', [])
    if not shp_files or not shx_files or not dbf_files:
        raise ShapefileIngestError(
            'El .zip debe incluir .shp, .shx y .dbf.',
        )

    if len(shp_files) != 1:
        raise ShapefileIngestError('El .zip debe contener exactamente un archivo .shp.')
    base_name = shp_files[0].filename.rsplit('/', 1)[-1].rsplit('.', 1)[0].lower()

    def pick(extension: str, required: bool = True) -> bytes | None:
        candidates = by_extension.get(extension, [])
        selected = None
        for item in candidates:
            item_base_name = item.filename.rsplit('/', 1)[-1].rsplit('.', 1)[0].lower()
            if item_base_name == base_name:
                selected = item
                break
        if selected is None:
            if required:
                raise ShapefileIngestError(
                    f'No se encontró archivo .{extension} en el .zip.',
                )
            return None
        return archive.read(selected)

    return {
        'shp': pick('shp', required=True) or b'',
        'shx': pick('shx', required=True) or b'',
        'dbf': pick('dbf', required=True) or b'',
        'prj': pick('prj', required=False),
        'cpg': pick('cpg', required=False),
    }


def _resolve_encoding(cpg_bytes: bytes | None) -> str:
    if not cpg_bytes:
        return 'utf-8'
    try:
        candidate = cpg_bytes.decode('utf-8', errors='ignore').strip()
    except Exception:
        return 'utf-8'
    return candidate or 'utf-8'


def _candidate_encodings(preferred: str) -> list[str]:
    values = [preferred, 'utf-8', 'cp1252', 'latin-1']
    ordered: list[str] = []
    for value in values:
        normalized = (value or '').strip()
        if normalized and normalized not in ordered:
            ordered.append(normalized)
    return ordered


def _resolve_crs(prj_bytes: bytes | None) -> dict[str, Any]:
    if not prj_bytes:
        return {
            'label': 'EPSG:4326 (assumed)',
            'transformer': None,
        }

    try:
        prj_text = prj_bytes.decode('utf-8', errors='ignore')
        source_crs = CRS.from_wkt(prj_text)
    except Exception:
        return {
            'label': 'Unknown (fallback to EPSG:4326)',
            'transformer': None,
        }

    epsg = source_crs.to_epsg()
    label = f'EPSG:{epsg}' if epsg else source_crs.to_string()
    if epsg == 4326:
        return {
            'label': label or 'EPSG:4326',
            'transformer': None,
        }

    transformer = Transformer.from_crs(source_crs, CRS.from_epsg(4326), always_xy=True)
    return {
        'label': label or 'custom CRS',
        'transformer': transformer,
    }


def _record_to_dict(field_names: list[str], record: shapefile._Record) -> dict[str, Any]:
    values = list(record)
    return {
        field_names[index]: values[index]
        for index in range(min(len(field_names), len(values)))
    }


def _suggest_mapping(field_names: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for canonical_field in CANONICAL_FIELDS:
        resolved = _find_column(field_names, CANDIDATES_BY_FIELD[canonical_field])
        if resolved:
            mapping[canonical_field] = resolved
    return mapping


def _resolve_mapping(
    field_names: list[str],
    manual_mapping: dict[str, str],
    suggested_mapping: dict[str, str],
) -> dict[str, str]:
    available_columns_by_key = {
        normalize_key(column): column
        for column in field_names
    }
    resolved: dict[str, str] = {}
    for canonical_field in CANONICAL_FIELDS:
        manual_value = manual_mapping.get(canonical_field)
        if manual_value:
            manual_key = normalize_key(manual_value)
            if manual_key in available_columns_by_key:
                resolved[canonical_field] = available_columns_by_key[manual_key]
                continue
        suggested_value = suggested_mapping.get(canonical_field)
        if suggested_value:
            resolved[canonical_field] = suggested_value
    return resolved


def _find_column(field_names: list[str], candidates: Iterable[str]) -> str | None:
    by_normalized = {
        normalize_key(field_name): field_name
        for field_name in field_names
    }
    for candidate in candidates:
        normalized = normalize_key(candidate)
        if normalized in by_normalized:
            return by_normalized[normalized]
    return None


def _normalize_geometry(
    *,
    geometry: Any,
    transformer: Transformer | None,
    row_number: int,
    row_issues: list[dict[str, Any]],
) -> MultiPolygon | None:
    transformed = geometry
    if transformer is not None:
        transformed = transform_geometry(transformer.transform, transformed)

    if transformed.is_empty:
        row_issues.append(
            _issue(row_number, 'geometry_empty', 'La geometría está vacía.'),
        )
        return None

    if not transformed.is_valid:
        transformed = transformed.buffer(0)
    if transformed.is_empty or not transformed.is_valid:
        row_issues.append(
            _issue(row_number, 'geometry_invalid', 'La geometría no es válida.'),
        )
        return None

    if isinstance(transformed, Polygon):
        return MultiPolygon([transformed])
    if isinstance(transformed, MultiPolygon):
        return transformed

    row_issues.append(
        _issue(
            row_number,
            'geometry_type_not_supported',
            'Solo se admiten Polygon/MultiPolygon en esta versión.',
        ),
    )
    return None


def _validate_national_bounds(
    *,
    geometry: MultiPolygon,
    row_number: int,
    row_issues: list[dict[str, Any]],
) -> None:
    min_lon, min_lat, max_lon, max_lat = settings.shapefile_national_bbox
    geom_min_lon, geom_min_lat, geom_max_lon, geom_max_lat = geometry.bounds
    if (
        geom_max_lon < min_lon
        or geom_min_lon > max_lon
        or geom_max_lat < min_lat
        or geom_min_lat > max_lat
    ):
        row_issues.append(
            _issue(
                row_number,
                'geometry_outside_national_bounds',
                'La geometría parece estar fuera del territorio nacional configurado.',
            ),
        )


def _load_territory_reference_map() -> dict[str, dict[str, str]]:
    rows = fetch_all(
        """
        SELECT LOWER(code) AS key, code, name, level
        FROM core.territories
        WHERE code IS NOT NULL
        UNION
        SELECT LOWER(k.alias_key) AS key, t.code, t.name, t.level
        FROM core.territory_keys k
        INNER JOIN core.territories t ON t.id = k.territory_id
        WHERE k.active = TRUE
          AND k.alias_key IS NOT NULL
        """
    )
    return {
        str(row['key']): {
            'code': str(row['code']),
            'name': str(row['name']),
            'level': str(row['level']),
        }
        for row in rows
        if row.get('key') and row.get('code') and row.get('name') and row.get('level')
    }


def _validate_territory_catalog_alignment(
    *,
    row_number: int,
    canonical: dict[str, Any],
    territory_reference_map: dict[str, dict[str, str]],
    row_issues: list[dict[str, Any]],
) -> None:
    territory_code = _value_as_text(canonical.get('territory_code'))
    if not territory_code:
        return

    reference = territory_reference_map.get(normalize_key(territory_code))
    if reference is None:
        row_issues.append(
            _issue(
                row_number,
                'territory_code_not_found_in_catalog',
                f'El territory_code {territory_code} no existe en el catálogo SIGI y debe revisarse antes de promoción final.',
                'warning',
            ),
        )
        return

    territory_level = _value_as_text(canonical.get('territory_level'))
    if territory_level and normalize_key(reference['level']) != normalize_key(territory_level):
        row_issues.append(
            _issue(
                row_number,
                'territory_level_mismatch',
                f'El territory_code {territory_code} existe con nivel {reference["level"]}, no {territory_level}.',
            ),
        )

    territory_name = _value_as_text(canonical.get('territory_name'))
    if territory_name and normalize_key(reference['name']) != normalize_key(territory_name):
        row_issues.append(
            _issue(
                row_number,
                'territory_name_mismatch',
                f'El territory_code {territory_code} existe como {reference["name"]}; revisa el territory_name enviado.',
                'warning',
            ),
        )


def _merge_bounds(
    current_bounds: tuple[float, float, float, float] | None,
    next_bounds: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    if current_bounds is None:
        return next_bounds
    return (
        min(current_bounds[0], next_bounds[0]),
        min(current_bounds[1], next_bounds[1]),
        max(current_bounds[2], next_bounds[2]),
        max(current_bounds[3], next_bounds[3]),
    )


def _serialize_bounds(
    bounds: tuple[float, float, float, float] | list[float] | None,
) -> dict[str, float] | None:
    if not bounds or len(bounds) != 4:
        return None
    min_lon, min_lat, max_lon, max_lat = bounds
    return {
        'minLon': round(float(min_lon), 6),
        'minLat': round(float(min_lat), 6),
        'maxLon': round(float(max_lon), 6),
        'maxLat': round(float(max_lat), 6),
    }


def _build_canonical_row(
    *,
    row_number: int,
    raw_props: dict[str, Any],
    mapping_applied: dict[str, str],
    country_override: str | None,
    geometry: MultiPolygon | None,
    row_issues: list[dict[str, Any]],
    source_crs: str,
    import_mode: str,
) -> dict[str, Any]:
    project_code = _value_as_text(raw_props.get(mapping_applied.get('project_code', '')))
    territory_code = _value_as_text(raw_props.get(mapping_applied.get('territory_code', '')))
    territory_name = _value_as_text(raw_props.get(mapping_applied.get('territory_name', '')))
    territory_level = _value_as_text(raw_props.get(mapping_applied.get('territory_level', ''))) or 'parcel'
    country_value = (
        _value_as_text(raw_props.get(mapping_applied.get('country', '')))
        or country_override
        or settings.shapefile_default_country
    )
    area_value = _parse_number(raw_props.get(mapping_applied.get('area_ha', '')))

    if import_mode == PROJECT_LINKED_IMPORT_MODE and not project_code:
        row_issues.append(
            _issue(
                row_number,
                'project_code_required',
                'project_code es requerido para integrar con proyectos SIGI/Odoo.',
            ),
        )
    if not country_value:
        row_issues.append(
            _issue(row_number, 'country_required', 'country es requerido.'),
        )

    if geometry is None:
        row_issues.append(
            _issue(row_number, 'geometry_required', 'No hay geometría válida para la fila.'),
        )
        geometry_wkt = ''
        computed_area_ha = None
    else:
        geometry_wkt = dump_wkt(geometry, rounding_precision=8)
        computed_area_ha = _compute_area_ha(geometry)

    area_ha = area_value if area_value is not None else computed_area_ha
    if area_ha is None:
        row_issues.append(
            _issue(row_number, 'area_ha_invalid', 'No se pudo calcular area_ha.'),
        )
        area_ha = 0
    if area_ha < 0:
        row_issues.append(
            _issue(row_number, 'area_ha_negative', 'area_ha debe ser >= 0.'),
        )

    if not territory_code:
        territory_code = _default_territory_code(project_code, row_number)
    if not territory_name:
        territory_name = project_code or territory_code

    return {
        'rowNumber': row_number,
        'project_code': project_code or '',
        'territory_code': territory_code,
        'territory_name': territory_name,
        'territory_level': territory_level,
        'country': country_value or '',
        'area_ha': round(area_ha, 6),
        'geometry_wkt': geometry_wkt,
        'source_crs': source_crs,
        'raw_properties': raw_props,
    }


def _compute_area_ha(geometry: MultiPolygon) -> float:
    geod = Geod(ellps='WGS84')
    area_square_meters = abs(geod.geometry_area_perimeter(geometry)[0])
    return area_square_meters / 10000


def _default_territory_code(project_code: str | None, row_number: int) -> str:
    if project_code:
        return f'{normalize_key(project_code)}-geo-{row_number}'
    return f'territory-{row_number}'


def _parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if not isinstance(value, str):
        return None
    normalized = value.strip().replace(' ', '')
    if normalized == '':
        return None
    normalized = normalized.replace(',', '.')
    try:
        return float(normalized)
    except ValueError:
        return None


def _value_as_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return None


def _issue(row_number: int, code: str, message: str, severity: str = 'error') -> dict[str, Any]:
    return {
        'rowNumber': row_number,
        'code': code,
        'message': message,
        'severity': severity,
    }


def normalize_import_mode(value: str | None) -> str:
    candidate = (value or '').strip().lower()
    if candidate == '':
        return PROJECT_LINKED_IMPORT_MODE
    if candidate not in SUPPORTED_IMPORT_MODES:
        raise ShapefileIngestError(
            f'importMode no soportado. Usa {", ".join(SUPPORTED_IMPORT_MODES)}.',
        )
    return candidate


def required_fields_for_mode(import_mode: str) -> tuple[str, ...]:
    if import_mode == REFERENCE_LAYER_IMPORT_MODE:
        return tuple(field for field in REQUIRED_FIELDS if field != 'project_code')
    return REQUIRED_FIELDS


def normalize_key(value: str) -> str:
    text = value.strip().lower()
    text = text.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
    text = text.replace('ñ', 'n')
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')
