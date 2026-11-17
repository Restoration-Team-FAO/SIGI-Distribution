from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.services.sync_jobs import create_job, get_job, list_jobs, run_job

router = APIRouter()


class SyncRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    platformJobId: str = Field(..., min_length=1)
    institutionId: str = Field(..., min_length=1)
    connectorId: str = Field(..., min_length=1)
    connectorType: Literal['kobo', 'odoo', 'excel', 'postgis', 'api'] = Field(
        default='kobo',
        validation_alias='connector_type',
    )
    triggeredBy: Literal['user', 'scheduler'] = Field(default='user')
    mode: Literal['incremental', 'full'] = Field(default='incremental')
    source: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)


@router.post('/', status_code=status.HTTP_202_ACCEPTED)
async def submit_sync_job(
    payload: SyncRequest,
    background_tasks: BackgroundTasks,
):
    job = create_job(payload.model_dump())
    background_tasks.add_task(run_job, job['job_id'])
    return {
        'job_id': job['job_id'],
        'status': job['status'],
        'status_url': f"/sync/{job['job_id']}",
    }


@router.get('/')
async def sync_jobs():
    return {'jobs': list_jobs()}


@router.get(
    '/{job_id}',
    responses={404: {'description': 'Sync job not found'}},
)
async def sync_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Sync job not found')
    return job
