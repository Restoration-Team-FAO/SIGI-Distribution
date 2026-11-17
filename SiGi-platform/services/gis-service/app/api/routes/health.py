from fastapi import APIRouter, HTTPException

from app.core.db import fetch_one

router = APIRouter()

@router.get('/')
async def health():
    try:
        fetch_one('SELECT 1 AS ok')
    except Exception as exc:
        raise HTTPException(status_code=503, detail='database unavailable') from exc

    return {'status': 'ok', 'dependencies': {'database': 'ok'}}
