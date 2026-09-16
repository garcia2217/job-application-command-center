from datetime import date, datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ApplicationStatus, WorkArrangement

application_contacts = Table(
    "application_contacts",
    Base.metadata,
    Column(
        "application_id",
        ForeignKey("applications.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "contact_id", ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True
    ),
)


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)

    role_title: Mapped[str] = mapped_column(String(200))
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, native_enum=False, length=20),
        default=ApplicationStatus.APPLIED,
    )
    posting_url: Mapped[str | None] = mapped_column(String(2000), default=None)
    location: Mapped[str | None] = mapped_column(String(200), default=None)
    work_arrangement: Mapped[WorkArrangement | None] = mapped_column(
        Enum(WorkArrangement, native_enum=False, length=10), default=None
    )
    salary_min: Mapped[int | None] = mapped_column(default=None)
    salary_max: Mapped[int | None] = mapped_column(default=None)
    salary_currency: Mapped[str | None] = mapped_column(String(3), default=None)
    source: Mapped[str | None] = mapped_column(String(200), default=None)
    date_applied: Mapped[date | None] = mapped_column(Date, default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    job_description: Mapped[str | None] = mapped_column(Text, default=None)
    job_description_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )

    # F-04: maintained by services (activity) and the daily check (is_quiet).
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    is_quiet: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped["Company"] = relationship(back_populates="applications")  # noqa: F821, UP037
    stages: Mapped[list["InterviewStage"]] = relationship(  # noqa: F821, UP037
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="InterviewStage.position",
    )
    contacts: Mapped[list["Contact"]] = relationship(  # noqa: F821, UP037
        secondary=application_contacts, back_populates="applications"
    )
    comparison: Mapped["Comparison | None"] = relationship(  # noqa: F821, UP037
        back_populates="application", cascade="all, delete-orphan", uselist=False
    )
