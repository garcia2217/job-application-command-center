"""Create or update the two QStash schedules that drive F-04 and F-05.

Idempotent: a fixed schedule_id makes create() update the existing schedule.
Usage: uv run python scripts/register_schedules.py   (reads .env; needs QSTASH_TOKEN
and a public PUBLIC_BASE_URL — QStash cannot reach localhost)
"""

import sys

from qstash import QStash

from app.config import get_settings

# (schedule_id, path, cron in UTC, retries). The digest is hourly; each account decides
# whether Monday 08:00 in its own time zone has passed (see DigestService).
# digest retries=0: a QStash retry overlapping a slow cold-start request is the only
# realistic way two digest runs could race, and the hourly cron already serves as the
# retry, so we don't need QStash's own retry on top of it.
SCHEDULES = [
    ("jacc-quiet-check", "/jobs/quiet-check", "15 0 * * *", 3),
    ("jacc-digest", "/jobs/digest", "0 * * * *", 0),
]


def main() -> None:
    settings = get_settings()
    if settings.qstash_token == "REPLACE_ME":
        sys.exit("QSTASH_TOKEN is not set (see .env.example / MANUAL_STEPS.md)")
    if "localhost" in settings.public_base_url:
        sys.exit(
            "PUBLIC_BASE_URL must be the deployed API URL; QStash cannot reach localhost"
        )

    client = QStash(settings.qstash_token)
    for schedule_id, path, cron, retries in SCHEDULES:
        created = client.schedule.create(
            destination=f"{settings.public_base_url}{path}",
            cron=cron,
            schedule_id=schedule_id,
            retries=retries,
        )
        print(f"{created}: {cron} -> {path}")


if __name__ == "__main__":
    main()
