from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
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
