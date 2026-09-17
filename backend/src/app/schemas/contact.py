from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.schemas.common import HttpUrlStr, NonBlankStr, OptionalText, reject_null


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    title: str | None
    email: str | None
    linkedin_url: str | None
    notes: str | None
    created_at: datetime


class ContactCreate(BaseModel):
    company_id: int
    name: NonBlankStr
    title: OptionalText = None
    email: EmailStr | None = None
    linkedin_url: HttpUrlStr | None = None
    notes: str | None = None


class ContactUpdate(BaseModel):
    name: NonBlankStr | None = None
    title: OptionalText = None
    email: EmailStr | None = None
    linkedin_url: HttpUrlStr | None = None
    notes: str | None = None

    _no_null = field_validator("name")(reject_null)
