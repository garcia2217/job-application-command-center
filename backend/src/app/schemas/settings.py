from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import TimezoneName, reject_null


class SettingsUpdate(BaseModel):
    """PATCH: omitted fields are untouched; null is rejected (columns are NOT NULL)."""

    quiet_threshold_days: Annotated[int, Field(strict=True, ge=1, le=90)] | None = None
    timezone: TimezoneName | None = None

    _no_null = field_validator("quiet_threshold_days", "timezone")(reject_null)
