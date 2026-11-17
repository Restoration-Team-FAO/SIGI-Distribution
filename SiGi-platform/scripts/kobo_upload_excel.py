#!/usr/bin/env python3
import argparse
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from unicodedata import normalize
from xml.sax.saxutils import escape

import requests
from openpyxl import load_workbook
from requests.auth import HTTPBasicAuth


DEFAULT_KOBO_BASE_URL = "https://kf.kobotoolbox.org"
DEFAULT_OPENROSA_URL = "https://kc.kobotoolbox.org/submission"
DEFAULT_FORM_VERSION = "1 (2026-06-09 16:42:38)"


@dataclass
class ChoiceIndex:
    by_list_and_label: dict[tuple[str, str], str]

    def lookup(self, list_name: str, label: Any) -> str | None:
        return self.by_list_and_label.get((list_name, normalize_label(label)))

    def find_contains(self, list_name: str, label: Any) -> str | None:
        normalized = normalize_label(label)
        for (candidate_list, candidate_label), value in self.by_list_and_label.items():
            if candidate_list != list_name:
                continue
            if candidate_label in normalized or normalized in candidate_label:
                return value
        return None


def normalize_label(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower().replace("\xa0", " ")
    text = normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(text.split())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Carga filas de Excel como submissions en Kobo usando OpenRosa.",
    )
    parser.add_argument("workbook", help="Ruta al archivo .xlsx")
    parser.add_argument("--sheet", help="Nombre de la hoja. Por defecto usa la primera.")
    parser.add_argument("--asset-uid", default=os.getenv("KOBO_ASSET_UID"), help="UID del asset Kobo")
    parser.add_argument("--token", default=os.getenv("KOBO_TOKEN"), help="Token API de Kobo")
    parser.add_argument("--username", default=os.getenv("KOBO_USERNAME"), help="Usuario Kobo")
    parser.add_argument("--password", default=os.getenv("KOBO_PASSWORD"), help="Password Kobo")
    parser.add_argument("--base-url", default=os.getenv("KOBO_BASE_URL", DEFAULT_KOBO_BASE_URL))
    parser.add_argument(
        "--submission-url",
        default=os.getenv("KOBO_SUBMISSION_URL", DEFAULT_OPENROSA_URL),
        help="Endpoint OpenRosa submission",
    )
    parser.add_argument(
        "--form-version",
        default=os.getenv("KOBO_FORM_VERSION", DEFAULT_FORM_VERSION),
        help="Version exacta del form en KoboCAT",
    )
    parser.add_argument("--limit", type=int, help="Limita la cantidad de filas a procesar")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Si se incluye, envía las submissions. Sin esto solo hace validación.",
    )
    return parser.parse_args()


def require_args(args: argparse.Namespace) -> None:
    missing = []
    for field in ("asset_uid", "token", "username", "password"):
        if not getattr(args, field):
            missing.append(field)
    if missing:
        raise SystemExit(f"Faltan argumentos requeridos: {', '.join(missing)}")


def load_choice_index(base_url: str, asset_uid: str, token: str) -> ChoiceIndex:
    response = requests.get(
        f"{base_url}/api/v2/assets/{asset_uid}/",
        headers={"Authorization": f"Token {token}"},
        timeout=30,
    )
    response.raise_for_status()
    asset = response.json()
    index: dict[tuple[str, str], str] = {}
    for choice in asset["content"]["choices"]:
        label = choice["label"][1] if isinstance(choice.get("label"), list) else choice.get("label")
        index[(choice["list_name"], normalize_label(label))] = choice["name"]
    return ChoiceIndex(index)


def load_rows(workbook_path: str, sheet_name: str | None) -> list[dict[str, Any]]:
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    worksheet = workbook[sheet_name or workbook.sheetnames[0]]
    header_row = next(worksheet.iter_rows(min_row=1, max_row=1, values_only=True))
    headers = [str(value).strip() if value is not None else "" for value in header_row]
    rows: list[dict[str, Any]] = []
    for row in worksheet.iter_rows(min_row=2, values_only=True):
        if not any(value not in (None, "") for value in row):
            continue
        rows.append(dict(zip(headers, row)))
    return rows


def build_submission_payload(
    row: dict[str, Any],
    choice_index: ChoiceIndex,
    asset_uid: str,
    form_version: str,
    username: str,
) -> tuple[str | None, list[str]]:
    mapped = {
        "direccion": choice_index.lookup("direccion", row.get("Direccion")),
        "agencia": choice_index.lookup("agencia", row.get("Agencia")),
        "act_general": choice_index.lookup("act_general", row.get("Act. General")),
        "act_especifica": choice_index.find_contains("act_especifica", row.get("Act. Especifica")),
        "actividad": choice_index.lookup("actividad", row.get("Actividad")) or "",
        "es_primaria": "si" if normalize_label(row.get("Es Primaria")) in {"si", "sí", "true"} else "no",
        "area_ha": row.get("Area Ha"),
        "tipo_identificacion": choice_index.lookup("tipo_identificacion", row.get("Tipo Identificacion")),
        "tenencia": choice_index.lookup("tenencia", row.get("Tenencia")),
        "activo": "si" if bool(row.get("Activo")) else "no",
        "tipo_pympa": choice_index.lookup("tipo_pympa", row.get("Tipo PYMPA")),
        "sexo": choice_index.lookup("sexo", row.get("Sexo")),
        "poblacion": choice_index.lookup("poblacion", row.get("Poblacion")) or "",
        "provincia": choice_index.lookup("provincia", row.get("Provincia")),
        "canton": choice_index.lookup("canton", row.get("Canton")),
        "distrito": choice_index.lookup("distrito", row.get("Distrito")),
        "referencia_direccion": str(row.get("Direccion") or ""),
        "latitud": row.get("Latitud"),
        "longitud": row.get("Longitud"),
    }
    required = (
        "direccion",
        "agencia",
        "act_general",
        "act_especifica",
        "area_ha",
        "tipo_identificacion",
        "tenencia",
        "tipo_pympa",
        "sexo",
        "provincia",
        "canton",
        "distrito",
        "latitud",
        "longitud",
    )
    missing = [field for field in required if mapped.get(field) in (None, "")]
    if missing:
        return None, missing

    now = datetime.now(timezone(timedelta(hours=-6)))
    instance_id = f"uuid:{uuid.uuid4()}"
    geopoint = f"{mapped['latitud']} {mapped['longitud']} 0 0"
    xml = f"""<?xml version="1.0"?>
<{asset_uid} id="{asset_uid}" version="{escape(form_version)}">
  <start>{now.isoformat(timespec='milliseconds')}</start>
  <end>{(now + timedelta(minutes=2)).isoformat(timespec='milliseconds')}</end>
  <fecha_registro>{now.date().isoformat()}</fecha_registro>
  <deviceid>excel-loader</deviceid>
  <usuario>{escape(username)}</usuario>
  <identificacion>
    <direccion>{mapped['direccion']}</direccion>
    <agencia>{mapped['agencia']}</agencia>
    <act_general>{mapped['act_general']}</act_general>
    <act_especifica>{mapped['act_especifica']}</act_especifica>
    <actividad>{mapped['actividad']}</actividad>
    <es_primaria>{mapped['es_primaria']}</es_primaria>
    <area_ha>{mapped['area_ha']}</area_ha>
    <tipo_identificacion>{mapped['tipo_identificacion']}</tipo_identificacion>
    <tenencia>{mapped['tenencia']}</tenencia>
    <activo>{mapped['activo']}</activo>
    <tipo_pympa>{mapped['tipo_pympa']}</tipo_pympa>
    <sexo>{mapped['sexo']}</sexo>
    <poblacion>{mapped['poblacion']}</poblacion>
    <observaciones>carga demo excel</observaciones>
  </identificacion>
  <ubicacion_admin>
    <provincia>{mapped['provincia']}</provincia>
    <canton>{mapped['canton']}</canton>
    <distrito>{mapped['distrito']}</distrito>
    <referencia_direccion>{escape(mapped['referencia_direccion'])}</referencia_direccion>
  </ubicacion_admin>
  <ubicacion_gps>
    <ubicacion>{geopoint}</ubicacion>
    <latitud/>
    <longitud/>
    <nota_validacion/>
  </ubicacion_gps>
  <meta>
    <instanceID>{instance_id}</instanceID>
    <instanceName></instanceName>
  </meta>
</{asset_uid}>"""
    return xml, []


def submit_xml(submission_url: str, username: str, password: str, xml: str) -> requests.Response:
    return requests.post(
        submission_url,
        files={"xml_submission_file": ("submission.xml", xml, "text/xml")},
        auth=HTTPBasicAuth(username, password),
        timeout=30,
    )


def main() -> int:
    args = parse_args()
    require_args(args)
    choice_index = load_choice_index(args.base_url, args.asset_uid, args.token)
    rows = load_rows(args.workbook, args.sheet)
    if args.limit:
        rows = rows[: args.limit]

    total = len(rows)
    valid = 0
    sent = 0
    failed = 0
    print(f"Filas leidas: {total}")
    print(f"Modo: {'envio real' if args.execute else 'dry-run'}")

    for index, row in enumerate(rows, start=1):
        xml, missing = build_submission_payload(
            row=row,
            choice_index=choice_index,
            asset_uid=args.asset_uid,
            form_version=args.form_version,
            username=args.username,
        )
        if missing:
            failed += 1
            print(
                f"[fila {index}] invalida: faltan o no mapean {', '.join(missing)} | "
                f"agencia={row.get('Agencia')} provincia={row.get('Provincia')}"
            )
            continue

        valid += 1
        if not args.execute:
            print(
                f"[fila {index}] valida | agencia={row.get('Agencia')} "
                f"actividad={row.get('Actividad')} provincia={row.get('Provincia')}"
            )
            continue

        response = submit_xml(args.submission_url, args.username, args.password, xml)
        if response.status_code == 201:
            sent += 1
            print(f"[fila {index}] enviada correctamente")
            continue

        failed += 1
        print(f"[fila {index}] error {response.status_code}: {response.text[:300]}")

    print(
        "Resumen: "
        f"total={total} validas={valid} enviadas={sent} fallidas={failed}"
    )
    return 0 if failed == 0 or (not args.execute and valid > 0) else 1


if __name__ == "__main__":
    sys.exit(main())
