from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Company(Base):
    __tablename__ = "companies"
    # PRD F-02: names unique per account, ignoring case/whitespace — enforced on
    # the normalized form; services must always set name_normalized.
    __table_args__ = (
        UniqueConstraint("account_id", "name_normalized", name="uq_company_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    name_normalized: Mapped[str] = mapped_column(String(200))
    website: Mapped[str | None] = mapped_column(String(2000), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    applications: Mapped[list["Application"]] = relationship(  # noqa: F821, UP037
        back_populates="company", order_by="desc(Application.last_activity_at)"
    )
    contacts: Mapped[list["Contact"]] = relationship(  # noqa: F821, UP037
        back_populates="company",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Contact.name",
    )
