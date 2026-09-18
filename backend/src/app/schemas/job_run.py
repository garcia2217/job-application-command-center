from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import JobStatus, JobType


class JobRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_type: JobType
    account_id: int | None
    ran_at: datetime
    status: JobStatus
    detail: str | None


class JobRunsResponse(BaseModel):
    """Latest run of each job, for Settings (PRD F-04/F-05)."""

    quiet_check: JobRunResponse | None
    digest: JobRunResponse | None
