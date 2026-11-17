from fastapi import Depends, FastAPI
from app.api.routes.health import router as health_router
from app.api.routes.geometry import router as geometry_router
from app.api.routes.metrics import router as metrics_router
from app.api.routes.shapefile import router as shapefile_router
from app.core.observability import log_request, log_startup_event
from app.core.security import require_internal_service_auth
from app.core.settings import settings

app = FastAPI(title='GIS Service')

app.middleware('http')(log_request)
app.include_router(health_router, prefix='/health')
app.include_router(
    geometry_router,
    prefix='/geometry',
    dependencies=[Depends(require_internal_service_auth)],
)
app.include_router(
    metrics_router,
    prefix='/metrics',
    dependencies=[Depends(require_internal_service_auth)],
)
app.include_router(
    shapefile_router,
    prefix='/shapefile',
    dependencies=[Depends(require_internal_service_auth)],
)

log_startup_event(
    service_name=settings.service_name,
    log_level=settings.log_level,
    timeout_ms=settings.http_client_timeout_ms,
    max_retries=settings.http_client_max_retries,
)

@app.get('/')
def root():
    return {'service': 'gis-service'}
