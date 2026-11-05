# Milestone 1: Schema + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full relational schema for the MVP plus working F-01 authentication (login, logout, session validation, lockout) with Alembic migrations and a two-account seed script.

**Architecture:** FastAPI app factory + lifespan; async SQLAlchemy 2.0 against Postgres (aiosqlite in tests); opaque DB-backed session tokens stored as SHA-256 hashes, sent as a `session` cookie; RFC 9457 problem+json errors per `docs/API_CONTRACT.md`; layering routes → services → DB.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0 (async), asyncpg/aiosqlite, pydantic-settings, pwdlib[argon2], Alembic, pytest + pytest-asyncio + httpx.

**Spec:** `docs/PRD.md` (F-01 + §8 data model), `docs/API_CONTRACT.md` (auth mechanism, error shape, codes, wire values). AGENTS.md governs process.

## Global Constraints

- Python `>=3.14`, managed with **uv** (`uv add`, `uv run`); src layout `backend/src/app/`.
- All work happens in `backend/` unless a step names another path. Run commands from `backend/`.
- Type hints on all function signatures. Async DB access everywhere; no blocking I/O in request paths (password hashing via `run_in_threadpool`).
- Routes thin → services own business logic and raise `AppError` subclasses, never `HTTPException`.
- Every route declares `response_model` (or `status_code=204`).
- Errors: `application/problem+json`, shape and codes exactly per `docs/API_CONTRACT.md` — **no** `instance`, **no** `request_id`, **no** `WWW-Authenticate` header.
- Wire values: snake_case fields; enums lowercase (`wishlist|applied|interviewing|offer|rejected|withdrawn`, `pending|passed|failed`, `on_site|hybrid|remote`); timestamps ISO 8601 UTC.
- Config only via one pydantic-settings `Settings` object; no scattered `os.getenv`.
- No secrets in git; `.env` ignored, `.env.example` committed with every variable.
- Commits: conventional messages (`feat:`, `chore:` …), **no AI attribution of any kind** (no `Co-Authored-By: Claude`, no "Generated with"). Never `git add` AGENTS.md, CLAUDE.md, `.claude/`, MANUAL_STEPS.md, docs/OPERATOR_RUNBOOK.md, or `docs/superpowers/`.
- Verification before claiming done: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .` (run `uv run ruff format .` before finishing a task).
- PRD Non-goals: **no sign-up endpoint**, no password change/reset endpoints.

## Decisions recorded (PRD is silent / contract choice)

- Lockout accounting lives on the account row: `failed_login_count`, `lockout_window_started_at`, `locked_until`. Window is fixed 15 min from the first failure (resets if a failure arrives after the window lapsed); lock = 15 min from the 5th failure. Successful login resets the counter.
- Session tokens: `secrets.token_urlsafe(32)`, stored as SHA-256 hex; raw token returned once in the login body per the contract.
- Time is read through `app.clock.utcnow()` so tests can monkeypatch it (expiry + lockout tests).
- `GET /auth/me` is added (contract allows growth; frontend needs it to validate a session and read settings).
- Demo **sample data** (applications, stages, …) is seeded in milestone 2 when F-02/F-03 semantics exist; milestone 1 seeds only the two accounts.
- Comparison staleness (F-06) is supported by `resume_updated_at` on account and `job_description_updated_at` on application; comparison rows store term lists as JSON.

## File Structure

```
backend/
├── pyproject.toml                    # + deps, pytest config
├── .env.example                      # every env var, placeholder values
├── alembic.ini
├── alembic/                          # async template; env.py wired to Base.metadata
│   └── versions/<hash>_initial_schema.py
├── scripts/seed.py                   # creates/updates owner + demo accounts
├── src/app/
│   ├── main.py                       # create_app() factory (replaces module-level app)
│   ├── config.py                     # Settings (pydantic-settings, lazy+cached)
│   ├── database.py                   # Base, build_engine, build_sessionmaker
│   ├── clock.py                      # utcnow()
│   ├── security.py                   # hashing + session-token helpers
│   ├── errors.py                     # ErrorCode + AppError hierarchy (contract codes)
│   ├── error_handlers.py             # problem+json handlers per contract
│   ├── dependencies.py               # get_db, get_current_account, aliases
│   ├── models/
│   │   ├── __init__.py               # imports all models (Alembic autogenerate needs it)
│   │   ├── enums.py                  # ApplicationStatus, WorkArrangement, StageOutcome, JobType
│   │   ├── account.py                # Account, Session
│   │   ├── company.py                # Company
│   │   ├── application.py            # Application, application_contacts table
│   │   ├── contact.py                # Contact
│   │   ├── interview_stage.py        # InterviewStage
│   │   ├── comparison.py             # Comparison
│   │   └── job_run.py                # JobRun
│   ├── schemas/auth.py               # LoginRequest, LoginResponse, AccountResponse
│   ├── services/auth_service.py      # login/logout/lockout/session validation
│   └── routers/auth.py               # POST /auth/login, POST /auth/logout, GET /auth/me
├── tests/
│   ├── conftest.py
│   ├── test_health.py                # updated to async client
│   ├── test_errors.py                # contract shape + fixture assertion
│   ├── test_models.py                # constraints
│   └── test_auth.py                  # AC-01.1..01.7, 01.9
docs/api-fixtures/validation-error.json   # shared contract fixture (committed)
```

---

### Task 1: Scaffolding — dependencies, config, database, clock, app factory

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/src/app/config.py`, `backend/src/app/database.py`, `backend/src/app/clock.py`
- Modify: `backend/src/app/main.py` (replace content)
- Create: `backend/tests/conftest.py`
- Modify: `backend/tests/test_health.py` (replace content)
- Modify: `/.gitignore` (repo root — add `docs/superpowers/` under the AI-workflow block)

**Interfaces:**
- Produces: `get_settings() -> Settings` (cached; fields below), `Base`, `build_engine(url)`, `build_sessionmaker(engine)`, `utcnow() -> datetime`, `create_app(settings: Settings | None = None) -> FastAPI`, conftest fixtures `engine`, `db_session`, `app`, `client`.

- [ ] **Step 1: Add dependencies**

```bash
cd backend
uv add "pydantic[email]" pydantic-settings "sqlalchemy[asyncio]" asyncpg "pwdlib[argon2]" alembic
uv add --dev httpx aiosqlite
```

- [ ] **Step 2: Add pytest config to `pyproject.toml`**

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
```

- [ ] **Step 3: Write `src/app/clock.py`**

```python
from datetime import UTC, datetime


def utcnow() -> datetime:
    """Single time source; tests monkeypatch this for expiry/lockout cases."""
    return datetime.now(UTC)
```

- [ ] **Step 4: Write `src/app/config.py`**

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Job Application Command Center API"
    app_version: str = "0.1.0"

    database_url: str
    auto_create_tables: bool = False  # tests/dev only; production uses Alembic

    session_ttl_days: int = 7
    lockout_max_attempts: int = 5
    lockout_window_minutes: int = 15
    lockout_duration_minutes: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: Write `src/app/database.py`**

```python
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def build_engine(url: str, **kwargs: object) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True, **kwargs)


def build_sessionmaker(engine: AsyncEngine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)
```

- [ ] **Step 6: Replace `src/app/main.py` with the factory**

```python
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

from app.config import Settings, get_settings
from app.database import Base, build_engine, build_sessionmaker


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = build_engine(settings.database_url)
        app.state.engine = engine
        app.state.sessionmaker = build_sessionmaker(engine)
        if settings.auto_create_tables:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        yield
        await engine.dispose()

    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

(Task 2 adds `register_exception_handlers(app)`; Task 7 adds the auth router. `uvicorn app.main:create_app --factory` becomes the run command.)

- [ ] **Step 7: Write `tests/conftest.py`**

```python
import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base
from app.main import create_app


@pytest.fixture(autouse=True)
def _fresh_settings() -> AsyncIterator[None]:
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
    from app.dependencies import get_db  # exists from Task 6 on; see note below

    app = create_app()

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
```

**Note:** `app/dependencies.py` does not exist until Task 6. For Tasks 1–5, write the `app` fixture WITHOUT the import/override (just `return create_app()`); Task 6 adds the override back exactly as above.

- [ ] **Step 8: Replace `tests/test_health.py`**

```python
from httpx import AsyncClient


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 9: Run tests — expect PASS**

Run: `uv run pytest` → 1 passed.

- [ ] **Step 10: Add `docs/superpowers/` to repo-root `.gitignore`** (append one line inside the "AI workflow files" block).

- [ ] **Step 11: Format, lint, commit**

```bash
uv run ruff format . && uv run ruff check .
git add pyproject.toml uv.lock src/app tests ../.gitignore
git commit -m "chore(backend): app factory, settings, async db plumbing"
```

---

### Task 2: Error layer per API contract + shared fixture

**Files:**
- Create: `backend/src/app/errors.py`, `backend/src/app/error_handlers.py`
- Modify: `backend/src/app/main.py` (register handlers)
- Create: `docs/api-fixtures/validation-error.json`
- Test: `backend/tests/test_errors.py`

**Interfaces:**
- Produces: `ErrorCode` (StrEnum: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `NOT_FOUND`, `CONFLICT`, `COMPANY_NAME_TAKEN`, `INTERNAL_ERROR`), `AppError(detail, *, code=None, errors=None)` with subclasses `NotFoundError` (404/NOT_FOUND), `ConflictError` (409/CONFLICT), `AuthenticationError` (401/UNAUTHENTICATED), `ValidationFailedError` (422/VALIDATION_FAILED); `register_exception_handlers(app)`; `problem_response(...)`.

- [ ] **Step 1: Write failing tests `tests/test_errors.py`**

```python
import json
from pathlib import Path

from httpx import ASGITransport, AsyncClient

FIXTURE = Path(__file__).parents[2] / "docs" / "api-fixtures" / "validation-error.json"


async def test_unknown_route_is_problem_json(client: AsyncClient) -> None:
    response = await client.get("/does-not-exist")
    assert response.status_code == 404
    assert "application/problem+json" in response.headers["content-type"]
    body = response.json()
    assert body["status"] == 404
    assert "instance" not in body and "request_id" not in body


async def test_validation_error_matches_contract_fixture(app) -> None:
    # Task 7's login endpoint makes this real; until then use a probe route.
    from pydantic import BaseModel

    class Probe(BaseModel):
        role_title: str

    @app.post("/probe")
    async def probe(payload: Probe) -> dict[str, str]:  # pragma: no cover
        return {"ok": "yes"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/probe", json={})

    assert response.status_code == 422
    assert response.json() == json.loads(FIXTURE.read_text())


async def test_unhandled_error_is_generic_500(app) -> None:
    @app.get("/boom")
    async def boom() -> None:  # pragma: no cover
        raise RuntimeError("secret internals")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/boom")

    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
    assert "secret internals" not in response.text
```

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_errors.py -v` → FAIL (content-type is plain JSON, shapes differ).

- [ ] **Step 3: Write `docs/api-fixtures/validation-error.json`** (repo root `docs/`, committed — this is the contract's shared fixture; the frontend test will parse this same file in milestone 2)

```json
{
  "type": "https://example.com/errors/validation-failed",
  "title": "Request validation failed",
  "status": 422,
  "detail": "1 field(s) failed validation",
  "code": "VALIDATION_FAILED",
  "errors": [
    {
      "location": "body",
      "field": "role_title",
      "message": "Field required",
      "type": "missing"
    }
  ]
}
```

- [ ] **Step 4: Write `src/app/errors.py`**

```python
from enum import StrEnum
from typing import Any


class ErrorCode(StrEnum):
    VALIDATION_FAILED = "VALIDATION_FAILED"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    COMPANY_NAME_TAKEN = "COMPANY_NAME_TAKEN"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class AppError(Exception):
    """Expected application error; handlers map it to problem+json."""

    status_code: int = 500
    code: ErrorCode = ErrorCode.INTERNAL_ERROR
    title: str = "Internal server error"

    def __init__(
        self,
        detail: str | None = None,
        *,
        code: ErrorCode | None = None,
        errors: list[dict[str, Any]] | None = None,
    ) -> None:
        self.detail = detail
        if code is not None:
            self.code = code
        self.errors = errors
        super().__init__(detail or self.title)


class NotFoundError(AppError):
    status_code = 404
    code = ErrorCode.NOT_FOUND
    title = "Resource not found"


class ConflictError(AppError):
    status_code = 409
    code = ErrorCode.CONFLICT
    title = "Conflict"


class AuthenticationError(AppError):
    status_code = 401
    code = ErrorCode.UNAUTHENTICATED
    title = "Authentication required"


class ValidationFailedError(AppError):
    status_code = 422
    code = ErrorCode.VALIDATION_FAILED
    title = "Request validation failed"
```

(Contract note: cookie auth — `AuthenticationError` sets **no** `WWW-Authenticate` header, deliberately diverging from the skill default.)

- [ ] **Step 5: Write `src/app/error_handlers.py`**

```python
import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.errors import AppError, ErrorCode

logger = logging.getLogger("app.errors")
PROBLEM_TYPE_BASE = "https://example.com/errors/"


def problem_response(
    *,
    status: int,
    code: ErrorCode | str,
    title: str,
    detail: str | None = None,
    errors: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"{PROBLEM_TYPE_BASE}{str(code).lower().replace('_', '-')}",
        "title": title,
        "status": status,
        "detail": detail,
        "code": str(code),
    }
    if errors:
        body["errors"] = errors
    return JSONResponse(status_code=status, content=body, media_type="application/problem+json")


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    logger.info("%s %s -> %s %s", request.method, request.url.path, exc.status_code, exc.code)
    return problem_response(
        status=exc.status_code, code=exc.code, title=exc.title,
        detail=exc.detail, errors=exc.errors,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Rebuilt (not exc.errors() verbatim) so submitted input and ctx never leak.
    errors = []
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", ())]
        errors.append(
            {
                "location": loc[0] if loc else "body",
                "field": ".".join(loc[1:]) or None,
                "message": err.get("msg", "Invalid value"),
                "type": err.get("type", "value_error"),
            }
        )
    return problem_response(
        status=422,
        code=ErrorCode.VALIDATION_FAILED,
        title="Request validation failed",
        detail=f"{len(errors)} field(s) failed validation",
        errors=errors,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    try:
        title = HTTPStatus(exc.status_code).phrase
    except ValueError:
        title = "HTTP error"
    code = ErrorCode.NOT_FOUND if exc.status_code == 404 else ErrorCode.INTERNAL_ERROR
    return problem_response(
        status=exc.status_code,
        code=code,
        title=title,
        detail=exc.detail if isinstance(exc.detail, str) else None,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return problem_response(
        status=500,
        code=ErrorCode.INTERNAL_ERROR,
        title="Internal server error",
        detail="An unexpected error occurred.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
```

- [ ] **Step 6: Wire into `main.py`** — after `app = FastAPI(...)`: `register_exception_handlers(app)` (import at top).

- [ ] **Step 7: Run tests** — `uv run pytest` → all pass (fix any message-text drift by updating the fixture only if FastAPI's normalized output legitimately differs; the fixture is then the recorded contract).

- [ ] **Step 8: Format, lint, commit**

```bash
uv run ruff format . && uv run ruff check .
git add src/app tests ../docs/api-fixtures
git commit -m "feat(backend): problem+json error layer per API contract"
```

---

### Task 3: ORM models — full MVP schema

**Files:**
- Create: `backend/src/app/models/__init__.py`, `enums.py`, `account.py`, `company.py`, `application.py`, `contact.py`, `interview_stage.py`, `comparison.py`, `job_run.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces: ORM classes `Account`, `Session`, `Company`, `Application`, `Contact`, `InterviewStage`, `Comparison`, `JobRun`; association table `application_contacts`; enums `ApplicationStatus`, `WorkArrangement`, `StageOutcome`, `JobType`, `JobStatus`. All importable from `app.models` (via `__init__`).

- [ ] **Step 1: Write failing tests `tests/test_models.py`**

```python
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import Account, Application, Company
from app.models.enums import ApplicationStatus


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
```

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_models.py -v` → FAIL (`ModuleNotFoundError: app.models`).

- [ ] **Step 3: Write `models/enums.py`**

```python
from enum import StrEnum


class ApplicationStatus(StrEnum):
    WISHLIST = "wishlist"
    APPLIED = "applied"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


ACTIVE_STATUSES = frozenset(
    {ApplicationStatus.WISHLIST, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEWING}
)


class WorkArrangement(StrEnum):
    ON_SITE = "on_site"
    HYBRID = "hybrid"
    REMOTE = "remote"


class StageOutcome(StrEnum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"


class JobType(StrEnum):
    QUIET_CHECK = "quiet_check"
    DIGEST = "digest"


class JobStatus(StrEnum):
    SUCCEEDED = "succeeded"
    SKIPPED = "skipped"
    NOT_SENT = "not_sent"
    FAILED = "failed"
```

- [ ] **Step 4: Write `models/account.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_demo: Mapped[bool] = mapped_column(default=False)

    quiet_threshold_days: Mapped[int] = mapped_column(default=7)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    resume_tex: Mapped[str | None] = mapped_column(Text, default=None)
    resume_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )

    failed_login_count: Mapped[int] = mapped_column(default=0)
    lockout_window_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    account: Mapped[Account] = relationship(back_populates="sessions")
```

- [ ] **Step 5: Write `models/company.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Company(Base):
    __tablename__ = "companies"
    # PRD F-02: names unique per account, ignoring case/whitespace — enforced on
    # the normalized form; services must always set name_normalized.
    __table_args__ = (UniqueConstraint("account_id", "name_normalized", name="uq_company_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    name_normalized: Mapped[str] = mapped_column(String(200))
    website: Mapped[str | None] = mapped_column(String(2000), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    applications: Mapped[list["Application"]] = relationship(back_populates="company")  # noqa: F821
    contacts: Mapped[list["Contact"]] = relationship(  # noqa: F821
        back_populates="company", cascade="all, delete-orphan"
    )
```

- [ ] **Step 6: Write `models/application.py`**

```python
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ApplicationStatus, WorkArrangement

application_contacts = Table(
    "application_contacts",
    Base.metadata,
    Column(
        "application_id",
        ForeignKey("applications.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("contact_id", ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True),
)


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)

    role_title: Mapped[str] = mapped_column(String(200))
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, native_enum=False, length=20),
        default=ApplicationStatus.APPLIED,
    )
    posting_url: Mapped[str | None] = mapped_column(String(2000), default=None)
    location: Mapped[str | None] = mapped_column(String(200), default=None)
    work_arrangement: Mapped[WorkArrangement | None] = mapped_column(
        Enum(WorkArrangement, native_enum=False, length=10), default=None
    )
    salary_min: Mapped[int | None] = mapped_column(default=None)
    salary_max: Mapped[int | None] = mapped_column(default=None)
    salary_currency: Mapped[str | None] = mapped_column(String(3), default=None)
    source: Mapped[str | None] = mapped_column(String(200), default=None)
    date_applied: Mapped[date | None] = mapped_column(Date, default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    job_description: Mapped[str | None] = mapped_column(Text, default=None)
    job_description_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )

    # F-04: maintained by services (activity) and the daily check (is_quiet).
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    is_quiet: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped["Company"] = relationship(back_populates="applications")  # noqa: F821
    stages: Mapped[list["InterviewStage"]] = relationship(  # noqa: F821
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="InterviewStage.position",
    )
    contacts: Mapped[list["Contact"]] = relationship(  # noqa: F821
        secondary=application_contacts, back_populates="applications"
    )
    comparison: Mapped["Comparison | None"] = relationship(  # noqa: F821
        back_populates="application", cascade="all, delete-orphan", uselist=False
    )
```

- [ ] **Step 7: Write `models/contact.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.application import application_contacts


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    title: Mapped[str | None] = mapped_column(String(200), default=None)
    email: Mapped[str | None] = mapped_column(String(320), default=None)
    linkedin_url: Mapped[str | None] = mapped_column(String(2000), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped["Company"] = relationship(back_populates="contacts")  # noqa: F821
    applications: Mapped[list["Application"]] = relationship(  # noqa: F821
        secondary=application_contacts, back_populates="contacts"
    )
```

- [ ] **Step 8: Write `models/interview_stage.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import StageOutcome


class InterviewStage(Base):
    __tablename__ = "interview_stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None, index=True
    )
    outcome: Mapped[StageOutcome] = mapped_column(
        Enum(StageOutcome, native_enum=False, length=10), default=StageOutcome.PENDING
    )
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    position: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    application: Mapped["Application"] = relationship(back_populates="stages")  # noqa: F821
```

- [ ] **Step 9: Write `models/comparison.py`**

```python
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Comparison(Base):
    __tablename__ = "comparisons"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True
    )
    matched_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    missing_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    match_percentage: Mapped[int | None] = mapped_column(default=None)  # None: no terms found
    ran_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    application: Mapped["Application"] = relationship(back_populates="comparison")  # noqa: F821
```

- [ ] **Step 10: Write `models/job_run.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import JobStatus, JobType


class JobRun(Base):
    __tablename__ = "job_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_type: Mapped[JobType] = mapped_column(Enum(JobType, native_enum=False, length=20))
    # NULL for system-wide runs (quiet check); set for per-account digest runs.
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), default=None, index=True
    )
    ran_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus, native_enum=False, length=10))
    detail: Mapped[str | None] = mapped_column(String(500), default=None)
```

- [ ] **Step 11: Write `models/__init__.py`**

```python
from app.models.account import Account, Session
from app.models.application import Application, application_contacts
from app.models.company import Company
from app.models.comparison import Comparison
from app.models.contact import Contact
from app.models.interview_stage import InterviewStage
from app.models.job_run import JobRun

__all__ = [
    "Account",
    "Application",
    "Company",
    "Comparison",
    "Contact",
    "InterviewStage",
    "JobRun",
    "Session",
    "application_contacts",
]
```

**Also:** `conftest.py` must `import app.models  # noqa: F401` before `Base.metadata.create_all` (add the import at the top of `conftest.py`) so all tables register.

- [ ] **Step 12: Run tests** — `uv run pytest` → all pass.

- [ ] **Step 13: Format, lint, commit**

```bash
uv run ruff format . && uv run ruff check .
git add src/app/models tests/test_models.py tests/conftest.py
git commit -m "feat(backend): relational schema for accounts, applications, and jobs"
```

---

### Task 4: Alembic async migrations + initial revision

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/` (via `alembic init`), `backend/alembic/versions/<hash>_initial_schema.py` (autogenerated)

**Interfaces:**
- Consumes: `Base.metadata` with all models imported (Task 3).
- Produces: `uv run alembic upgrade head` builds the full schema on any empty database pointed to by `DATABASE_URL`.

- [ ] **Step 1: Init**

Run from `backend/`: `uv run alembic init -t async alembic`

- [ ] **Step 2: Wire `alembic/env.py`** — replace the `target_metadata = None` block:

```python
import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.config import get_settings
from app.database import Base

target_metadata = Base.metadata
config.set_main_option("sqlalchemy.url", get_settings().database_url)
```

(Leave the rest of the async template as generated. In `alembic.ini`, blank out `sqlalchemy.url = ` — the env var wins.)

- [ ] **Step 3: Generate the initial revision**

```bash
DATABASE_URL="sqlite+aiosqlite:///./_alembic_scratch.db" uv run alembic revision --autogenerate -m "initial schema"
```

Review the generated file: it must create all 8 tables + association table indexes/uniques. Delete `_alembic_scratch.db` after.

- [ ] **Step 4: Verify upgrade runs clean**

```bash
rm -f ./_alembic_scratch.db
DATABASE_URL="sqlite+aiosqlite:///./_alembic_scratch.db" uv run alembic upgrade head
rm ./_alembic_scratch.db
```

Expected: exits 0, logs the revision.

- [ ] **Step 5: Confirm full suite still green** — `uv run pytest`.

- [ ] **Step 6: Format, lint, commit**

```bash
uv run ruff format . && uv run ruff check .
git add alembic.ini alembic
git commit -m "feat(backend): alembic async migrations with initial schema"
```

---

### Task 5: Security helpers

**Files:**
- Create: `backend/src/app/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Produces: `async hash_password(password: str) -> str`, `async verify_password(password: str, hashed: str) -> bool`, `DUMMY_HASH: str`, `generate_session_token() -> str`, `hash_session_token(token: str) -> str` (sha256 hexdigest, 64 chars).

- [ ] **Step 1: Write failing tests `tests/test_security.py`**

```python
from app.security import (
    DUMMY_HASH,
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


async def test_password_roundtrip() -> None:
    hashed = await hash_password("correct horse")
    assert hashed != "correct horse"
    assert await verify_password("correct horse", hashed)
    assert not await verify_password("wrong", hashed)


async def test_dummy_hash_verifies_false() -> None:
    assert not await verify_password("anything", DUMMY_HASH)


def test_session_token_hashing() -> None:
    token = generate_session_token()
    assert len(token) >= 32
    digest = hash_session_token(token)
    assert digest == hash_session_token(token)
    assert len(digest) == 64
    assert digest != token
```

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_security.py -v` → FAIL (module missing).

- [ ] **Step 3: Write `src/app/security.py`**

```python
import hashlib
import secrets

from fastapi.concurrency import run_in_threadpool
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()  # Argon2id

# Verified when the email is unknown, so unknown-email and wrong-password
# take similar time (no user enumeration by timing).
DUMMY_HASH = password_hash.hash("dummy-password-for-timing")


async def hash_password(password: str) -> str:
    return await run_in_threadpool(password_hash.hash, password)


async def verify_password(password: str, hashed: str) -> bool:
    return await run_in_threadpool(password_hash.verify, password, hashed)


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    # Sessions are stored hashed so a DB leak doesn't expose live sessions.
    return hashlib.sha256(token.encode()).hexdigest()
```

- [ ] **Step 4: Run tests** — `uv run pytest tests/test_security.py -v` → PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
uv run ruff format . && uv run ruff check .
git add src/app/security.py tests/test_security.py
git commit -m "feat(backend): password hashing and session token helpers"
```

---

### Task 6: Auth service — login, lockout, session validation, logout

**Files:**
- Create: `backend/src/app/services/auth_service.py`, `backend/src/app/dependencies.py`
- Modify: `backend/tests/conftest.py` (add `get_db` override to `app` fixture — exact code in Task 1 Step 7 — plus fixtures below)
- Test: `backend/tests/test_auth_service.py`

**Interfaces:**
- Consumes: models (Task 3), security helpers (Task 5), `utcnow()` (Task 1), errors (Task 2).
- Produces:
  - `AuthService(db: AsyncSession, settings: Settings)` with:
    - `async login(email: str, password: str) -> tuple[str, datetime]` — returns `(raw_token, expires_at)`; raises `AuthenticationError(code=INVALID_CREDENTIALS)` or `AuthenticationError(code=ACCOUNT_LOCKED)`.
    - `async logout(raw_token: str) -> None` — deletes the session row if present; no error if absent.
    - `async get_account_for_token(raw_token: str) -> Account | None` — `None` when the token is unknown or expired (expired rows are deleted on sight).
  - `app/dependencies.py`: `get_db` (yields from `request.app.state.sessionmaker`), `DbDep`, `SettingsDep = Annotated[Settings, Depends(get_settings)]`, `get_current_account(session: Annotated[str | None, Cookie()] , db, settings) -> Account` raising `AuthenticationError` (401 UNAUTHENTICATED) when missing/invalid, and `CurrentAccountDep`.

- [ ] **Step 1: Add auth fixtures to `conftest.py`**

```python
from app.models import Account
from app.security import hash_password


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
```

- [ ] **Step 2: Write failing tests `tests/test_auth_service.py`**

```python
from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.auth_service as auth_module
from app.clock import utcnow
from app.config import get_settings
from app.errors import AuthenticationError, ErrorCode
from app.models import Account
from app.services.auth_service import AuthService


@pytest.fixture
def service(db_session: AsyncSession) -> AuthService:
    return AuthService(db_session, get_settings())


async def test_login_returns_token_and_expiry(service: AuthService, owner_account: Account) -> None:
    token, expires_at = await service.login("owner@example.com", "owner-password-1")
    assert token
    assert expires_at - utcnow() > timedelta(days=6)
    account = await service.get_account_for_token(token)
    assert account is not None and account.id == owner_account.id


async def test_wrong_password_is_invalid_credentials(
    service: AuthService, owner_account: Account
) -> None:
    with pytest.raises(AuthenticationError) as exc:
        await service.login("owner@example.com", "nope")
    assert exc.value.code is ErrorCode.INVALID_CREDENTIALS


async def test_unknown_email_same_error(service: AuthService) -> None:
    with pytest.raises(AuthenticationError) as exc:
        await service.login("ghost@example.com", "whatever")
    assert exc.value.code is ErrorCode.INVALID_CREDENTIALS


async def test_lockout_after_5_failures_then_recovery(
    service: AuthService, owner_account: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    for _ in range(5):
        with pytest.raises(AuthenticationError):
            await service.login("owner@example.com", "nope")

    # AC-01.3: even the correct password is refused while locked.
    with pytest.raises(AuthenticationError) as exc:
        await service.login("owner@example.com", "owner-password-1")
    assert exc.value.code is ErrorCode.ACCOUNT_LOCKED

    # 15 minutes later the correct password succeeds.
    later = utcnow() + timedelta(minutes=15, seconds=1)
    monkeypatch.setattr(auth_module, "utcnow", lambda: later)
    token, _ = await service.login("owner@example.com", "owner-password-1")
    assert token


async def test_failures_outside_window_do_not_lock(
    service: AuthService, owner_account: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    for _ in range(4):
        with pytest.raises(AuthenticationError):
            await service.login("owner@example.com", "nope")

    # 5th failure lands after the 15-minute window: it starts a new window.
    later = utcnow() + timedelta(minutes=16)
    monkeypatch.setattr(auth_module, "utcnow", lambda: later)
    with pytest.raises(AuthenticationError) as exc:
        await service.login("owner@example.com", "nope")
    assert exc.value.code is ErrorCode.INVALID_CREDENTIALS  # not locked

    token, _ = await service.login("owner@example.com", "owner-password-1")
    assert token  # success also resets the counter


async def test_expired_session_is_rejected(
    service: AuthService, owner_account: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    token, _ = await service.login("owner@example.com", "owner-password-1")
    later = utcnow() + timedelta(days=7, seconds=1)
    monkeypatch.setattr(auth_module, "utcnow", lambda: later)
    assert await service.get_account_for_token(token) is None


async def test_logout_revokes_immediately(service: AuthService, owner_account: Account) -> None:
    token, _ = await service.login("owner@example.com", "owner-password-1")
    await service.logout(token)
    assert await service.get_account_for_token(token) is None
```

- [ ] **Step 3: Run to verify failure** — `uv run pytest tests/test_auth_service.py -v` → FAIL (module missing).

- [ ] **Step 4: Write `src/app/services/auth_service.py`**

```python
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.config import Settings
from app.errors import AuthenticationError, ErrorCode
from app.models import Account, Session
from app.security import (
    DUMMY_HASH,
    generate_session_token,
    hash_password as _hash_password,  # noqa: F401  (seed script reuses this module)
    hash_session_token,
    verify_password,
)

LOCKED_DETAIL = "Too many attempts. Try again in 15 minutes."
INVALID_DETAIL = "Email or password is incorrect"


class AuthService:
    def __init__(self, db: AsyncSession, settings: Settings) -> None:
        self.db = db
        self.settings = settings

    async def login(self, email: str, password: str) -> tuple[str, datetime]:
        result = await self.db.execute(select(Account).where(Account.email == email))
        account = result.scalar_one_or_none()

        now = utcnow()
        if account is not None and account.locked_until is not None:
            if now < self._aware(account.locked_until):
                raise AuthenticationError(LOCKED_DETAIL, code=ErrorCode.ACCOUNT_LOCKED)
            account.locked_until = None

        # Verify even for unknown emails: comparable timing either way.
        valid = await verify_password(
            password, account.hashed_password if account else DUMMY_HASH
        )
        if account is None:
            raise AuthenticationError(INVALID_DETAIL, code=ErrorCode.INVALID_CREDENTIALS)
        if not valid:
            await self._record_failure(account, now)
            raise AuthenticationError(INVALID_DETAIL, code=ErrorCode.INVALID_CREDENTIALS)

        account.failed_login_count = 0
        account.lockout_window_started_at = None
        raw_token = generate_session_token()
        expires_at = now + timedelta(days=self.settings.session_ttl_days)
        self.db.add(
            Session(
                account_id=account.id,
                token_hash=hash_session_token(raw_token),
                expires_at=expires_at,
            )
        )
        await self.db.commit()
        return raw_token, expires_at

    async def logout(self, raw_token: str) -> None:
        await self.db.execute(
            delete(Session).where(Session.token_hash == hash_session_token(raw_token))
        )
        await self.db.commit()

    async def get_account_for_token(self, raw_token: str) -> Account | None:
        result = await self.db.execute(
            select(Session).where(Session.token_hash == hash_session_token(raw_token))
        )
        session = result.scalar_one_or_none()
        if session is None:
            return None
        if utcnow() >= self._aware(session.expires_at):
            await self.db.delete(session)
            await self.db.commit()
            return None
        return await self.db.get(Account, session.account_id)

    async def _record_failure(self, account: Account, now: datetime) -> None:
        window = timedelta(minutes=self.settings.lockout_window_minutes)
        started = account.lockout_window_started_at
        if started is None or now - self._aware(started) > window:
            account.lockout_window_started_at = now
            account.failed_login_count = 1
        else:
            account.failed_login_count += 1

        if account.failed_login_count >= self.settings.lockout_max_attempts:
            account.locked_until = now + timedelta(
                minutes=self.settings.lockout_duration_minutes
            )
            account.failed_login_count = 0
            account.lockout_window_started_at = None
        await self.db.commit()

    @staticmethod
    def _aware(value: datetime) -> datetime:
        # SQLite returns naive datetimes even for timezone=True columns.
        from datetime import UTC

        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
```

**Important:** every `utcnow()` call inside this module must go through the module-level import (`from app.clock import utcnow` then call `utcnow()`), because tests monkeypatch `app.services.auth_service.utcnow`.

- [ ] **Step 5: Write `src/app/dependencies.py`**

```python
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Cookie, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.errors import AuthenticationError
from app.models import Account
from app.services.auth_service import AuthService


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    async with request.app.state.sessionmaker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


DbDep = Annotated[AsyncSession, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_auth_service(db: DbDep, settings: SettingsDep) -> AuthService:
    return AuthService(db, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


async def get_current_account(
    service: AuthServiceDep,
    session: Annotated[str | None, Cookie()] = None,
) -> Account:
    if not session:
        raise AuthenticationError("Not signed in")
    account = await service.get_account_for_token(session)
    if account is None:
        raise AuthenticationError("Session is invalid or expired")
    return account


CurrentAccountDep = Annotated[Account, Depends(get_current_account)]
```

- [ ] **Step 6: Update the `app` fixture in `conftest.py`** to override `get_db` (exact code already shown in Task 1 Step 7).

- [ ] **Step 7: Run tests** — `uv run pytest` → all pass.

- [ ] **Step 8: Format, lint, commit**

```bash
uv run ruff format . && uv run ruff check .
git add src/app/services src/app/dependencies.py tests
git commit -m "feat(backend): auth service with sessions and login lockout"
```

---

### Task 7: Auth API — routes, schemas, endpoint tests (F-01 ACs)

**Files:**
- Create: `backend/src/app/schemas/auth.py`, `backend/src/app/routers/auth.py` (+ empty `schemas/__init__.py`, `routers/__init__.py`, `services/__init__.py` if missing)
- Modify: `backend/src/app/main.py` (include router)
- Modify: `backend/tests/conftest.py` (add `auth_client` fixture)
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `AuthServiceDep`, `CurrentAccountDep` (Task 6).
- Produces endpoints:
  - `POST /auth/login` → 200 `{"token": str, "expires_at": ISO-8601-UTC}` | 401 INVALID_CREDENTIALS/ACCOUNT_LOCKED | 422 VALIDATION_FAILED
  - `POST /auth/logout` → 204 (requires session)
  - `GET /auth/me` → 200 `{"id", "email", "is_demo", "quiet_threshold_days", "timezone"}` | 401

- [ ] **Step 1: Write failing tests `tests/test_auth.py`**

```python
from httpx import AsyncClient

from app.models import Account


async def test_login_success_returns_token_and_expiry(
    client: AsyncClient, owner_account: Account
) -> None:  # AC-01.1
    response = await client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "owner-password-1"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token"]
    assert body["expires_at"].endswith("Z") or "+00:00" in body["expires_at"]


async def test_wrong_password_generic_error(
    client: AsyncClient, owner_account: Account
) -> None:  # AC-01.2
    response = await client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "wrong"}
    )
    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "INVALID_CREDENTIALS"
    assert body["detail"] == "Email or password is incorrect"
    assert "www-authenticate" not in response.headers


async def test_empty_fields_are_validation_not_attempt(
    client: AsyncClient, owner_account: Account
) -> None:
    for _ in range(5):
        response = await client.post("/auth/login", json={"email": "", "password": ""})
        assert response.status_code == 422
    # Five empty submissions counted no attempts: correct login still works.
    ok = await client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "owner-password-1"}
    )
    assert ok.status_code == 200


async def test_protected_endpoint_without_session(client: AsyncClient) -> None:  # AC-01.6
    response = await client.get("/auth/me")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


async def test_me_with_session(client: AsyncClient, owner_account: Account) -> None:
    login = await client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "owner-password-1"}
    )
    client.cookies.set("session", login.json()["token"])
    response = await client.get("/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "owner@example.com"
    assert "hashed_password" not in body


async def test_logout_revokes_session(client: AsyncClient, owner_account: Account) -> None:  # AC-01.4
    login = await client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "owner-password-1"}
    )
    client.cookies.set("session", login.json()["token"])
    assert (await client.post("/auth/logout")).status_code == 204
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_lockout_via_api(client: AsyncClient, owner_account: Account) -> None:  # AC-01.3 (API half)
    for _ in range(5):
        await client.post("/auth/login", json={"email": "owner@example.com", "password": "no"})
    response = await client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "owner-password-1"}
    )
    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "ACCOUNT_LOCKED"
    assert body["detail"] == "Too many attempts. Try again in 15 minutes."


def test_no_signup_route_exists(app) -> None:  # AC-01.9
    paths = {route.path for route in app.routes}
    assert not any("signup" in p or "register" in p for p in paths)
```

(AC-01.5 session expiry and AC-01.3's time-passage half are covered at service level in Task 6, where the clock is patchable. AC-01.7 belongs to milestone 2's CRUD; AC-01.8 to the milestone-2 demo seed.)

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_auth.py -v` → FAIL (404s).

- [ ] **Step 3: Write `src/app/schemas/auth.py`**

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
    token: str
    expires_at: datetime


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    is_demo: bool
    quiet_threshold_days: int
    timezone: str
```

- [ ] **Step 4: Write `src/app/routers/auth.py`**

```python
from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status

from app.dependencies import AuthServiceDep, CurrentAccountDep
from app.schemas.auth import AccountResponse, LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, service: AuthServiceDep):
    token, expires_at = await service.login(payload.email, payload.password)
    return LoginResponse(token=token, expires_at=expires_at)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    service: AuthServiceDep,
    _account: CurrentAccountDep,
    session: Annotated[str | None, Cookie()] = None,
) -> Response:
    if session:
        await service.logout(session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=AccountResponse)
async def me(account: CurrentAccountDep):
    return account
```

- [ ] **Step 5: Include router in `main.py`** — `from app.routers import auth` … `app.include_router(auth.router)` after `register_exception_handlers(app)`.

- [ ] **Step 6: Run tests** — `uv run pytest` → all pass. If `EmailStr` rejects `""` with a different message than expected, that's fine — the test only asserts 422.

- [ ] **Step 7: Format, lint, commit**

```bash
uv run ruff format . && uv run ruff check .
git add src/app tests
git commit -m "feat(backend): auth endpoints with cookie sessions"
```

---

### Task 8: Seed script, env example, manual steps

**Files:**
- Create: `backend/scripts/seed.py`, `backend/.env.example`
- Modify: `/MANUAL_STEPS.md` (repo root; create if missing — it's gitignored)

**Interfaces:**
- Consumes: `get_settings()`, models, `hash_password`.
- Produces: `uv run python scripts/seed.py` — idempotent; creates or updates the owner and demo accounts from env vars.

- [ ] **Step 1: Write `backend/.env.example`**

```bash
# Neon Postgres connection string (asyncpg driver)
DATABASE_URL=postgresql+asyncpg://REPLACE_ME
# Seed accounts (scripts/seed.py) — the only two accounts in the system
OWNER_EMAIL=owner@example.com
OWNER_PASSWORD=REPLACE_ME
DEMO_EMAIL=demo@example.com
DEMO_PASSWORD=REPLACE_ME
```

- [ ] **Step 2: Write `backend/scripts/seed.py`**

```python
"""Create or update the owner and demo accounts (PRD F-01: exactly two accounts).

Idempotent: re-running updates passwords in place. Demo sample data is seeded
in milestone 2 once application/contact semantics exist.

Usage: uv run python scripts/seed.py  (reads .env)
"""

import asyncio
import os
import sys

from sqlalchemy import select

from app.config import get_settings
from app.database import build_engine, build_sessionmaker
from app.models import Account
from app.security import hash_password


async def upsert_account(session, email: str, password: str, *, is_demo: bool) -> str:
    result = await session.execute(select(Account).where(Account.email == email))
    account = result.scalar_one_or_none()
    hashed = await hash_password(password)
    if account is None:
        session.add(Account(email=email, hashed_password=hashed, is_demo=is_demo))
        return f"created {email}"
    account.hashed_password = hashed
    account.is_demo = is_demo
    return f"updated {email}"


async def main() -> None:
    required = ["OWNER_EMAIL", "OWNER_PASSWORD", "DEMO_EMAIL", "DEMO_PASSWORD"]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        sys.exit(f"Missing env vars: {', '.join(missing)} (see .env.example)")

    engine = build_engine(get_settings().database_url)
    async with build_sessionmaker(engine)() as session:
        print(
            await upsert_account(
                session, os.environ["OWNER_EMAIL"], os.environ["OWNER_PASSWORD"], is_demo=False
            )
        )
        print(
            await upsert_account(
                session, os.environ["DEMO_EMAIL"], os.environ["DEMO_PASSWORD"], is_demo=True
            )
        )
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
```

Note: `scripts/seed.py` reads the four account env vars directly (they're seed-time inputs, not app config — keeping them out of `Settings` avoids making the API require them). This is the one sanctioned `os.environ` site; say so in the module docstring if ruff or review flags it.

Also load `.env`: pydantic-settings only loads `.env` into `Settings`, not `os.environ`. Simplest fix that keeps `uv run python scripts/seed.py` working: at the top of `main()`, before the check, add

```python
from dotenv import load_dotenv

load_dotenv()
```

`python-dotenv` ships as a dependency of `pydantic-settings` — verify with `uv run python -c "import dotenv"`; if absent, `uv add python-dotenv`.

- [ ] **Step 3: Smoke-test locally against SQLite**

```bash
DATABASE_URL="sqlite+aiosqlite:///./_seed_scratch.db" uv run alembic upgrade head
DATABASE_URL="sqlite+aiosqlite:///./_seed_scratch.db" OWNER_EMAIL=o@x.com OWNER_PASSWORD=pw1 \
  DEMO_EMAIL=d@x.com DEMO_PASSWORD=pw2 uv run python scripts/seed.py
# run again to confirm idempotency → prints "updated ..."
rm ./_seed_scratch.db
```

- [ ] **Step 4: Append to `/MANUAL_STEPS.md`** (repo root, gitignored):

```markdown
## Milestone 1 — Neon + seed (added 2026-09-16)

1. Create a Neon Postgres project (free tier) at https://neon.tech; copy the connection string.
2. In `backend/.env` (copy from `.env.example`): set `DATABASE_URL` using the
   `postgresql+asyncpg://` scheme (Neon gives `postgresql://`; swap the scheme,
   keep `sslmode=require` as `?ssl=require` if present).
3. Choose real values for OWNER_EMAIL/OWNER_PASSWORD and DEMO_EMAIL/DEMO_PASSWORD
   (demo credentials will be published in the README later — pick accordingly).
4. From `backend/`: `uv run alembic upgrade head`, then `uv run python scripts/seed.py`.
5. Verify: `uv run uvicorn app.main:create_app --factory` then POST /auth/login
   with the owner credentials → expect a token.
```

- [ ] **Step 5: Format, lint, commit**

```bash
uv run ruff format . && uv run ruff check .
git add scripts/seed.py .env.example
git commit -m "feat(backend): account seed script and env template"
```

---

### Task 9: Milestone verification

- [ ] **Step 1:** `cd backend && uv run pytest` → all tests pass.
- [ ] **Step 2:** `uv run ruff check .` → clean.
- [ ] **Step 3:** `uv run ruff format --check .` → clean.
- [ ] **Step 4:** OpenAPI sanity (NFR-01): `uv run python -c "from app.main import create_app; import os; os.environ.setdefault('DATABASE_URL','sqlite+aiosqlite:///:memory:'); paths = create_app().openapi()['paths']; print(sorted(paths))"` → shows `/auth/login`, `/auth/logout`, `/auth/me`, `/health` and no signup route.
- [ ] **Step 5:** `git status` → clean tree, nothing gitignored staged; `git log --oneline` shows conventional commits without AI attribution.

## Self-Review (done at planning time)

- **Spec coverage:** AC-01.1–01.6 and 01.9 covered by Tasks 6–7 tests; AC-01.7 (cross-account 404) and AC-01.8 (demo sample data) are milestone-2 items by design (they require F-02/F-03), recorded above. Schema covers every §8 entity including run records and comparison staleness fields.
- **Contract:** error codes, no-WWW-Authenticate, cookie name `session`, login body `{token, expires_at}`, snake_case, lowercase enums — all pinned in Tasks 2, 6, 7. Shared fixture committed at `docs/api-fixtures/validation-error.json` (backend half of the contract's Enforcement section; frontend half lands with milestone-2 frontend work).
- **Type consistency:** `AuthService.login -> tuple[str, datetime]` consumed by router Task 7; `get_account_for_token -> Account | None` consumed by `get_current_account`; fixture `owner_account` password `owner-password-1` consistent across Tasks 6–7.
