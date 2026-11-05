from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clock import as_utc
from app.errors import NotFoundError
from app.models import Account, Application, InterviewStage
from app.schemas.interview_stage import (
    StageCreate,
    StageUpdate,
    UpcomingStageSummary,
)
from app.services.activity import record_activity
from app.services.application_service import ApplicationService

UPCOMING_WINDOW = timedelta(days=7)


def to_utc(value: datetime | None, timezone: str) -> datetime | None:
    """Naive wire datetimes are in the account's time zone; aware ones are converted."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo(timezone))
    return value.astimezone(UTC)


class StageService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.applications = ApplicationService(db)

    async def upcoming(
        self, account_id: int, now: datetime
    ) -> list[UpcomingStageSummary]:
        result = await self.db.execute(
            select(InterviewStage)
            .join(Application)
            .where(
                Application.account_id == account_id,
                InterviewStage.scheduled_at >= now,
                InterviewStage.scheduled_at < now + UPCOMING_WINDOW,
            )
            .options(
                selectinload(InterviewStage.application).selectinload(
                    Application.company
                )
            )
            .order_by(InterviewStage.scheduled_at.asc(), InterviewStage.id.asc())
        )
        return [
            UpcomingStageSummary(
                application_id=s.application_id,
                company=s.application.company.name,
                role_title=s.application.role_title,
                stage_name=s.name,
                scheduled_at=as_utc(s.scheduled_at),
            )
            for s in result.scalars()
        ]

    async def create(
        self, account: Account, application_id: int, payload: StageCreate
    ) -> InterviewStage:
        application = await self.applications.get_detail(account.id, application_id)
        stage = InterviewStage(
            application_id=application.id,
            name=payload.name,
            scheduled_at=to_utc(payload.scheduled_at, account.timezone),
            outcome=payload.outcome,
            notes=payload.notes,
            position=len(application.stages),
        )
        application.stages.append(stage)
        record_activity(application)
        await self.db.commit()
        await self.db.refresh(stage)
        return stage

    async def update(
        self, account: Account, application_id: int, stage_id: int, payload: StageUpdate
    ) -> InterviewStage:
        application = await self.applications.get_detail(account.id, application_id)
        stage = self._find(application, stage_id)
        changes = payload.model_dump(exclude_unset=True)
        if "scheduled_at" in changes:
            changes["scheduled_at"] = to_utc(changes["scheduled_at"], account.timezone)
        for field, value in changes.items():
            setattr(stage, field, value)
        record_activity(application)
        await self.db.commit()
        await self.db.refresh(stage)
        return stage

    async def delete(self, account_id: int, application_id: int, stage_id: int) -> None:
        application = await self.applications.get_detail(account_id, application_id)
        stage = self._find(application, stage_id)
        application.stages.remove(stage)  # delete-orphan removes the row
        self._renumber(application)
        record_activity(application)
        await self.db.commit()

    async def move(
        self,
        account_id: int,
        application_id: int,
        stage_id: int,
        direction: Literal["up", "down"],
    ) -> list[InterviewStage]:
        application = await self.applications.get_detail(account_id, application_id)
        stage = self._find(application, stage_id)
        stages = application.stages
        index = stages.index(stage)
        target = index - 1 if direction == "up" else index + 1
        if 0 <= target < len(stages):
            # Swap `position` values in place rather than reordering the
            # relationship-backed list: reassigning list items triggers
            # remove/append events that (with cascade="all, delete-orphan")
            # can orphan and delete a stage still meant to stay linked.
            stages[index].position, stages[target].position = (
                stages[target].position,
                stages[index].position,
            )
            record_activity(application)
            await self.db.commit()
        return sorted(application.stages, key=lambda s: s.position)

    @staticmethod
    def _find(application: Application, stage_id: int) -> InterviewStage:
        for stage in application.stages:
            if stage.id == stage_id:
                return stage
        raise NotFoundError("Interview stage not found")

    @staticmethod
    def _renumber(application: Application) -> None:
        for position, stage in enumerate(application.stages):
            stage.position = position
