from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clock import as_utc, utcnow, whole_days_between
from app.config import Settings
from app.integrations.email import EmailSender, EmailSendError
from app.integrations.rate_limit import RateLimiter
from app.models import (
    Account,
    Application,
    ApplicationStatus,
    InterviewStage,
    JobRun,
    JobStatus,
    JobType,
)
from app.services.digest_render import render_digest
from app.services.job_run_service import latest_run

DIGEST_HOUR = 8
DIGEST_WINDOW = timedelta(days=7)

SKIP_DEMO = "Skipped: demo account"
SKIP_EMPTY = "Skipped: nothing to report"
SKIP_ALREADY_SENT = "Already sent this week"
NOT_SENT_LIMIT = "Not sent: daily email limit reached"


def week_anchor(timezone: str, now: datetime) -> datetime:
    """Most recent Monday 08:00 in `timezone` at or before `now`, as aware UTC.

    The digest for a week is due once `now` passes its anchor; a run recorded at
    or after the anchor means that week is done (PRD F-05: once per Monday, late
    runs still send).
    """
    zone = ZoneInfo(timezone)
    local = as_utc(now).astimezone(zone)
    monday = (local - timedelta(days=local.weekday())).date()
    anchor = datetime.combine(monday, time(DIGEST_HOUR), tzinfo=zone)
    if anchor > local:
        anchor = datetime.combine(
            monday - timedelta(days=7), time(DIGEST_HOUR), tzinfo=zone
        )
    return anchor.astimezone(UTC)


@dataclass(frozen=True)
class QuietItem:
    application_id: int
    company: str
    role_title: str
    status: ApplicationStatus
    days_since_activity: int
    url: str


@dataclass(frozen=True)
class UpcomingStageItem:
    application_id: int
    company: str
    role_title: str
    stage_name: str
    scheduled_at: datetime
    url: str


@dataclass(frozen=True)
class DigestContent:
    window_start: datetime
    window_end: datetime
    quiet: list[QuietItem]
    upcoming: list[UpcomingStageItem]

    @property
    def is_empty(self) -> bool:
        return not self.quiet and not self.upcoming


@dataclass(frozen=True)
class DigestPreview:
    content: DigestContent
    would_send: bool
    skip_reason: str | None


class DigestService:
    def __init__(
        self,
        db: AsyncSession,
        settings: Settings,
        sender: EmailSender,
        limiter: RateLimiter,
    ) -> None:
        self.db = db
        self.settings = settings
        self.sender = sender
        self.limiter = limiter

    async def build(self, account: Account, now: datetime) -> DigestContent:
        start = week_anchor(account.timezone, now)
        end = start + DIGEST_WINDOW
        quiet_rows = await self.db.execute(
            select(Application)
            .where(Application.account_id == account.id, Application.is_quiet.is_(True))
            .options(selectinload(Application.company))
            .order_by(Application.last_activity_at.asc(), Application.id.asc())
        )
        quiet = [
            QuietItem(
                application_id=a.id,
                company=a.company.name,
                role_title=a.role_title,
                status=a.status,
                days_since_activity=whole_days_between(a.last_activity_at, now),
                url=self._url(a.id),
            )
            for a in quiet_rows.scalars()
        ]
        stage_rows = await self.db.execute(
            select(InterviewStage)
            .join(Application)
            .where(
                Application.account_id == account.id,
                InterviewStage.scheduled_at >= start,
                InterviewStage.scheduled_at < end,
            )
            .options(
                selectinload(InterviewStage.application).selectinload(
                    Application.company
                )
            )
            .order_by(InterviewStage.scheduled_at.asc(), InterviewStage.id.asc())
        )
        upcoming = [
            UpcomingStageItem(
                application_id=s.application_id,
                company=s.application.company.name,
                role_title=s.application.role_title,
                stage_name=s.name,
                scheduled_at=as_utc(s.scheduled_at),
                url=self._url(s.application_id),
            )
            for s in stage_rows.scalars()
        ]
        return DigestContent(
            window_start=start, window_end=end, quiet=quiet, upcoming=upcoming
        )

    async def run(self, now: datetime | None = None) -> list[JobRun]:
        """Hourly trigger: send to every account whose week is due and unsent."""
        now = now or utcnow()
        accounts = (
            (await self.db.execute(select(Account).order_by(Account.id)))
            .scalars()
            .all()
        )
        runs: list[JobRun] = []
        for account in accounts:
            run = await self._run_for(account, now)
            if run is not None:
                runs.append(run)
        return runs

    async def preview(
        self, account: Account, now: datetime | None = None
    ) -> DigestPreview:
        """What a send right now would contain (AC-05.8); touches no provider."""
        now = now or utcnow()
        content = await self.build(account, now)
        if account.is_demo:
            reason: str | None = SKIP_DEMO
        elif content.is_empty:
            reason = SKIP_EMPTY
        elif await self._already_ran(account, now):
            reason = SKIP_ALREADY_SENT
        else:
            reason = None
        return DigestPreview(
            content=content, would_send=reason is None, skip_reason=reason
        )

    async def _run_for(self, account: Account, now: datetime) -> JobRun | None:
        if await self._already_ran(account, now):
            return None
        status, detail = await self._deliver(account, now)
        run = JobRun(
            job_type=JobType.DIGEST,
            account_id=account.id,
            ran_at=now,
            status=status,
            detail=detail[:500],
        )
        self.db.add(run)
        await self.db.commit()  # per account, so one failure never blocks the next
        await self.db.refresh(run)
        return run

    async def _already_ran(self, account: Account, now: datetime) -> bool:
        latest = await latest_run(self.db, JobType.DIGEST, account.id)
        return latest is not None and as_utc(latest.ran_at) >= week_anchor(
            account.timezone, now
        )

    async def _deliver(self, account: Account, now: datetime) -> tuple[JobStatus, str]:
        if account.is_demo:
            return JobStatus.SKIPPED, SKIP_DEMO
        content = await self.build(account, now)
        if content.is_empty:
            return JobStatus.SKIPPED, SKIP_EMPTY
        if not await self.limiter.try_acquire(as_utc(now).date()):
            return JobStatus.NOT_SENT, NOT_SENT_LIMIT
        subject, html, text = render_digest(content, account.timezone)
        try:
            await self.sender.send(
                to=account.email, subject=subject, html=html, text=text
            )
        except EmailSendError as exc:
            return JobStatus.FAILED, f"Failed: {exc}"
        return JobStatus.SUCCEEDED, f"Sent to {account.email}"

    def _url(self, application_id: int) -> str:
        return f"{self.settings.app_base_url}/applications/{application_id}"
