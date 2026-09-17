from app.clock import utcnow
from app.models import Application


def record_activity(application: Application) -> None:
    """PRD F-04: application edits and stage changes count as activity;
    contact edits and comparisons do not. Clears the quiet flag immediately."""
    application.last_activity_at = utcnow()
    application.is_quiet = False
