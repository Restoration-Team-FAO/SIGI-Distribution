from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.db import fetch_one
from app.core.settings import settings
from app.services.odoo_connector import (
    OdooSyncError,
    preview_odoo_sync,
    test_odoo_connection,
    upsert_odoo_projects,
)

router = APIRouter()


class OdooConnectionTestRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceId: str | None = Field(default=None, validation_alias='source_id')
    baseUrl: str | None = Field(default=None, validation_alias='base_url')
    databaseName: str | None = Field(default=None, validation_alias='database_name')
    username: str | None = None
    password: str | None = None


class OdooPreviewRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceId: str = Field(..., min_length=1, validation_alias='source_id')
    institutionLimit: int | None = Field(default=None, validation_alias='institution_limit')
    institutionCodes: list[str] = Field(default_factory=list, validation_alias='institution_codes')


class OdooProjectUpsertRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    projectCode: str = Field(..., min_length=1, validation_alias='project_code')
    projectName: str | None = Field(default=None, validation_alias='project_name')
    startDate: str | None = Field(default=None, validation_alias='start_date')
    endDate: str | None = Field(default=None, validation_alias='end_date')
    totalAreaHa: float | None = Field(default=None, validation_alias='total_area_ha')
    status: str | None = None


class OdooProjectsUpsertRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceId: str = Field(..., min_length=1, validation_alias='source_id')
    projects: list[OdooProjectUpsertRow] = Field(default_factory=list)
    dryRun: bool = Field(default=False, validation_alias='dry_run')


@router.post('/test-connection')
async def test_connection(payload: OdooConnectionTestRequest):
    credentials: dict[str, Any] = {}

    if payload.sourceId:
        stored = _load_source_credentials(payload.sourceId)
        if not stored:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Odoo source config not found',
            )
        credentials.update(stored)

    if payload.baseUrl:
        credentials['base_url'] = payload.baseUrl.strip()
    if payload.databaseName:
        credentials['database_name'] = payload.databaseName.strip()
    if payload.username:
        credentials['username'] = payload.username.strip()
    if payload.password:
        credentials['password'] = payload.password

    required = ['base_url', 'database_name', 'username', 'password']
    missing = [field for field in required if not credentials.get(field)]
    if missing and not settings.odoo_mock_mode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Faltan credenciales Odoo: {", ".join(missing)}',
        )

    try:
        return test_odoo_connection(
            credentials=credentials if credentials else None,
            source_id=payload.sourceId,
        )
    except OdooSyncError as error:
        return {
            'ok': False,
            'mode': 'live',
            'message': str(error),
            'sourceId': payload.sourceId,
        }
    except Exception as error:
        return {
            'ok': False,
            'mode': 'live',
            'message': f'Error inesperado al probar conexión Odoo: {error}',
            'sourceId': payload.sourceId,
        }


@router.post('/preview')
async def preview(payload: OdooPreviewRequest):
    if payload.institutionLimit is not None and payload.institutionLimit <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='institutionLimit debe ser mayor que 0',
        )

    source_config = _load_source_config(payload.sourceId)
    if not source_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Odoo source config not found',
        )

    credentials = _load_source_credentials(payload.sourceId)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Odoo credentials not found',
        )

    try:
        return preview_odoo_sync(
            source_id=payload.sourceId,
            connector_config=source_config.get('connector_config') or {},
            credentials=credentials,
            selection_options={
                'institutionLimit': payload.institutionLimit,
                'institutionCodes': payload.institutionCodes,
            },
        )
    except OdooSyncError as error:
        return {
            'ok': False,
            'mode': 'live',
            'message': str(error),
            'sourceId': payload.sourceId,
            'institutionsFound': 0,
            'institutionsSelected': 0,
            'institutionCodesSelected': [],
            'projectsEstimated': 0,
            'selectionApplied': False,
        }
    except Exception as error:
        return {
            'ok': False,
            'mode': 'live',
            'message': f'Error inesperado en previsualización Odoo: {error}',
            'sourceId': payload.sourceId,
            'institutionsFound': 0,
            'institutionsSelected': 0,
            'institutionCodesSelected': [],
            'projectsEstimated': 0,
            'selectionApplied': False,
        }


@router.post('/projects/upsert')
async def upsert_projects(payload: OdooProjectsUpsertRequest):
    source_config = _load_source_config(payload.sourceId)
    if not source_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Odoo source config not found',
        )

    credentials = _load_source_credentials(payload.sourceId)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Odoo credentials not found',
        )

    try:
        return upsert_odoo_projects(
            source_id=payload.sourceId,
            connector_config=source_config.get('connector_config') or {},
            credentials=credentials,
            projects=[project.model_dump(by_alias=True) for project in payload.projects],
            dry_run=payload.dryRun,
        )
    except OdooSyncError as error:
        return {
            'ok': False,
            'mode': 'live',
            'sourceId': payload.sourceId,
            'message': str(error),
            'totals': {
                'received': len(payload.projects),
                'created': 0,
                'existing': 0,
                'failed': len(payload.projects),
            },
            'createdProjectCodes': [],
            'existingProjectCodes': [],
            'failedRows': [
                {
                    'projectCode': project.projectCode,
                    'error': str(error),
                }
                for project in payload.projects
            ],
        }
    except Exception as error:
        return {
            'ok': False,
            'mode': 'live',
            'sourceId': payload.sourceId,
            'message': f'Error inesperado en upsert de proyectos Odoo: {error}',
            'totals': {
                'received': len(payload.projects),
                'created': 0,
                'existing': 0,
                'failed': len(payload.projects),
            },
            'createdProjectCodes': [],
            'existingProjectCodes': [],
            'failedRows': [
                {
                    'projectCode': project.projectCode,
                    'error': str(error),
                }
                for project in payload.projects
            ],
        }


def _load_source_credentials(source_id: str) -> dict[str, Any] | None:
    row = fetch_one(
        """
        SELECT
          base_url,
          database_name,
          username,
          pgp_sym_decrypt(password_encrypted, %s) AS password
        FROM integration.odoo_source_configs
        WHERE source_id = %s::uuid
          AND is_active = TRUE
        """,
        (settings.sigi_secrets_key, source_id),
    )
    if not row:
        return None

    return {
        'base_url': row.get('base_url'),
        'database_name': row.get('database_name'),
        'username': row.get('username'),
        'password': row.get('password'),
    }


def _load_source_config(source_id: str) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT
          ds.id AS source_id,
          c.config_json AS connector_config
        FROM core.data_sources ds
        INNER JOIN core.connectors c
          ON c.id = ds.connector_id
        WHERE ds.id = %s::uuid
        """,
        (source_id,),
    )
