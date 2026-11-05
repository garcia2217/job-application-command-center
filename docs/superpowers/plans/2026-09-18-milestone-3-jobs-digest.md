# Milestone 3: Quiet Check Job + Weekly Digest Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The backend for PRD F-04 (daily quiet-application check + Needs follow-up data) and F-05 (Monday digest email with preview, rate limit and run records), triggered by QStash, sending through Resend, rate-limited through Upstash Redis — all covered by tests with fakes at the client boundary.

**Architecture:** Two QStash-signed `POST /jobs/*` routes call service classes that own one transaction each and always record a `JobRun` row (existing table). Provider clients (Resend, Upstash Redis) sit behind two tiny protocols in `app/integrations/`, are built once in the app lifespan onto `app.state`, and are replaced by in-memory fakes in tests. The digest's "is it due?" logic is a pure function (`week_anchor`) plus a "no run recorded since the anchor" check, which makes late runs and re-runs safe without any scheduler state.

**Tech Stack:** Python 3.14, FastAPI, Pydantic v2, SQLAlchemy 2.0 async (existing). Adds runtime deps `qstash` (schedules + `Receiver` signature verification), `resend` (`Emails.send_async`), `upstash-redis` (async REST client).

**Spec:** `docs/superpowers/specs/2026-09-18-milestone-3-jobs-digest-design.md` (approved 2026-09-18). PRD: `docs/PRD.md` §7 F-04, F-05; NFR-05, NFR-06. Contract: `docs/API_CONTRACT.md`.

## Global Constraints

- All work in `backend/`; run commands from `backend/` with `uv run …`.
- Type hints on all signatures; async DB access; no blocking I/O in request paths (the one sync call, `Receiver.verify`, is pure CPU).
- Routes thin → services own business logic and transactions and raise `AppError` subclasses; never `HTTPException`. Every route declares `response_model`.
- Errors are `application/problem+json`. New error code `INVALID_JOB_SIGNATURE` (401) must be added to `docs/API_CONTRACT.md` (Task 5).
- Config only via `Settings` (`app/config.py`); new values default to `REPLACE_ME` placeholders so the app boots with no secrets (stub-and-defer rule). `.env.example` mirrors every new variable.
- Wire values snake_case, enums lowercase (`succeeded|skipped|not_sent|failed`, `quiet_check|digest`), timestamps ISO 8601 UTC.
- SQLite in tests returns **naive** datetimes for `DateTime(timezone=True)` columns; Postgres returns aware. Use `app.clock.as_utc()` (Task 3) before any Python-side datetime arithmetic on values read from the DB.
- Job routes return **200 with a `failed` JobRun** on provider/DB failures (QStash retries non-2xx; the PRD says failures are not retried). Only a bad signature returns 401.
- TDD: failing test first. Tests live in `backend/tests/` mirroring source; fakes in `tests/fakes.py`.
- Commits: conventional messages, **no AI attribution of any kind**. Never `git add` AGENTS.md, CLAUDE.md, `.claude/`, MANUAL_STEPS.md, docs/OPERATOR_RUNBOOK.md, or `docs/superpowers/`. Implementers never commit; they list files for the controller.
- Before claiming done: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .` (run `uv run ruff format .` first).
- Out of scope: any frontend, per-application reminder emails, automatic retries, releasing a rate-limit slot after a failed send, non-hourly digest precision.

## Dispatch grouping (for the controller)

- **Dispatch A:** Task 1 + Task 2 (carry-overs, config, integrations, fakes). One reviewer.
- **Dispatch B:** Task 3 (quiet check job, jobs router, quiet filter). One reviewer.
- **Dispatch C:** Task 4 (digest service + job). Dedicated review — email path.
- **Dispatch D:** Task 5 (settings routes, register script, docs, manual steps). One reviewer (Haiku acceptable for the docs half).

## File structure

```
backend/src/app/
  clock.py                         + as_utc(), whole_days_between()
  config.py                        + 10 settings
  errors.py                        + INVALID_JOB_SIGNATURE, JobSignatureError
  dependencies.py                  + get_email_sender, get_rate_limiter, get_digest_service
  main.py                          + build adapters in lifespan; include jobs router
  integrations/__init__.py         build_email_sender(), build_rate_limiter()
  integrations/email.py            EmailSender protocol, EmailSendError, ResendEmailSender
  integrations/rate_limit.py       RateLimiter protocol, RedisRateLimiter
  integrations/qstash.py           verify_qstash_signature dependency
  schemas/job_run.py               JobRunResponse, JobRunsResponse
  schemas/digest.py                DigestPreviewResponse + item schemas
  schemas/application.py           ApplicationSummary.days_since_activity
  services/job_run_service.py      latest_run()
  services/quiet_check_service.py  QuietCheckService
  services/digest_service.py       week_anchor(), DigestContent, DigestService
  services/digest_render.py        render_digest()
  services/application_service.py  quiet filter; utcnow in _validate_rules
  services/contact_service.py      remove identity-map workaround
  routers/jobs.py                  POST /jobs/quiet-check, POST /jobs/digest
  routers/settings.py              GET /settings/job-runs, GET /settings/digest-preview
  routers/applications.py          ?quiet= param
backend/scripts/register_schedules.py
backend/tests/
  conftest.py                      per-request app session; fake adapters; jobs_client
  fakes.py                         FakeEmailSender, FakeRateLimiter, FakeRedis
  test_integrations.py, test_jobs_quiet_check.py, test_jobs_digest.py
  test_settings.py, test_applications.py, test_stages.py (additions)
docs/API_CONTRACT.md, MANUAL_STEPS.md, README.md (additions)
```

---

### Task 1: Milestone 2 carry-overs (test session isolation, clock, activity coverage)

**Files:**
- Modify: `backend/tests/conftest.py` (the `app` fixture, lines ~62-70)
- Modify: `backend/src/app/services/contact_service.py:52-70`
- Modify: `backend/src/app/services/application_service.py:1-2, 163-166`
- Test: `backend/tests/test_stages.py`, `backend/tests/test_applications.py`

**Interfaces:**
- Consumes: existing `create_app`, `get_db`, `record_activity`, `utcnow`.
- Produces: the `app` fixture no longer depends on `db_session`; requests get their own session. Later tasks rely on this: an ORM object held by a test must be `await db_session.refresh(obj)`-ed after the client mutates it.

- [ ] **Step 1: Write the failing activity tests for stage edit / reorder / delete (AC-04.4)**

Append to `backend/tests/test_stages.py`:

```python
@pytest.mark.parametrize("action", ["update", "move", "delete"])
async def test_stage_edit_reorder_delete_record_activity(
    owner_client: AsyncClient,
    application: Application,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    action: str,
) -> None:  # AC-04.4 — every stage change counts as activity
    url = f"/applications/{application.id}/stages"
    first = (await owner_client.post(url, json={"name": "Screen"})).json()
    await owner_client.post(url, json={"name": "Onsite"})

    # Re-quiet the application so the action under test must clear it again.
    await db_session.refresh(application)
    application.is_quiet = True
    application.last_activity_at = utcnow() - timedelta(days=10)
    await db_session.commit()

    later = utcnow() + timedelta(hours=1)
    monkeypatch.setattr(activity_module, "utcnow", lambda: later)
    if action == "update":
        response = await owner_client.patch(
            f"{url}/{first['id']}", json={"name": "Phone screen"}
        )
    elif action == "move":
        response = await owner_client.post(
            f"{url}/{first['id']}/move", json={"direction": "down"}
        )
    else:
        response = await owner_client.delete(f"{url}/{first['id']}")
    assert response.status_code in (200, 204), response.text

    detail = (await owner_client.get(f"/applications/{application.id}")).json()
    assert detail["is_quiet"] is False
    assert detail["last_activity_at"].startswith(later.isoformat()[:19])
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run pytest tests/test_stages.py -k record_activity -v`
Expected: the three new cases FAIL (with the shared session, the app returns the stale in-memory object, so `is_quiet` may still read `True`, or the refresh sees mutated state). If they already pass, continue — the fixture change in Step 3 is still required for Task 3.

- [ ] **Step 3: Give the ASGI app its own per-request session**

In `backend/tests/conftest.py` replace the `app` fixture:

```python
@pytest.fixture
def app(engine) -> FastAPI:
    application = create_app()
    request_sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def _get_db_override():
        async with request_sessions() as session:
            yield session

    application.dependency_overrides[get_db] = _get_db_override
    return application
```

`db_session` stays as-is for test-side seeding. Because the engine uses `StaticPool`, both sessions share one SQLite connection, so committed rows are visible across them.

- [ ] **Step 4: Remove the identity-map workaround from contact delete**

In `backend/src/app/services/contact_service.py` replace the whole `delete` method with:

```python
    async def delete(self, account_id: int, contact_id: int) -> None:
        contact = await self.get(account_id, contact_id)
        await self.db.delete(contact)  # application_contacts rows: ON DELETE CASCADE
        await self.db.commit()
```

Then remove any imports that became unused (`select`, `Application`, `application_contacts`) — `uv run ruff check .` will name them.

- [ ] **Step 5: Run the whole suite; repair stale-object reads**

Run: `uv run pytest -q`
Expected: most tests pass. For any failure where a test asserts on an ORM object it created through `db_session` **after** the client mutated that row, add `await db_session.refresh(<obj>)` right before the assertion (this is the only sanctioned fix). If more than three tests fail for any other reason (e.g. `database is locked`), stop and report — the controller decides whether to park this item again.

- [ ] **Step 6: Write the failing clock test for date-applied validation**

Append to `backend/tests/test_applications.py`:

```python
async def test_future_date_uses_app_clock(
    owner_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 23:30 UTC on the 18th is already the 19th in Bangkok (UTC+7).
    frozen = datetime(2026, 9, 18, 23, 30, tzinfo=UTC)
    monkeypatch.setattr(application_service_module, "utcnow", lambda: frozen)
    await owner_client.patch("/settings", json={"timezone": "Asia/Bangkok"})
    company = await make_company(db_session, owner_account)

    ok = await owner_client.post(
        "/applications",
        json={
            "company_id": company.id,
            "role_title": "Clock A",
            "date_applied": "2026-09-19",
        },
    )
    assert ok.status_code == 201, ok.text

    future = await owner_client.post(
        "/applications",
        json={
            "company_id": company.id,
            "role_title": "Clock B",
            "date_applied": "2026-09-20",
        },
    )
    assert future.status_code == 422
    assert future.json()["errors"][0]["field"] == "date_applied"
```

Add to the imports at the top of `test_applications.py` (keep existing ones):

```python
from datetime import UTC, datetime

import pytest

from app.services import application_service as application_service_module
```

- [ ] **Step 7: Run it to verify it fails**

Run: `uv run pytest tests/test_applications.py::test_future_date_uses_app_clock -v`
Expected: FAIL — the first POST returns 422 because `datetime.now` (real clock) is used instead of the frozen one.

- [ ] **Step 8: Use the app clock in `_validate_rules`**

In `backend/src/app/services/application_service.py` change the date check to:

```python
        if application.date_applied is not None:
            today = utcnow().astimezone(ZoneInfo(account.timezone)).date()
            if application.date_applied > today:
                raise field_error("date_applied", "Cannot be in the future")
```

Remove `from datetime import datetime` if it is now unused.

- [ ] **Step 9: Verify**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass (83 existing + 4 new).

- [ ] **Step 10: Report files for commit**

Files: `tests/conftest.py`, `tests/test_stages.py`, `tests/test_applications.py`, `src/app/services/contact_service.py`, `src/app/services/application_service.py`.
Commit message (controller): `fix(backend): isolate request sessions in tests and use the app clock for date rules`

---

### Task 2: Config, integrations (Resend, Upstash Redis, QStash signature) and test fakes

**Files:**
- Modify: `backend/pyproject.toml` (dependencies), `backend/.env.example`
- Modify: `backend/src/app/config.py`, `backend/src/app/errors.py`, `backend/src/app/dependencies.py`, `backend/src/app/main.py`
- Create: `backend/src/app/integrations/__init__.py`, `email.py`, `rate_limit.py`, `qstash.py`
- Create: `backend/tests/fakes.py`, `backend/tests/test_integrations.py`
- Modify: `backend/tests/conftest.py` (fake adapters on `app.state`, `email_sender`, `rate_limiter`, `jobs_client` fixtures)

**Interfaces:**
- Produces (used by Tasks 3-5):
  - `Settings` fields: `public_base_url`, `app_base_url`, `qstash_token`, `qstash_current_signing_key`, `qstash_next_signing_key`, `resend_api_key`, `email_from`, `upstash_redis_rest_url`, `upstash_redis_rest_token`, `email_daily_limit`.
  - `app.integrations.email.EmailSender` protocol: `async send(self, *, to: str, subject: str, html: str, text: str) -> str`; `EmailSendError(Exception)`.
  - `app.integrations.rate_limit.RateLimiter` protocol: `async try_acquire(self, day: date) -> bool`.
  - `app.integrations.qstash.verify_qstash_signature` (FastAPI dependency, raises `JobSignatureError`).
  - `app.dependencies.EmailSenderDep`, `RateLimiterDep`.
  - Fixtures: `email_sender: FakeEmailSender` (`.sent: list[SentEmail]`, `.fail_with: str | None`), `rate_limiter: FakeRateLimiter` (`.counts: dict[date, int]`, `.limit`), `jobs_client: AsyncClient` (signature check bypassed).

- [ ] **Step 1: Add dependencies**

Run from `backend/`: `uv add qstash resend upstash-redis`
Expected: `pyproject.toml` gains the three entries under `dependencies`; `uv.lock` updates.

- [ ] **Step 2: Extend Settings and `.env.example`**

Append inside `class Settings` in `backend/src/app/config.py` (after `lockout_duration_minutes`):

```python
    # Milestone 3 — jobs, email, rate limit. Placeholders keep the app bootable
    # without secrets (stub-and-defer); real values come from MANUAL_STEPS.md.
    public_base_url: str = "http://localhost:8000"  # this API, as QStash reaches it
    app_base_url: str = "http://localhost:3000"  # the frontend, for links in emails
    qstash_token: str = "REPLACE_ME"
    qstash_current_signing_key: str = "REPLACE_ME"
    qstash_next_signing_key: str = "REPLACE_ME"
    resend_api_key: str = "REPLACE_ME"
    email_from: str = "Job Application Command Center <onboarding@resend.dev>"
    upstash_redis_rest_url: str = "REPLACE_ME"
    upstash_redis_rest_token: str = "REPLACE_ME"
    email_daily_limit: int = 5
```

Append to `backend/.env.example`:

```
# Milestone 3 — background jobs and email
# Public URL of this API as QStash reaches it (Render URL in production, no trailing slash)
PUBLIC_BASE_URL=http://localhost:8000
# Public URL of the frontend; digest links point here
APP_BASE_URL=http://localhost:3000
# Upstash QStash (console → QStash → Request Builder / Signing Keys)
QSTASH_TOKEN=REPLACE_ME
QSTASH_CURRENT_SIGNING_KEY=REPLACE_ME
QSTASH_NEXT_SIGNING_KEY=REPLACE_ME
# Resend (https://resend.com/api-keys); onboarding@resend.dev delivers only to the Resend account owner's address
RESEND_API_KEY=REPLACE_ME
EMAIL_FROM="Job Application Command Center <onboarding@resend.dev>"
# Upstash Redis REST credentials (console → database → REST API)
UPSTASH_REDIS_REST_URL=REPLACE_ME
UPSTASH_REDIS_REST_TOKEN=REPLACE_ME
# System-wide cap on outbound emails per UTC day (PRD F-05)
EMAIL_DAILY_LIMIT=5
```

- [ ] **Step 3: Add the error code and exception**

In `backend/src/app/errors.py`, add to `ErrorCode` after `CONTACT_COMPANY_MISMATCH`:

```python
    INVALID_JOB_SIGNATURE = "INVALID_JOB_SIGNATURE"
```

and after `AuthenticationError`:

```python
class JobSignatureError(AppError):
    """QStash signature missing or invalid on a /jobs route (never a session issue)."""

    status_code = 401
    code = ErrorCode.INVALID_JOB_SIGNATURE
    title = "Invalid job signature"
```

- [ ] **Step 4: Write the failing integration unit tests**

Create `backend/tests/fakes.py`:

```python
"""In-memory stand-ins for provider clients (PRD NFR-06: test doubles at the boundary)."""

from dataclasses import dataclass, field
from datetime import date

from app.integrations.email import EmailSendError


@dataclass(frozen=True)
class SentEmail:
    to: str
    subject: str
    html: str
    text: str


@dataclass
class FakeEmailSender:
    sent: list[SentEmail] = field(default_factory=list)
    fail_with: str | None = None

    async def send(self, *, to: str, subject: str, html: str, text: str) -> str:
        if self.fail_with is not None:
            raise EmailSendError(self.fail_with)
        self.sent.append(SentEmail(to=to, subject=subject, html=html, text=text))
        return f"fake-{len(self.sent)}"


@dataclass
class FakeRateLimiter:
    limit: int = 5
    counts: dict[date, int] = field(default_factory=dict)

    async def try_acquire(self, day: date) -> bool:
        self.counts[day] = self.counts.get(day, 0) + 1
        return self.counts[day] <= self.limit


@dataclass
class FakeRedis:
    """Only the two commands RedisRateLimiter uses."""

    values: dict[str, int] = field(default_factory=dict)
    expirations: dict[str, int] = field(default_factory=dict)

    async def incr(self, key: str) -> int:
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    async def expire(self, key: str, seconds: int) -> bool:
        self.expirations[key] = seconds
        return True
```

Create `backend/tests/test_integrations.py`:

```python
from datetime import date
from unittest.mock import AsyncMock

import pytest
import resend

from app.integrations.email import EmailSendError, ResendEmailSender
from app.integrations.rate_limit import KEY_TTL_SECONDS, RedisRateLimiter
from tests.fakes import FakeRedis


async def test_redis_limiter_allows_limit_then_refuses() -> None:
    redis = FakeRedis()
    limiter = RedisRateLimiter(redis, limit=5)
    day = date(2026, 9, 21)
    results = [await limiter.try_acquire(day) for _ in range(6)]
    assert results == [True] * 5 + [False]
    assert redis.values == {"emails:sent:2026-09-21": 6}
    # TTL is set exactly once, when the key is created.
    assert redis.expirations == {"emails:sent:2026-09-21": KEY_TTL_SECONDS}


async def test_redis_limiter_counts_per_day() -> None:
    limiter = RedisRateLimiter(FakeRedis(), limit=1)
    assert await limiter.try_acquire(date(2026, 9, 21)) is True
    assert await limiter.try_acquire(date(2026, 9, 21)) is False
    assert await limiter.try_acquire(date(2026, 9, 22)) is True


async def test_resend_sender_passes_params_and_returns_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send_async = AsyncMock(return_value={"id": "email_123"})
    monkeypatch.setattr(resend.Emails, "send_async", send_async)
    sender = ResendEmailSender(api_key="re_test", from_address="Me <me@example.com>")

    message_id = await sender.send(
        to="owner@example.com", subject="Hi", html="<p>x</p>", text="x"
    )

    assert message_id == "email_123"
    assert resend.api_key == "re_test"
    send_async.assert_awaited_once_with(
        {
            "from": "Me <me@example.com>",
            "to": ["owner@example.com"],
            "subject": "Hi",
            "html": "<p>x</p>",
            "text": "x",
        }
    )


async def test_resend_sender_wraps_provider_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        resend.Emails, "send_async", AsyncMock(side_effect=RuntimeError("401 bad key"))
    )
    sender = ResendEmailSender(api_key="re_test", from_address="me@example.com")
    with pytest.raises(EmailSendError) as info:
        await sender.send(to="a@b.c", subject="s", html="h", text="t")
    assert str(info.value) == "RuntimeError: 401 bad key"
```

- [ ] **Step 5: Run to verify they fail**

Run: `uv run pytest tests/test_integrations.py -v`
Expected: FAIL with `ModuleNotFoundError: app.integrations`.

- [ ] **Step 6: Implement the integrations package**

Create `backend/src/app/integrations/email.py`:

```python
from typing import Protocol

import resend


class EmailSendError(Exception):
    """The provider rejected or could not deliver the message.

    The message is a short, safe summary suitable for a JobRun detail.
    """


class EmailSender(Protocol):
    async def send(self, *, to: str, subject: str, html: str, text: str) -> str:
        """Send one message; returns the provider's message id."""
        ...


class ResendEmailSender:
    def __init__(self, api_key: str, from_address: str) -> None:
        resend.api_key = api_key  # the SDK is configured module-wide
        self.from_address = from_address

    async def send(self, *, to: str, subject: str, html: str, text: str) -> str:
        params: resend.Emails.SendParams = {
            "from": self.from_address,
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
        }
        try:
            response = await resend.Emails.send_async(params)
        except Exception as exc:  # any SDK/HTTP failure becomes a recorded Failed run
            raise EmailSendError(f"{type(exc).__name__}: {exc}") from exc
        return response["id"]
```

Create `backend/src/app/integrations/rate_limit.py`:

```python
from datetime import date
from typing import Protocol

from upstash_redis.asyncio import Redis

KEY_TTL_SECONDS = 172_800  # two days: the key only matters for one UTC day


class RateLimiter(Protocol):
    async def try_acquire(self, day: date) -> bool:
        """Reserve one send slot for `day`; False when the daily cap is reached."""
        ...


class RedisRateLimiter:
    """System-wide cap on outbound emails per UTC calendar day (PRD F-05).

    A slot is reserved before sending and never released: a failed send is not
    retried, so counting it keeps the cap conservative.
    """

    def __init__(self, redis: Redis, limit: int) -> None:
        self.redis = redis
        self.limit = limit

    async def try_acquire(self, day: date) -> bool:
        key = f"emails:sent:{day.isoformat()}"
        count = await self.redis.incr(key)
        if count == 1:
            await self.redis.expire(key, KEY_TTL_SECONDS)
        return count <= self.limit
```

Create `backend/src/app/integrations/qstash.py`:

```python
from typing import Annotated

from fastapi import Header, Request
from qstash import Receiver
from qstash.errors import SignatureError

from app.dependencies import SettingsDep
from app.errors import JobSignatureError


async def verify_qstash_signature(
    request: Request,
    settings: SettingsDep,
    upstash_signature: Annotated[str | None, Header()] = None,
) -> None:
    """Route dependency for /jobs/*: only QStash may trigger jobs (no session)."""
    if not upstash_signature:
        raise JobSignatureError("Missing Upstash-Signature header")
    receiver = Receiver(
        current_signing_key=settings.qstash_current_signing_key,
        next_signing_key=settings.qstash_next_signing_key,
    )
    body = (await request.body()).decode()
    try:
        receiver.verify(
            signature=upstash_signature,
            body=body,
            url=f"{settings.public_base_url}{request.url.path}",
        )
    except SignatureError as exc:
        raise JobSignatureError("Invalid QStash signature") from exc
```

Create `backend/src/app/integrations/__init__.py`:

```python
from upstash_redis.asyncio import Redis

from app.config import Settings
from app.integrations.email import EmailSender, ResendEmailSender
from app.integrations.rate_limit import RateLimiter, RedisRateLimiter


def build_email_sender(settings: Settings) -> EmailSender:
    return ResendEmailSender(settings.resend_api_key, settings.email_from)


def build_rate_limiter(settings: Settings) -> RateLimiter:
    redis = Redis(
        url=settings.upstash_redis_rest_url, token=settings.upstash_redis_rest_token
    )
    return RedisRateLimiter(redis, settings.email_daily_limit)


__all__ = ["build_email_sender", "build_rate_limiter"]
```

- [ ] **Step 7: Wire adapters into the app and dependencies**

In `backend/src/app/main.py` add the import `from app.integrations import build_email_sender, build_rate_limiter` and, inside `lifespan` right after `app.state.sessionmaker = ...`:

```python
        app.state.email_sender = build_email_sender(settings)
        app.state.rate_limiter = build_rate_limiter(settings)
```

In `backend/src/app/dependencies.py` add (imports: `from app.integrations.email import EmailSender`, `from app.integrations.rate_limit import RateLimiter`) after `SettingsDep`:

```python
def get_email_sender(request: Request) -> EmailSender:
    return request.app.state.email_sender


def get_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.rate_limiter


EmailSenderDep = Annotated[EmailSender, Depends(get_email_sender)]
RateLimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]
```

(`app.integrations.qstash` imports `app.dependencies`; `app.dependencies` imports only `email`/`rate_limit`, so there is no cycle.)

- [ ] **Step 8: Add fake adapters and the jobs client to conftest**

In `backend/tests/conftest.py` add the import `from tests.fakes import FakeEmailSender, FakeRateLimiter` and `from app.integrations.qstash import verify_qstash_signature`. Change the `app` fixture (from Task 1) to also set state, and add three fixtures:

```python
@pytest.fixture
def app(engine) -> FastAPI:
    application = create_app()
    request_sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def _get_db_override():
        async with request_sessions() as session:
            yield session

    application.dependency_overrides[get_db] = _get_db_override
    # ASGITransport never runs lifespan, so the adapters are set here directly.
    application.state.email_sender = FakeEmailSender()
    application.state.rate_limiter = FakeRateLimiter()
    return application


@pytest.fixture
def email_sender(app: FastAPI) -> FakeEmailSender:
    return app.state.email_sender


@pytest.fixture
def rate_limiter(app: FastAPI) -> FakeRateLimiter:
    return app.state.rate_limiter


@pytest.fixture
async def jobs_client(app: FastAPI, client: AsyncClient) -> AsyncClient:
    """A client whose /jobs calls pass signature verification (QStash stand-in)."""
    app.dependency_overrides[verify_qstash_signature] = lambda: None
    return client
```

- [ ] **Step 9: Verify**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass, including the 4 new integration tests. Also confirm the app boots with placeholders:
`uv run python -c "from app.main import create_app; create_app()"` → no output, exit 0.

- [ ] **Step 10: Report files for commit**

Files: `pyproject.toml`, `uv.lock`, `.env.example`, `src/app/config.py`, `src/app/errors.py`, `src/app/dependencies.py`, `src/app/main.py`, `src/app/integrations/*.py`, `tests/fakes.py`, `tests/test_integrations.py`, `tests/conftest.py`.
Commit message: `feat(backend): email, rate-limit and QStash signature adapters with test fakes`

---

### Task 3: Daily quiet check job, jobs router, Needs follow-up query

**Files:**
- Modify: `backend/src/app/clock.py`
- Create: `backend/src/app/schemas/job_run.py`, `backend/src/app/services/job_run_service.py`, `backend/src/app/services/quiet_check_service.py`, `backend/src/app/routers/jobs.py`
- Modify: `backend/src/app/main.py` (include router), `backend/src/app/schemas/application.py` (`ApplicationSummary`), `backend/src/app/services/application_service.py` (`list`), `backend/src/app/routers/applications.py` (`list_applications`)
- Test: `backend/tests/test_jobs_quiet_check.py`, `backend/tests/test_applications.py`

**Interfaces:**
- Consumes: Task 2's `verify_qstash_signature`, `jobs_client` fixture; existing `JobRun`, `JobType`, `JobStatus`, `ACTIVE_STATUSES`.
- Produces:
  - `app.clock.as_utc(value: datetime) -> datetime`, `app.clock.whole_days_between(earlier: datetime, later: datetime) -> int`.
  - `app.schemas.job_run.JobRunResponse` (`id, job_type, account_id, ran_at, status, detail`).
  - `app.services.job_run_service.latest_run(db, job_type: JobType, account_id: int | None) -> JobRun | None`.
  - `QuietCheckService(db).run(now: datetime | None = None) -> JobRun`.
  - `routers/jobs.router` with prefix `/jobs`, dependency `verify_qstash_signature`, route `POST /jobs/quiet-check`. Task 4 adds `POST /jobs/digest` to this router.
  - `GET /applications?quiet=true` and `ApplicationSummary.days_since_activity: int`.

- [ ] **Step 1: Write the failing job tests**

Create `backend/tests/test_jobs_quiet_check.py`:

```python
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import Account, Application, ApplicationStatus, JobRun
from app.services.quiet_check_service import QuietCheckService
from tests.conftest import make_application, make_company


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
    return (await db_session.execute(select(func.count()).select_from(JobRun))).scalar_one()


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
    jobs_client: AsyncClient, db_session: AsyncSession, owner_account: Account
) -> None:  # AC-04.6 and "threshold change takes effect at the next run"
    stale = await _seed(db_session, owner_account, days=10)
    await jobs_client.post("/jobs/quiet-check")
    await jobs_client.post("/jobs/quiet-check")

    listed = (await jobs_client.get("/applications?quiet=true")).json()
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

    async def explode(self: QuietCheckService, now):  # noqa: ANN001
        await original(self, now)  # flags are written, then the run blows up
        raise RuntimeError("boom")

    monkeypatch.setattr(QuietCheckService, "_flag_all", explode)

    response = await jobs_client.post("/jobs/quiet-check")

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert response.json()["detail"] == "RuntimeError: boom"
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
```

Append to `backend/tests/test_applications.py`:

```python
async def test_quiet_filter_oldest_first_with_days(
    owner_client: AsyncClient, db_session: AsyncSession, owner_account: Account
) -> None:  # F-04 Needs follow-up list
    company = await make_company(db_session, owner_account)
    newer = await make_application(
        db_session,
        owner_account,
        company,
        role_title="Newer",
        last_activity_at=utcnow() - timedelta(days=8),
        is_quiet=True,
    )
    older = await make_application(
        db_session,
        owner_account,
        company,
        role_title="Older",
        last_activity_at=utcnow() - timedelta(days=12),
        is_quiet=True,
    )
    await make_application(
        db_session, owner_account, company, role_title="Fresh", is_quiet=False
    )

    response = await owner_client.get("/applications?quiet=true")

    assert response.status_code == 200
    body = response.json()
    assert [a["id"] for a in body] == [older.id, newer.id]
    assert [a["days_since_activity"] for a in body] == [12, 8]

    everything = (await owner_client.get("/applications")).json()
    assert len(everything) == 3
    assert everything[0]["days_since_activity"] == 0
```

(`timedelta` and `utcnow` imports: add `from datetime import UTC, datetime, timedelta` and `from app.clock import utcnow` at the top of the file if not already present.)

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_jobs_quiet_check.py tests/test_applications.py::test_quiet_filter_oldest_first_with_days -v`
Expected: FAIL — `ModuleNotFoundError: app.services.quiet_check_service`, and 404 on `/jobs/quiet-check`.

- [ ] **Step 3: Clock helpers**

Append to `backend/src/app/clock.py`:

```python
def as_utc(value: datetime) -> datetime:
    """SQLite hands back naive UTC for timezone-aware columns; Postgres hands back aware."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def whole_days_between(earlier: datetime, later: datetime) -> int:
    return (as_utc(later) - as_utc(earlier)).days
```

- [ ] **Step 4: JobRun schema and latest-run helper**

Create `backend/src/app/schemas/job_run.py`:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import JobStatus, JobType


class JobRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_type: JobType
    account_id: int | None
    ran_at: datetime
    status: JobStatus
    detail: str | None


class JobRunsResponse(BaseModel):
    """Latest run of each job, for Settings (PRD F-04/F-05)."""

    quiet_check: JobRunResponse | None
    digest: JobRunResponse | None
```

Create `backend/src/app/services/job_run_service.py`:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import JobRun, JobType


async def latest_run(
    db: AsyncSession, job_type: JobType, account_id: int | None
) -> JobRun | None:
    """Most recent run of `job_type`; `account_id=None` means the system-wide run."""
    query = select(JobRun).where(JobRun.job_type == job_type)
    if account_id is None:
        query = query.where(JobRun.account_id.is_(None))
    else:
        query = query.where(JobRun.account_id == account_id)
    query = query.order_by(JobRun.ran_at.desc(), JobRun.id.desc()).limit(1)
    return (await db.execute(query)).scalar_one_or_none()
```

- [ ] **Step 5: Quiet check service**

Create `backend/src/app/services/quiet_check_service.py`:

```python
from datetime import datetime, timedelta

from sqlalchemy import and_, not_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import ACTIVE_STATUSES, Account, Application, JobRun, JobStatus, JobType


class QuietCheckService:
    """PRD F-04: one system-wide daily run that recomputes every account's quiet flags."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def run(self, now: datetime | None = None) -> JobRun:
        now = now or utcnow()
        try:
            flagged = await self._flag_all(now)
            run = JobRun(
                job_type=JobType.QUIET_CHECK,
                account_id=None,
                ran_at=now,
                status=JobStatus.SUCCEEDED,
                detail=f"Flagged {flagged} application(s)",
            )
            self.db.add(run)
            await self.db.commit()
        except Exception as exc:
            # AC-04.7: previous flags survive; the failure itself is recorded.
            await self.db.rollback()
            run = JobRun(
                job_type=JobType.QUIET_CHECK,
                account_id=None,
                ran_at=now,
                status=JobStatus.FAILED,
                detail=f"{type(exc).__name__}: {exc}"[:500],
            )
            self.db.add(run)
            await self.db.commit()
        await self.db.refresh(run)
        return run

    async def _flag_all(self, now: datetime) -> int:
        accounts = (await self.db.execute(select(Account))).scalars().all()
        flagged = 0
        for account in accounts:
            cutoff = now - timedelta(days=account.quiet_threshold_days)
            is_quiet_now = and_(
                Application.account_id == account.id,
                Application.status.in_(list(ACTIVE_STATUSES)),
                Application.last_activity_at <= cutoff,
            )
            result = await self.db.execute(
                update(Application)
                .where(is_quiet_now)
                .values(is_quiet=True)
                .execution_options(synchronize_session="fetch")
            )
            flagged += result.rowcount
            await self.db.execute(
                update(Application)
                .where(Application.account_id == account.id, not_(is_quiet_now))
                .values(is_quiet=False)
                .execution_options(synchronize_session="fetch")
            )
        return flagged
```

- [ ] **Step 6: Jobs router**

Create `backend/src/app/routers/jobs.py`:

```python
from fastapi import APIRouter, Depends

from app.dependencies import DbDep
from app.integrations.qstash import verify_qstash_signature
from app.schemas.job_run import JobRunResponse
from app.services.quiet_check_service import QuietCheckService

router = APIRouter(
    prefix="/jobs", tags=["jobs"], dependencies=[Depends(verify_qstash_signature)]
)


@router.post("/quiet-check", response_model=JobRunResponse)
async def run_quiet_check(db: DbDep):
    """Triggered daily by a QStash schedule (see scripts/register_schedules.py)."""
    return await QuietCheckService(db).run()
```

In `backend/src/app/main.py` add `jobs` to the `from app.routers import ...` line and `app.include_router(jobs.router)` after the contacts routers.

- [ ] **Step 7: Quiet filter and days_since_activity**

In `backend/src/app/schemas/application.py` add imports `from pydantic import computed_field` (extend the existing pydantic import line) and `from app.clock import utcnow, whole_days_between`, then inside `ApplicationSummary` after `is_quiet: bool`:

```python
    @computed_field
    @property
    def days_since_activity(self) -> int:
        return whole_days_between(self.last_activity_at, utcnow())
```

In `backend/src/app/services/application_service.py` change `list`:

```python
    async def list(
        self,
        account_id: int,
        *,
        status: ApplicationStatus | None = None,
        quiet: bool | None = None,
        sort: ApplicationSort = "last_activity",
        order: SortOrder | None = None,
    ) -> list[Application]:
        # Needs follow-up (quiet=true) defaults to oldest activity first (PRD F-04).
        if order is None:
            order = "asc" if quiet else "desc"
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
        if quiet is not None:
            query = query.where(Application.is_quiet.is_(quiet))
        result = await self.db.execute(query)
        return list(result.scalars())
```

In `backend/src/app/routers/applications.py` change `list_applications`:

```python
@router.get("", response_model=list[ApplicationSummary])
async def list_applications(
    account: CurrentAccountDep,
    service: ApplicationServiceDep,
    status_filter: Annotated[ApplicationStatus | None, Query(alias="status")] = None,
    quiet: bool | None = None,
    sort: ApplicationSort = "last_activity",
    order: SortOrder | None = None,
):
    return await service.list(
        account.id, status=status_filter, quiet=quiet, sort=sort, order=order
    )
```

- [ ] **Step 8: Verify**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass. If `test_job_routes_require_qstash_signature` fails on the garbage header with a non-`SignatureError` exception type leaking out of `Receiver.verify`, report the exact exception class; do not widen the `except` without the controller's decision.

- [ ] **Step 9: Report files for commit**

Files: `src/app/clock.py`, `src/app/schemas/job_run.py`, `src/app/schemas/application.py`, `src/app/services/job_run_service.py`, `src/app/services/quiet_check_service.py`, `src/app/services/application_service.py`, `src/app/routers/jobs.py`, `src/app/routers/applications.py`, `src/app/main.py`, `tests/test_jobs_quiet_check.py`, `tests/test_applications.py`.
Commit message: `feat(backend): daily quiet check job and Needs follow-up query`

---

### Task 4: Weekly digest service and job

**Files:**
- Create: `backend/src/app/services/digest_service.py`, `backend/src/app/services/digest_render.py`
- Modify: `backend/src/app/dependencies.py` (`get_digest_service`), `backend/src/app/routers/jobs.py` (`POST /jobs/digest`)
- Test: `backend/tests/test_jobs_digest.py`

**Interfaces:**
- Consumes: Task 2 `EmailSenderDep`, `RateLimiterDep`, `EmailSendError`, fixtures `email_sender`, `rate_limiter`, `jobs_client`; Task 3 `latest_run`, `as_utc`, `whole_days_between`, `JobRunResponse`, `routers/jobs.router`.
- Produces:
  - `week_anchor(timezone: str, now: datetime) -> datetime` (aware UTC).
  - dataclasses `QuietItem`, `UpcomingStageItem`, `DigestContent(.is_empty)`, `DigestPreview(content, would_send, skip_reason)`.
  - `DigestService(db, settings, sender, limiter)` with `build(account, now)`, `run(now=None) -> list[JobRun]`, `preview(account, now=None) -> DigestPreview`.
  - `render_digest(content, timezone) -> tuple[str, str, str]` (subject, html, text).
  - `app.dependencies.DigestServiceDep`.
  - `POST /jobs/digest` → `list[JobRunResponse]` (one per account that was due).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_jobs_digest.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Application, InterviewStage, JobRun, JobStatus, JobType
from app.services import digest_service as digest_module
from app.services.digest_service import week_anchor
from tests.conftest import make_application, make_company
from tests.fakes import FakeEmailSender, FakeRateLimiter

MONDAY_0800_UTC = datetime(2026, 9, 21, 8, 0, tzinfo=UTC)  # 2026-09-21 is a Monday
MONDAY_0900_UTC = MONDAY_0800_UTC + timedelta(hours=1)


def test_week_anchor_utc() -> None:
    assert week_anchor("UTC", MONDAY_0900_UTC) == MONDAY_0800_UTC
    # Monday 07:59 belongs to the previous week.
    assert week_anchor("UTC", MONDAY_0800_UTC - timedelta(minutes=1)) == (
        MONDAY_0800_UTC - timedelta(days=7)
    )
    # Late in the week still anchors to this Monday (late runs, PRD F-05).
    assert week_anchor("UTC", MONDAY_0800_UTC + timedelta(days=4)) == MONDAY_0800_UTC


def test_week_anchor_tokyo() -> None:  # AC-05.7
    tokyo_monday_0800 = datetime(2026, 9, 20, 23, 0, tzinfo=UTC)  # Mon 08:00 JST
    assert week_anchor("Asia/Tokyo", tokyo_monday_0800) == tokyo_monday_0800
    assert (
        week_anchor("Asia/Tokyo", tokyo_monday_0800 - timedelta(minutes=30))
        == tokyo_monday_0800 - timedelta(days=7)
    )
    assert week_anchor("Asia/Tokyo", MONDAY_0900_UTC) == tokyo_monday_0800


@pytest.fixture
def frozen_now(monkeypatch: pytest.MonkeyPatch):
    def freeze(moment: datetime) -> None:
        monkeypatch.setattr(digest_module, "utcnow", lambda: moment)

    return freeze


async def _stage(
    db_session: AsyncSession, application: Application, name: str, at: datetime
) -> InterviewStage:
    stage = InterviewStage(application_id=application.id, name=name, scheduled_at=at)
    db_session.add(stage)
    await db_session.commit()
    return stage


async def _run_rows(db_session: AsyncSession) -> list[JobRun]:
    rows = await db_session.execute(
        select(JobRun).where(JobRun.job_type == JobType.DIGEST).order_by(JobRun.id)
    )
    return list(rows.scalars())


async def test_monday_run_sends_quiet_and_upcoming(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.1, AC-05.9
    frozen_now(MONDAY_0900_UTC)
    company = await make_company(db_session, owner_account)
    quiet_a = await make_application(
        db_session, owner_account, company, role_title="Quiet A",
        last_activity_at=MONDAY_0900_UTC - timedelta(days=10), is_quiet=True,
    )
    quiet_b = await make_application(
        db_session, owner_account, company, role_title="Quiet B",
        last_activity_at=MONDAY_0900_UTC - timedelta(days=8), is_quiet=True,
    )
    active = await make_application(
        db_session, owner_account, company, role_title="Active",
        last_activity_at=MONDAY_0900_UTC,
    )
    await _stage(db_session, active, "Onsite", MONDAY_0800_UTC + timedelta(days=2))
    await _stage(db_session, active, "Too late", MONDAY_0800_UTC + timedelta(days=8))
    await _stage(db_session, active, "Already past", MONDAY_0800_UTC - timedelta(hours=1))

    response = await jobs_client.post("/jobs/digest")

    assert response.status_code == 200, response.text
    runs = response.json()
    assert len(runs) == 1
    assert runs[0]["status"] == "succeeded"
    assert runs[0]["account_id"] == owner_account.id
    assert runs[0]["detail"] == f"Sent to {owner_account.email}"

    assert len(email_sender.sent) == 1
    email = email_sender.sent[0]
    assert email.to == owner_account.email
    assert email.subject == "Your week: 2 to chase, 1 coming up"
    for application in (quiet_a, quiet_b, active):
        assert f"/applications/{application.id}" in email.text
        assert f"/applications/{application.id}" in email.html
    assert "Quiet A" in email.text and "10 days" in email.text
    assert "Onsite" in email.text
    assert "Too late" not in email.text
    assert "Already past" not in email.text


async def test_nothing_to_report_is_skipped(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.2
    frozen_now(MONDAY_0900_UTC)
    response = await jobs_client.post("/jobs/digest")
    assert response.json()[0]["status"] == "skipped"
    assert response.json()[0]["detail"] == "Skipped: nothing to report"
    assert email_sender.sent == []


async def test_demo_account_never_sends(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    other_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.3 (other_account is the demo account)
    frozen_now(MONDAY_0900_UTC)
    company = await make_company(db_session, other_account)
    await make_application(
        db_session, other_account, company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=20), is_quiet=True,
    )
    response = await jobs_client.post("/jobs/digest")
    runs = response.json()
    assert len(runs) == 1
    assert runs[0]["status"] == "skipped"
    assert runs[0]["detail"] == "Skipped: demo account"
    assert email_sender.sent == []


async def test_second_run_same_monday_sends_nothing(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.4
    frozen_now(MONDAY_0900_UTC)
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session, owner_account, company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9), is_quiet=True,
    )
    first = await jobs_client.post("/jobs/digest")
    frozen_now(MONDAY_0900_UTC + timedelta(hours=3))
    second = await jobs_client.post("/jobs/digest")

    assert len(first.json()) == 1
    assert second.json() == []
    assert len(email_sender.sent) == 1
    assert len(await _run_rows(db_session)) == 1


async def test_next_monday_sends_again(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session, owner_account, company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9), is_quiet=True,
    )
    frozen_now(MONDAY_0900_UTC)
    await jobs_client.post("/jobs/digest")
    frozen_now(MONDAY_0900_UTC + timedelta(days=7))
    await jobs_client.post("/jobs/digest")
    assert len(email_sender.sent) == 2


async def test_late_run_still_sends(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # server asleep on Monday; job fires Wednesday
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session, owner_account, company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9), is_quiet=True,
    )
    frozen_now(MONDAY_0800_UTC + timedelta(days=2, hours=5))
    response = await jobs_client.post("/jobs/digest")
    assert response.json()[0]["status"] == "succeeded"
    assert len(email_sender.sent) == 1


async def test_not_due_before_local_monday_0800(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.7 end to end
    owner_account.timezone = "Asia/Tokyo"
    await db_session.commit()
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session, owner_account, company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=20), is_quiet=True,
    )
    previous_monday_jst = datetime(2026, 9, 13, 23, 30, tzinfo=UTC)
    db_session.add(
        JobRun(
            job_type=JobType.DIGEST, account_id=owner_account.id,
            ran_at=previous_monday_jst, status=JobStatus.SUCCEEDED, detail="Sent",
        )
    )
    await db_session.commit()

    frozen_now(datetime(2026, 9, 20, 22, 30, tzinfo=UTC))  # Mon 07:30 JST
    assert (await jobs_client.post("/jobs/digest")).json() == []
    frozen_now(datetime(2026, 9, 20, 23, 30, tzinfo=UTC))  # Mon 08:30 JST
    assert (await jobs_client.post("/jobs/digest")).json()[0]["status"] == "succeeded"
    assert len(email_sender.sent) == 1


async def test_daily_limit_blocks_send(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    rate_limiter: FakeRateLimiter,
    frozen_now,
) -> None:  # AC-05.5
    frozen_now(MONDAY_0900_UTC)
    rate_limiter.counts[MONDAY_0900_UTC.date()] = 5
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session, owner_account, company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9), is_quiet=True,
    )
    response = await jobs_client.post("/jobs/digest")
    assert response.json()[0]["status"] == "not_sent"
    assert response.json()[0]["detail"] == "Not sent: daily email limit reached"
    assert email_sender.sent == []


async def test_provider_error_is_recorded_not_raised(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:  # AC-05.6
    frozen_now(MONDAY_0900_UTC)
    email_sender.fail_with = "ResendError: invalid API key"
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session, owner_account, company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9), is_quiet=True,
    )
    response = await jobs_client.post("/jobs/digest")
    assert response.status_code == 200
    assert response.json()[0]["status"] == "failed"
    assert response.json()[0]["detail"] == "Failed: ResendError: invalid API key"
    # Not retried this week (PRD: a send failure is not retried automatically).
    assert (await jobs_client.post("/jobs/digest")).json() == []


async def test_one_account_failure_does_not_block_the_other(
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    other_account: Account,
    email_sender: FakeEmailSender,
    frozen_now,
) -> None:
    frozen_now(MONDAY_0900_UTC)
    company = await make_company(db_session, owner_account)
    await make_application(
        db_session, owner_account, company,
        last_activity_at=MONDAY_0900_UTC - timedelta(days=9), is_quiet=True,
    )
    runs = (await jobs_client.post("/jobs/digest")).json()
    assert {r["account_id"]: r["status"] for r in runs} == {
        owner_account.id: "succeeded",
        other_account.id: "skipped",
    }
    total = (await db_session.execute(select(func.count()).select_from(JobRun))).scalar_one()
    assert total == 2
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_jobs_digest.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.digest_service`.

- [ ] **Step 3: Digest service**

Create `backend/src/app/services/digest_service.py`:

```python
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clock import as_utc, utcnow, whole_days_between
from app.config import Settings
from app.integrations.email import EmailSender, EmailSendError
from app.integrations.rate_limit import RateLimiter
from app.models import (
    Account,
    Application,
    ApplicationStatus,
    InterviewStage,
    JobRun,
    JobStatus,
    JobType,
)
from app.services.digest_render import render_digest
from app.services.job_run_service import latest_run

DIGEST_HOUR = 8
DIGEST_WINDOW = timedelta(days=7)

SKIP_DEMO = "Skipped: demo account"
SKIP_EMPTY = "Skipped: nothing to report"
SKIP_ALREADY_SENT = "Already sent this week"
NOT_SENT_LIMIT = "Not sent: daily email limit reached"


def week_anchor(timezone: str, now: datetime) -> datetime:
    """Most recent Monday 08:00 in `timezone` at or before `now`, as aware UTC.

    The digest for a week is due once `now` passes its anchor; a run recorded at
    or after the anchor means that week is done (PRD F-05: once per Monday, late
    runs still send).
    """
    zone = ZoneInfo(timezone)
    local = as_utc(now).astimezone(zone)
    monday = (local - timedelta(days=local.weekday())).date()
    anchor = datetime.combine(monday, time(DIGEST_HOUR), tzinfo=zone)
    if anchor > local:
        anchor = datetime.combine(monday - timedelta(days=7), time(DIGEST_HOUR), tzinfo=zone)
    return anchor.astimezone(UTC)


@dataclass(frozen=True)
class QuietItem:
    application_id: int
    company: str
    role_title: str
    status: ApplicationStatus
    days_since_activity: int
    url: str


@dataclass(frozen=True)
class UpcomingStageItem:
    application_id: int
    company: str
    role_title: str
    stage_name: str
    scheduled_at: datetime
    url: str


@dataclass(frozen=True)
class DigestContent:
    window_start: datetime
    window_end: datetime
    quiet: list[QuietItem]
    upcoming: list[UpcomingStageItem]

    @property
    def is_empty(self) -> bool:
        return not self.quiet and not self.upcoming


@dataclass(frozen=True)
class DigestPreview:
    content: DigestContent
    would_send: bool
    skip_reason: str | None


class DigestService:
    def __init__(
        self,
        db: AsyncSession,
        settings: Settings,
        sender: EmailSender,
        limiter: RateLimiter,
    ) -> None:
        self.db = db
        self.settings = settings
        self.sender = sender
        self.limiter = limiter

    async def build(self, account: Account, now: datetime) -> DigestContent:
        start = week_anchor(account.timezone, now)
        end = start + DIGEST_WINDOW
        quiet_rows = await self.db.execute(
            select(Application)
            .where(Application.account_id == account.id, Application.is_quiet.is_(True))
            .options(selectinload(Application.company))
            .order_by(Application.last_activity_at.asc(), Application.id.asc())
        )
        quiet = [
            QuietItem(
                application_id=a.id,
                company=a.company.name,
                role_title=a.role_title,
                status=a.status,
                days_since_activity=whole_days_between(a.last_activity_at, now),
                url=self._url(a.id),
            )
            for a in quiet_rows.scalars()
        ]
        stage_rows = await self.db.execute(
            select(InterviewStage)
            .join(Application)
            .where(
                Application.account_id == account.id,
                InterviewStage.scheduled_at >= start,
                InterviewStage.scheduled_at < end,
            )
            .options(
                selectinload(InterviewStage.application).selectinload(
                    Application.company
                )
            )
            .order_by(InterviewStage.scheduled_at.asc(), InterviewStage.id.asc())
        )
        upcoming = [
            UpcomingStageItem(
                application_id=s.application_id,
                company=s.application.company.name,
                role_title=s.application.role_title,
                stage_name=s.name,
                scheduled_at=as_utc(s.scheduled_at),
                url=self._url(s.application_id),
            )
            for s in stage_rows.scalars()
        ]
        return DigestContent(window_start=start, window_end=end, quiet=quiet, upcoming=upcoming)

    async def run(self, now: datetime | None = None) -> list[JobRun]:
        """Hourly trigger: send to every account whose week is due and unsent."""
        now = now or utcnow()
        accounts = (await self.db.execute(select(Account).order_by(Account.id))).scalars().all()
        runs: list[JobRun] = []
        for account in accounts:
            run = await self._run_for(account, now)
            if run is not None:
                runs.append(run)
        return runs

    async def preview(self, account: Account, now: datetime | None = None) -> DigestPreview:
        """What a send right now would contain (AC-05.8); touches no provider."""
        now = now or utcnow()
        content = await self.build(account, now)
        if account.is_demo:
            reason: str | None = SKIP_DEMO
        elif content.is_empty:
            reason = SKIP_EMPTY
        elif await self._already_ran(account, now):
            reason = SKIP_ALREADY_SENT
        else:
            reason = None
        return DigestPreview(content=content, would_send=reason is None, skip_reason=reason)

    async def _run_for(self, account: Account, now: datetime) -> JobRun | None:
        if await self._already_ran(account, now):
            return None
        status, detail = await self._deliver(account, now)
        run = JobRun(
            job_type=JobType.DIGEST,
            account_id=account.id,
            ran_at=now,
            status=status,
            detail=detail[:500],
        )
        self.db.add(run)
        await self.db.commit()  # per account, so one failure never blocks the next
        await self.db.refresh(run)
        return run

    async def _already_ran(self, account: Account, now: datetime) -> bool:
        latest = await latest_run(self.db, JobType.DIGEST, account.id)
        return latest is not None and as_utc(latest.ran_at) >= week_anchor(
            account.timezone, now
        )

    async def _deliver(self, account: Account, now: datetime) -> tuple[JobStatus, str]:
        if account.is_demo:
            return JobStatus.SKIPPED, SKIP_DEMO
        content = await self.build(account, now)
        if content.is_empty:
            return JobStatus.SKIPPED, SKIP_EMPTY
        if not await self.limiter.try_acquire(as_utc(now).date()):
            return JobStatus.NOT_SENT, NOT_SENT_LIMIT
        subject, html, text = render_digest(content, account.timezone)
        try:
            await self.sender.send(to=account.email, subject=subject, html=html, text=text)
        except EmailSendError as exc:
            return JobStatus.FAILED, f"Failed: {exc}"
        return JobStatus.SUCCEEDED, f"Sent to {account.email}"

    def _url(self, application_id: int) -> str:
        return f"{self.settings.app_base_url}/applications/{application_id}"
```

- [ ] **Step 4: Renderer**

Create `backend/src/app/services/digest_render.py`:

```python
from __future__ import annotations

import html
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from app.services.digest_service import DigestContent

EMPTY_QUIET = "Nothing needs follow-up."
EMPTY_UPCOMING = "No interviews scheduled in the next 7 days."


def render_digest(content: DigestContent, timezone: str) -> tuple[str, str, str]:
    """Returns (subject, html, text). Times are shown in the account's time zone."""
    zone = ZoneInfo(timezone)
    subject = (
        f"Your week: {len(content.quiet)} to chase, {len(content.upcoming)} coming up"
    )

    quiet_lines = [
        f"- {q.company} — {q.role_title} ({q.status.value}), "
        f"{q.days_since_activity} days since last activity: {q.url}"
        for q in content.quiet
    ] or [EMPTY_QUIET]
    upcoming_lines = [
        f"- {s.scheduled_at.astimezone(zone):%a %d %b %H:%M} — {s.company} — "
        f"{s.role_title}: {s.stage_name}: {s.url}"
        for s in content.upcoming
    ] or [EMPTY_UPCOMING]
    text = "\n".join(
        ["Needs follow-up", *quiet_lines, "", "Coming up this week", *upcoming_lines]
    )

    def li(label: str, url: str) -> str:
        return f'<li>{html.escape(label)} — <a href="{html.escape(url)}">Open</a></li>'

    quiet_html = "".join(
        li(
            f"{q.company} — {q.role_title} ({q.status.value}), "
            f"{q.days_since_activity} days since last activity",
            q.url,
        )
        for q in content.quiet
    ) or f"<li>{EMPTY_QUIET}</li>"
    upcoming_html = "".join(
        li(
            f"{s.scheduled_at.astimezone(zone):%a %d %b %H:%M} — {s.company} — "
            f"{s.role_title}: {s.stage_name}",
            s.url,
        )
        for s in content.upcoming
    ) or f"<li>{EMPTY_UPCOMING}</li>"
    body = (
        "<h2>Needs follow-up</h2>"
        f"<ul>{quiet_html}</ul>"
        "<h2>Coming up this week</h2>"
        f"<ul>{upcoming_html}</ul>"
    )
    return subject, body, text
```

- [ ] **Step 5: Dependency and route**

In `backend/src/app/dependencies.py` add `from app.services.digest_service import DigestService` and:

```python
def get_digest_service(
    db: DbDep, settings: SettingsDep, sender: EmailSenderDep, limiter: RateLimiterDep
) -> DigestService:
    return DigestService(db, settings, sender, limiter)


DigestServiceDep = Annotated[DigestService, Depends(get_digest_service)]
```

In `backend/src/app/routers/jobs.py` add `from app.dependencies import DbDep, DigestServiceDep` and:

```python
@router.post("/digest", response_model=list[JobRunResponse])
async def run_digest(service: DigestServiceDep):
    """Triggered hourly by QStash; each account decides for itself whether it is due."""
    return await service.run()
```

- [ ] **Step 6: Verify**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass (11 new digest tests). Note `uv run ruff format .` will reflow the compact `make_application(...)` calls in the test file; that is fine.

- [ ] **Step 7: Report files for commit**

Files: `src/app/services/digest_service.py`, `src/app/services/digest_render.py`, `src/app/dependencies.py`, `src/app/routers/jobs.py`, `tests/test_jobs_digest.py`.
Commit message: `feat(backend): weekly digest job with per-account due check, rate limit and Resend send`

---

### Task 5: Settings run status + digest preview, schedule registration script, docs and manual steps

**Files:**
- Create: `backend/src/app/schemas/digest.py`, `backend/scripts/register_schedules.py`
- Modify: `backend/src/app/routers/settings.py`
- Modify: `docs/API_CONTRACT.md`, `MANUAL_STEPS.md`, `README.md`
- Test: `backend/tests/test_settings.py`

**Interfaces:**
- Consumes: Task 3 `JobRunResponse`, `JobRunsResponse`, `latest_run`; Task 4 `DigestServiceDep`, `DigestPreview`, `SKIP_DEMO`.
- Produces: `GET /settings/job-runs`, `GET /settings/digest-preview`; `scripts/register_schedules.py`.

- [ ] **Step 1: Write the failing settings tests**

Append to `backend/tests/test_settings.py`:

```python
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, JobRun, JobStatus, JobType
from tests.conftest import make_application, make_company


async def test_job_runs_null_when_never_run(owner_client: AsyncClient) -> None:
    response = await owner_client.get("/settings/job-runs")
    assert response.status_code == 200
    assert response.json() == {"quiet_check": None, "digest": None}


async def test_job_runs_shows_shared_quiet_and_own_digest(
    owner_client: AsyncClient,
    other_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    other_account: Account,
) -> None:
    now = datetime(2026, 9, 21, 9, 0, tzinfo=UTC)
    db_session.add_all(
        [
            JobRun(job_type=JobType.QUIET_CHECK, ran_at=now - timedelta(days=1),
                   status=JobStatus.FAILED, detail="RuntimeError: old"),
            JobRun(job_type=JobType.QUIET_CHECK, ran_at=now,
                   status=JobStatus.SUCCEEDED, detail="Flagged 2 application(s)"),
            JobRun(job_type=JobType.DIGEST, account_id=owner_account.id, ran_at=now,
                   status=JobStatus.SUCCEEDED, detail="Sent to owner@example.com"),
            JobRun(job_type=JobType.DIGEST, account_id=other_account.id, ran_at=now,
                   status=JobStatus.SKIPPED, detail="Skipped: demo account"),
        ]
    )
    await db_session.commit()

    owner = (await owner_client.get("/settings/job-runs")).json()
    assert owner["quiet_check"]["status"] == "succeeded"
    assert owner["quiet_check"]["detail"] == "Flagged 2 application(s)"
    assert owner["digest"]["detail"] == "Sent to owner@example.com"

    other = (await other_client.get("/settings/job-runs")).json()
    assert other["quiet_check"]["detail"] == "Flagged 2 application(s)"
    assert other["digest"]["status"] == "skipped"


async def test_digest_preview_matches_send_content(
    owner_client: AsyncClient,
    jobs_client: AsyncClient,
    db_session: AsyncSession,
    owner_account: Account,
    email_sender,
    monkeypatch,
) -> None:  # AC-05.8
    from app.services import digest_service as digest_module

    now = datetime(2026, 9, 21, 9, 0, tzinfo=UTC)
    monkeypatch.setattr(digest_module, "utcnow", lambda: now)
    company = await make_company(db_session, owner_account)
    quiet = await make_application(
        db_session, owner_account, company, role_title="Quiet",
        last_activity_at=now - timedelta(days=9), is_quiet=True,
    )

    preview = await owner_client.get("/settings/digest-preview")
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["would_send"] is True
    assert body["skip_reason"] is None
    assert body["window_start"].startswith("2026-09-21T08:00:00")
    assert body["upcoming"] == []
    assert [q["application_id"] for q in body["quiet"]] == [quiet.id]
    assert body["quiet"][0]["days_since_activity"] == 9
    assert body["quiet"][0]["url"].endswith(f"/applications/{quiet.id}")

    await jobs_client.post("/jobs/digest")
    assert f"/applications/{quiet.id}" in email_sender.sent[0].text
    after = (await owner_client.get("/settings/digest-preview")).json()
    assert after["would_send"] is False
    assert after["skip_reason"] == "Already sent this week"


async def test_digest_preview_empty_and_demo(
    owner_client: AsyncClient, other_client: AsyncClient
) -> None:
    empty = (await owner_client.get("/settings/digest-preview")).json()
    assert empty["would_send"] is False
    assert empty["skip_reason"] == "Skipped: nothing to report"
    assert empty["quiet"] == [] and empty["upcoming"] == []

    demo = (await other_client.get("/settings/digest-preview")).json()
    assert demo["would_send"] is False
    assert demo["skip_reason"] == "Skipped: demo account"


async def test_preview_requires_sign_in(client: AsyncClient) -> None:
    assert (await client.get("/settings/digest-preview")).status_code == 401
    assert (await client.get("/settings/job-runs")).status_code == 401
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_settings.py -v`
Expected: the five new tests FAIL with 404/405 on the new routes.

- [ ] **Step 3: Preview schema**

Create `backend/src/app/schemas/digest.py`:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ApplicationStatus


class QuietItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    application_id: int
    company: str
    role_title: str
    status: ApplicationStatus
    days_since_activity: int
    url: str


class UpcomingStageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    application_id: int
    company: str
    role_title: str
    stage_name: str
    scheduled_at: datetime
    url: str


class DigestPreviewResponse(BaseModel):
    """Exactly what a send right now would contain (PRD F-05, AC-05.8)."""

    would_send: bool
    skip_reason: str | None
    window_start: datetime
    window_end: datetime
    quiet: list[QuietItemResponse]
    upcoming: list[UpcomingStageResponse]
```

- [ ] **Step 4: Settings routes**

In `backend/src/app/routers/settings.py` add imports:

```python
from app.dependencies import CurrentAccountDep, DbDep, DigestServiceDep
from app.models import JobType
from app.schemas.digest import DigestPreviewResponse
from app.schemas.job_run import JobRunResponse, JobRunsResponse
from app.services.job_run_service import latest_run
```

and the routes:

```python
@router.get("/job-runs", response_model=JobRunsResponse)
async def get_job_runs(account: CurrentAccountDep, db: DbDep):
    """Latest run of each job: the quiet check is system-wide, the digest per account."""
    quiet = await latest_run(db, JobType.QUIET_CHECK, None)
    digest = await latest_run(db, JobType.DIGEST, account.id)
    return JobRunsResponse(
        quiet_check=JobRunResponse.model_validate(quiet) if quiet else None,
        digest=JobRunResponse.model_validate(digest) if digest else None,
    )


@router.get("/digest-preview", response_model=DigestPreviewResponse)
async def preview_digest(account: CurrentAccountDep, service: DigestServiceDep):
    preview = await service.preview(account)
    return DigestPreviewResponse(
        would_send=preview.would_send,
        skip_reason=preview.skip_reason,
        window_start=preview.content.window_start,
        window_end=preview.content.window_end,
        quiet=[QuietItemResponse.model_validate(q) for q in preview.content.quiet],
        upcoming=[
            UpcomingStageResponse.model_validate(s) for s in preview.content.upcoming
        ],
    )
```

(Also import `QuietItemResponse, UpcomingStageResponse` from `app.schemas.digest`.)

- [ ] **Step 5: Run the settings tests**

Run: `uv run pytest tests/test_settings.py -v`
Expected: PASS.

- [ ] **Step 6: Schedule registration script**

Create `backend/scripts/register_schedules.py`:

```python
"""Create or update the two QStash schedules that drive F-04 and F-05.

Idempotent: a fixed schedule_id makes create() update the existing schedule.
Usage: uv run python scripts/register_schedules.py   (reads .env; needs QSTASH_TOKEN
and a public PUBLIC_BASE_URL — QStash cannot reach localhost)
"""

import sys

from qstash import QStash

from app.config import get_settings

# (schedule_id, path, cron in UTC). The digest is hourly; each account decides
# whether Monday 08:00 in its own time zone has passed (see DigestService).
SCHEDULES = [
    ("jacc-quiet-check", "/jobs/quiet-check", "15 0 * * *"),
    ("jacc-digest", "/jobs/digest", "0 * * * *"),
]


def main() -> None:
    settings = get_settings()
    if settings.qstash_token == "REPLACE_ME":
        sys.exit("QSTASH_TOKEN is not set (see .env.example / MANUAL_STEPS.md)")
    if "localhost" in settings.public_base_url:
        sys.exit("PUBLIC_BASE_URL must be the deployed API URL; QStash cannot reach localhost")

    client = QStash(settings.qstash_token)
    for schedule_id, path, cron in SCHEDULES:
        created = client.schedule.create(
            destination=f"{settings.public_base_url}{path}",
            cron=cron,
            schedule_id=schedule_id,
            retries=3,
        )
        print(f"{created}: {cron} -> {path}")


if __name__ == "__main__":
    main()
```

Check it imports and refuses cleanly: `uv run python scripts/register_schedules.py` → exits with the `QSTASH_TOKEN is not set` message (or the localhost message if a token is present locally).

- [ ] **Step 7: Contract and README updates**

In `docs/API_CONTRACT.md`:
- Add to the error-code table after `CONTACT_COMPANY_MISMATCH`:
  `| \`INVALID_JOB_SIGNATURE\` | 401 | \`/jobs/*\` called without a valid QStash \`Upstash-Signature\` (these routes are never session-authenticated) |`
- Under **Wire values**, append two bullets:
  - `GET /applications` also accepts `quiet=true|false`. With `quiet=true` and no explicit `order`, results are oldest-activity-first (the Needs follow-up list). Every summary carries `days_since_activity` (whole days, computed at response time).
  - Job run statuses serialize as `succeeded | skipped | not_sent | failed`; job types as `quiet_check | digest`. `GET /settings/job-runs` returns `{quiet_check, digest}` (each `JobRun` or `null`; `null` means "First check pending"). `GET /settings/digest-preview` returns exactly what a send now would contain plus `would_send` and `skip_reason`.
- Under **Authentication**, append: `POST /jobs/quiet-check` and `POST /jobs/digest` are called by Upstash QStash schedules and authenticated by signature only; the frontend never calls them.

In `README.md`, append a section:

```markdown
## Background jobs and email

- **Daily quiet check** (`POST /jobs/quiet-check`, QStash cron `15 0 * * *` UTC) flags active applications with no activity for the account's threshold and records a run visible in Settings.
- **Weekly digest** (`POST /jobs/digest`, QStash cron hourly) emails each account on Monday 08:00 in its own time zone via Resend, at most once per Monday and at most 5 emails per UTC day system-wide (Upstash Redis counter). The demo account never sends; both accounts can preview the digest.
- Both routes are authenticated by QStash request signatures, not sessions, and are idempotent, so a late trigger (the free API host sleeps) still does the right thing.
- Register the schedules once with `uv run python scripts/register_schedules.py` after deploying.
```

- [ ] **Step 8: Manual steps**

Append to `MANUAL_STEPS.md`:

```markdown
## Milestone 3 — QStash, Resend, Upstash Redis (added 2026-09-18)

Code is complete and tested with doubles; per NFR-06 the scheduler and email are
"not yet verified live" until each of these has run for real once.

1. **Upstash QStash:** create a QStash instance at https://console.upstash.com/qstash.
   Copy `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` into `backend/.env` (and the Render environment).
2. **Upstash Redis:** create a free Redis database; copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. **Resend:** create an API key at https://resend.com/api-keys → `RESEND_API_KEY`.
   Until a domain is verified, keep `EMAIL_FROM` as `onboarding@resend.dev`; it delivers only to the Resend account owner's address, so sign up to Resend with the owner sign-in email. For G-03 in an inbox that isn't the Resend account, verify a domain (Resend → Domains) and set `EMAIL_FROM="Job Application Command Center <digest@your-domain>"` (OQ-02).
4. **Deploy the API** and set `PUBLIC_BASE_URL` to its public URL (no trailing slash) and `APP_BASE_URL` to the frontend URL.
5. From `backend/`: `uv run python scripts/register_schedules.py` → prints `jacc-quiet-check` and `jacc-digest`.
6. **Verify live (NFR-06 / AC-04.8):**
   - In the QStash console, open `jacc-quiet-check` and trigger it now; then `GET /settings/job-runs` (signed in) shows a `succeeded` quiet_check with a fresh `ran_at`, and the demo account's Needs follow-up list (`GET /applications?quiet=true`) is non-empty.
   - Trigger `jacc-digest` now: the owner account's digest run shows `succeeded` (or `skipped: nothing to report` if nothing is quiet — add a back-dated application first) and the email arrives in the inbox, not just the Resend "sent" log (R-03).
   - G-03 needs two consecutive real Mondays; note the dates here when they pass.
```

- [ ] **Step 9: Verify**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass. Then confirm OpenAPI lists the new routes:
`uv run python -c "from app.main import create_app; print(sorted(p for p in create_app().openapi()['paths'] if p.startswith(('/jobs','/settings'))))"`
Expected: `['/jobs/digest', '/jobs/quiet-check', '/settings', '/settings/digest-preview', '/settings/job-runs']`.

- [ ] **Step 10: Report files for commit**

Files: `src/app/schemas/digest.py`, `src/app/routers/settings.py`, `scripts/register_schedules.py`, `tests/test_settings.py`, `../docs/API_CONTRACT.md`, `../README.md`. (`MANUAL_STEPS.md` is gitignored — edit it, never stage it.)
Commit message: `feat(backend): job run status, digest preview and QStash schedule registration`

---

## Self-review against the spec

- **Config** → Task 2 (adds `app_base_url` beyond the spec so email links point at the frontend, not the API).
- **Adapters + fakes + signature dependency** → Task 2. **Quiet check + failure rollback + idempotence + per-account threshold** → Task 3. **Quiet list + days_since_activity** → Task 3. **week_anchor, build, run, preview, render, per-account commit, dedupe on any recorded run since the anchor** → Task 4. **Settings job-runs + digest-preview, register script, contract, README, manual steps** → Task 5. **Carry-overs 1-3** → Task 1.
- **Not in any task, by design:** AC-04.8 and live runs (manual, Task 5 Step 8); parked minors 4-10 from milestone 2.
- **Names cross-checked:** `verify_qstash_signature`, `EmailSenderDep`/`RateLimiterDep`/`DigestServiceDep`, `latest_run(db, job_type, account_id)`, `week_anchor(timezone, now)`, `render_digest(content, timezone)`, `JobRunResponse`/`JobRunsResponse`, `SKIP_ALREADY_SENT == "Already sent this week"` (asserted in Task 5), `FakeRateLimiter.counts` keyed by `date` (Task 4 sets `counts[MONDAY_0900_UTC.date()]`).
