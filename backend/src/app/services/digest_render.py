from __future__ import annotations

import html
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from app.services.digest_service import DigestContent

EMPTY_QUIET = "Nothing needs follow-up."
EMPTY_UPCOMING = "No interviews scheduled in the next 7 days."


def render_digest(content: DigestContent, timezone: str) -> tuple[str, str, str]:
    """Returns (subject, html, text). Times are shown in the account's time zone."""
    zone = ZoneInfo(timezone)
    subject = (
        f"Your week: {len(content.quiet)} to chase, {len(content.upcoming)} coming up"
    )

    quiet_lines = [
        f"- {q.company} — {q.role_title} ({q.status.value}), "
        f"{q.days_since_activity} days since last activity: {q.url}"
        for q in content.quiet
    ] or [EMPTY_QUIET]
    upcoming_lines = [
        f"- {s.scheduled_at.astimezone(zone):%a %d %b %H:%M} — {s.company} — "
        f"{s.role_title}: {s.stage_name}: {s.url}"
        for s in content.upcoming
    ] or [EMPTY_UPCOMING]
    text = "\n".join(
        ["Needs follow-up", *quiet_lines, "", "Coming up this week", *upcoming_lines]
    )

    def li(label: str, url: str) -> str:
        return f'<li>{html.escape(label)} — <a href="{html.escape(url)}">Open</a></li>'

    quiet_html = (
        "".join(
            li(
                f"{q.company} — {q.role_title} ({q.status.value}), "
                f"{q.days_since_activity} days since last activity",
                q.url,
            )
            for q in content.quiet
        )
        or f"<li>{EMPTY_QUIET}</li>"
    )
    upcoming_html = (
        "".join(
            li(
                f"{s.scheduled_at.astimezone(zone):%a %d %b %H:%M} — {s.company} — "
                f"{s.role_title}: {s.stage_name}",
                s.url,
            )
            for s in content.upcoming
        )
        or f"<li>{EMPTY_UPCOMING}</li>"
    )
    body = (
        "<h2>Needs follow-up</h2>"
        f"<ul>{quiet_html}</ul>"
        "<h2>Coming up this week</h2>"
        f"<ul>{upcoming_html}</ul>"
    )
    return subject, body, text
