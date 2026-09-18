from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import JobRun, JobType


async def latest_run(
    db: AsyncSession, job_type: JobType, account_id: int | None
) -> JobRun | None:
    """Most recent run of `job_type`; `account_id=None` means the system-wide run."""
    query = select(JobRun).where(JobRun.job_type == job_type)
    if account_id is None:
        query = query.where(JobRun.account_id.is_(None))
    else:
        query = query.where(JobRun.account_id == account_id)
    query = query.order_by(JobRun.ran_at.desc(), JobRun.id.desc()).limit(1)
    return (await db.execute(query)).scalar_one_or_none()
