from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
