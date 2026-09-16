import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import Account, Application, ApplicationStatus, Company


def make_account(email: str = "owner@example.com") -> Account:
    return Account(email=email, hashed_password="x", is_demo=False)


async def test_account_email_unique(db_session: AsyncSession) -> None:
    db_session.add_all([make_account(), make_account()])
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_company_name_unique_per_account_only(db_session: AsyncSession) -> None:
    a1, a2 = make_account("a@example.com"), make_account("b@example.com")
    db_session.add_all([a1, a2])
    await db_session.flush()
    db_session.add_all(
        [
            Company(account_id=a1.id, name="Acme", name_normalized="acme"),
            Company(account_id=a2.id, name="Acme", name_normalized="acme"),
        ]
    )
    await db_session.commit()  # different accounts: allowed

    db_session.add(Company(account_id=a1.id, name=" ACME ", name_normalized="acme"))
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_application_defaults(db_session: AsyncSession) -> None:
    account = make_account()
    db_session.add(account)
    await db_session.flush()
    company = Company(account_id=account.id, name="Acme", name_normalized="acme")
    db_session.add(company)
    await db_session.flush()
    app_row = Application(
        account_id=account.id,
        company_id=company.id,
        role_title="Backend Engineer",
        last_activity_at=utcnow(),
    )
    db_session.add(app_row)
    await db_session.commit()
    assert app_row.status is ApplicationStatus.APPLIED
    assert app_row.is_quiet is False
