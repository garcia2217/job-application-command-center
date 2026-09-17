import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models
from app.clock import utcnow
from app.config import get_settings
from app.database import Base
from app.dependencies import get_db
from app.main import create_app
from app.models import Account, Application, Company
from app.security import hash_password


@pytest.fixture(autouse=True)
def _fresh_settings() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record) -> None:
        # Match Postgres ON DELETE CASCADE semantics in tests.
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(engine) -> AsyncIterator[AsyncSession]:
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session


@pytest.fixture
def app(db_session: AsyncSession) -> FastAPI:
    application = create_app()

    async def _get_db_override():
        yield db_session

    application.dependency_overrides[get_db] = _get_db_override
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
async def owner_account(db_session: AsyncSession) -> Account:
    account = Account(
        email="owner@example.com",
        hashed_password=await hash_password("owner-password-1"),
        is_demo=False,
    )
    db_session.add(account)
    await db_session.commit()
    await db_session.refresh(account)
    return account


OWNER_PASSWORD = "owner-password-1"
OTHER_PASSWORD = "other-password-1"


@pytest.fixture
async def other_account(db_session: AsyncSession) -> Account:
    account = Account(
        email="other@example.com",
        hashed_password=await hash_password(OTHER_PASSWORD),
        is_demo=True,
    )
    db_session.add(account)
    await db_session.commit()
    await db_session.refresh(account)
    return account


async def _signed_in(client: AsyncClient, email: str, password: str) -> AsyncClient:
    response = await client.post(
        "/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    client.cookies.set("session", response.json()["token"])
    return client


@pytest.fixture
async def owner_client(client: AsyncClient, owner_account: Account) -> AsyncClient:
    return await _signed_in(client, owner_account.email, OWNER_PASSWORD)


@pytest.fixture
async def other_client(
    app: FastAPI, other_account: Account
) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield await _signed_in(ac, other_account.email, OTHER_PASSWORD)


async def make_company(
    db_session: AsyncSession, account: Account, name: str = "Acme", **fields: object
) -> Company:
    company = Company(
        account_id=account.id,
        name=name,
        name_normalized=name.strip().casefold(),
        **fields,
    )
    db_session.add(company)
    await db_session.commit()
    await db_session.refresh(company)
    return company


async def make_application(
    db_session: AsyncSession,
    account: Account,
    company: Company,
    role_title: str = "Backend Engineer",
    **fields: object,
) -> Application:
    fields.setdefault("last_activity_at", utcnow())
    application = Application(
        account_id=account.id,
        company_id=company.id,
        role_title=role_title,
        **fields,
    )
    db_session.add(application)
    await db_session.commit()
    await db_session.refresh(application)
    return application
