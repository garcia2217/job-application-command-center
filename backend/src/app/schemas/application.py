from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import ApplicationStatus, WorkArrangement
from app.schemas.common import (
    CurrencyCode,
    HttpUrlStr,
    NonBlankStr,
    OptionalText,
    reject_null,
)
from app.schemas.company import CompanyCreate
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


ApplicationSort = Literal["last_activity", "date_applied"]
SortOrder = Literal["asc", "desc"]


class _ApplicationFields(BaseModel):
    posting_url: HttpUrlStr | None = None
    location: OptionalText = None
    work_arrangement: WorkArrangement | None = None
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)
    salary_currency: CurrencyCode | None = None
    source: OptionalText = None
    date_applied: date | None = None
    notes: str | None = None
    job_description: str | None = None


class ApplicationCreate(_ApplicationFields):
    company_id: int | None = None
    company: CompanyCreate | None = None
    role_title: NonBlankStr
    status: ApplicationStatus = ApplicationStatus.APPLIED
    confirm_duplicate: bool = False

    @model_validator(mode="after")
    def exactly_one_company(self) -> ApplicationCreate:
        if (self.company_id is None) == (self.company is None):
            raise ValueError("Provide exactly one of company_id or company")
        return self


class ApplicationUpdate(_ApplicationFields):
    company_id: int | None = None
    role_title: NonBlankStr | None = None
    status: ApplicationStatus | None = None

    _no_null = field_validator("company_id", "role_title", "status")(reject_null)
