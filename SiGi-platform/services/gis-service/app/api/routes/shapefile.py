from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.shapefile_ingest import (
    ShapefileIngestError,
    parse_mapping_json,
    preview_shapefile_zip,
    transform_shapefile_zip,
)

router = APIRouter()


@router.post('/preview')
async def preview(
    file: UploadFile = File(...),
    mappingJson: str | None = Form(default=None),
    country: str | None = Form(default=None),
    importMode: str | None = Form(default=None),
):
    try:
        payload = await file.read()
        mapping = parse_mapping_json(mappingJson)
        return preview_shapefile_zip(
            archive_bytes=payload,
            file_name=file.filename or 'shapefile.zip',
            mapping=mapping,
            country=country,
            import_mode=importMode,
        )
    except ShapefileIngestError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f'Error inesperado al inspeccionar shapefile: {error}',
        ) from error


@router.post('/transform')
async def transform(
    file: UploadFile = File(...),
    mappingJson: str | None = Form(default=None),
    country: str | None = Form(default=None),
    importMode: str | None = Form(default=None),
):
    try:
        payload = await file.read()
        mapping = parse_mapping_json(mappingJson)
        return transform_shapefile_zip(
            archive_bytes=payload,
            file_name=file.filename or 'shapefile.zip',
            mapping=mapping,
            country=country,
            import_mode=importMode,
        )
    except ShapefileIngestError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f'Error inesperado al transformar shapefile: {error}',
        ) from error
