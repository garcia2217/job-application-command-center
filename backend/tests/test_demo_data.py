from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import as_utc, utcnow
from app.comparison import compare
from app.demo_data import reset_demo_data
from app.models import (
    Account,
    Application,
    ApplicationStatus,
    Company,
    Comparison,
    Contact,
    InterviewStage,
    application_contacts,
)
from tests.conftest import make_application, make_company


async def _count(db: AsyncSession, column) -> int:
    return (await db.execute(select(func.count(column)))).scalar_one()


async def test_reset_is_idempotent_and_scoped(
    db_session: AsyncSession, owner_account: Account, other_account: Account
) -> None:  # AC-01.8, R-07
    owner_co = await make_company(db_session, owner_account, "Owner Co")
    await make_application(db_session, owner_account, owner_co)

    first = await reset_demo_data(db_session, other_account)
    await db_session.commit()
    second = await reset_demo_data(db_session, other_account)
    await db_session.commit()
    assert first == second
    assert first["companies"] >= 4 and first["applications"] >= 8

    demo_apps = (
        (
            await db_session.execute(
                select(Application).where(Application.account_id == other_account.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(demo_apps) == first["applications"]
    statuses = {a.status for a in demo_apps}
    assert statuses == set(ApplicationStatus)  # all six statuses present
    assert any(a.last_activity_at is not None for a in demo_apps)
    assert sum(a.is_quiet for a in demo_apps) >= 2
    assert await _count(db_session, InterviewStage.id) == first["stages"]
    assert await _count(db_session, Contact.id) == first["contacts"]
    assert (
        await db_session.execute(select(func.count()).select_from(application_contacts))
    ).scalar_one() == first["links"]
    assert await _count(db_session, Comparison.id) == first["comparisons"]

    now = utcnow().replace(tzinfo=None)
    soon = now + timedelta(days=7)
    stage_times = (
        (await db_session.execute(select(InterviewStage.scheduled_at))).scalars().all()
    )
    assert any(
        t is not None and now <= t.replace(tzinfo=None) <= soon for t in stage_times
    )

    # Owner data untouched.
    owner_apps = await db_session.execute(
        select(func.count(Application.id)).where(
            Application.account_id == owner_account.id
        )
    )
    assert owner_apps.scalar_one() == 1
    assert (await db_session.get(Company, owner_co.id)) is not None


async def _seed(db: AsyncSession, account: Account) -> list[Application]:
    await reset_demo_data(db, account)
    await db.commit()
    apps = (
        (
            await db.execute(
                select(Application).where(Application.account_id == account.id)
            )
        )
        .scalars()
        .all()
    )
    return list(apps)


async def _backend_acme(db: AsyncSession, account: Account) -> Application:
    return (
        await db.execute(
            select(Application).where(
                Application.account_id == account.id,
                Application.role_title == "Backend Engineer",
                Application.job_description.contains("FastAPI"),
            )
        )
    ).scalar_one()


async def test_demo_account_has_resume_and_jd_timestamps(
    db_session: AsyncSession, other_account: Account
) -> None:  # AC-01.8
    apps = await _seed(db_session, other_account)
    await db_session.refresh(other_account)
    assert other_account.resume_tex
    assert other_account.resume_updated_at is not None
    for application in apps:
        if application.job_description:
            assert application.job_description_updated_at is not None
        else:
            assert application.job_description_updated_at is None


async def test_seeded_comparison_is_real_and_fresh(
    db_session: AsyncSession, other_account: Account
) -> None:  # AC-01.8, G-04
    await _seed(db_session, other_account)
    await db_session.refresh(other_account)
    application = await _backend_acme(db_session, other_account)
    saved = (
        await db_session.execute(
            select(Comparison).where(Comparison.application_id == application.id)
        )
    ).scalar_one()
    expected = compare(other_account.resume_tex, application.job_description)
    assert saved.matched_terms == expected.matched
    assert saved.missing_terms == expected.missing
    assert saved.match_percentage == expected.match_percentage
    assert expected.matched and expected.missing
    assert "Kubernetes" in expected.missing  # only in a % comment in the resume

    ran_at = as_utc(saved.ran_at)
    assert ran_at > as_utc(other_account.resume_updated_at)
    assert ran_at > as_utc(application.job_description_updated_at)


async def test_seeded_comparison_is_not_stale_via_api(
    db_session: AsyncSession, other_account: Account, other_client: AsyncClient
) -> None:  # AC-01.8, AC-06.8
    await reset_demo_data(db_session, other_account)
    await db_session.commit()
    application = await _backend_acme(db_session, other_account)
    response = await other_client.get(f"/applications/{application.id}/comparison")
    assert response.status_code == 200
    body = response.json()
    assert body["blocked_reason"] is None
    assert body["comparison"]["is_stale"] is False
