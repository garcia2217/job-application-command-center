from datetime import UTC, datetime


def utcnow() -> datetime:
    """Single time source; tests monkeypatch this for expiry/lockout cases."""
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    """SQLite hands back naive UTC for timezone-aware columns; Postgres hands back aware."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def whole_days_between(earlier: datetime, later: datetime) -> int:
    return (as_utc(later) - as_utc(earlier)).days
