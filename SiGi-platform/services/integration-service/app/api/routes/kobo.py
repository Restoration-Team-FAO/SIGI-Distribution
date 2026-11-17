from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.db import fetch_one
from app.services.kobo_connector import preview_kobo_sync, test_kobo_connection

router = APIRouter()


class KoboConnectionTestRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceId: str | None = Field(default=None, validation_alias='source_id')
    baseUrl: str | None = Field(default=None, validation_alias='base_url')
    token: str | None = None
    assetUid: str | None = Field(default=None, validation_alias='asset_uid')


class KoboPreviewRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceId: str = Field(..., min_length=1, validation_alias='source_id')


@router.post('/test-connection')
async def test_connection(payload: KoboConnectionTestRequest):
    connector_config: dict[str, Any] = {}
    source_config: dict[str, Any] = {}

    if payload.sourceId:
        stored = _load_source_context(payload.sourceId)
        if not stored:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Kobo source config not found',
            )
        connector_config = stored.get('connector_config') or {}
        source_config = stored.get('source_config') or {}

    if payload.baseUrl:
        connector_config['baseUrl'] = payload.baseUrl.strip()
    if payload.token:
        connector_config['credentialSecret'] = payload.token
    if payload.assetUid:
        source_config['assetUid'] = payload.assetUid.strip()

    try:
        return test_kobo_connection(
            connector_config=connector_config,
            source_config=source_config,
            source_id=payload.sourceId,
        )
    except Exception as error:
        return {
            'ok': False,
            'mode': 'live',
            'message': f'No se pudo validar la conexion Kobo: {error}',
            'sourceId': payload.sourceId,
        }


@router.post('/preview')
async def preview(payload: KoboPreviewRequest):
    stored = _load_source_context(payload.sourceId)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Kobo source config not found',
        )

    try:
        return preview_kobo_sync(
            connector_config=stored.get('connector_config') or {},
            source_config=stored.get('source_config') or {},
            source_id=payload.sourceId,
        )
    except Exception as error:
        return {
            'ok': False,
            'mode': 'live',
            'message': f'No se pudo generar la previsualizacion Kobo: {error}',
            'sourceId': payload.sourceId,
            'previewRows': [],
            'geojsonPreview': None,
            'recordsOnFirstPage': 0,
            'hasMore': False,
            'lastSubmissionTime': None,
            'lastSubmissionId': None,
        }


def _load_source_context(source_id: str) -> dict[str, Any] | None:
    row = fetch_one(
        """
        SELECT
          ds.id AS source_id,
          ds.config_json AS source_config,
          c.config_json AS connector_config
        FROM core.data_sources ds
        LEFT JOIN core.connectors c ON c.id = ds.connector_id
        WHERE ds.id = %s::uuid
          AND ds.source_type = 'kobo'
        """,
        (source_id,),
    )
    if row is None:
        return None
    return {
        'source_id': str(row['source_id']),
        'source_config': row['source_config'] or {},
        'connector_config': row['connector_config'] or {},
    }
