from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

BlockedReason = Literal["no_resume", "no_job_description"]


class ComparisonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    matched: list[str]
    missing: list[str]
    requirement_count: int
    match_percentage: int | None  # None: "No recognised requirements found"
    ran_at: datetime
    is_stale: bool


class ComparisonStateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    blocked_reason: BlockedReason | None
    comparison: ComparisonResponse | None
