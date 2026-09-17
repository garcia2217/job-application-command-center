import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models
from app.config import get_settings
from app.database import Base
from app.dependencies import get_db
from app.main import create_app
from app.models import Account
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
