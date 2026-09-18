from datetime import datetime, timedelta

from sqlalchemy import and_, not_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import ACTIVE_STATUSES, Account, Application, JobRun, JobStatus, JobType


class QuietCheckService:
    """PRD F-04: one system-wide daily run that recomputes every account's quiet flags."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def run(self, now: datetime | None = None) -> JobRun:
        now = now or utcnow()
        try:
            flagged = await self._flag_all(now)
            run = JobRun(
                job_type=JobType.QUIET_CHECK,
                account_id=None,
                ran_at=now,
                status=JobStatus.SUCCEEDED,
                detail=f"Flagged {flagged} application(s)",
            )
            self.db.add(run)
            await self.db.commit()
        except Exception as exc:  # noqa: BLE001 -- job routes must record any failure, not raise
            # AC-04.7: previous flags survive; the failure itself is recorded.
            await self.db.rollback()
            run = JobRun(
                job_type=JobType.QUIET_CHECK,
                account_id=None,
                ran_at=now,
                status=JobStatus.FAILED,
                detail=f"{type(exc).__name__}: {exc}"[:500],
            )
            self.db.add(run)
            await self.db.commit()
        await self.db.refresh(run)
        return run

    async def _flag_all(self, now: datetime) -> int:
        accounts = (await self.db.execute(select(Account))).scalars().all()
        flagged = 0
        for account in accounts:
            cutoff = now - timedelta(days=account.quiet_threshold_days)
            is_quiet_now = and_(
                Application.account_id == account.id,
                Application.status.in_(list(ACTIVE_STATUSES)),
                Application.last_activity_at <= cutoff,
            )
            result = await self.db.execute(
                update(Application)
                .where(is_quiet_now)
                .values(is_quiet=True)
                .execution_options(synchronize_session="fetch")
            )
            flagged += result.rowcount
            await self.db.execute(
                update(Application)
                .where(Application.account_id == account.id, not_(is_quiet_now))
                .values(is_quiet=False)
                .execution_options(synchronize_session="fetch")
            )
        return flagged
