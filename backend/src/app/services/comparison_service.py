from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clock import as_utc, utcnow
from app.comparison import ComparisonResult, compare
from app.errors import ConflictError, ErrorCode, NotFoundError
from app.models import Account, Application, Comparison

_BLOCKED: dict[str, tuple[ErrorCode, str]] = {
    "no_resume": (ErrorCode.RESUME_REQUIRED, "Add your resume in Settings first."),
    "no_job_description": (
        ErrorCode.JOB_DESCRIPTION_REQUIRED,
        "Paste the job description first.",
    ),
}


@dataclass(frozen=True)
class ComparisonView:
    matched: list[str]
    missing: list[str]
    requirement_count: int
    match_percentage: int | None
    ran_at: datetime
    is_stale: bool


@dataclass(frozen=True)
class ComparisonState:
    blocked_reason: str | None
    comparison: ComparisonView | None


def _blank(text: str | None) -> bool:
    return text is None or not text.strip()


def blocked_reason(account: Account, application: Application) -> str | None:
    if _blank(account.resume_tex):
        return "no_resume"
    if _blank(application.job_description):
        return "no_job_description"
    return None


def _changed_after(edited_at: datetime | None, ran_at: datetime) -> bool:
    return edited_at is not None and as_utc(edited_at) > as_utc(ran_at)


class ComparisonService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def state(self, account: Account, application_id: int) -> ComparisonState:
        application = await self._load(account.id, application_id)
        return self._state(account, application)

    async def run(self, account: Account, application_id: int) -> ComparisonState:
        application = await self._load(account.id, application_id)
        reason = blocked_reason(account, application)
        if reason is not None:
            code, message = _BLOCKED[reason]
            raise ConflictError(message, code=code)
        result = compare(account.resume_tex or "", application.job_description or "")
        try:
            self._store(application, result)
            await self.db.commit()
        except IntegrityError:
            # A concurrent first run inserted the row; store again as an update.
            await self.db.rollback()
            await self.db.refresh(account)  # rollback expired it; no lazy IO in async
            application = await self._load(account.id, application_id)
            self._store(application, result)
            await self.db.commit()
        return self._state(account, application)

    def _store(self, application: Application, result: ComparisonResult) -> None:
        row = application.comparison
        if row is None:
            row = Comparison(application_id=application.id)
            application.comparison = row
        row.matched_terms = result.matched
        row.missing_terms = result.missing
        row.match_percentage = result.match_percentage
        row.ran_at = utcnow()

    def _state(self, account: Account, application: Application) -> ComparisonState:
        row = application.comparison
        view = None
        if row is not None:
            view = ComparisonView(
                matched=list(row.matched_terms),
                missing=list(row.missing_terms),
                requirement_count=len(row.matched_terms) + len(row.missing_terms),
                match_percentage=row.match_percentage,
                ran_at=as_utc(row.ran_at),
                is_stale=_changed_after(account.resume_updated_at, row.ran_at)
                or _changed_after(application.job_description_updated_at, row.ran_at),
            )
        return ComparisonState(blocked_reason(account, application), view)

    async def _load(self, account_id: int, application_id: int) -> Application:
        result = await self.db.execute(
            select(Application)
            .where(
                Application.id == application_id,
                Application.account_id == account_id,
            )
            .options(selectinload(Application.comparison))
            .execution_options(populate_existing=True)
        )
        application = result.scalar_one_or_none()
        if application is None:
            raise NotFoundError("Application not found")
        return application
