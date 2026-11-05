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


# --- Resume (milestone 4) ---------------------------------------------------

T1 = datetime(2026, 11, 5, 9, 0, tzinfo=UTC)
T2 = T1 + timedelta(hours=2)


def _freeze_settings_clock(monkeypatch, moment: datetime) -> None:
    from app.services import settings_service as settings_module

    monkeypatch.setattr(settings_module, "utcnow", lambda: moment)


def _ts(value: str | None) -> str | None:
    # SQLite reloads naive timestamps (no "Z"); Postgres keeps them aware.
    return value.removesuffix("Z") if value else value


async def test_get_settings_defaults(owner_client: AsyncClient) -> None:
    response = await owner_client.get("/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["quiet_threshold_days"] == 7
    assert body["timezone"]
    assert body["resume_tex"] is None
    assert body["resume_updated_at"] is None
    assert body["email"] == "owner@example.com"
    assert body["has_resume"] is False


async def test_get_settings_requires_session(client: AsyncClient) -> None:
    assert (await client.get("/settings")).status_code == 401


async def test_save_resume_round_trip(owner_client: AsyncClient, monkeypatch) -> None:
    _freeze_settings_clock(monkeypatch, T1)
    response = await owner_client.patch(
        "/settings", json={"resume_tex": "\\textbf{Python}"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["resume_tex"] == "\\textbf{Python}"
    assert body["resume_updated_at"].startswith("2026-11-05T09:00:00")
    fetched = (await owner_client.get("/settings")).json()
    assert _ts(fetched.pop("resume_updated_at")) == _ts(body.pop("resume_updated_at"))
    assert fetched == body


async def test_resume_length_limit_counts_code_points(
    owner_client: AsyncClient,
) -> None:  # AC-06.9
    ok = await owner_client.patch("/settings", json={"resume_tex": "a" * 50_000})
    assert ok.status_code == 200
    emoji = await owner_client.patch("/settings", json={"resume_tex": "😀" * 50_000})
    assert emoji.status_code == 200

    too_long = await owner_client.patch("/settings", json={"resume_tex": "a" * 50_001})
    assert too_long.status_code == 422
    error = too_long.json()["errors"][0]
    assert error["field"] == "resume_tex"
    assert error["message"] == "Resume must be 50,000 characters or fewer"
    assert len(too_long.json()["errors"]) == 1


async def test_resave_identical_resume_keeps_timestamp(
    owner_client: AsyncClient, monkeypatch
) -> None:
    _freeze_settings_clock(monkeypatch, T1)
    first = (
        await owner_client.patch("/settings", json={"resume_tex": "Python"})
    ).json()
    _freeze_settings_clock(monkeypatch, T2)
    same = (await owner_client.patch("/settings", json={"resume_tex": "Python"})).json()
    assert _ts(same["resume_updated_at"]) == _ts(first["resume_updated_at"])
    changed = (await owner_client.patch("/settings", json={"resume_tex": "Go"})).json()
    assert changed["resume_updated_at"].startswith("2026-11-05T11:00:00")


async def test_other_settings_leave_resume_timestamp(
    owner_client: AsyncClient, monkeypatch
) -> None:
    _freeze_settings_clock(monkeypatch, T1)
    first = (
        await owner_client.patch("/settings", json={"resume_tex": "Python"})
    ).json()
    _freeze_settings_clock(monkeypatch, T2)
    after = (
        await owner_client.patch("/settings", json={"timezone": "Asia/Bangkok"})
    ).json()
    assert _ts(after["resume_updated_at"]) == _ts(first["resume_updated_at"])
    assert after["resume_tex"] == "Python"


async def test_blank_resume_clears_and_moves_timestamp(
    owner_client: AsyncClient, monkeypatch
) -> None:
    _freeze_settings_clock(monkeypatch, T1)
    await owner_client.patch("/settings", json={"resume_tex": "Python"})
    _freeze_settings_clock(monkeypatch, T2)
    cleared = (await owner_client.patch("/settings", json={"resume_tex": "   "})).json()
    assert cleared["resume_tex"] is None
    assert cleared["resume_updated_at"].startswith("2026-11-05T11:00:00")
    assert (await owner_client.get("/auth/me")).json()["has_resume"] is False


async def test_null_resume_is_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.patch("/settings", json={"resume_tex": None})
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "resume_tex"


async def test_me_has_resume_flag_and_never_the_resume(
    owner_client: AsyncClient,
) -> None:
    before = (await owner_client.get("/auth/me")).json()
    assert before["has_resume"] is False
    assert "resume_tex" not in before

    await owner_client.patch("/settings", json={"resume_tex": "Python"})
    after = (await owner_client.get("/auth/me")).json()
    assert after["has_resume"] is True
    assert "resume_tex" not in after
    assert "resume_updated_at" not in after
