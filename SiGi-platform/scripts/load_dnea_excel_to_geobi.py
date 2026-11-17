from __future__ import annotations

import json
import math
import os
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import openpyxl
import psycopg2
from psycopg2.extras import Json


SOURCE_CODE = "excel-dnea-actividades"
DATASET_SCHEMA_CODE = "dnea_activity_points"
PROJECT_CODE = "CR-DNEA-2026-001"
LAYER_CODE = "dnea_activity_points"
SITE_CODE_PREFIX = "DNEA-SITE-"


@dataclass
class RowRecord:
    row_number: int
    activity_general: str
    activity_specific: str
    activity: str
    is_primary: str
    area_ha: float
    address: str
    agency: str
    province: str
    canton: str
    district: str
    identification_type: str
    tenure: str
    active_flag: str
    pympa_type: str
    sex: str
    population: str
    latitude: float
    longitude: float

    @property
    def site_code(self) -> str:
        return f"{SITE_CODE_PREFIX}{self.row_number:04d}"

    @property
    def territory_name(self) -> str:
        district = self.district or "Distrito no especificado"
        return f"{district} · {self.activity or 'Actividad'}"

    @property
    def properties(self) -> dict[str, Any]:
        return {
            "rowNumber": self.row_number,
            "activityGeneral": self.activity_general,
            "activitySpecific": self.activity_specific,
            "activity": self.activity,
            "isPrimary": self.is_primary,
            "areaHa": self.area_ha,
            "address": self.address,
            "agency": self.agency,
            "province": self.province,
            "canton": self.canton,
            "district": self.district,
            "identificationType": self.identification_type,
            "tenure": self.tenure,
            "activeFlag": self.active_flag,
            "pympaType": self.pympa_type,
            "sex": self.sex,
            "population": self.population,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text


def parse_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return 0.0
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text:
        return 0.0
    return float(text)


def read_workbook(path: Path) -> list[RowRecord]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook[workbook.sheetnames[0]]
    rows = sheet.iter_rows(values_only=True)
    headers = [normalize_text(value) for value in next(rows)]
    header_index = {header: index for index, header in enumerate(headers)}

    required_headers = [
        "Act. General",
        "Act. Especifica",
        "Actividad",
        "Area Ha",
        "Provincia",
        "Canton",
        "Distrito",
        "Latitud",
        "Longitud",
    ]
    missing = [header for header in required_headers if header not in header_index]
    if missing:
        raise RuntimeError(f"El Excel no contiene los encabezados requeridos: {missing}")

    records: list[RowRecord] = []
    for excel_row_number, row in enumerate(rows, start=2):
        values = list(row)
        latitude = parse_float(values[header_index["Latitud"]])
        longitude = parse_float(values[header_index["Longitud"]])
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            continue

        records.append(
            RowRecord(
                row_number=excel_row_number - 1,
                activity_general=normalize_text(values[header_index.get("Act. General", -1)]),
                activity_specific=normalize_text(values[header_index.get("Act. Especifica", -1)]),
                activity=normalize_text(values[header_index.get("Actividad", -1)]),
                is_primary=normalize_text(values[header_index.get("Es Primaria", -1)]),
                area_ha=parse_float(values[header_index.get("Area Ha", -1)]),
                address=normalize_text(values[header_index.get("Direccion", -1)]),
                agency=normalize_text(values[header_index.get("Agencia", -1)]),
                province=normalize_text(values[header_index.get("Provincia", -1)]),
                canton=normalize_text(values[header_index.get("Canton", -1)]),
                district=normalize_text(values[header_index.get("Distrito", -1)]),
                identification_type=normalize_text(values[header_index.get("Tipo Identificacion", -1)]),
                tenure=normalize_text(values[header_index.get("Tenencia", -1)]),
                active_flag=normalize_text(values[header_index.get("Activo", -1)]),
                pympa_type=normalize_text(values[header_index.get("Tipo PYMPA", -1)]),
                sex=normalize_text(values[header_index.get("Sexo", -1)]),
                population=normalize_text(values[header_index.get("Poblacion", -1)]),
                latitude=latitude,
                longitude=longitude,
            ),
        )

    if not records:
        raise RuntimeError("No se encontraron filas con coordenadas validas en el Excel.")
    return records


def get_scalar(cur, query: str, params: tuple[Any, ...]) -> Any:
    cur.execute(query, params)
    row = cur.fetchone()
    return row[0] if row else None


def upsert_source(cur, institution_id: str, connector_id: str | None, workbook_name: str) -> str:
    source_id = get_scalar(cur, "SELECT id FROM core.data_sources WHERE code = %s", (SOURCE_CODE,))
    config_json = {
        "ingestMode": "excel-manual",
        "workbook": workbook_name,
        "sheet": "Sheet",
        "geospatial": True,
        "columns": {
            "activityGeneral": "Act. General",
            "activitySpecific": "Act. Especifica",
            "activity": "Actividad",
            "areaHa": "Area Ha",
            "province": "Provincia",
            "canton": "Canton",
            "district": "Distrito",
            "latitude": "Latitud",
            "longitude": "Longitud",
        },
    }
    if source_id:
        cur.execute(
            """
            UPDATE core.data_sources
            SET institution_id = %s,
                connector_id = %s,
                name = %s,
                source_type = 'excel',
                status = 'active',
                config_json = %s::jsonb,
                last_ingested_at = NOW(),
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                institution_id,
                connector_id,
                "Actividades DNEA por establecimiento",
                json.dumps(config_json),
                source_id,
            ),
        )
        return source_id

    source_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO core.data_sources (
          id, institution_id, connector_id, code, name, source_type, status, config_json, last_ingested_at
        ) VALUES (%s, %s, %s, %s, %s, 'excel', 'active', %s::jsonb, NOW())
        """,
        (
            source_id,
            institution_id,
            connector_id,
            SOURCE_CODE,
            "Actividades DNEA por establecimiento",
            json.dumps(config_json),
        ),
    )
    return source_id


def upsert_dataset(cur, institution_id: str, source_id: str, summary_payload: dict[str, Any]) -> str:
    dataset_id = get_scalar(
        cur,
        "SELECT id FROM core.datasets WHERE source_id = %s AND schema_code = %s ORDER BY created_at ASC LIMIT 1",
        (source_id, DATASET_SCHEMA_CODE),
    )
    if dataset_id:
        cur.execute(
            """
            UPDATE core.datasets
            SET institution_id = %s,
                title = %s,
                status = 'published',
                updated_at = NOW()
            WHERE id = %s
            """,
            (institution_id, "Actividades DNEA georreferenciadas", dataset_id),
        )
    else:
        dataset_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO core.datasets (id, institution_id, source_id, schema_code, title, status)
            VALUES (%s, %s, %s, %s, %s, 'published')
            """,
            (
                dataset_id,
                institution_id,
                source_id,
                DATASET_SCHEMA_CODE,
                "Actividades DNEA georreferenciadas",
            ),
        )

    version_id = get_scalar(
        cur,
        "SELECT id FROM core.dataset_versions WHERE dataset_id = %s AND version_number = 1",
        (dataset_id,),
    )
    payload = {
        "datasetCode": DATASET_SCHEMA_CODE,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": summary_payload,
    }
    if version_id:
        cur.execute(
            """
            UPDATE core.dataset_versions
            SET status = 'published',
                payload_json = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (Json(payload), version_id),
        )
    else:
        cur.execute(
            """
            INSERT INTO core.dataset_versions (id, dataset_id, version_number, status, payload_json)
            VALUES (%s, %s, 1, 'published', %s)
            """,
            (str(uuid.uuid4()), dataset_id, Json(payload)),
        )

    return dataset_id


def upsert_project(cur, institution_id: str, dataset_id: str, total_area_ha: float) -> str:
    project_id = get_scalar(cur, "SELECT id FROM core.projects WHERE code = %s", (PROJECT_CODE,))
    values = (
        dataset_id,
        institution_id,
        "Actividades DNEA georreferenciadas",
        "active",
        total_area_ha,
        PROJECT_CODE,
        "Seguimiento territorial de actividades productivas y establecimientos georreferenciados de DNEA.",
        "Carga operativa de establecimientos con localizacion y actividad para lectura geoespacial institucional.",
        "Consolidar actividades y establecimientos DNEA en una capa interoperable para analisis, seguimiento y toma de decisiones.",
        "agricultura",
        "medium",
        "public",
        100.0,
        True,
    )
    if project_id:
        cur.execute(
            """
            UPDATE core.projects
            SET dataset_id = %s,
                institution_id = %s,
                title = %s,
                status = %s,
                area_ha = %s,
                code = %s,
                objective = %s,
                summary = %s,
                description = %s,
                theme = %s,
                priority = %s,
                visibility = %s,
                progress_pct = %s,
                featured = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            values + (project_id,),
        )
        return project_id

    project_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO core.projects (
          id, dataset_id, institution_id, title, status, area_ha, code,
          objective, summary, description, theme, priority, visibility, progress_pct, featured
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (project_id,) + values,
    )
    return project_id


def upsert_layer(cur) -> str:
    layer_id = get_scalar(cur, "SELECT id FROM gis.geo_layers WHERE code = %s", (LAYER_CODE,))
    if layer_id:
        cur.execute(
            """
            UPDATE gis.geo_layers
            SET name = %s,
                layer_type = 'point',
                visibility = 'public',
                status = 'published',
                updated_at = NOW()
            WHERE id = %s
            """,
            ("Actividades DNEA georreferenciadas", layer_id),
        )
        return layer_id

    layer_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO gis.geo_layers (id, code, name, layer_type, visibility, status)
        VALUES (%s, %s, %s, 'point', 'public', 'published')
        """,
        (layer_id, LAYER_CODE, "Actividades DNEA georreferenciadas"),
    )
    return layer_id


def reset_existing(cur, project_id: str | None, layer_id: str | None) -> None:
    if layer_id:
        cur.execute("DELETE FROM gis.territory_features WHERE layer_id = %s", (layer_id,))
    if project_id:
        cur.execute("DELETE FROM core.project_territories WHERE project_id = %s", (project_id,))
        cur.execute(
            "DELETE FROM core.project_indicators WHERE project_id = %s AND indicator_code LIKE 'dnea_%'",
            (project_id,),
        )
        cur.execute("DELETE FROM core.project_datasets WHERE project_id = %s", (project_id,))
    cur.execute("DELETE FROM core.territories WHERE code LIKE %s", (f"{SITE_CODE_PREFIX}%",))


def insert_rows(cur, layer_id: str, project_id: str, records: list[RowRecord]) -> None:
    for record in records:
        territory_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO core.territories (id, code, name, level, status)
            VALUES (%s, %s, %s, 'site', 'inactive')
            """,
            (territory_id, record.site_code, record.territory_name),
        )
        cur.execute(
            """
            INSERT INTO gis.territory_features (
              id, territory_id, layer_id, area_ha, geometry, properties_json
            )
            VALUES (
              %s,
              %s,
              %s,
              %s,
              ST_Multi(
                ST_Transform(
                  ST_Buffer(
                    ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 3857),
                    35
                  ),
                  4326
                )
              ),
              %s
            )
            """,
            (
                str(uuid.uuid4()),
                territory_id,
                layer_id,
                record.area_ha,
                record.longitude,
                record.latitude,
                Json(record.properties),
            ),
        )
        cur.execute(
            """
            INSERT INTO core.project_territories (
              id, project_id, territory_id, territory_code, territory_name, country, area_ha
            )
            VALUES (%s, %s, %s, %s, %s, 'Costa Rica', %s)
            """,
            (
                str(uuid.uuid4()),
                project_id,
                territory_id,
                record.site_code,
                record.territory_name,
                record.area_ha,
            ),
        )


def insert_project_links(cur, project_id: str, dataset_id: str, summary: dict[str, Any]) -> None:
    cur.execute(
        """
        INSERT INTO core.project_datasets (
          id, project_id, dataset_id, relationship_type, validation_status, evidence_note
        )
        VALUES (%s, %s, %s, 'source', 'validated', %s)
        ON CONFLICT (project_id, dataset_id, relationship_type)
        DO UPDATE SET
          validation_status = EXCLUDED.validation_status,
          evidence_note = EXCLUDED.evidence_note,
          updated_at = NOW()
        """,
        (
            str(uuid.uuid4()),
            project_id,
            dataset_id,
            (
                f"Workbook cargado directamente a Geo/BI con {summary['totalRecords']} registros, "
                f"{summary['activityTypes']} actividades y {summary['districts']} distritos."
            ),
        ),
    )

    observed_at = date.today().isoformat()
    indicators = [
        ("dnea_records_total", "Establecimientos cargados", "registros", float(summary["totalRecords"])),
        ("dnea_total_area_ha", "Area total declarada", "ha", float(summary["totalAreaHa"])),
        ("dnea_activity_types", "Tipos de actividad", "actividades", float(summary["activityTypes"])),
        ("dnea_districts", "Distritos con cobertura", "distritos", float(summary["districts"])),
    ]
    for code, name, unit, value in indicators:
        cur.execute(
            """
            INSERT INTO core.project_indicators (
              id, project_id, indicator_code, indicator_name, unit, value_numeric, category, observed_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'project', %s)
            ON CONFLICT (project_id, indicator_code, observed_at)
            DO UPDATE SET
              indicator_name = EXCLUDED.indicator_name,
              unit = EXCLUDED.unit,
              value_numeric = EXCLUDED.value_numeric,
              updated_at = NOW()
            """,
            (str(uuid.uuid4()), project_id, code, name, unit, value, observed_at),
        )


def build_summary(records: list[RowRecord]) -> dict[str, Any]:
    total_area_ha = round(sum(record.area_ha for record in records), 2)
    activities = Counter(record.activity for record in records if record.activity)
    agencies = Counter(record.agency for record in records if record.agency)
    return {
        "totalRecords": len(records),
        "totalAreaHa": total_area_ha,
        "activityTypes": len(activities),
        "districts": len({record.district for record in records if record.district}),
        "cantons": len({record.canton for record in records if record.canton}),
        "provinces": len({record.province for record in records if record.province}),
        "topActivities": activities.most_common(5),
        "topAgencies": agencies.most_common(5),
    }


def main() -> None:
    workbook_path = Path(
        os.environ.get("DNEA_XLSX_PATH", r"C:\Users\E22431\Desktop\Dxgv_ActividadesDNEA.xlsx"),
    )
    if not workbook_path.exists():
        raise RuntimeError(f"No se encontro el archivo: {workbook_path}")

    records = read_workbook(workbook_path)
    summary = build_summary(records)

    connection = psycopg2.connect(
        host=os.environ.get("SIGI_DB_HOST", "localhost"),
        port=int(os.environ.get("SIGI_DB_PORT", "5432")),
        dbname=os.environ.get("SIGI_DB_NAME", "sigi_db"),
        user=os.environ.get("SIGI_DB_USER", "sigi_user"),
        password=os.environ.get("SIGI_DB_PASSWORD", "sigi_password"),
    )
    connection.autocommit = False

    try:
        with connection.cursor() as cur:
            institution_id = get_scalar(cur, "SELECT id FROM core.institutions WHERE code = 'mag'", ())
            if not institution_id:
                raise RuntimeError("No se encontro la institucion MAG en core.institutions.")

            connector_id = get_scalar(
                cur,
                """
                SELECT id
                FROM core.connectors
                WHERE institution_id = %s
                  AND connector_type = 'excel'
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """,
                (institution_id,),
            )

            existing_project_id = get_scalar(cur, "SELECT id FROM core.projects WHERE code = %s", (PROJECT_CODE,))
            existing_layer_id = get_scalar(cur, "SELECT id FROM gis.geo_layers WHERE code = %s", (LAYER_CODE,))
            reset_existing(cur, existing_project_id, existing_layer_id)

            source_id = upsert_source(cur, institution_id, connector_id, workbook_path.name)
            dataset_id = upsert_dataset(cur, institution_id, source_id, summary)
            project_id = upsert_project(cur, institution_id, dataset_id, float(summary["totalAreaHa"]))
            layer_id = upsert_layer(cur)
            insert_rows(cur, layer_id, project_id, records)
            insert_project_links(cur, project_id, dataset_id, summary)

        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    output = {
        "sourceCode": SOURCE_CODE,
        "datasetSchemaCode": DATASET_SCHEMA_CODE,
        "projectCode": PROJECT_CODE,
        "layerCode": LAYER_CODE,
        "summary": summary,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
