from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ApplicationStatus, WorkArrangement
from app.schemas.contact import ContactResponse
from app.schemas.interview_stage import StageResponse


class _CompanyRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ApplicationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company: _CompanyRef
    role_title: str
    status: ApplicationStatus
    date_applied: date | None
    last_activity_at: datetime
    is_quiet: bool


class ApplicationResponse(ApplicationSummary):
    posting_url: str | None
    location: str | None
    work_arrangement: WorkArrangement | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    source: str | None
    notes: str | None
    job_description: str | None
    created_at: datetime


class ApplicationDetailResponse(ApplicationResponse):
    stages: list[StageResponse]
    contacts: list[ContactResponse]
