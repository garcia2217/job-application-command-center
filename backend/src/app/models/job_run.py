from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import JobStatus, JobType, enum_values


class JobRun(Base):
    __tablename__ = "job_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_type: Mapped[JobType] = mapped_column(
        Enum(JobType, native_enum=False, length=20, values_callable=enum_values)
    )
    # NULL for system-wide runs (quiet check); set for per-account digest runs.
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), default=None, index=True
    )
    ran_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, native_enum=False, length=10, values_callable=enum_values)
    )
    detail: Mapped[str | None] = mapped_column(String(500), default=None)
