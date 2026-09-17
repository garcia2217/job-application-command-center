from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import StageOutcome


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
