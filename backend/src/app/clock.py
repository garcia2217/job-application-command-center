from datetime import UTC, datetime


def utcnow() -> datetime:
    """Single time source; tests monkeypatch this for expiry/lockout cases."""
    return datetime.now(UTC)
