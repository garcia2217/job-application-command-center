from fastapi import APIRouter, Depends

from app.dependencies import DbDep, DigestServiceDep
from app.integrations.qstash import verify_qstash_signature
from app.schemas.job_run import JobRunResponse
from app.services.quiet_check_service import QuietCheckService

router = APIRouter(
    prefix="/jobs", tags=["jobs"], dependencies=[Depends(verify_qstash_signature)]
)


@router.post("/quiet-check", response_model=JobRunResponse)
async def run_quiet_check(db: DbDep):
    """Triggered daily by a QStash schedule (see scripts/register_schedules.py)."""
    return await QuietCheckService(db).run()


@router.post("/digest", response_model=list[JobRunResponse])
async def run_digest(service: DigestServiceDep):
    """Triggered hourly by QStash; each account decides for itself whether it is due."""
    return await service.run()
