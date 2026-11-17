from fastapi import Depends, FastAPI
from app.api.routes.health import router as health_router
from app.api.routes.kobo import router as kobo_router
from app.api.routes.metrics import router as metrics_router
from app.api.routes.odoo import router as odoo_router
from app.api.routes.sync import router as sync_router
from app.core.observability import log_request, log_startup_event
from app.core.security import require_internal_service_auth
from app.core.settings import settings

app = FastAPI(title='Integration Service')

app.middleware('http')(log_request)
app.include_router(health_router, prefix='/health')
app.include_router(
    metrics_router,
    prefix='/metrics',
    dependencies=[Depends(require_internal_service_auth)],
)
app.include_router(
    sync_router,
    prefix='/sync',
    dependencies=[Depends(require_internal_service_auth)],
)
app.include_router(
    odoo_router,
    prefix='/odoo',
    dependencies=[Depends(require_internal_service_auth)],
)
app.include_router(
    kobo_router,
    prefix='/kobo',
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
    return {'service': 'integration-service'}
