from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from app.core.observability import render_metrics

router = APIRouter()


@router.get('/', response_class=PlainTextResponse)
async def metrics():
    return render_metrics()
