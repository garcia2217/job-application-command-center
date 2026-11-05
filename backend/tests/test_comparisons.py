from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Application, Comparison
from app.services import application_service as application_service_module
from app.services import comparison_service as comparison_module
from app.services import settings_service as settings_module
from app.services.comparison_service import ComparisonService
from tests.conftest import make_application, make_company

T0 = datetime(2026, 11, 5, 9, 0, tzinfo=UTC)


def _clock(monkeypatch: pytest.MonkeyPatch, moment: datetime) -> None:
    for module in (comparison_module, settings_module, application_service_module):
        monkeypatch.setattr(module, "utcnow", lambda: moment)


async def _setup(
    client: AsyncClient,
    db_session: AsyncSession,
    account: Account,
    *,
    resume: str | None,
    job_description: str | None,
) -> int:
    if resume is not None:
        response = await client.patch("/settings", json={"resume_tex": resume})
        assert response.status_code == 200
    company = await make_company(db_session, account)
    application = await make_application(
        db_session, account, company, job_description=job_description
    )
    return application.id


async def _row_count(db_session: AsyncSession, application_id: int) -> int:
    result = await db_session.execute(
        select(func.count())
        .select_from(Comparison)
        .where(Comparison.application_id == application_id)
    )
    return result.scalar_one()


async def test_get_blocked_no_resume_wins(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-06.6
    app_id = await _setup(
        owner_client, db_session, owner_account, resume=None, job_description=None
    )
    response = await owner_client.get(f"/applications/{app_id}/comparison")
    assert response.status_code == 200
    assert response.json() == {"blocked_reason": "no_resume", "comparison": None}


@pytest.mark.parametrize("job_description", [None, "  \n "])
async def test_get_blocked_no_job_description(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    job_description: str | None,
) -> None:
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume="Python",
        job_description=job_description,
    )
    body = (await owner_client.get(f"/applications/{app_id}/comparison")).json()
    assert body == {"blocked_reason": "no_job_description", "comparison": None}


async def test_post_blocked_returns_409_with_prd_text(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-06.6
    no_resume = await _setup(
        owner_client, db_session, owner_account, resume=None, job_description="Python"
    )
    response = await owner_client.post(f"/applications/{no_resume}/comparison")
    assert response.status_code == 409
    assert response.json()["code"] == "RESUME_REQUIRED"
    assert response.json()["detail"] == "Add your resume in Settings first."

    await owner_client.patch("/settings", json={"resume_tex": "Python"})
    company = await make_company(db_session, owner_account, "Other Co")
    no_jd = await make_application(db_session, owner_account, company)
    response = await owner_client.post(f"/applications/{no_jd.id}/comparison")
    assert response.status_code == 409
    assert response.json()["code"] == "JOB_DESCRIPTION_REQUIRED"
    assert response.json()["detail"] == "Paste the job description first."
    assert await _row_count(db_session, no_jd.id) == 0


async def test_run_matches_and_misses(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # AC-06.1
    _clock(monkeypatch, T0)
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume=r"\textbf{PostgreSQL}",
        job_description="Postgres and Kubernetes",
    )
    _clock(monkeypatch, T0 + timedelta(hours=1))
    response = await owner_client.post(f"/applications/{app_id}/comparison")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["blocked_reason"] is None
    comparison = body["comparison"]
    assert comparison["matched"] == ["PostgreSQL"]
    assert comparison["missing"] == ["Kubernetes"]
    assert comparison["match_percentage"] == 50
    assert comparison["requirement_count"] == 2
    assert comparison["is_stale"] is False

    fetched = await owner_client.get(f"/applications/{app_id}/comparison")
    assert fetched.json()["comparison"]["matched"] == ["PostgreSQL"]
    assert fetched.json()["comparison"]["is_stale"] is False


async def test_run_with_no_recognised_terms(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-06.5
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume="Python",
        job_description="We value kindness and curiosity",
    )
    response = await owner_client.post(f"/applications/{app_id}/comparison")
    assert response.status_code == 200
    comparison = response.json()["comparison"]
    assert comparison["match_percentage"] is None
    assert comparison["requirement_count"] == 0


async def test_rerun_replaces_the_single_row(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # AC-06.7
    _clock(monkeypatch, T0)
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume="Python",
        job_description="Python",
    )
    url = f"/applications/{app_id}/comparison"
    _clock(monkeypatch, T0 + timedelta(hours=1))
    await owner_client.post(url)
    second_time = T0 + timedelta(hours=2)
    _clock(monkeypatch, second_time)
    response = await owner_client.post(url)

    assert (
        response.json()["comparison"]["ran_at"]
        .removesuffix("Z")
        .startswith(second_time.strftime("%Y-%m-%dT%H:%M:%S"))
    )
    assert await _row_count(db_session, app_id) == 1


async def test_resume_edit_makes_comparison_stale(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # AC-06.8
    _clock(monkeypatch, T0)
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume="Python",
        job_description="Python",
    )
    url = f"/applications/{app_id}/comparison"
    _clock(monkeypatch, T0 + timedelta(hours=1))
    await owner_client.post(url)
    _clock(monkeypatch, T0 + timedelta(hours=2))
    await owner_client.patch("/settings", json={"resume_tex": "Python and Go"})
    assert (await owner_client.get(url)).json()["comparison"]["is_stale"] is True


async def test_job_description_edit_makes_comparison_stale(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # AC-06.8
    _clock(monkeypatch, T0)
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume="Python",
        job_description="Python",
    )
    # make_application bypasses the service, so stamp the edit time like create does.
    row = await db_session.get(Application, app_id)
    row.job_description_updated_at = T0
    await db_session.commit()
    url = f"/applications/{app_id}/comparison"
    _clock(monkeypatch, T0 + timedelta(hours=1))
    await owner_client.post(url)
    assert (await owner_client.get(url)).json()["comparison"]["is_stale"] is False
    _clock(monkeypatch, T0 + timedelta(hours=2))
    await owner_client.patch(
        f"/applications/{app_id}", json={"job_description": "Python and Go"}
    )
    assert (await owner_client.get(url)).json()["comparison"]["is_stale"] is True


async def test_unchanged_resave_and_notes_edit_stay_fresh(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # AC-06.8
    _clock(monkeypatch, T0)
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume="Python",
        job_description="Python",
    )
    url = f"/applications/{app_id}/comparison"
    _clock(monkeypatch, T0 + timedelta(hours=1))
    await owner_client.post(url)
    _clock(monkeypatch, T0 + timedelta(hours=2))
    await owner_client.patch("/settings", json={"resume_tex": "Python"})
    await owner_client.patch(f"/applications/{app_id}", json={"notes": "hello"})
    assert (await owner_client.get(url)).json()["comparison"]["is_stale"] is False


async def test_malformed_latex_still_compares(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-06.10
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume=r"\textbf{Python",
        job_description="Python",
    )
    response = await owner_client.post(f"/applications/{app_id}/comparison")
    assert response.status_code == 200
    assert response.json()["comparison"]["matched"] == ["Python"]


async def test_running_a_comparison_is_not_activity(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clock(monkeypatch, T0 + timedelta(days=30))
    company = await make_company(db_session, owner_account)
    old = T0 - timedelta(days=20)
    application = await make_application(
        db_session,
        owner_account,
        company,
        job_description="Python",
        last_activity_at=old,
        is_quiet=True,
    )
    app_id = application.id
    await owner_client.patch("/settings", json={"resume_tex": "Python"})
    response = await owner_client.post(f"/applications/{app_id}/comparison")
    assert response.status_code == 200

    db_session.expire_all()
    row = await db_session.get(Application, app_id)
    assert row.is_quiet is True
    assert row.last_activity_at.replace(tzinfo=UTC) == old


async def test_other_accounts_application_is_404(
    owner_client: AsyncClient,
    other_client: AsyncClient,
    other_account: Account,
    db_session: AsyncSession,
) -> None:
    company = await make_company(db_session, other_account)
    foreign = await make_application(
        db_session, other_account, company, job_description="Python"
    )
    url = f"/applications/{foreign.id}/comparison"
    for response in (await owner_client.get(url), await owner_client.post(url)):
        assert response.status_code == 404
        assert response.json()["code"] == "NOT_FOUND"


async def test_requires_session(client: AsyncClient) -> None:
    assert (await client.get("/applications/1/comparison")).status_code == 401
    assert (await client.post("/applications/1/comparison")).status_code == 401


async def test_clearing_resume_keeps_old_comparison_as_stale(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clock(monkeypatch, T0)
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume="Python",
        job_description="Python",
    )
    url = f"/applications/{app_id}/comparison"
    _clock(monkeypatch, T0 + timedelta(hours=1))
    await owner_client.post(url)
    _clock(monkeypatch, T0 + timedelta(hours=2))
    await owner_client.patch("/settings", json={"resume_tex": ""})

    body = (await owner_client.get(url)).json()
    assert body["blocked_reason"] == "no_resume"
    assert body["comparison"]["matched"] == ["Python"]
    assert body["comparison"]["is_stale"] is True


async def test_concurrent_first_run_retries_as_update(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app_id = await _setup(
        owner_client,
        db_session,
        owner_account,
        resume="Python",
        job_description="Python and Docker",
    )
    original_load = ComparisonService._load
    calls = 0

    async def racing_load(self, account_id: int, application_id: int):
        nonlocal calls
        application = await original_load(self, account_id, application_id)
        calls += 1
        if calls == 1:
            # A competing request inserts the row after we saw none.
            db_session.add(Comparison(application_id=application_id, ran_at=T0))
            await db_session.commit()
        return application

    monkeypatch.setattr(ComparisonService, "_load", racing_load)
    response = await owner_client.post(f"/applications/{app_id}/comparison")

    assert calls == 2
    assert response.status_code == 200, response.text
    assert response.json()["comparison"]["matched"] == ["Python"]
    assert response.json()["comparison"]["missing"] == ["Docker"]
    assert response.json()["comparison"]["is_stale"] is False
    assert await _row_count(db_session, app_id) == 1


async def test_openapi_documents_problem_responses(client: AsyncClient) -> None:
    spec = (await client.get("/openapi.json")).json()
    post = spec["paths"]["/applications/{application_id}/comparison"]["post"]
    assert {"401", "404", "409"} <= set(post["responses"])
    assert "application/problem+json" in post["responses"]["409"]["content"]
