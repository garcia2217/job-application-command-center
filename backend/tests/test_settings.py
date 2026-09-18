from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, JobRun, JobStatus, JobType
from tests.conftest import make_application, make_company


async def test_update_threshold_and_timezone(owner_client: AsyncClient) -> None:
    response = await owner_client.patch(
        "/settings", json={"quiet_threshold_days": 10, "timezone": "Asia/Bangkok"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["quiet_threshold_days"] == 10
    assert body["timezone"] == "Asia/Bangkok"

    me = await owner_client.get("/auth/me")
    assert me.json()["quiet_threshold_days"] == 10


async def test_partial_update_keeps_other_field(owner_client: AsyncClient) -> None:
    await owner_client.patch("/settings", json={"timezone": "Europe/Berlin"})
    response = await owner_client.patch("/settings", json={"quiet_threshold_days": 3})
    assert response.json()["timezone"] == "Europe/Berlin"


async def test_threshold_bounds_rejected(owner_client: AsyncClient) -> None:  # AC-04.9
    for bad in (0, 91, 7.5, "7"):
        response = await owner_client.patch(
            "/settings", json={"quiet_threshold_days": bad}
        )
        assert response.status_code == 422, bad
        assert response.json()["errors"][0]["field"] == "quiet_threshold_days"


async def test_unknown_timezone_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.patch("/settings", json={"timezone": "Mars/Olympus"})
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "timezone"


async def test_null_is_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.patch("/settings", json={"timezone": None})
    assert response.status_code == 422


async def test_requires_session(client: AsyncClient) -> None:
    response = await client.patch("/settings", json={"quiet_threshold_days": 5})
    assert response.status_code == 401


async def test_job_runs_null_when_never_run(owner_client: AsyncClient) -> None:
    response = await owner_client.get("/settings/job-runs")
    assert response.status_code == 200
    assert response.json() == {"quiet_check": None, "digest": None}


async def test_job_runs_shows_shared_quiet_and_own_digest(
    owner_client: AsyncClient,
    other_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    other_account: Account,
) -> None:
    now = datetime(2026, 9, 21, 9, 0, tzinfo=UTC)
    db_session.add_all(
        [
            JobRun(
                job_type=JobType.QUIET_CHECK,
                ran_at=now - timedelta(days=1),
                status=JobStatus.FAILED,
                detail="RuntimeError: old",
            ),
            JobRun(
                job_type=JobType.QUIET_CHECK,
                ran_at=now,
                status=JobStatus.SUCCEEDED,
                detail="Flagged 2 application(s)",
            ),
            JobRun(
                job_type=JobType.DIGEST,
                account_id=owner_account.id,
                ran_at=now,
                status=JobStatus.SUCCEEDED,
                detail="Sent to owner@example.com",
            ),
            JobRun(
                job_type=JobType.DIGEST,
                account_id=other_account.id,
                ran_at=now,
                status=JobStatus.SKIPPED,
                detail="Skipped: demo account",
            ),
        ]
    )
    await db_session.commit()

    owner = (await owner_client.get("/settings/job-runs")).json()
    assert owner["quiet_check"]["status"] == "succeeded"
    assert owner["quiet_check"]["detail"] == "Flagged 2 application(s)"
    assert owner["digest"]["detail"] == "Sent to owner@example.com"

    other = (await other_client.get("/settings/job-runs")).json()
    assert other["quiet_check"]["detail"] == "Flagged 2 application(s)"
    assert other["digest"]["status"] == "skipped"


async def test_digest_preview_matches_send_content(
    owner_client: AsyncClient,
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender,
    monkeypatch,
) -> None:  # AC-05.8
    from app.services import digest_service as digest_module

    now = datetime(2026, 9, 21, 9, 0, tzinfo=UTC)
    monkeypatch.setattr(digest_module, "utcnow", lambda: now)
    company = await make_company(db_session, owner_account)
    quiet = await make_application(
        db_session,
        owner_account,
        company,
        role_title="Quiet",
        last_activity_at=now - timedelta(days=9),
        is_quiet=True,
    )

    preview = await owner_client.get("/settings/digest-preview")
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["would_send"] is True
    assert body["skip_reason"] is None
    assert body["window_start"].startswith("2026-09-21T08:00:00")
    assert body["upcoming"] == []
    assert [q["application_id"] for q in body["quiet"]] == [quiet.id]
    assert body["quiet"][0]["days_since_activity"] == 9
    assert body["quiet"][0]["url"].endswith(f"/applications/{quiet.id}")

    await jobs_client.post("/jobs/digest")
    assert f"/applications/{quiet.id}" in email_sender.sent[0].text
    after = (await owner_client.get("/settings/digest-preview")).json()
    assert after["would_send"] is False
    assert after["skip_reason"] == "Already sent this week"


async def test_digest_preview_empty_and_demo(
    owner_client: AsyncClient, other_client: AsyncClient
) -> None:
    empty = (await owner_client.get("/settings/digest-preview")).json()
    assert empty["would_send"] is False
    assert empty["skip_reason"] == "Skipped: nothing to report"
    assert empty["quiet"] == [] and empty["upcoming"] == []

    demo = (await other_client.get("/settings/digest-preview")).json()
    assert demo["would_send"] is False
    assert demo["skip_reason"] == "Skipped: demo account"


async def test_preview_requires_sign_in(client: AsyncClient) -> None:
    assert (await client.get("/settings/digest-preview")).status_code == 401
    assert (await client.get("/settings/job-runs")).status_code == 401
