from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

from app.schemas.auth import AccountResponse
from app.schemas.common import TimezoneName, reject_null

RESUME_MAX_CHARS = 50_000


def _resume_within_limit(value: str) -> str:
    if len(value) > RESUME_MAX_CHARS:
        raise PydanticCustomError(
            "resume_too_long", "Resume must be 50,000 characters or fewer"
        )
    return value


ResumeTex = Annotated[str, AfterValidator(_resume_within_limit)]


class SettingsUpdate(BaseModel):
    """PATCH: omitted fields are untouched; null is rejected (columns are NOT NULL)."""

    quiet_threshold_days: Annotated[int, Field(strict=True, ge=1, le=90)] | None = None
    timezone: TimezoneName | None = None
    resume_tex: ResumeTex | None = None  # empty/blank string clears the resume

    _no_null = field_validator("quiet_threshold_days", "timezone", "resume_tex")(
        reject_null
    )


class SettingsResponse(AccountResponse):
    # Redeclared without exclude: AccountResponse keeps the resume off /auth/me.
    resume_tex: str | None
    resume_updated_at: datetime | None
