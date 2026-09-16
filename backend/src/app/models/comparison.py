from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Comparison(Base):
    __tablename__ = "comparisons"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True
    )
    matched_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    missing_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    match_percentage: Mapped[int | None] = mapped_column(
        default=None
    )  # None: no terms found
    ran_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    application: Mapped["Application"] = relationship(back_populates="comparison")  # noqa: F821, UP037
