from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import StageOutcome
from app.schemas.common import NonBlankStr, reject_null


class StageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    name: str
    scheduled_at: datetime | None
    outcome: StageOutcome
    notes: str | None
    position: int
    created_at: datetime


class StageCreate(BaseModel):
    name: NonBlankStr
    scheduled_at: datetime | None = None
    outcome: StageOutcome = StageOutcome.PENDING
    notes: str | None = None


class StageUpdate(BaseModel):
    name: NonBlankStr | None = None
    scheduled_at: datetime | None = None
    outcome: StageOutcome | None = None
    notes: str | None = None

    _no_null = field_validator("name", "outcome")(reject_null)


class StageMove(BaseModel):
    direction: Literal["up", "down"]
