# Milestone 2: CRUD API + Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete backend API for PRD F-02 (applications + companies) and F-03 (contacts + interview stages), plus account settings (quiet threshold, time zone), cross-account isolation (AC-01.7), and demo sample data (AC-01.8) — all covered by tests.

**Architecture:** Same layering as milestone 1: thin routers → service classes (own the transaction, raise `AppError` subclasses) → SQLAlchemy async models that already exist. Every entity lookup is scoped by `account_id`, so foreign rows are indistinguishable from missing rows (404). "Last activity" is maintained in one helper (`services/activity.py`) called by the application and stage services only — contact edits never touch it (F-04 rules). Cascading deletes (stages, comparison, contacts, contact links) are delegated to database `ON DELETE CASCADE` via `passive_deletes=True`; tests turn on SQLite foreign keys so the behavior matches Postgres.

**Tech Stack:** Python 3.14, FastAPI, Pydantic v2, SQLAlchemy 2.0 async, pytest + pytest-asyncio + httpx (existing). Adds `tzdata` (runtime) for time-zone validation on hosts without a system zone database.

**Spec:** `docs/PRD.md` §7 F-02 + F-03 (plus AC-01.7, AC-01.8, AC-04.9, NFR-07, NFR-08), `docs/API_CONTRACT.md`. AGENTS.md governs process. **Frontend work is not part of this milestone** — milestone 2 is "CRUD API + tests" per AGENTS.md; the UI is raised at the milestone checkpoint.

## Global Constraints

- All work in `backend/`; run commands from `backend/` with `uv run …`.
- Type hints on all signatures; async DB access throughout; no blocking I/O in request paths.
- Routes thin → services own business logic and transactions and raise `AppError` subclasses (`app/errors.py`), never `HTTPException`. Every route declares `response_model` (or `status_code=204`).
- Every lookup filters by `account_id`; foreign or missing rows raise `NotFoundError` (`NOT_FOUND`, 404) — AC-01.7.
- Errors are `application/problem+json` per `docs/API_CONTRACT.md`. Field-level failures use `errors[]` entries `{location, field, message, type}`.
- Wire values: snake_case; enums lowercase (`wishlist|applied|interviewing|offer|rejected|withdrawn`, `pending|passed|failed`, `on_site|hybrid|remote`); timestamps ISO 8601 UTC.
- Config only via `Settings`; no new env vars are needed in this milestone.
- TDD: failing test first, then implementation. Tests live in `backend/tests/` mirroring source.
- Commits: conventional messages, **no AI attribution of any kind**. Never `git add` AGENTS.md, CLAUDE.md, `.claude/`, MANUAL_STEPS.md, docs/OPERATOR_RUNBOOK.md, or `docs/superpowers/`.
- Verification before claiming done: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .` (run `uv run ruff format .` before finishing).
- PRD Non-goals: no pagination/export/import, no custom statuses, no file upload, no sign-up.

## Decisions recorded (PRD is silent / contract choice)

- **Duplicate application warning (AC-02.5):** `POST /applications` refuses with `409 DUPLICATE_APPLICATION` (body carries `existing_id`) when an application with the same company and case-insensitive role title exists, unless the request sets `confirm_duplicate: true`. The frontend shows the warning and re-submits with the flag.
- **Offering the existing company (AC-02.4):** `409 COMPANY_NAME_TAKEN` carries an RFC 9457 extension member `existing_id` (the existing company's id) so the client can offer it. `AppError` gains an `extra` dict merged into the problem body. Recorded in `docs/API_CONTRACT.md`.
- **Inline company creation:** `POST /applications` takes exactly one of `company_id` or `company` (`{name, website?, notes?}`). Inline creation and the application insert share one transaction.
- **Cross-field validation lives in the service layer** (`salary_min ≤ salary_max`, salary needs currency, date applied not in the future) so create and PATCH share one rule set. Failures raise `ValidationFailedError` with an `errors[]` entry naming the field (NFR-07). Single-field shape rules (URL, email, currency format, non-blank) stay in Pydantic.
- **"Future" date applied** is judged against today in the account's time zone (NFR-08).
- **Stage `scheduled_at` on the wire:** aware datetimes are stored as-is (converted to UTC); naive datetimes are interpreted in the account's time zone. Responses are always UTC.
- **Stage move at the boundary** (top stage moved up, bottom moved down) is a no-op returning `200` with the unchanged list.
- **Contact links:** `PUT /applications/{id}/contacts/{contact_id}` is idempotent (204 whether or not the link existed); `DELETE` likewise. Linking across companies → `409 CONTACT_COMPANY_MISMATCH`.
- **Company deletion with applications** → `409 COMPANY_HAS_APPLICATIONS`, detail "Delete or move this company's applications first." Deleting a company with no applications deletes its contacts (DB cascade).
- **No list pagination.** Two personal accounts; the lists return everything. Sorting is server-side: `sort=last_activity|date_applied`, `order=asc|desc`, default `last_activity desc`; nulls sort last.
- **Settings endpoint** (`PATCH /settings`: `quiet_threshold_days` 1–90 integer, `timezone` IANA name) ships now because F-04's daily job (milestone 3) and NFR-08 need it and it is plain CRUD. Resume text (F-06) waits for milestone 4. `GET /auth/me` already returns the settings.
- **Cascades are database-level.** Relationships that cascade get `passive_deletes=True`; the SQLite test engine enables `PRAGMA foreign_keys=ON`. The existing schema already declares `ON DELETE CASCADE` on stages, comparison, contacts, sessions, and the link table, so **no migration is needed**.
- **Demo sample data** (AC-01.8) is rebuilt on every `scripts/seed.py` run: the demo account's applications, companies, contacts, and stages are deleted and recreated (R-07 re-runnable seed). Owner data is never touched.
- **Application response shape:** list rows are `ApplicationSummary` (company `{id,name}`, role, status, date applied, last activity, quiet flag); detail adds all fields plus ordered `stages` and `contacts`. The saved comparison joins the detail in milestone 4.

## Endpoint Map

| Method | Path | Response | Notes |
| --- | --- | --- | --- |
| PATCH | `/settings` | `AccountResponse` | threshold 1–90 strict int; IANA time zone |
| GET | `/companies` | `list[CompanyResponse]` | ordered by name |
| POST | `/companies` | `CompanyResponse` 201 | 409 `COMPANY_NAME_TAKEN` + `existing_id` |
| GET | `/companies/{id}` | `CompanyDetailResponse` | applications (recent first) + contacts (by name) |
| PATCH | `/companies/{id}` | `CompanyResponse` | rename re-checks uniqueness |
| DELETE | `/companies/{id}` | 204 | 409 `COMPANY_HAS_APPLICATIONS` |
| GET | `/applications` | `list[ApplicationSummary]` | `status`, `sort`, `order` query params |
| POST | `/applications` | `ApplicationDetailResponse` 201 | inline company; `confirm_duplicate` |
| GET | `/applications/{id}` | `ApplicationDetailResponse` | |
| PATCH | `/applications/{id}` | `ApplicationDetailResponse` | records activity |
| DELETE | `/applications/{id}` | 204 | cascades stages + comparison + links |
| POST | `/applications/{id}/stages` | `StageResponse` 201 | appended last; records activity |
| PATCH | `/applications/{id}/stages/{sid}` | `StageResponse` | records activity |
| DELETE | `/applications/{id}/stages/{sid}` | 204 | renumbers; records activity |
| POST | `/applications/{id}/stages/{sid}/move` | `list[StageResponse]` | `{direction: up\|down}`; records activity |
| POST | `/contacts` | `ContactResponse` 201 | `company_id` must be the account's |
| GET | `/contacts/{id}` | `ContactResponse` | |
| PATCH | `/contacts/{id}` | `ContactResponse` | no activity |
| DELETE | `/contacts/{id}` | 204 | links removed by cascade |
| PUT | `/applications/{id}/contacts/{cid}` | 204 | idempotent; 409 `CONTACT_COMPANY_MISMATCH` |
| DELETE | `/applications/{id}/contacts/{cid}` | 204 | idempotent |

## File Structure

```
backend/
├── pyproject.toml                        # + tzdata
├── src/app/
│   ├── errors.py                         # + 3 codes, AppError.extra, field_error()
│   ├── error_handlers.py                 # merge extra into body
│   ├── main.py                           # include new routers
│   ├── models/company.py                 # relationship order_by + passive_deletes
│   ├── models/application.py             # passive_deletes on cascading relationships
│   ├── models/contact.py                 # passive_deletes on secondary
│   ├── schemas/common.py                 # NonBlankStr, HttpUrlStr, CurrencyCode, TimezoneName, reject_null
│   ├── schemas/settings.py               # SettingsUpdate
│   ├── schemas/company.py                # CompanyCreate/Update/Response/DetailResponse, CompanySummary
│   ├── schemas/application.py            # ApplicationCreate/Update/Summary/Response/DetailResponse
│   ├── schemas/contact.py                # ContactCreate/Update/Response
│   ├── schemas/interview_stage.py        # StageCreate/Update/Move/Response
│   ├── services/activity.py              # record_activity()
│   ├── services/settings_service.py
│   ├── services/company_service.py
│   ├── services/application_service.py
│   ├── services/stage_service.py
│   ├── services/contact_service.py
│   ├── routers/settings.py
│   ├── routers/companies.py
│   ├── routers/applications.py
│   ├── routers/stages.py
│   ├── routers/contacts.py               # /contacts + /applications/{id}/contacts links
│   └── demo_data.py                      # reset_demo_data() used by scripts/seed.py
├── scripts/seed.py                       # + demo data reset
└── tests/
    ├── conftest.py                       # + SQLite FKs, owner_client, other_client, factories
    ├── test_errors.py                    # + extra member test
    ├── test_settings.py
    ├── test_companies.py
    ├── test_applications.py
    ├── test_stages.py
    ├── test_contacts.py
    └── test_demo_data.py
docs/API_CONTRACT.md                      # + codes, existing_id, confirm_duplicate, sort params
```

## Dispatch Batches (for the controller)

| Batch | Tasks | Implementer | Review |
| --- | --- | --- | --- |
| B1 | Task 1 + Task 2 (foundations, settings, companies) | Sonnet | one Sonnet review |
| B2 | Task 3 (applications) | Sonnet | dedicated Sonnet review (validation + inline-company transaction are judgment-heavy) |
| B3 | Task 4 + Task 5 (stages, contacts + links) | Sonnet | one Sonnet review |
| B4 | Task 6 (demo data, contract doc) | Sonnet | Haiku review (transcription-grade) |
| — | Task 7 (verification) | controller | — |

Reports go to `docs/superpowers/plans/reports/m2-<batch>-{implementer,review}.md`.

---

### Task 1: Foundations — error extensions, shared schema types, cascades, test fixtures, settings endpoint

**Files:**
- Modify: `backend/pyproject.toml` (add `tzdata`)
- Modify: `backend/src/app/errors.py`, `backend/src/app/error_handlers.py`
- Modify: `backend/src/app/models/company.py`, `backend/src/app/models/application.py`, `backend/src/app/models/contact.py`
- Create: `backend/src/app/schemas/common.py`, `backend/src/app/schemas/settings.py`
- Create: `backend/src/app/services/settings_service.py`, `backend/src/app/routers/settings.py`
- Modify: `backend/src/app/main.py`
- Modify: `backend/tests/conftest.py`, `backend/tests/test_errors.py`
- Create: `backend/tests/__init__.py`, `backend/tests/test_settings.py`

**Interfaces:**
- Produces: `ErrorCode.{COMPANY_HAS_APPLICATIONS, DUPLICATE_APPLICATION, CONTACT_COMPANY_MISMATCH}`; `AppError(detail, *, code, errors, extra)`; `field_error(field: str, message: str) -> ValidationFailedError`; schema types `NonBlankStr`, `OptionalText`, `HttpUrlStr`, `CurrencyCode`, `TimezoneName`, and validator `reject_null`; fixtures `owner_client` (signed in as `owner_account`), `other_account`, `other_client`, and factories `make_company(db_session, account, name="Acme") -> Company`, `make_application(db_session, account, company, role_title="Backend Engineer", **fields) -> Application`.

- [ ] **Step 1: Add `tzdata`**

```bash
cd backend && uv add tzdata
```

- [ ] **Step 2: Failing tests for the error extension and the settings endpoint**

Append to `tests/test_errors.py`:

```python
async def test_app_error_extra_members_are_merged(app) -> None:
    from app.errors import ConflictError, ErrorCode

    @app.get("/probe-extra")
    async def probe_extra() -> dict[str, str]:  # pragma: no cover
        raise ConflictError(
            "Exists", code=ErrorCode.COMPANY_NAME_TAKEN, extra={"existing_id": 42}
        )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get("/probe-extra")
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "COMPANY_NAME_TAKEN"
    assert body["existing_id"] == 42
    assert "errors" not in body


async def test_field_error_helper_shape(app) -> None:
    from app.errors import field_error

    @app.get("/probe-field")
    async def probe_field() -> dict[str, str]:  # pragma: no cover
        raise field_error("salary_max", "Must be greater than or equal to salary_min")

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get("/probe-field")
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert body["errors"] == [
        {
            "location": "body",
            "field": "salary_max",
            "message": "Must be greater than or equal to salary_min",
            "type": "value_error",
        }
    ]
```

Create `tests/test_settings.py`:

```python
from httpx import AsyncClient


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
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `uv run pytest tests/test_errors.py tests/test_settings.py -v`
Expected: FAIL (fixture `owner_client` not found; `ImportError` for `field_error`; `TypeError` on `extra`).

- [ ] **Step 4: Extend `src/app/errors.py`**

Replace the `ErrorCode` enum and `AppError` with:

```python
class ErrorCode(StrEnum):
    VALIDATION_FAILED = "VALIDATION_FAILED"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    COMPANY_NAME_TAKEN = "COMPANY_NAME_TAKEN"
    COMPANY_HAS_APPLICATIONS = "COMPANY_HAS_APPLICATIONS"
    DUPLICATE_APPLICATION = "DUPLICATE_APPLICATION"
    CONTACT_COMPANY_MISMATCH = "CONTACT_COMPANY_MISMATCH"
    HTTP_ERROR = "HTTP_ERROR"
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
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.detail = detail if detail is not None else self.title
        if code is not None:
            self.code = code
        self.errors = errors
        # RFC 9457 extension members (e.g. existing_id); never overrides base keys.
        self.extra = extra
        super().__init__(detail or self.title)
```

Keep the four subclasses as they are and append at the end of the file:

```python
def field_error(field: str, message: str) -> ValidationFailedError:
    """One field-level failure in the contract's errors[] shape (NFR-07)."""
    return ValidationFailedError(
        "1 field(s) failed validation",
        errors=[
            {
                "location": "body",
                "field": field,
                "message": message,
                "type": "value_error",
            }
        ],
    )
```

- [ ] **Step 5: Merge `extra` in `src/app/error_handlers.py`**

Change `problem_response` to accept and merge extension members, and pass them from `app_error_handler`:

```python
def problem_response(
    *,
    status: int,
    code: ErrorCode | str,
    title: str,
    detail: str | None = None,
    errors: list[dict[str, Any]] | None = None,
    extra: dict[str, Any] | None = None,
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
    if extra:
        reserved = body.keys() | {"instance", "request_id"}
        body.update({k: v for k, v in extra.items() if k not in reserved})
    return JSONResponse(
        status_code=status, content=body, media_type="application/problem+json"
    )
```

In `app_error_handler`, add `extra=exc.extra,` to the `problem_response(...)` call.

- [ ] **Step 6: Database-level cascades on the models**

`src/app/models/company.py` — replace the two relationships:

```python
    applications: Mapped[list["Application"]] = relationship(  # noqa: F821, UP037
        back_populates="company", order_by="desc(Application.last_activity_at)"
    )
    contacts: Mapped[list["Contact"]] = relationship(  # noqa: F821, UP037
        back_populates="company",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Contact.name",
    )
```

`src/app/models/application.py` — replace the `stages`, `contacts`, `comparison` relationships:

```python
    stages: Mapped[list["InterviewStage"]] = relationship(  # noqa: F821, UP037
        back_populates="application",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewStage.position",
    )
    contacts: Mapped[list["Contact"]] = relationship(  # noqa: F821, UP037
        secondary=application_contacts,
        back_populates="applications",
        passive_deletes=True,
        order_by="Contact.name",
    )
    comparison: Mapped["Comparison | None"] = relationship(  # noqa: F821, UP037
        back_populates="application",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
```

`src/app/models/contact.py` — replace the `applications` relationship:

```python
    applications: Mapped[list["Application"]] = relationship(  # noqa: F821, UP037
        secondary=application_contacts,
        back_populates="contacts",
        passive_deletes=True,
    )
```

- [ ] **Step 7: Write `src/app/schemas/common.py`**

```python
"""Shared field types. Shape rules live here; cross-field rules live in services."""

from typing import Annotated, Any
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, BeforeValidator, Field


def _strip_non_blank(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Field required")
    return value


def _http_url(value: str) -> str:
    value = value.strip()
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        raise ValueError("Must be a valid http(s) URL")
    return value


def _upper_stripped(value: Any) -> Any:
    return value.strip().upper() if isinstance(value, str) else value


def _iana_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        raise ValueError("Unknown time zone") from None
    return value


def reject_null(value: Any) -> Any:
    """For PATCH fields that may be omitted but not cleared."""
    if value is None:
        raise ValueError("Field may be omitted but not set to null")
    return value


NonBlankStr = Annotated[str, Field(max_length=200), AfterValidator(_strip_non_blank)]
OptionalText = Annotated[str | None, Field(max_length=200)]
HttpUrlStr = Annotated[str, Field(max_length=2000), AfterValidator(_http_url)]
CurrencyCode = Annotated[
    str, BeforeValidator(_upper_stripped), Field(pattern=r"^[A-Z]{3}$")
]
TimezoneName = Annotated[str, Field(max_length=64), AfterValidator(_iana_timezone)]
```

- [ ] **Step 8: Settings schema, service, router**

`src/app/schemas/settings.py`:

```python
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import TimezoneName, reject_null


class SettingsUpdate(BaseModel):
    """PATCH: omitted fields are untouched; null is rejected (columns are NOT NULL)."""

    quiet_threshold_days: Annotated[int, Field(strict=True, ge=1, le=90)] | None = None
    timezone: TimezoneName | None = None

    _no_null = field_validator("quiet_threshold_days", "timezone")(reject_null)
```

`src/app/services/settings_service.py`:

```python
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account
from app.schemas.settings import SettingsUpdate


class SettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def update(self, account: Account, payload: SettingsUpdate) -> Account:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(account, field, value)
        await self.db.commit()
        return account
```

`src/app/routers/settings.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.auth import AccountResponse
from app.schemas.settings import SettingsUpdate
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/settings", tags=["settings"])


def get_settings_service(db: DbDep) -> SettingsService:
    return SettingsService(db)


SettingsServiceDep = Annotated[SettingsService, Depends(get_settings_service)]


@router.patch("", response_model=AccountResponse)
async def update_settings(
    payload: SettingsUpdate, account: CurrentAccountDep, service: SettingsServiceDep
):
    return await service.update(account, payload)
```

In `src/app/main.py` change the import to `from app.routers import auth, settings` and add `app.include_router(settings.router)` after the auth router. (Later tasks add `companies`, `applications`, `stages`, `contacts` to the same import and include list.)

- [ ] **Step 9: Test fixtures**

Create an empty `tests/__init__.py` so test modules can `from tests.conftest import make_company, make_application` (pytest then puts `backend/` on `sys.path`).

Replace the `engine` fixture in `tests/conftest.py` with one that enables foreign keys, and append the new fixtures and factories:

```python
from sqlalchemy import event
```

```python
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
```

```python
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
```

Add the imports `from app.clock import utcnow` and `from app.models import Account, Application, Company` (replacing the existing `Account` import). The existing `owner_account` fixture keeps its password `owner-password-1`.

Note: `owner_client` reuses the `client` fixture's `AsyncClient`; tests that need an anonymous request alongside an owner session use `client` before `owner_client` or create a second client via `ASGITransport`.

- [ ] **Step 10: Run the tests**

Run: `uv run pytest -v`
Expected: all pass, including the milestone 1 suite (the cascade tests in `test_models.py` still pass with foreign keys on; if one now fails because it relied on SQLite ignoring a foreign key, fix the test's data setup, not the model).

- [ ] **Step 11: Lint and format**

Run: `uv run ruff format . && uv run ruff check .`
Expected: clean.

---

### Task 2: Companies — schemas, service, router, tests

**Files:**
- Create: `backend/src/app/schemas/company.py`, `backend/src/app/schemas/application.py`, `backend/src/app/schemas/contact.py`, `backend/src/app/schemas/interview_stage.py`
- Create: `backend/src/app/services/company_service.py`, `backend/src/app/routers/companies.py`
- Modify: `backend/src/app/main.py`
- Create: `backend/tests/test_companies.py`

**Interfaces:**
- Consumes: Task 1 types, fixtures, `field_error`, `AppError.extra`.
- Produces: `CompanyService(db)` with `list(account_id) -> list[Company]`, `get(account_id, company_id) -> Company`, `get_detail(account_id, company_id) -> Company` (applications + contacts eagerly loaded), `add(account_id, payload: CompanyCreate) -> Company` (adds + flushes, **no commit**; raises `COMPANY_NAME_TAKEN`), `create(...)`, `update(...)`, `delete(...)`; response schemas `CompanySummary`, `CompanyResponse`, `CompanyDetailResponse`, `ApplicationSummary`, `ContactResponse`, `StageResponse`; `normalize_company_name(name) -> str`.

- [ ] **Step 1: Response schemas for every entity (used by Tasks 2–5)**

`src/app/schemas/company.py`:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.application import ApplicationSummary
from app.schemas.common import HttpUrlStr, NonBlankStr, reject_null
from app.schemas.contact import ContactResponse


class CompanyCreate(BaseModel):
    name: NonBlankStr
    website: HttpUrlStr | None = None
    notes: str | None = None


class CompanyUpdate(BaseModel):
    name: NonBlankStr | None = None
    website: HttpUrlStr | None = None
    notes: str | None = None

    _no_null = field_validator("name")(reject_null)


class CompanySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class CompanyResponse(CompanySummary):
    website: str | None
    notes: str | None
    created_at: datetime


class CompanyDetailResponse(CompanyResponse):
    applications: list[ApplicationSummary]
    contacts: list[ContactResponse]
```

`src/app/schemas/application.py` (response half; Task 3 adds the request schemas to this file):

```python
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ApplicationStatus, WorkArrangement
from app.schemas.contact import ContactResponse
from app.schemas.interview_stage import StageResponse


class _CompanyRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ApplicationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company: _CompanyRef
    role_title: str
    status: ApplicationStatus
    date_applied: date | None
    last_activity_at: datetime
    is_quiet: bool


class ApplicationResponse(ApplicationSummary):
    posting_url: str | None
    location: str | None
    work_arrangement: WorkArrangement | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    source: str | None
    notes: str | None
    job_description: str | None
    created_at: datetime


class ApplicationDetailResponse(ApplicationResponse):
    stages: list[StageResponse]
    contacts: list[ContactResponse]
```

(`_CompanyRef` duplicates `CompanySummary` on purpose: `schemas/company.py` imports this module, so importing back would be circular.)

`src/app/schemas/contact.py` (response half; Task 5 adds request schemas):

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    title: str | None
    email: str | None
    linkedin_url: str | None
    notes: str | None
    created_at: datetime
```

`src/app/schemas/interview_stage.py` (response half; Task 4 adds request schemas):

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import StageOutcome


class StageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    name: str
    scheduled_at: datetime | None
    outcome: StageOutcome
    notes: str | None
    position: int
    created_at: datetime
```

- [ ] **Step 2: Failing tests — `tests/test_companies.py`**

```python
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Company, Contact
from tests.conftest import make_application, make_company


async def test_create_company_minimal(owner_client: AsyncClient) -> None:
    response = await owner_client.post("/companies", json={"name": "  Acme  "})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Acme"
    assert body["website"] is None
    assert body["id"]


async def test_blank_name_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.post("/companies", json={"name": "   "})
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "name"


async def test_invalid_website_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.post(
        "/companies", json={"name": "Acme", "website": "acme.example"}
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "website"


async def test_duplicate_name_offers_existing(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.4
    existing = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.post("/companies", json={"name": " acme "})
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "COMPANY_NAME_TAKEN"
    assert body["existing_id"] == existing.id


async def test_same_name_allowed_across_accounts(
    owner_client: AsyncClient,
    other_client: AsyncClient,
) -> None:
    assert (await owner_client.post("/companies", json={"name": "Acme"})).status_code == 201
    assert (await other_client.post("/companies", json={"name": "Acme"})).status_code == 201


async def test_list_is_scoped_and_sorted(
    owner_client: AsyncClient,
    owner_account: Account,
    other_account: Account,
    db_session: AsyncSession,
) -> None:  # AC-01.7
    await make_company(db_session, owner_account, "Zeta")
    await make_company(db_session, owner_account, "alpha")
    await make_company(db_session, other_account, "Foreign")
    response = await owner_client.get("/companies")
    assert response.status_code == 200
    assert [c["name"] for c in response.json()] == ["alpha", "Zeta"]


async def test_get_other_accounts_company_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign = await make_company(db_session, other_account, "Foreign")
    for method, kwargs in (
        ("get", {}),
        ("patch", {"json": {"name": "X"}}),
        ("delete", {}),
    ):
        response = await owner_client.request(method, f"/companies/{foreign.id}", **kwargs)
        assert response.status_code == 404, method
        assert response.json()["code"] == "NOT_FOUND"


async def test_detail_lists_applications_and_contacts(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account, "Acme")
    app_row = await make_application(db_session, owner_account, company, "SRE")
    db_session.add(Contact(account_id=owner_account.id, company_id=company.id, name="Ann"))
    await db_session.commit()
    response = await owner_client.get(f"/companies/{company.id}")
    assert response.status_code == 200
    body = response.json()
    assert [a["id"] for a in body["applications"]] == [app_row.id]
    assert body["applications"][0]["company"] == {"id": company.id, "name": "Acme"}
    assert [c["name"] for c in body["contacts"]] == ["Ann"]


async def test_rename_conflict_and_success(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    acme = await make_company(db_session, owner_account, "Acme")
    beta = await make_company(db_session, owner_account, "Beta")
    conflict = await owner_client.patch(f"/companies/{beta.id}", json={"name": "ACME"})
    assert conflict.status_code == 409
    assert conflict.json()["existing_id"] == acme.id
    same = await owner_client.patch(f"/companies/{acme.id}", json={"name": "ACME"})
    assert same.status_code == 200  # renaming to its own name is fine
    assert same.json()["name"] == "ACME"
    ok = await owner_client.patch(
        f"/companies/{beta.id}", json={"website": "https://beta.example", "notes": None}
    )
    assert ok.status_code == 200
    assert ok.json()["website"] == "https://beta.example"


async def test_patch_name_null_rejected(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    acme = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.patch(f"/companies/{acme.id}", json={"name": None})
    assert response.status_code == 422


async def test_delete_refused_with_applications(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.6
    company = await make_company(db_session, owner_account, "Acme")
    await make_application(db_session, owner_account, company)
    response = await owner_client.delete(f"/companies/{company.id}")
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "COMPANY_HAS_APPLICATIONS"
    assert body["detail"] == "Delete or move this company's applications first."


async def test_delete_removes_company_and_contacts(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account, "Acme")
    db_session.add(Contact(account_id=owner_account.id, company_id=company.id, name="Ann"))
    await db_session.commit()
    response = await owner_client.delete(f"/companies/{company.id}")
    assert response.status_code == 204
    assert (await db_session.get(Company, company.id)) is None
    contacts = (await db_session.execute(select(func.count(Contact.id)))).scalar_one()
    assert contacts == 0


async def test_requires_session(client: AsyncClient) -> None:
    assert (await client.get("/companies")).status_code == 401
```

- [ ] **Step 3: Run to confirm failure**

Run: `uv run pytest tests/test_companies.py -v`
Expected: FAIL — 404/405 on `/companies` (router missing) and import errors.

- [ ] **Step 4: Write `src/app/services/company_service.py`**

```python
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ConflictError, ErrorCode, NotFoundError
from app.models import Application, Company
from app.schemas.company import CompanyCreate, CompanyUpdate

HAS_APPLICATIONS_DETAIL = "Delete or move this company's applications first."


def normalize_company_name(name: str) -> str:
    # PRD F-02: unique per account ignoring case and surrounding whitespace.
    return name.strip().casefold()


class CompanyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list(self, account_id: int) -> list[Company]:
        result = await self.db.execute(
            select(Company)
            .where(Company.account_id == account_id)
            .order_by(Company.name_normalized, Company.id)
        )
        return list(result.scalars())

    async def get(self, account_id: int, company_id: int) -> Company:
        result = await self.db.execute(
            select(Company).where(
                Company.id == company_id, Company.account_id == account_id
            )
        )
        company = result.scalar_one_or_none()
        if company is None:
            raise NotFoundError("Company not found")
        return company

    async def get_detail(self, account_id: int, company_id: int) -> Company:
        result = await self.db.execute(
            select(Company)
            .where(Company.id == company_id, Company.account_id == account_id)
            .options(
                selectinload(Company.applications).selectinload(Application.company),
                selectinload(Company.contacts),
            )
        )
        company = result.scalar_one_or_none()
        if company is None:
            raise NotFoundError("Company not found")
        return company

    async def add(self, account_id: int, payload: CompanyCreate) -> Company:
        """Add + flush without committing, so callers can extend the transaction."""
        normalized = normalize_company_name(payload.name)
        await self._ensure_name_free(account_id, normalized)
        company = Company(
            account_id=account_id,
            name=payload.name,
            name_normalized=normalized,
            website=payload.website,
            notes=payload.notes,
        )
        self.db.add(company)
        await self._flush_or_conflict(account_id, normalized)
        return company

    async def create(self, account_id: int, payload: CompanyCreate) -> Company:
        company = await self.add(account_id, payload)
        await self.db.commit()
        await self.db.refresh(company)
        return company

    async def update(
        self, account_id: int, company_id: int, payload: CompanyUpdate
    ) -> Company:
        company = await self.get(account_id, company_id)
        changes = payload.model_dump(exclude_unset=True)
        if "name" in changes:
            normalized = normalize_company_name(changes["name"])
            if normalized != company.name_normalized:
                await self._ensure_name_free(account_id, normalized)
            company.name_normalized = normalized
        for field, value in changes.items():
            setattr(company, field, value)
        await self._flush_or_conflict(account_id, company.name_normalized)
        await self.db.commit()
        await self.db.refresh(company)
        return company

    async def delete(self, account_id: int, company_id: int) -> None:
        company = await self.get(account_id, company_id)
        count = (
            await self.db.execute(
                select(func.count(Application.id)).where(
                    Application.company_id == company.id
                )
            )
        ).scalar_one()
        if count:
            raise ConflictError(
                HAS_APPLICATIONS_DETAIL, code=ErrorCode.COMPANY_HAS_APPLICATIONS
            )
        await self.db.delete(company)  # contacts go via ON DELETE CASCADE
        await self.db.commit()

    async def _find_by_normalized(
        self, account_id: int, normalized: str
    ) -> Company | None:
        result = await self.db.execute(
            select(Company).where(
                Company.account_id == account_id,
                Company.name_normalized == normalized,
            )
        )
        return result.scalar_one_or_none()

    async def _ensure_name_free(self, account_id: int, normalized: str) -> None:
        existing = await self._find_by_normalized(account_id, normalized)
        if existing is not None:
            raise ConflictError(
                f'Company "{existing.name}" already exists',
                code=ErrorCode.COMPANY_NAME_TAKEN,
                extra={"existing_id": existing.id},
            )

    async def _flush_or_conflict(self, account_id: int, normalized: str) -> None:
        # The unique constraint is the race-safe check; the pre-check above only
        # exists to return the existing id.
        try:
            await self.db.flush()
        except IntegrityError as exc:
            await self.db.rollback()
            existing = await self._find_by_normalized(account_id, normalized)
            raise ConflictError(
                "Company name already exists",
                code=ErrorCode.COMPANY_NAME_TAKEN,
                extra={"existing_id": existing.id} if existing else None,
            ) from exc
```

- [ ] **Step 5: Write `src/app/routers/companies.py`**

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.company import (
    CompanyCreate,
    CompanyDetailResponse,
    CompanyResponse,
    CompanyUpdate,
)
from app.services.company_service import CompanyService

router = APIRouter(prefix="/companies", tags=["companies"])


def get_company_service(db: DbDep) -> CompanyService:
    return CompanyService(db)


CompanyServiceDep = Annotated[CompanyService, Depends(get_company_service)]


@router.get("", response_model=list[CompanyResponse])
async def list_companies(account: CurrentAccountDep, service: CompanyServiceDep):
    return await service.list(account.id)


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate, account: CurrentAccountDep, service: CompanyServiceDep
):
    return await service.create(account.id, payload)


@router.get("/{company_id}", response_model=CompanyDetailResponse)
async def get_company(
    company_id: int, account: CurrentAccountDep, service: CompanyServiceDep
):
    return await service.get_detail(account.id, company_id)


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    payload: CompanyUpdate,
    account: CurrentAccountDep,
    service: CompanyServiceDep,
):
    return await service.update(account.id, company_id, payload)


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: int, account: CurrentAccountDep, service: CompanyServiceDep
) -> Response:
    await service.delete(account.id, company_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Register in `src/app/main.py`: import `companies` and `app.include_router(companies.router)`.

- [ ] **Step 6: Run the tests, lint, format**

Run: `uv run pytest -v && uv run ruff format . && uv run ruff check .`
Expected: all pass, clean.

---

### Task 3: Applications — schemas, activity helper, service, router, tests

**Files:**
- Modify: `backend/src/app/schemas/application.py` (add request schemas)
- Create: `backend/src/app/services/activity.py`, `backend/src/app/services/application_service.py`, `backend/src/app/routers/applications.py`
- Modify: `backend/src/app/main.py`
- Create: `backend/tests/test_applications.py`

**Interfaces:**
- Consumes: `CompanyService.add`, `CompanyService.get`, `field_error`, Task 1 types.
- Produces: `record_activity(application: Application) -> None`; `ApplicationService(db)` with `list(account_id, *, status, sort, order) -> list[Application]`, `get_detail(account_id, application_id) -> Application` (company, stages, contacts loaded), `create(account, payload) -> Application`, `update(account, application_id, payload) -> Application`, `delete(account_id, application_id) -> None`; `ApplicationSort = Literal["last_activity", "date_applied"]`, `SortOrder = Literal["asc", "desc"]`.

- [ ] **Step 1: Failing tests — `tests/test_applications.py`**

```python
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import (
    Account,
    Application,
    ApplicationStatus,
    Comparison,
    InterviewStage,
)
from app.services import activity as activity_module
from tests.conftest import make_application, make_company


async def test_create_minimal_defaults_to_applied(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.1
    company = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.post(
        "/applications", json={"company_id": company.id, "role_title": "Backend Engineer"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "applied"
    assert body["company"] == {"id": company.id, "name": "Acme"}
    assert body["stages"] == [] and body["contacts"] == []
    assert body["is_quiet"] is False
    assert body["last_activity_at"]


async def test_create_with_inline_company(
    owner_client: AsyncClient, owner_account: Account
) -> None:
    response = await owner_client.post(
        "/applications",
        json={"company": {"name": "Beta"}, "role_title": "SRE", "status": "wishlist"},
    )
    assert response.status_code == 201
    assert response.json()["company"]["name"] == "Beta"
    companies = await owner_client.get("/companies")
    assert [c["name"] for c in companies.json()] == ["Beta"]


async def test_inline_company_conflict_offers_existing_and_creates_nothing(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.4 via inline path
    existing = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.post(
        "/applications", json={"company": {"name": "acme"}, "role_title": "SRE"}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "COMPANY_NAME_TAKEN"
    assert response.json()["existing_id"] == existing.id
    count = (await db_session.execute(select(func.count(Application.id)))).scalar_one()
    assert count == 0


async def test_company_xor_required(owner_client: AsyncClient) -> None:
    both = await owner_client.post(
        "/applications",
        json={"company_id": 1, "company": {"name": "X"}, "role_title": "SRE"},
    )
    neither = await owner_client.post("/applications", json={"role_title": "SRE"})
    assert both.status_code == 422 and neither.status_code == 422


async def test_foreign_company_id_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign = await make_company(db_session, other_account, "Foreign")
    response = await owner_client.post(
        "/applications", json={"company_id": foreign.id, "role_title": "SRE"}
    )
    assert response.status_code == 404


async def test_missing_role_title_field_error(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.2
    company = await make_company(db_session, owner_account)
    for payload in ({"company_id": company.id}, {"company_id": company.id, "role_title": " "}):
        response = await owner_client.post("/applications", json=payload)
        assert response.status_code == 422
        assert response.json()["errors"][0]["field"] == "role_title"


async def test_salary_rules(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.3
    company = await make_company(db_session, owner_account)
    base = {"company_id": company.id, "role_title": "SRE"}
    inverted = await owner_client.post(
        "/applications",
        json={**base, "salary_min": 100, "salary_max": 50, "salary_currency": "usd"},
    )
    assert inverted.status_code == 422
    assert inverted.json()["errors"][0]["field"] == "salary_max"
    no_currency = await owner_client.post("/applications", json={**base, "salary_min": 100})
    assert no_currency.status_code == 422
    assert no_currency.json()["errors"][0]["field"] == "salary_currency"
    bad_currency = await owner_client.post(
        "/applications", json={**base, "salary_min": 1, "salary_currency": "dollars"}
    )
    assert bad_currency.status_code == 422
    ok = await owner_client.post(
        "/applications",
        json={**base, "salary_min": 50, "salary_max": 100, "salary_currency": "usd"},
    )
    assert ok.status_code == 201
    assert ok.json()["salary_currency"] == "USD"


async def test_invalid_url_and_future_date_rejected(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account)
    base = {"company_id": company.id, "role_title": "SRE"}
    url = await owner_client.post("/applications", json={**base, "posting_url": "ftp://x"})
    assert url.status_code == 422
    assert url.json()["errors"][0]["field"] == "posting_url"
    tomorrow = (utcnow().date() + timedelta(days=2)).isoformat()
    future = await owner_client.post("/applications", json={**base, "date_applied": tomorrow})
    assert future.status_code == 422
    assert future.json()["errors"][0]["field"] == "date_applied"
    today = await owner_client.post(
        "/applications", json={**base, "date_applied": utcnow().date().isoformat()}
    )
    assert today.status_code == 201


async def test_invalid_status_rejected(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.10
    company = await make_company(db_session, owner_account)
    response = await owner_client.post(
        "/applications",
        json={"company_id": company.id, "role_title": "SRE", "status": "ghosted"},
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "status"


async def test_duplicate_warning_then_confirm(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.5
    company = await make_company(db_session, owner_account, "Acme")
    first = await make_application(db_session, owner_account, company, "Backend Engineer")
    payload = {"company_id": company.id, "role_title": "backend engineer"}
    warned = await owner_client.post("/applications", json=payload)
    assert warned.status_code == 409
    assert warned.json()["code"] == "DUPLICATE_APPLICATION"
    assert warned.json()["existing_id"] == first.id
    confirmed = await owner_client.post(
        "/applications", json={**payload, "confirm_duplicate": True}
    )
    assert confirmed.status_code == 201
    listing = await owner_client.get("/applications")
    assert len(listing.json()) == 2


async def test_list_filter_sort_and_scope(
    owner_client: AsyncClient,
    owner_account: Account,
    other_account: Account,
    db_session: AsyncSession,
) -> None:  # AC-02.8, AC-02.9, AC-01.7
    assert (await owner_client.get("/applications")).json() == []
    company = await make_company(db_session, owner_account, "Acme")
    foreign_co = await make_company(db_session, other_account, "Foreign")
    now = utcnow()
    older = await make_application(
        db_session, owner_account, company, "Old",
        status=ApplicationStatus.INTERVIEWING,
        last_activity_at=now - timedelta(days=3),
        date_applied=date(2026, 9, 1),
    )
    newer = await make_application(
        db_session, owner_account, company, "New",
        status=ApplicationStatus.APPLIED,
        last_activity_at=now,
        date_applied=None,
    )
    mid = await make_application(
        db_session, owner_account, company, "Mid",
        status=ApplicationStatus.INTERVIEWING,
        last_activity_at=now - timedelta(days=1),
        date_applied=date(2026, 9, 10),
    )
    await make_application(db_session, other_account, foreign_co, "Foreign role")

    default = await owner_client.get("/applications")
    assert [a["id"] for a in default.json()] == [newer.id, mid.id, older.id]

    filtered = await owner_client.get("/applications", params={"status": "interviewing"})
    assert [a["id"] for a in filtered.json()] == [mid.id, older.id]

    by_date = await owner_client.get(
        "/applications", params={"sort": "date_applied", "order": "asc"}
    )
    assert [a["id"] for a in by_date.json()] == [older.id, mid.id, newer.id]  # nulls last

    bad = await owner_client.get("/applications", params={"sort": "salary"})
    assert bad.status_code == 422


async def test_get_and_patch_records_activity(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    company = await make_company(db_session, owner_account)
    app_row = await make_application(
        db_session, owner_account, company,
        last_activity_at=utcnow() - timedelta(days=10), is_quiet=True,
    )
    detail = await owner_client.get(f"/applications/{app_row.id}")
    assert detail.status_code == 200 and detail.json()["is_quiet"] is True

    later = utcnow() + timedelta(hours=1)
    monkeypatch.setattr(activity_module, "utcnow", lambda: later)
    patched = await owner_client.patch(
        f"/applications/{app_row.id}", json={"status": "offer", "notes": "yay"}
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["status"] == "offer" and body["notes"] == "yay"
    assert body["is_quiet"] is False
    assert body["last_activity_at"].startswith(later.isoformat(timespec="seconds")[:19])


async def test_patch_validation_uses_stored_values(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account)
    app_row = await make_application(
        db_session, owner_account, company,
        salary_min=50, salary_max=100, salary_currency="USD",
    )
    response = await owner_client.patch(
        f"/applications/{app_row.id}", json={"salary_max": 10}
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "salary_max"
    cleared = await owner_client.patch(
        f"/applications/{app_row.id}",
        json={"salary_min": None, "salary_max": None, "salary_currency": None},
    )
    assert cleared.status_code == 200
    null_role = await owner_client.patch(
        f"/applications/{app_row.id}", json={"role_title": None}
    )
    assert null_role.status_code == 422


async def test_patch_company_must_be_own(
    owner_client: AsyncClient,
    owner_account: Account,
    other_account: Account,
    db_session: AsyncSession,
) -> None:
    company = await make_company(db_session, owner_account)
    foreign = await make_company(db_session, other_account, "Foreign")
    app_row = await make_application(db_session, owner_account, company)
    response = await owner_client.patch(
        f"/applications/{app_row.id}", json={"company_id": foreign.id}
    )
    assert response.status_code == 404


async def test_delete_cascades_stages_and_comparison(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.7
    company = await make_company(db_session, owner_account)
    app_row = await make_application(db_session, owner_account, company)
    db_session.add_all(
        [
            InterviewStage(application_id=app_row.id, name="Screen", position=0),
            Comparison(application_id=app_row.id, ran_at=utcnow()),
        ]
    )
    await db_session.commit()
    response = await owner_client.delete(f"/applications/{app_row.id}")
    assert response.status_code == 204
    stages = (await db_session.execute(select(func.count(InterviewStage.id)))).scalar_one()
    comparisons = (await db_session.execute(select(func.count(Comparison.id)))).scalar_one()
    assert stages == 0 and comparisons == 0
    assert (await owner_client.get(f"/applications/{app_row.id}")).status_code == 404


async def test_foreign_application_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign_co = await make_company(db_session, other_account, "Foreign")
    foreign = await make_application(db_session, other_account, foreign_co)
    for method, kwargs in (
        ("get", {}),
        ("patch", {"json": {"notes": "x"}}),
        ("delete", {}),
    ):
        response = await owner_client.request(
            method, f"/applications/{foreign.id}", **kwargs
        )
        assert response.status_code == 404, method
```

- [ ] **Step 2: Run to confirm failure**

Run: `uv run pytest tests/test_applications.py -v`
Expected: FAIL — `ImportError` (`app.services.activity`), then 404s.

- [ ] **Step 3: Write `src/app/services/activity.py`**

```python
from app.clock import utcnow
from app.models import Application


def record_activity(application: Application) -> None:
    """PRD F-04: application edits and stage changes count as activity;
    contact edits and comparisons do not. Clears the quiet flag immediately."""
    application.last_activity_at = utcnow()
    application.is_quiet = False
```

- [ ] **Step 4: Add request schemas to `src/app/schemas/application.py`**

Append (and extend the imports: `Literal` from `typing`, `Field`, `field_validator`, `model_validator` from `pydantic`, `CompanyCreate` from `app.schemas.company`, and `CurrencyCode`, `HttpUrlStr`, `NonBlankStr`, `OptionalText`, `reject_null` from `app.schemas.common`). `schemas/company.py` imports this module at top level, so import `CompanyCreate` **inside** the file via a deferred import to avoid the cycle:

```python
ApplicationSort = Literal["last_activity", "date_applied"]
SortOrder = Literal["asc", "desc"]


class _ApplicationFields(BaseModel):
    posting_url: HttpUrlStr | None = None
    location: OptionalText = None
    work_arrangement: WorkArrangement | None = None
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)
    salary_currency: CurrencyCode | None = None
    source: OptionalText = None
    date_applied: date | None = None
    notes: str | None = None
    job_description: str | None = None


class ApplicationCreate(_ApplicationFields):
    company_id: int | None = None
    company: "CompanyCreate | None" = None
    role_title: NonBlankStr
    status: ApplicationStatus = ApplicationStatus.APPLIED
    confirm_duplicate: bool = False

    @model_validator(mode="after")
    def exactly_one_company(self) -> "ApplicationCreate":
        if (self.company_id is None) == (self.company is None):
            raise ValueError("Provide exactly one of company_id or company")
        return self


class ApplicationUpdate(_ApplicationFields):
    company_id: int | None = None
    role_title: NonBlankStr | None = None
    status: ApplicationStatus | None = None

    _no_null = field_validator("company_id", "role_title", "status")(reject_null)
```

Then at the bottom of the file:

```python
from app.schemas.company import CompanyCreate  # noqa: E402  (cycle: company imports this module)

ApplicationCreate.model_rebuild()
```

- [ ] **Step 5: Write `src/app/services/application_service.py`**

```python
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clock import utcnow
from app.errors import ConflictError, ErrorCode, NotFoundError, field_error
from app.models import Account, Application, ApplicationStatus
from app.schemas.application import (
    ApplicationCreate,
    ApplicationSort,
    ApplicationUpdate,
    SortOrder,
)
from app.services.activity import record_activity
from app.services.company_service import CompanyService

_SORT_COLUMNS = {
    "last_activity": Application.last_activity_at,
    "date_applied": Application.date_applied,
}


class ApplicationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.companies = CompanyService(db)

    async def list(
        self,
        account_id: int,
        *,
        status: ApplicationStatus | None = None,
        sort: ApplicationSort = "last_activity",
        order: SortOrder = "desc",
    ) -> list[Application]:
        column = _SORT_COLUMNS[sort]
        primary = column.asc() if order == "asc" else column.desc()
        query = (
            select(Application)
            .where(Application.account_id == account_id)
            .options(selectinload(Application.company))
            .order_by(primary.nulls_last(), Application.id.desc())
        )
        if status is not None:
            query = query.where(Application.status == status)
        result = await self.db.execute(query)
        return list(result.scalars())

    async def get(self, account_id: int, application_id: int) -> Application:
        result = await self.db.execute(
            select(Application).where(
                Application.id == application_id,
                Application.account_id == account_id,
            )
        )
        application = result.scalar_one_or_none()
        if application is None:
            raise NotFoundError("Application not found")
        return application

    async def get_detail(self, account_id: int, application_id: int) -> Application:
        result = await self.db.execute(
            select(Application)
            .where(
                Application.id == application_id,
                Application.account_id == account_id,
            )
            .options(
                selectinload(Application.company),
                selectinload(Application.stages),
                selectinload(Application.contacts),
            )
        )
        application = result.scalar_one_or_none()
        if application is None:
            raise NotFoundError("Application not found")
        return application

    async def create(self, account: Account, payload: ApplicationCreate) -> Application:
        if payload.company is not None:
            company = await self.companies.add(account.id, payload.company)
        else:
            company = await self.companies.get(account.id, payload.company_id)  # type: ignore[arg-type]

        if not payload.confirm_duplicate:
            await self._ensure_not_duplicate(account.id, company.id, payload.role_title)

        fields = payload.model_dump(exclude={"company", "company_id", "confirm_duplicate"})
        application = Application(
            account_id=account.id,
            company_id=company.id,
            last_activity_at=utcnow(),
            **fields,
        )
        self._validate_rules(application, account)
        self.db.add(application)
        await self.db.commit()
        return await self.get_detail(account.id, application.id)

    async def update(
        self, account: Account, application_id: int, payload: ApplicationUpdate
    ) -> Application:
        application = await self.get(account.id, application_id)
        changes = payload.model_dump(exclude_unset=True)
        if "company_id" in changes:
            await self.companies.get(account.id, changes["company_id"])
        for field, value in changes.items():
            setattr(application, field, value)
        self._validate_rules(application, account)
        record_activity(application)
        await self.db.commit()
        return await self.get_detail(account.id, application.id)

    async def delete(self, account_id: int, application_id: int) -> None:
        application = await self.get(account_id, application_id)
        await self.db.delete(application)  # stages/comparison/links: ON DELETE CASCADE
        await self.db.commit()

    async def _ensure_not_duplicate(
        self, account_id: int, company_id: int, role_title: str
    ) -> None:
        result = await self.db.execute(
            select(Application)
            .where(
                Application.account_id == account_id,
                Application.company_id == company_id,
                func.lower(Application.role_title) == role_title.lower(),
            )
            .order_by(Application.id)
            .limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise ConflictError(
                f'An application for "{existing.role_title}" at this company already exists',
                code=ErrorCode.DUPLICATE_APPLICATION,
                extra={"existing_id": existing.id},
            )

    @staticmethod
    def _validate_rules(application: Application, account: Account) -> None:
        """Cross-field rules shared by create and update (PRD F-02 edge cases)."""
        has_salary = application.salary_min is not None or application.salary_max is not None
        if has_salary and application.salary_currency is None:
            raise field_error("salary_currency", "A currency code is required with a salary")
        if (
            application.salary_min is not None
            and application.salary_max is not None
            and application.salary_min > application.salary_max
        ):
            raise field_error("salary_max", "Must be greater than or equal to salary_min")
        if application.date_applied is not None:
            today = datetime.now(ZoneInfo(account.timezone)).date()
            if application.date_applied > today:
                raise field_error("date_applied", "Cannot be in the future")
```

Note for the implementer: `_validate_rules` runs before `flush`, so a failure leaves nothing pending except (on the inline-company path) the flushed company — the `AppError` propagates out of the request, `get_db` rolls the session back, and the company is never committed (the test `test_inline_company_conflict…` and a PATCH failure both rely on this).

- [ ] **Step 6: Write `src/app/routers/applications.py`**

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.dependencies import CurrentAccountDep, DbDep
from app.models.enums import ApplicationStatus
from app.schemas.application import (
    ApplicationCreate,
    ApplicationDetailResponse,
    ApplicationSort,
    ApplicationSummary,
    ApplicationUpdate,
    SortOrder,
)
from app.services.application_service import ApplicationService

router = APIRouter(prefix="/applications", tags=["applications"])


def get_application_service(db: DbDep) -> ApplicationService:
    return ApplicationService(db)


ApplicationServiceDep = Annotated[ApplicationService, Depends(get_application_service)]


@router.get("", response_model=list[ApplicationSummary])
async def list_applications(
    account: CurrentAccountDep,
    service: ApplicationServiceDep,
    status_filter: Annotated[ApplicationStatus | None, Query(alias="status")] = None,
    sort: ApplicationSort = "last_activity",
    order: SortOrder = "desc",
):
    return await service.list(account.id, status=status_filter, sort=sort, order=order)


@router.post(
    "", response_model=ApplicationDetailResponse, status_code=status.HTTP_201_CREATED
)
async def create_application(
    payload: ApplicationCreate,
    account: CurrentAccountDep,
    service: ApplicationServiceDep,
):
    return await service.create(account, payload)


@router.get("/{application_id}", response_model=ApplicationDetailResponse)
async def get_application(
    application_id: int, account: CurrentAccountDep, service: ApplicationServiceDep
):
    return await service.get_detail(account.id, application_id)


@router.patch("/{application_id}", response_model=ApplicationDetailResponse)
async def update_application(
    application_id: int,
    payload: ApplicationUpdate,
    account: CurrentAccountDep,
    service: ApplicationServiceDep,
):
    return await service.update(account, application_id, payload)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(
    application_id: int, account: CurrentAccountDep, service: ApplicationServiceDep
) -> Response:
    await service.delete(account.id, application_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Register in `src/app/main.py` (`applications.router`).

- [ ] **Step 7: Run the tests, lint, format**

Run: `uv run pytest -v && uv run ruff format . && uv run ruff check .`
Expected: all pass, clean. If `nulls_last()` misbehaves on SQLite, the aiosqlite/SQLite version is too old — report rather than work around.

---

### Task 4: Interview stages — schemas, service, router, tests

**Files:**
- Modify: `backend/src/app/schemas/interview_stage.py` (add request schemas)
- Create: `backend/src/app/services/stage_service.py`, `backend/src/app/routers/stages.py`
- Modify: `backend/src/app/main.py`
- Create: `backend/tests/test_stages.py`

**Interfaces:**
- Consumes: `record_activity`, `ApplicationService.get_detail`, Task 1 types.
- Produces: `StageService(db)` with `create(account, application_id, payload) -> InterviewStage`, `update(account, application_id, stage_id, payload) -> InterviewStage`, `delete(account_id, application_id, stage_id) -> None`, `move(account_id, application_id, stage_id, direction) -> list[InterviewStage]`.

- [ ] **Step 1: Failing tests — `tests/test_stages.py`**

```python
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import Account, Application
from app.services import activity as activity_module
from tests.conftest import make_application, make_company


@pytest.fixture
async def application(owner_account: Account, db_session: AsyncSession) -> Application:
    company = await make_company(db_session, owner_account)
    return await make_application(
        db_session, owner_account, company,
        last_activity_at=utcnow() - timedelta(days=10), is_quiet=True,
    )


async def _names(client: AsyncClient, application_id: int) -> list[str]:
    detail = await client.get(f"/applications/{application_id}")
    return [s["name"] for s in detail.json()["stages"]]


async def test_create_defaults_pending_and_appends(
    owner_client: AsyncClient, application: Application
) -> None:  # AC-03.5
    url = f"/applications/{application.id}/stages"
    first = await owner_client.post(url, json={"name": "Phone screen"})
    assert first.status_code == 201
    assert first.json()["outcome"] == "pending"
    assert first.json()["position"] == 0
    second = await owner_client.post(url, json={"name": "Onsite", "outcome": "passed"})
    assert second.json()["position"] == 1
    assert await _names(owner_client, application.id) == ["Phone screen", "Onsite"]


async def test_missing_name_rejected(
    owner_client: AsyncClient, application: Application
) -> None:
    response = await owner_client.post(
        f"/applications/{application.id}/stages", json={"name": "  "}
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "name"


async def test_bad_outcome_rejected(
    owner_client: AsyncClient, application: Application
) -> None:
    response = await owner_client.post(
        f"/applications/{application.id}/stages", json={"name": "X", "outcome": "maybe"}
    )
    assert response.status_code == 422


async def test_naive_scheduled_at_uses_account_timezone(
    owner_client: AsyncClient, application: Application
) -> None:  # NFR-08
    await owner_client.patch("/settings", json={"timezone": "Asia/Bangkok"})
    response = await owner_client.post(
        f"/applications/{application.id}/stages",
        json={"name": "Screen", "scheduled_at": "2026-09-20T09:00:00"},
    )
    assert response.status_code == 201
    assert response.json()["scheduled_at"].startswith("2026-09-20T02:00:00")
    aware = await owner_client.post(
        f"/applications/{application.id}/stages",
        json={"name": "Aware", "scheduled_at": "2026-09-20T09:00:00+02:00"},
    )
    assert aware.json()["scheduled_at"].startswith("2026-09-20T07:00:00")


async def test_move_up(owner_client: AsyncClient, application: Application) -> None:  # AC-03.4
    url = f"/applications/{application.id}/stages"
    ids = [
        (await owner_client.post(url, json={"name": n})).json()["id"] for n in ("1", "2", "3")
    ]
    moved = await owner_client.post(f"{url}/{ids[2]}/move", json={"direction": "up"})
    assert moved.status_code == 200
    assert [s["name"] for s in moved.json()] == ["1", "3", "2"]
    assert [s["position"] for s in moved.json()] == [0, 1, 2]
    assert await _names(owner_client, application.id) == ["1", "3", "2"]

    noop = await owner_client.post(f"{url}/{ids[0]}/move", json={"direction": "up"})
    assert noop.status_code == 200
    assert [s["name"] for s in noop.json()] == ["1", "3", "2"]
    down = await owner_client.post(f"{url}/{ids[0]}/move", json={"direction": "down"})
    assert [s["name"] for s in down.json()] == ["3", "1", "2"]
    bad = await owner_client.post(f"{url}/{ids[0]}/move", json={"direction": "left"})
    assert bad.status_code == 422


async def test_update_and_delete_renumber(
    owner_client: AsyncClient, application: Application
) -> None:
    url = f"/applications/{application.id}/stages"
    ids = [
        (await owner_client.post(url, json={"name": n})).json()["id"] for n in ("a", "b", "c")
    ]
    updated = await owner_client.patch(
        f"{url}/{ids[1]}", json={"outcome": "failed", "notes": "tough"}
    )
    assert updated.status_code == 200
    assert updated.json()["outcome"] == "failed"
    null_name = await owner_client.patch(f"{url}/{ids[1]}", json={"name": None})
    assert null_name.status_code == 422

    deleted = await owner_client.delete(f"{url}/{ids[0]}")
    assert deleted.status_code == 204
    detail = (await owner_client.get(f"/applications/{application.id}")).json()
    assert [(s["name"], s["position"]) for s in detail["stages"]] == [("b", 0), ("c", 1)]


async def test_stage_changes_record_activity(
    owner_client: AsyncClient,
    application: Application,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # AC-04.4
    later = utcnow() + timedelta(hours=1)
    monkeypatch.setattr(activity_module, "utcnow", lambda: later)
    url = f"/applications/{application.id}/stages"
    await owner_client.post(url, json={"name": "Screen"})
    detail = (await owner_client.get(f"/applications/{application.id}")).json()
    assert detail["is_quiet"] is False
    assert detail["last_activity_at"].startswith(later.isoformat()[:19])


async def test_foreign_or_missing_application_is_404(
    owner_client: AsyncClient,
    other_account: Account,
    db_session: AsyncSession,
    application: Application,
) -> None:  # AC-01.7
    foreign_co = await make_company(db_session, other_account, "Foreign")
    foreign = await make_application(db_session, other_account, foreign_co)
    response = await owner_client.post(
        f"/applications/{foreign.id}/stages", json={"name": "X"}
    )
    assert response.status_code == 404
    missing_stage = await owner_client.delete(f"/applications/{application.id}/stages/999")
    assert missing_stage.status_code == 404
```

- [ ] **Step 2: Run to confirm failure**

Run: `uv run pytest tests/test_stages.py -v` — Expected: FAIL (404/405 on the stages routes).

- [ ] **Step 3: Add request schemas to `src/app/schemas/interview_stage.py`**

Append (extend imports with `Literal` from `typing`, `field_validator` from `pydantic`, and `NonBlankStr`, `reject_null` from `app.schemas.common`):

```python
class StageCreate(BaseModel):
    name: NonBlankStr
    scheduled_at: datetime | None = None
    outcome: StageOutcome = StageOutcome.PENDING
    notes: str | None = None


class StageUpdate(BaseModel):
    name: NonBlankStr | None = None
    scheduled_at: datetime | None = None
    outcome: StageOutcome | None = None
    notes: str | None = None

    _no_null = field_validator("name", "outcome")(reject_null)


class StageMove(BaseModel):
    direction: Literal["up", "down"]
```

- [ ] **Step 4: Write `src/app/services/stage_service.py`**

```python
from datetime import UTC, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import NotFoundError
from app.models import Account, Application, InterviewStage
from app.schemas.interview_stage import StageCreate, StageUpdate
from app.services.activity import record_activity
from app.services.application_service import ApplicationService


def to_utc(value: datetime | None, timezone: str) -> datetime | None:
    """Naive wire datetimes are in the account's time zone; aware ones are converted."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo(timezone))
    return value.astimezone(UTC)


class StageService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.applications = ApplicationService(db)

    async def create(
        self, account: Account, application_id: int, payload: StageCreate
    ) -> InterviewStage:
        application = await self.applications.get_detail(account.id, application_id)
        stage = InterviewStage(
            application_id=application.id,
            name=payload.name,
            scheduled_at=to_utc(payload.scheduled_at, account.timezone),
            outcome=payload.outcome,
            notes=payload.notes,
            position=len(application.stages),
        )
        application.stages.append(stage)
        record_activity(application)
        await self.db.commit()
        await self.db.refresh(stage)
        return stage

    async def update(
        self, account: Account, application_id: int, stage_id: int, payload: StageUpdate
    ) -> InterviewStage:
        application = await self.applications.get_detail(account.id, application_id)
        stage = self._find(application, stage_id)
        changes = payload.model_dump(exclude_unset=True)
        if "scheduled_at" in changes:
            changes["scheduled_at"] = to_utc(changes["scheduled_at"], account.timezone)
        for field, value in changes.items():
            setattr(stage, field, value)
        record_activity(application)
        await self.db.commit()
        await self.db.refresh(stage)
        return stage

    async def delete(self, account_id: int, application_id: int, stage_id: int) -> None:
        application = await self.applications.get_detail(account_id, application_id)
        stage = self._find(application, stage_id)
        application.stages.remove(stage)  # delete-orphan removes the row
        self._renumber(application)
        record_activity(application)
        await self.db.commit()

    async def move(
        self,
        account_id: int,
        application_id: int,
        stage_id: int,
        direction: Literal["up", "down"],
    ) -> list[InterviewStage]:
        application = await self.applications.get_detail(account_id, application_id)
        stage = self._find(application, stage_id)
        stages = application.stages
        index = stages.index(stage)
        target = index - 1 if direction == "up" else index + 1
        if 0 <= target < len(stages):
            stages[index], stages[target] = stages[target], stages[index]
            self._renumber(application)
            record_activity(application)
            await self.db.commit()
        return list(stages)

    @staticmethod
    def _find(application: Application, stage_id: int) -> InterviewStage:
        for stage in application.stages:
            if stage.id == stage_id:
                return stage
        raise NotFoundError("Interview stage not found")

    @staticmethod
    def _renumber(application: Application) -> None:
        for position, stage in enumerate(application.stages):
            stage.position = position
```

- [ ] **Step 5: Write `src/app/routers/stages.py`**

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.interview_stage import (
    StageCreate,
    StageMove,
    StageResponse,
    StageUpdate,
)
from app.services.stage_service import StageService

router = APIRouter(prefix="/applications/{application_id}/stages", tags=["stages"])


def get_stage_service(db: DbDep) -> StageService:
    return StageService(db)


StageServiceDep = Annotated[StageService, Depends(get_stage_service)]


@router.post("", response_model=StageResponse, status_code=status.HTTP_201_CREATED)
async def create_stage(
    application_id: int,
    payload: StageCreate,
    account: CurrentAccountDep,
    service: StageServiceDep,
):
    return await service.create(account, application_id, payload)


@router.patch("/{stage_id}", response_model=StageResponse)
async def update_stage(
    application_id: int,
    stage_id: int,
    payload: StageUpdate,
    account: CurrentAccountDep,
    service: StageServiceDep,
):
    return await service.update(account, application_id, stage_id, payload)


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stage(
    application_id: int,
    stage_id: int,
    account: CurrentAccountDep,
    service: StageServiceDep,
) -> Response:
    await service.delete(account.id, application_id, stage_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{stage_id}/move", response_model=list[StageResponse])
async def move_stage(
    application_id: int,
    stage_id: int,
    payload: StageMove,
    account: CurrentAccountDep,
    service: StageServiceDep,
):
    return await service.move(account.id, application_id, stage_id, payload.direction)
```

Register in `src/app/main.py` (`stages.router`).

- [ ] **Step 6: Run the tests, lint, format**

Run: `uv run pytest -v && uv run ruff format . && uv run ruff check .` — Expected: all pass, clean.

---

### Task 5: Contacts and application links — schemas, service, router, tests

**Files:**
- Modify: `backend/src/app/schemas/contact.py` (add request schemas)
- Create: `backend/src/app/services/contact_service.py`, `backend/src/app/routers/contacts.py`
- Modify: `backend/src/app/main.py`
- Create: `backend/tests/test_contacts.py`

**Interfaces:**
- Consumes: `CompanyService.get`, `ApplicationService.get_detail`, Task 1 types.
- Produces: `ContactService(db)` with `create(account_id, payload) -> Contact`, `get(account_id, contact_id) -> Contact`, `update(...)`, `delete(...)`, `link(account_id, application_id, contact_id) -> None`, `unlink(account_id, application_id, contact_id) -> None`.

- [ ] **Step 1: Failing tests — `tests/test_contacts.py`**

```python
from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import Account, Contact
from tests.conftest import make_application, make_company


async def test_create_minimal_shows_on_company(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-03.1
    company = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.post(
        "/contacts", json={"company_id": company.id, "name": "Ann"}
    )
    assert response.status_code == 201
    assert response.json()["company_id"] == company.id
    detail = await owner_client.get(f"/companies/{company.id}")
    assert [c["name"] for c in detail.json()["contacts"]] == ["Ann"]


async def test_invalid_email_and_url(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-03.7
    company = await make_company(db_session, owner_account)
    bad_email = await owner_client.post(
        "/contacts", json={"company_id": company.id, "name": "Ann", "email": "not-an-email"}
    )
    assert bad_email.status_code == 422
    assert bad_email.json()["errors"][0]["field"] == "email"
    bad_url = await owner_client.post(
        "/contacts",
        json={"company_id": company.id, "name": "Ann", "linkedin_url": "linkedin.com/in/ann"},
    )
    assert bad_url.status_code == 422
    assert bad_url.json()["errors"][0]["field"] == "linkedin_url"


async def test_foreign_company_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign = await make_company(db_session, other_account, "Foreign")
    response = await owner_client.post(
        "/contacts", json={"company_id": foreign.id, "name": "Ann"}
    )
    assert response.status_code == 404


async def test_get_patch_delete(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account)
    created = (
        await owner_client.post("/contacts", json={"company_id": company.id, "name": "Ann"})
    ).json()
    got = await owner_client.get(f"/contacts/{created['id']}")
    assert got.status_code == 200
    patched = await owner_client.patch(
        f"/contacts/{created['id']}", json={"title": "Recruiter", "email": "ann@example.com"}
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Recruiter"
    null_name = await owner_client.patch(f"/contacts/{created['id']}", json={"name": None})
    assert null_name.status_code == 422
    deleted = await owner_client.delete(f"/contacts/{created['id']}")
    assert deleted.status_code == 204
    assert (await owner_client.get(f"/contacts/{created['id']}")).status_code == 404


async def test_link_is_idempotent_and_same_company_only(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-03.2, AC-03.3
    acme = await make_company(db_session, owner_account, "Acme")
    beta = await make_company(db_session, owner_account, "Beta")
    app_acme = await make_application(db_session, owner_account, acme)
    app_beta = await make_application(db_session, owner_account, beta)
    contact = Contact(account_id=owner_account.id, company_id=acme.id, name="Ann")
    db_session.add(contact)
    await db_session.commit()

    link_url = f"/applications/{app_acme.id}/contacts/{contact.id}"
    assert (await owner_client.put(link_url)).status_code == 204
    assert (await owner_client.put(link_url)).status_code == 204
    detail = (await owner_client.get(f"/applications/{app_acme.id}")).json()
    assert [c["id"] for c in detail["contacts"]] == [contact.id]

    mismatch = await owner_client.put(f"/applications/{app_beta.id}/contacts/{contact.id}")
    assert mismatch.status_code == 409
    assert mismatch.json()["code"] == "CONTACT_COMPANY_MISMATCH"

    assert (await owner_client.delete(link_url)).status_code == 204
    assert (await owner_client.delete(link_url)).status_code == 204
    detail = (await owner_client.get(f"/applications/{app_acme.id}")).json()
    assert detail["contacts"] == []


async def test_delete_contact_unlinks_but_keeps_applications(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-03.6
    acme = await make_company(db_session, owner_account, "Acme")
    app1 = await make_application(db_session, owner_account, acme, "One")
    app2 = await make_application(db_session, owner_account, acme, "Two")
    contact = Contact(account_id=owner_account.id, company_id=acme.id, name="Ann")
    db_session.add(contact)
    await db_session.commit()
    for app_id in (app1.id, app2.id):
        assert (await owner_client.put(f"/applications/{app_id}/contacts/{contact.id}")).status_code == 204

    assert (await owner_client.delete(f"/contacts/{contact.id}")).status_code == 204
    for app_id in (app1.id, app2.id):
        detail = await owner_client.get(f"/applications/{app_id}")
        assert detail.status_code == 200
        assert detail.json()["contacts"] == []


async def test_contact_changes_do_not_count_as_activity(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-04.5
    acme = await make_company(db_session, owner_account, "Acme")
    stale = utcnow() - timedelta(days=10)
    app_row = await make_application(
        db_session, owner_account, acme, last_activity_at=stale, is_quiet=True
    )
    contact = (
        await owner_client.post("/contacts", json={"company_id": acme.id, "name": "Ann"})
    ).json()
    await owner_client.put(f"/applications/{app_row.id}/contacts/{contact['id']}")
    await owner_client.patch(f"/contacts/{contact['id']}", json={"title": "Lead"})
    detail = (await owner_client.get(f"/applications/{app_row.id}")).json()
    assert detail["is_quiet"] is True
    assert detail["last_activity_at"].startswith(stale.isoformat()[:19])


async def test_foreign_contact_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign_co = await make_company(db_session, other_account, "Foreign")
    contact = Contact(account_id=other_account.id, company_id=foreign_co.id, name="X")
    db_session.add(contact)
    await db_session.commit()
    assert (await owner_client.get(f"/contacts/{contact.id}")).status_code == 404
    assert (await owner_client.delete(f"/contacts/{contact.id}")).status_code == 404
```

- [ ] **Step 2: Run to confirm failure**

Run: `uv run pytest tests/test_contacts.py -v` — Expected: FAIL (routes missing).

- [ ] **Step 3: Add request schemas to `src/app/schemas/contact.py`**

Append (extend imports with `EmailStr`, `field_validator` from `pydantic` and `HttpUrlStr`, `NonBlankStr`, `OptionalText`, `reject_null` from `app.schemas.common`):

```python
class ContactCreate(BaseModel):
    company_id: int
    name: NonBlankStr
    title: OptionalText = None
    email: EmailStr | None = None
    linkedin_url: HttpUrlStr | None = None
    notes: str | None = None


class ContactUpdate(BaseModel):
    name: NonBlankStr | None = None
    title: OptionalText = None
    email: EmailStr | None = None
    linkedin_url: HttpUrlStr | None = None
    notes: str | None = None

    _no_null = field_validator("name")(reject_null)
```

- [ ] **Step 4: Write `src/app/services/contact_service.py`**

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ConflictError, ErrorCode, NotFoundError
from app.models import Contact
from app.schemas.contact import ContactCreate, ContactUpdate
from app.services.application_service import ApplicationService
from app.services.company_service import CompanyService

MISMATCH_DETAIL = "Contact belongs to a different company than the application"


class ContactService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.companies = CompanyService(db)
        self.applications = ApplicationService(db)

    async def get(self, account_id: int, contact_id: int) -> Contact:
        result = await self.db.execute(
            select(Contact).where(
                Contact.id == contact_id, Contact.account_id == account_id
            )
        )
        contact = result.scalar_one_or_none()
        if contact is None:
            raise NotFoundError("Contact not found")
        return contact

    async def create(self, account_id: int, payload: ContactCreate) -> Contact:
        company = await self.companies.get(account_id, payload.company_id)
        contact = Contact(
            account_id=account_id,
            company_id=company.id,
            **payload.model_dump(exclude={"company_id"}),
        )
        self.db.add(contact)
        await self.db.commit()
        await self.db.refresh(contact)
        return contact

    async def update(
        self, account_id: int, contact_id: int, payload: ContactUpdate
    ) -> Contact:
        contact = await self.get(account_id, contact_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(contact, field, value)
        await self.db.commit()  # contact edits are not application activity (F-04)
        await self.db.refresh(contact)
        return contact

    async def delete(self, account_id: int, contact_id: int) -> None:
        contact = await self.get(account_id, contact_id)
        await self.db.delete(contact)  # application_contacts rows: ON DELETE CASCADE
        await self.db.commit()

    async def link(self, account_id: int, application_id: int, contact_id: int) -> None:
        application = await self.applications.get_detail(account_id, application_id)
        contact = await self.get(account_id, contact_id)
        if contact.company_id != application.company_id:
            raise ConflictError(MISMATCH_DETAIL, code=ErrorCode.CONTACT_COMPANY_MISMATCH)
        if contact not in application.contacts:
            application.contacts.append(contact)
            await self.db.commit()

    async def unlink(self, account_id: int, application_id: int, contact_id: int) -> None:
        application = await self.applications.get_detail(account_id, application_id)
        contact = await self.get(account_id, contact_id)
        if contact in application.contacts:
            application.contacts.remove(contact)
            await self.db.commit()
```

- [ ] **Step 5: Write `src/app/routers/contacts.py`**

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.contact import ContactCreate, ContactResponse, ContactUpdate
from app.services.contact_service import ContactService

router = APIRouter(prefix="/contacts", tags=["contacts"])
links_router = APIRouter(
    prefix="/applications/{application_id}/contacts", tags=["contacts"]
)


def get_contact_service(db: DbDep) -> ContactService:
    return ContactService(db)


ContactServiceDep = Annotated[ContactService, Depends(get_contact_service)]


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreate, account: CurrentAccountDep, service: ContactServiceDep
):
    return await service.create(account.id, payload)


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: int, account: CurrentAccountDep, service: ContactServiceDep
):
    return await service.get(account.id, contact_id)


@router.patch("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    account: CurrentAccountDep,
    service: ContactServiceDep,
):
    return await service.update(account.id, contact_id, payload)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: int, account: CurrentAccountDep, service: ContactServiceDep
) -> Response:
    await service.delete(account.id, contact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@links_router.put("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def link_contact(
    application_id: int,
    contact_id: int,
    account: CurrentAccountDep,
    service: ContactServiceDep,
) -> Response:
    await service.link(account.id, application_id, contact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@links_router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_contact(
    application_id: int,
    contact_id: int,
    account: CurrentAccountDep,
    service: ContactServiceDep,
) -> Response:
    await service.unlink(account.id, application_id, contact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Register both in `src/app/main.py`: `app.include_router(contacts.router)` and `app.include_router(contacts.links_router)`. Final router list in `main.py`: `auth, settings, companies, applications, stages, contacts (+ links_router)`.

- [ ] **Step 6: Run the tests, lint, format**

Run: `uv run pytest -v && uv run ruff format . && uv run ruff check .` — Expected: all pass, clean.

---

### Task 6: Demo sample data, seed integration, API contract doc

**Files:**
- Create: `backend/src/app/demo_data.py`
- Modify: `backend/scripts/seed.py`
- Create: `backend/tests/test_demo_data.py`
- Modify: `docs/API_CONTRACT.md`
- Modify: `backend/README.md` (if it documents endpoints or the seed; otherwise leave)

**Interfaces:**
- Consumes: models, `normalize_company_name`, `utcnow`.
- Produces: `reset_demo_data(session: AsyncSession, account: Account) -> dict[str, int]` (counts created).

- [ ] **Step 1: Failing test — `tests/test_demo_data.py`**

```python
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
        await db_session.execute(
            select(Application).where(Application.account_id == other_account.id)
        )
    ).scalars().all()
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
        select(func.count(Application.id)).where(Application.account_id == owner_account.id)
    )
    assert owner_apps.scalar_one() == 1
    assert (await db_session.get(Company, owner_co.id)) is not None
```

- [ ] **Step 2: Run to confirm failure**

Run: `uv run pytest tests/test_demo_data.py -v` — Expected: FAIL (`ImportError: app.demo_data`).

- [ ] **Step 3: Write `src/app/demo_data.py`**

```python
"""Demo account sample data (PRD AC-01.8). Rebuilt on every seed run (R-07).

Written with the ORM directly (not the services) so timestamps can be
back-dated: some applications are deliberately quiet for the daily check.
"""

from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import (
    Account,
    Application,
    ApplicationStatus,
    Company,
    Contact,
    InterviewStage,
    StageOutcome,
    WorkArrangement,
)
from app.services.company_service import normalize_company_name


async def _clear(session: AsyncSession, account_id: int) -> None:
    # Applications first (stages/comparison/links cascade), then companies
    # (contacts cascade). Application.company_id has no ON DELETE, so order matters.
    await session.execute(delete(Application).where(Application.account_id == account_id))
    await session.execute(delete(Company).where(Company.account_id == account_id))
    await session.flush()


def _company(account_id: int, name: str, website: str | None = None) -> Company:
    return Company(
        account_id=account_id,
        name=name,
        name_normalized=normalize_company_name(name),
        website=website,
    )


async def reset_demo_data(session: AsyncSession, account: Account) -> dict[str, int]:
    await _clear(session, account.id)
    now = utcnow()
    today = now.date()

    acme = _company(account.id, "Acme Robotics", "https://acme.example")
    nimbus = _company(account.id, "Nimbus Cloud", "https://nimbus.example")
    ledger = _company(account.id, "Ledgerly", "https://ledgerly.example")
    orbit = _company(account.id, "Orbit Health")
    session.add_all([acme, nimbus, ledger, orbit])
    await session.flush()

    def app(
        company: Company,
        role: str,
        status: ApplicationStatus,
        *,
        days_quiet: int,
        applied_days_ago: int | None,
        **fields: object,
    ) -> Application:
        return Application(
            account_id=account.id,
            company_id=company.id,
            role_title=role,
            status=status,
            last_activity_at=now - timedelta(days=days_quiet),
            date_applied=(
                today - timedelta(days=applied_days_ago)
                if applied_days_ago is not None
                else None
            ),
            **fields,
        )

    applications = [
        app(
            acme, "Backend Engineer", ApplicationStatus.INTERVIEWING,
            days_quiet=1, applied_days_ago=20,
            location="Berlin", work_arrangement=WorkArrangement.HYBRID,
            salary_min=85000, salary_max=105000, salary_currency="EUR",
            source="LinkedIn", posting_url="https://acme.example/jobs/backend",
            job_description=(
                "We are hiring a Backend Engineer with strong Python and FastAPI "
                "experience. You will design PostgreSQL schemas, build background "
                "jobs, and own our REST API. Docker and CI/CD experience required; "
                "Kubernetes and Redis are a plus."
            ),
        ),
        app(
            nimbus, "Platform Engineer", ApplicationStatus.APPLIED,
            days_quiet=9, applied_days_ago=9,
            work_arrangement=WorkArrangement.REMOTE, source="Referral",
            job_description=(
                "Platform Engineer to build internal tooling in Go and Python on "
                "Kubernetes. Terraform, AWS, and observability (Prometheus, Grafana) "
                "experience expected."
            ),
        ),
        app(
            ledger, "Full-stack Developer", ApplicationStatus.INTERVIEWING,
            days_quiet=2, applied_days_ago=15,
            location="Remote", work_arrangement=WorkArrangement.REMOTE,
            salary_min=70000, salary_max=90000, salary_currency="USD",
            job_description=(
                "Full-stack Developer working across a Next.js and TypeScript frontend "
                "and a Python backend. React, Tailwind, SQL, and REST API design "
                "required. GraphQL is nice to have."
            ),
        ),
        app(
            orbit, "Software Engineer", ApplicationStatus.WISHLIST,
            days_quiet=12, applied_days_ago=None,
            notes="Reach out to Dana before applying.",
        ),
        app(
            acme, "Data Engineer", ApplicationStatus.REJECTED,
            days_quiet=30, applied_days_ago=45,
            notes="Rejected after take-home.",
        ),
        app(
            nimbus, "Site Reliability Engineer", ApplicationStatus.OFFER,
            days_quiet=3, applied_days_ago=40,
            salary_min=95000, salary_max=95000, salary_currency="USD",
        ),
        app(
            ledger, "Backend Engineer", ApplicationStatus.WITHDRAWN,
            days_quiet=20, applied_days_ago=25,
        ),
    ]
    session.add_all(applications)
    await session.flush()
    backend_acme, platform_nimbus, fullstack_ledger = applications[0], applications[1], applications[2]

    stages = [
        InterviewStage(
            application_id=backend_acme.id, name="Recruiter screen", position=0,
            outcome=StageOutcome.PASSED, scheduled_at=now - timedelta(days=10),
        ),
        InterviewStage(
            application_id=backend_acme.id, name="Technical interview", position=1,
            outcome=StageOutcome.PASSED, scheduled_at=now - timedelta(days=4),
        ),
        InterviewStage(
            application_id=backend_acme.id, name="System design", position=2,
            outcome=StageOutcome.PENDING, scheduled_at=now + timedelta(days=3),
        ),
        InterviewStage(
            application_id=fullstack_ledger.id, name="Phone screen", position=0,
            outcome=StageOutcome.PASSED, scheduled_at=now - timedelta(days=6),
        ),
        InterviewStage(
            application_id=fullstack_ledger.id, name="Pair programming", position=1,
            outcome=StageOutcome.PENDING, scheduled_at=now + timedelta(days=5),
        ),
    ]
    session.add_all(stages)

    contacts = [
        Contact(
            account_id=account.id, company_id=acme.id, name="Priya Nair",
            title="Technical Recruiter", email="priya@acme.example",
        ),
        Contact(
            account_id=account.id, company_id=acme.id, name="Tom Weber",
            title="Engineering Manager",
            linkedin_url="https://www.linkedin.com/in/tom-weber-example",
        ),
        Contact(
            account_id=account.id, company_id=nimbus.id, name="Lena Fischer",
            title="Talent Partner", email="lena@nimbus.example",
        ),
        Contact(
            account_id=account.id, company_id=orbit.id, name="Dana Ortiz",
            title="Head of Engineering",
        ),
    ]
    session.add_all(contacts)
    await session.flush()

    links = [
        (backend_acme, contacts[0]),
        (backend_acme, contacts[1]),
        (platform_nimbus, contacts[2]),
    ]
    for application, contact in links:
        application.contacts.append(contact)
    await session.flush()

    return {
        "companies": 4,
        "applications": len(applications),
        "stages": len(stages),
        "contacts": len(contacts),
        "links": len(links),
    }
```

Implementer note: `application.contacts.append(...)` on a freshly-flushed object triggers a lazy load of the empty collection. In async that raises `MissingGreenlet`; if it does, replace the loop with an explicit insert:

```python
from app.models import application_contacts
await session.execute(
    application_contacts.insert(),
    [{"application_id": a.id, "contact_id": c.id} for a, c in links],
)
```

(Prefer the explicit insert from the start if in doubt; it is the deterministic option.)

- [ ] **Step 4: Wire the seed script**

In `scripts/seed.py`: change `upsert_account` to return the `Account` (still printing the created/updated line from `main`), then after both upserts and before `await session.commit()`:

```python
        await session.flush()
        counts = await reset_demo_data(session, demo)
        print("demo data:", ", ".join(f"{k}={v}" for k, v in counts.items()))
```

with `from app.demo_data import reset_demo_data` and `demo` being the demo `Account` returned by the second upsert. Update the module docstring: "Re-running updates passwords in place and rebuilds the demo account's sample data; the owner account's data is never touched."

- [ ] **Step 5: Update `docs/API_CONTRACT.md`**

Add to the error-code table (keep alphabetical-ish grouping under the 409 rows):

```markdown
| `COMPANY_HAS_APPLICATIONS` | 409 | Company deletion refused while it has applications (AC-02.6) |
| `DUPLICATE_APPLICATION` | 409 | Same company + role title exists; resend with `confirm_duplicate: true` to save anyway (AC-02.5) |
| `CONTACT_COMPANY_MISMATCH` | 409 | Contact and application belong to different companies (AC-03.2) |
```

Add a subsection after the table:

```markdown
### Extension members

`COMPANY_NAME_TAKEN` and `DUPLICATE_APPLICATION` responses carry `existing_id`
(integer id of the existing company / application) as an RFC 9457 extension
member, so the client can offer the existing record. No other extension members
exist in the MVP.
```

Add to "Wire values":

```markdown
- Naive datetimes sent for `scheduled_at` are interpreted in the account's time
  zone; aware datetimes are converted. Responses are always UTC.
- `GET /applications` accepts `status=<enum>`, `sort=last_activity|date_applied`
  (default `last_activity`) and `order=asc|desc` (default `desc`); nulls sort
  last. There is no pagination in the MVP.
- Deleting an application or company needs a confirmation step in the UI; the
  API deletes on the first call.
```

- [ ] **Step 6: Run the tests, lint, format, and the seed against the local database**

Run: `uv run pytest -v && uv run ruff format . && uv run ruff check .` — Expected: all pass, clean.
Run: `uv run python scripts/seed.py` (from `backend/`, with the local Docker Postgres `.env`) — Expected: two account lines plus `demo data: companies=4, applications=7, stages=5, contacts=4, links=3`; running it twice gives the same output.

---

### Task 7: Milestone verification (controller)

- [ ] **Step 1:** `cd backend && uv run pytest` → all pass (expect roughly 90+ tests).
- [ ] **Step 2:** `uv run ruff check . && uv run ruff format --check .` → clean.
- [ ] **Step 3:** OpenAPI paths: `uv run python -c "import os; os.environ.setdefault('DATABASE_URL','sqlite+aiosqlite:///:memory:'); from app.main import create_app; print('\n'.join(sorted(create_app().openapi()['paths'])))"` → lists `/settings`, `/companies`, `/companies/{company_id}`, `/applications`, `/applications/{application_id}`, `/applications/{application_id}/stages`, `/applications/{application_id}/stages/{stage_id}`, `/applications/{application_id}/stages/{stage_id}/move`, `/applications/{application_id}/contacts/{contact_id}`, `/contacts`, `/contacts/{contact_id}` plus the milestone 1 routes.
- [ ] **Step 4:** Live smoke against the local Docker Postgres: `uv run alembic upgrade head` (no-op), `uv run python scripts/seed.py`, start `uv run uvicorn app.main:create_app --factory`, then with the owner cookie: `POST /companies`, `POST /applications` (inline company conflict → 409 with `existing_id`), `GET /applications`, `POST …/stages`, `POST …/move`, `PUT …/contacts/{id}`, `DELETE /applications/{id}`. Log in as the demo account and confirm `GET /applications` returns the 7 seeded rows.
- [ ] **Step 5:** `git status` clean; `git log --oneline` shows conventional commits without AI attribution; nothing gitignored staged.
- [ ] **Step 6:** Append to `MANUAL_STEPS.md`: re-run `scripts/seed.py` against Neon once the milestone 1 Neon steps are done (demo data is part of the seed now).

## Self-Review (done at planning time)

- **Spec coverage:** AC-02.1–02.10 → Task 2 (02.4, 02.6) and Task 3 (02.1, 02.2, 02.3, 02.5, 02.7, 02.8, 02.9, 02.10). AC-03.1–03.7 → Task 4 (03.4, 03.5) and Task 5 (03.1, 03.2, 03.3, 03.6, 03.7). AC-01.7 → every task's 404 test. AC-01.8 → Task 6. AC-04.9 + NFR-08 time zone → Task 1. F-04 activity rules (what counts, what doesn't, immediate un-flagging) → Tasks 3, 4, 5. Frontend-only behaviors (empty state copy, confirmation dialogs, duplicate warning UI) are documented as client concerns in the contract and left for the UI milestone.
- **Adversarial pass over code blocks:**
  - Circular import `schemas/company.py` ↔ `schemas/application.py` is resolved with the deferred import + `model_rebuild()` in Task 3; `_CompanyRef` avoids importing company from application at the top.
  - `Application.contacts` and `Contact.applications` both declare `passive_deletes=True` (SQLAlchemy requires matching config on both sides of a secondary).
  - `CompanyService._flush_or_conflict` rolls back before re-querying, which also discards a pending inline application — correct, since the whole request fails.
  - `ApplicationService.create` calls `_validate_rules` before `add`, so a rule failure never leaves a pending application; the flushed inline company is discarded by `get_db`'s rollback on exception.
  - `record_activity` is imported by name into `services/activity.py` only; tests monkeypatch `app.services.activity.utcnow`, matching the milestone 1 pattern.
  - `StageService.move` swaps list positions then renumbers, so the `order_by=position` relationship and the returned list agree; the no-op path returns without committing.
  - Settings `strict=True` rejects `7.0`, `"7"`; `ge/le` reject 0 and 91 (AC-04.9). `reject_null` runs only when the client sends the key, because Pydantic skips validators for defaults.
  - `nulls_last()` is supported by SQLite ≥ 3.30 and Postgres; `Application.id.desc()` gives deterministic ties.
  - SQLite `PRAGMA foreign_keys=ON` makes `ON DELETE CASCADE` real in tests; Postgres already enforces it. `Application.company_id` has no `ON DELETE`, so the demo reset deletes applications before companies.
- **Type consistency:** `CompanyService.add/get` signatures used by `ApplicationService` and `ContactService`; `ApplicationService.get_detail` used by `StageService` and `ContactService`; `field_error(field, message)` used by `ApplicationService`; fixtures `owner_client`, `other_client`, `make_company`, `make_application` used identically across test files; `ApplicationSort`/`SortOrder` shared by schema, service, router.
