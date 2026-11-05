from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import CurrentAccountDep, DbDep, DigestServiceDep
from app.models import JobType
from app.schemas.digest import (
    DigestPreviewResponse,
    QuietItemResponse,
    UpcomingStageResponse,
)
from app.schemas.job_run import JobRunResponse, JobRunsResponse
from app.schemas.settings import SettingsResponse, SettingsUpdate
from app.services.job_run_service import latest_run
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/settings", tags=["settings"])


def get_settings_service(db: DbDep) -> SettingsService:
    return SettingsService(db)


SettingsServiceDep = Annotated[SettingsService, Depends(get_settings_service)]


@router.get("", response_model=SettingsResponse)
async def get_settings(account: CurrentAccountDep):
    return account


@router.patch("", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate, account: CurrentAccountDep, service: SettingsServiceDep
):
    return await service.update(account, payload)


@router.get("/job-runs", response_model=JobRunsResponse)
async def get_job_runs(account: CurrentAccountDep, db: DbDep):
    """Latest run of each job: the quiet check is system-wide, the digest per account."""
    quiet = await latest_run(db, JobType.QUIET_CHECK, None)
    digest = await latest_run(db, JobType.DIGEST, account.id)
    return JobRunsResponse(
        quiet_check=JobRunResponse.model_validate(quiet) if quiet else None,
        digest=JobRunResponse.model_validate(digest) if digest else None,
    )


@router.get("/digest-preview", response_model=DigestPreviewResponse)
async def preview_digest(account: CurrentAccountDep, service: DigestServiceDep):
    preview = await service.preview(account)
    return DigestPreviewResponse(
        would_send=preview.would_send,
        skip_reason=preview.skip_reason,
        window_start=preview.content.window_start,
        window_end=preview.content.window_end,
        quiet=[QuietItemResponse.model_validate(q) for q in preview.content.quiet],
        upcoming=[
            UpcomingStageResponse.model_validate(s) for s in preview.content.upcoming
        ],
    )
