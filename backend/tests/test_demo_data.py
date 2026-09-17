from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.demo_data import reset_demo_data
from app.models import (
    ACTIVE_STATUSES,
    Account,
    Application,
    Company,
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
    assert first["companies"] >= 4 and first["applications"] >= 6

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
    assert ACTIVE_STATUSES <= statuses  # covers wishlist/applied/interviewing at least
    assert any(a.last_activity_at is not None for a in demo_apps)
    assert await _count(db_session, InterviewStage.id) == first["stages"]
    assert await _count(db_session, Contact.id) == first["contacts"]
    assert (
        await db_session.execute(select(func.count()).select_from(application_contacts))
    ).scalar_one() == first["links"]

    # Owner data untouched.
    owner_apps = await db_session.execute(
        select(func.count(Application.id)).where(
            Application.account_id == owner_account.id
        )
    )
    assert owner_apps.scalar_one() == 1
    assert (await db_session.get(Company, owner_co.id)) is not None
