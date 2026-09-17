from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.common import HttpUrlStr, NonBlankStr, reject_null


class CompanyCreate(BaseModel):
    name: NonBlankStr
    website: HttpUrlStr | None = None
    notes: str | None = None


class CompanyUpdate(BaseModel):
    name: NonBlankStr | None = None
    website: HttpUrlStr | None = None
    notes: str | None = None

    _no_null = field_validator("name")(reject_null)


class CompanySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class CompanyResponse(CompanySummary):
    website: str | None
    notes: str | None
    created_at: datetime
