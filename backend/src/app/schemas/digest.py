from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ApplicationStatus


class QuietItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    application_id: int
    company: str
    role_title: str
    status: ApplicationStatus
    days_since_activity: int
    url: str


class UpcomingStageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    application_id: int
    company: str
    role_title: str
    stage_name: str
    scheduled_at: datetime
    url: str


class DigestPreviewResponse(BaseModel):
    """Exactly what a send right now would contain (PRD F-05, AC-05.8)."""

    would_send: bool
    skip_reason: str | None
    window_start: datetime
    window_end: datetime
    quiet: list[QuietItemResponse]
    upcoming: list[UpcomingStageResponse]
