from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Application, InterviewStage, JobRun, JobStatus, JobType
from app.services import digest_service as digest_module
from app.services.digest_service import week_anchor
from tests.conftest import make_application, make_company
from tests.fakes import FakeEmailSender, FakeRateLimiter

MONDAY_0800_UTC = datetime(2026, 9, 21, 8, 0, tzinfo=UTC)  # 2026-09-21 is a Monday
MONDAY_0900_UTC = MONDAY_0800_UTC + timedelta(hours=1)


def test_week_anchor_utc() -> None:
    assert week_anchor("UTC", MONDAY_0900_UTC) == MONDAY_0800_UTC
    # Monday 07:59 belongs to the previous week.
    assert week_anchor("UTC", MONDAY_0800_UTC - timedelta(minutes=1)) == (
        MONDAY_0800_UTC - timedelta(days=7)
    )
    # Late in the week still anchors to this Monday (late runs, PRD F-05).
    assert week_anchor("UTC", MONDAY_0800_UTC + timedelta(days=4)) == MONDAY_0800_UTC


def test_week_anchor_tokyo() -> None:  # AC-05.7
    tokyo_monday_0800 = datetime(2026, 9, 20, 23, 0, tzinfo=UTC)  # Mon 08:00 JST
    assert week_anchor("Asia/Tokyo", tokyo_monday_0800) == tokyo_monday_0800
    assert week_anchor(
        "Asia/Tokyo", tokyo_monday_0800 - timedelta(minutes=30)
    ) == tokyo_monday_0800 - timedelta(days=7)
    assert week_anchor("Asia/Tokyo", MONDAY_0900_UTC) == tokyo_monday_0800


@pytest.fixture
def frozen_now(monkeypatch: pytest.MonkeyPatch):
    def freeze(moment: datetime) -> None:
        monkeypatch.setattr(digest_module, "utcnow", lambda: moment)

    return freeze


async def _stage(
    db_session: AsyncSession, application: Application, name: str, at: datetime
) -> InterviewStage:
    stage = InterviewStage(application_id=application.id, name=name, scheduled_at=at)
    db_session.add(stage)
    await db_session.commit()
    return stage


async def _run_rows(db_session: AsyncSession) -> list[JobRun]:
    rows = await db_session.execute(
        select(JobRun).where(JobRun.job_type == JobType.DIGEST).order_by(JobRun.id)
    )
    return list(rows.scalars())


async def test_monday_run_sends_quiet_and_upcoming(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.1, AC-05.9
    frozen_now(MONDAY_0900_UTC)
    company = await make_company(db_session, owner_account)
    quiet_a = await make_application(
        db_session,
        owner_account,
        company,
        role_title="Quiet A",
        last_activity_at=MONDAY_0900_UTC - timedelta(days=10),
        is_quiet=True,
    )
    quiet_b = await make_application(
        db_session,
        owner_account,
        company,
        role_title="Quiet B",
        last_activity_at=MONDAY_0900_UTC - timedelta(days=8),
        is_quiet=True,
    )
    active = await make_application(
        db_session,
        owner_account,
        company,
        role_title="Active",
        last_activity_at=MONDAY_0900_UTC,
    )
    await _stage(db_session, active, "Onsite", MONDAY_0800_UTC + timedelta(days=2))
    await _stage(db_session, active, "Too late", MONDAY_0800_UTC + timedelta(days=8))
    await _stage(
        db_session, active, "Already past", MONDAY_0800_UTC - timedelta(hours=1)
    )

    response = await jobs_client.post("/jobs/digest")

    assert response.status_code == 200, response.text
    runs = response.json()
    assert len(runs) == 1
    assert runs[0]["status"] == "succeeded"
    assert runs[0]["account_id"] == owner_account.id
    assert runs[0]["detail"] == f"Sent to {owner_account.email}"

    assert len(email_sender.sent) == 1
    email = email_sender.sent[0]
    assert email.to == owner_account.email
    assert email.subject == "Your week: 2 to chase, 1 coming up"
    for application in (quiet_a, quiet_b, active):
        assert f"/applications/{application.id}" in email.text
        assert f"/applications/{application.id}" in email.html
    assert "Quiet A" in email.text and "10 days" in email.text
    assert "Onsite" in email.text
    assert "Too late" not in email.text
    assert "Already past" not in email.text


async def test_nothing_to_report_is_skipped(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.2
    frozen_now(MONDAY_0900_UTC)
    response = await jobs_client.post("/jobs/digest")
    assert response.json()[0]["status"] == "skipped"
    assert response.json()[0]["detail"] == "Skipped: nothing to report"
    assert email_sender.sent == []


async def test_demo_account_never_sends(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    other_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.3 (other_account is the demo account)
    frozen_now(MONDAY_0900_UTC)
    company = await make_company(db_session, other_account)
    await make_application(
        db_session,
        other_account,
        company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=20),
        is_quiet=True,
    )
    response = await jobs_client.post("/jobs/digest")
    runs = response.json()
    assert len(runs) == 1
    assert runs[0]["status"] == "skipped"
    assert runs[0]["detail"] == "Skipped: demo account"
    assert email_sender.sent == []


async def test_second_run_same_monday_sends_nothing(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.4
    frozen_now(MONDAY_0900_UTC)
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9),
        is_quiet=True,
    )
    first = await jobs_client.post("/jobs/digest")
    frozen_now(MONDAY_0900_UTC + timedelta(hours=3))
    second = await jobs_client.post("/jobs/digest")

    assert len(first.json()) == 1
    assert second.json() == []
    assert len(email_sender.sent) == 1
    assert len(await _run_rows(db_session)) == 1


async def test_next_monday_sends_again(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9),
        is_quiet=True,
    )
    frozen_now(MONDAY_0900_UTC)
    await jobs_client.post("/jobs/digest")
    frozen_now(MONDAY_0900_UTC + timedelta(days=7))
    await jobs_client.post("/jobs/digest")
    assert len(email_sender.sent) == 2


async def test_late_run_still_sends(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # server asleep on Monday; job fires Wednesday
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9),
        is_quiet=True,
    )
    frozen_now(MONDAY_0800_UTC + timedelta(days=2, hours=5))
    response = await jobs_client.post("/jobs/digest")
    assert response.json()[0]["status"] == "succeeded"
    assert len(email_sender.sent) == 1


async def test_not_due_before_local_monday_0800(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.7 end to end
    owner_account.timezone = "Asia/Tokyo"
    await db_session.commit()
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=20),
        is_quiet=True,
    )
    previous_monday_jst = datetime(2026, 9, 13, 23, 30, tzinfo=UTC)
    db_session.add(
        JobRun(
            job_type=JobType.DIGEST,
            account_id=owner_account.id,
            ran_at=previous_monday_jst,
            status=JobStatus.SUCCEEDED,
            detail="Sent",
        )
    )
    await db_session.commit()

    frozen_now(datetime(2026, 9, 20, 22, 30, tzinfo=UTC))  # Mon 07:30 JST
    assert (await jobs_client.post("/jobs/digest")).json() == []
    frozen_now(datetime(2026, 9, 20, 23, 30, tzinfo=UTC))  # Mon 08:30 JST
    assert (await jobs_client.post("/jobs/digest")).json()[0]["status"] == "succeeded"
    assert len(email_sender.sent) == 1


async def test_daily_limit_blocks_send(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    rate_limiter: FakeRateLimiter,
    frozen_now,
) -> None:  # AC-05.5
    frozen_now(MONDAY_0900_UTC)
    rate_limiter.counts[MONDAY_0900_UTC.date()] = 5
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9),
        is_quiet=True,
    )
    response = await jobs_client.post("/jobs/digest")
    assert response.json()[0]["status"] == "not_sent"
    assert response.json()[0]["detail"] == "Not sent: daily email limit reached"
    assert email_sender.sent == []


async def test_provider_error_is_recorded_not_raised(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.6
    frozen_now(MONDAY_0900_UTC)
    email_sender.fail_with = "ResendError: invalid API key"
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9),
        is_quiet=True,
    )
    response = await jobs_client.post("/jobs/digest")
    assert response.status_code == 200
    assert response.json()[0]["status"] == "failed"
    assert response.json()[0]["detail"] == "Failed: ResendError: invalid API key"
    # Not retried this week (PRD: a send failure is not retried automatically).
    assert (await jobs_client.post("/jobs/digest")).json() == []


async def test_one_account_failure_does_not_block_the_other(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    other_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:
    frozen_now(MONDAY_0900_UTC)
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9),
        is_quiet=True,
    )
    runs = (await jobs_client.post("/jobs/digest")).json()
    assert {r["account_id"]: r["status"] for r in runs} == {
        owner_account.id: "succeeded",
        other_account.id: "skipped",
    }
    total = (
        await db_session.execute(select(func.count()).select_from(JobRun))
    ).scalar_one()
    assert total == 2
