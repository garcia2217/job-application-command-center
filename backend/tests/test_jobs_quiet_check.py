import base64
import hashlib
from datetime import timedelta

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.config import get_settings
from app.models import Account, Application, ApplicationStatus, JobRun
from app.services.quiet_check_service import QuietCheckService
from tests.conftest import make_application, make_company


def _body_hash_claim(body: bytes) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(body).digest()).decode().rstrip("=")


def _sign(key: str, *, url: str = "http://localhost:8000/jobs/quiet-check") -> str:
    now = int(utcnow().timestamp())
    return jwt.encode(
        {
            "iss": "Upstash",
            "sub": url,
            "exp": now + 60,
            "nbf": now - 60,
            "body": _body_hash_claim(b""),
        },
        key,
        algorithm="HS256",
    )


async def _seed(
    db_session: AsyncSession, account: Account, *, days: int, **fields: object
) -> Application:
    company = await make_company(db_session, account, name=f"Co-{days}-{account.id}")
    return await make_application(
        db_session,
        account,
        company,
        role_title=f"Role {days}",
        last_activity_at=utcnow() - timedelta(days=days),
        **fields,
    )


async def _run_count(db_session: AsyncSession) -> int:
    return (
        await db_session.execute(select(func.count()).select_from(JobRun))
    ).scalar_one()


async def test_flags_at_threshold_not_before_and_ignores_closed(
    jobs_client: AsyncClient, db_session: AsyncSession, owner_account: Account
) -> None:  # AC-04.1, AC-04.2, AC-04.3
    at_threshold = await _seed(db_session, owner_account, days=7)
    just_under = await _seed(db_session, owner_account, days=6)
    rejected = await _seed(
        db_session, owner_account, days=30, status=ApplicationStatus.REJECTED
    )

    response = await jobs_client.post("/jobs/quiet-check")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["job_type"] == "quiet_check"
    assert body["account_id"] is None
    assert body["status"] == "succeeded"
    assert body["detail"] == "Flagged 1 application(s)"
    for application in (at_threshold, just_under, rejected):
        await db_session.refresh(application)
    assert at_threshold.is_quiet is True
    assert just_under.is_quiet is False
    assert rejected.is_quiet is False


async def test_threshold_is_per_account(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    other_account: Account,
) -> None:
    other_account.quiet_threshold_days = 3
    await db_session.commit()
    owner_app = await _seed(db_session, owner_account, days=4)
    other_app = await _seed(db_session, other_account, days=4)

    await jobs_client.post("/jobs/quiet-check")

    await db_session.refresh(owner_app)
    await db_session.refresh(other_app)
    assert owner_app.is_quiet is False  # default threshold 7
    assert other_app.is_quiet is True


async def test_rerun_is_idempotent_and_unflags_recovered(
    jobs_client: AsyncClient,
    owner_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
) -> None:  # AC-04.6 and "threshold change takes effect at the next run"
    stale = await _seed(db_session, owner_account, days=10)
    await jobs_client.post("/jobs/quiet-check")
    await jobs_client.post("/jobs/quiet-check")

    listed = (await owner_client.get("/applications?quiet=true")).json()
    assert [a["id"] for a in listed] == [stale.id]
    assert await _run_count(db_session) == 2

    owner_account.quiet_threshold_days = 30
    await db_session.commit()
    await jobs_client.post("/jobs/quiet-check")
    await db_session.refresh(stale)
    assert stale.is_quiet is False


async def test_failed_run_keeps_previous_flags(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # AC-04.7
    previously_flagged = await _seed(db_session, owner_account, days=10, is_quiet=True)
    newly_stale = await _seed(db_session, owner_account, days=9, is_quiet=False)
    original = QuietCheckService._flag_all

    async def explode(self: QuietCheckService, now):
        await original(self, now)  # flags are written, then the run blows up
        raise RuntimeError("boom")

    monkeypatch.setattr(QuietCheckService, "_flag_all", explode)

    response = await jobs_client.post("/jobs/quiet-check")

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert response.json()["detail"] == "Failed: RuntimeError"
    await db_session.refresh(previously_flagged)
    await db_session.refresh(newly_stale)
    assert previously_flagged.is_quiet is True
    assert newly_stale.is_quiet is False
    assert await _run_count(db_session) == 1


async def test_job_routes_require_qstash_signature(client: AsyncClient) -> None:
    missing = await client.post("/jobs/quiet-check")
    assert missing.status_code == 401
    assert missing.json()["code"] == "INVALID_JOB_SIGNATURE"

    garbage = await client.post(
        "/jobs/quiet-check", headers={"Upstash-Signature": "not-a-jwt"}
    )
    assert garbage.status_code == 401
    assert garbage.json()["code"] == "INVALID_JOB_SIGNATURE"


async def test_placeholder_signing_key_is_rejected_even_if_token_matches(
    client: AsyncClient,
) -> None:  # M-3: fail closed rather than trust the literal "REPLACE_ME" key
    token = _sign("REPLACE_ME")
    response = await client.post(
        "/jobs/quiet-check", headers={"Upstash-Signature": token}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_JOB_SIGNATURE"


async def test_real_signing_key_verifies(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("QSTASH_CURRENT_SIGNING_KEY", "test-key")
    monkeypatch.setenv("QSTASH_NEXT_SIGNING_KEY", "test-key-2")
    get_settings.cache_clear()  # the app fixture already cached the REPLACE_ME defaults
    token = _sign("test-key")
    response = await client.post(
        "/jobs/quiet-check", headers={"Upstash-Signature": token}
    )
    assert response.status_code == 200
