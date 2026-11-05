# Milestone 3 Design: Quiet Check Job + Weekly Digest Email

**Date:** 2026-09-18 · **Status:** approved by owner (chat, 2026-09-18)
**PRD features:** F-04 (quiet detection, Needs follow-up), F-05 (weekly digest). NFR-05, NFR-06.
**Scope:** backend only. The frontend for F-01…F-05 is a separate milestone.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Email provider | **Resend** (`resend` SDK, `send_async`) | SendGrid retired its free plan (May 2025; 60-day trial only). Resend free: 3,000/month, 100/day. |
| Rate limit store | **Upstash Redis** (`upstash-redis` async client) | Committed stack; owner confirmed. |
| Trigger | **QStash schedules** hitting signed `POST /jobs/*` routes | Committed stack; no worker process. |
| Digest cadence | QStash cron **hourly** (`0 * * * *`); service decides per-account due-ness | Owner confirmed; half-hour zones get 08:30 local, allowed by the late-run rule. |
| Quiet check cadence | QStash cron **daily 00:15 UTC** | One system-wide run per day. |
| Schedule registration | `backend/scripts/register_schedules.py`, fixed `schedule_id`s (`jacc-quiet-check`, `jacc-digest`) | Idempotent (create with a schedule_id updates); API stays stateless. |
| Sender address | `EMAIL_FROM`, default `Job Application Command Center <onboarding@resend.dev>` | Resend's test sender delivers to the account owner's own address, so G-03 can pass before a domain is verified (OQ-02). |

## Components

### Config (`app/config.py`)
New `Settings` fields, all with placeholders so the app boots without secrets:
`public_base_url="http://localhost:8000"`, `qstash_token="REPLACE_ME"`, `qstash_current_signing_key="REPLACE_ME"`, `qstash_next_signing_key="REPLACE_ME"`, `resend_api_key="REPLACE_ME"`, `email_from` (above), `upstash_redis_rest_url="REPLACE_ME"`, `upstash_redis_rest_token="REPLACE_ME"`, `email_daily_limit=5`. `.env.example` mirrors them.

### Adapters (`app/integrations/`)
- `email.py`: `EmailSender` protocol `async send(to, subject, html, text) -> str` (provider message id). `ResendEmailSender` sets `resend.api_key` and calls `resend.Emails.send_async`. Any exception propagates as `EmailSendError(str(exc))`.
- `rate_limit.py`: `RateLimiter` protocol `async try_acquire(day: date) -> bool`. `RedisRateLimiter`: `INCR emails:sent:<YYYY-MM-DD>`; if the result is 1, `EXPIRE` 172800 s; returns `count <= limit`. The slot is reserved before sending and never released on failure (PRD: "not retried automatically").
- `qstash.py`: `verify_qstash_signature` FastAPI dependency. Reads `Upstash-Signature`, the raw body, and calls `Receiver(current, next).verify(signature=..., body=..., url=f"{public_base_url}{request.url.path}")`. Missing or invalid → `JobSignatureError` (401, code `INVALID_JOB_SIGNATURE`).
- Fakes for tests live in `tests/fakes.py`: `FakeEmailSender` (records sends; `fail_with` to raise), `FakeRateLimiter` (in-memory counter, same limit semantics).

Adapters are constructed in `create_app` lifespan into `app.state.email_sender` / `app.state.rate_limiter`; dependencies read them from `request.app.state`. Tests replace the state objects.

### Services (`app/services/`)
- `quiet_check_service.py` — `QuietCheckService(db).run(now) -> JobRun`.
  For every account: `cutoff = now - timedelta(days=account.quiet_threshold_days)`; set `is_quiet = True` where status ∈ ACTIVE_STATUSES and `last_activity_at <= cutoff`; set `is_quiet = False` for every other application of the account. Two bulk `UPDATE`s per account. Writes `JobRun(job_type=quiet_check, account_id=None, status=succeeded, detail="Flagged N application(s)")` and commits — one transaction. On exception: rollback, then write a `failed` run (detail = `f"{type(exc).__name__}: {exc}"[:500]`) in the same session after rollback, commit, and return it (route still returns 200 with the failed run; QStash does not retry a 200).
  "Whole days" = `last_activity_at <= now - threshold days` (exactly 7 days ago counts, AC-04.1; 6 days does not, AC-04.2).
- `digest_service.py` —
  - `DigestContent` dataclass: `quiet: list[QuietItem]`, `upcoming: list[UpcomingStageItem]`, `window_start`, `window_end`, `is_empty`.
  - `build(account, now) -> DigestContent`: quiet = `is_quiet` applications for the account (oldest activity first) with `days_since_activity`; upcoming = stages of the account's applications with `window_start <= scheduled_at < window_end`, where `window_start = week_anchor(account, now)` and `window_end = window_start + 7 days`. Links are `f"{app_base_url}/applications/{id}"` (`app_base_url` is the frontend; `public_base_url` is this API as QStash reaches it).
  - `week_anchor(account, now)`: most recent Monday 08:00 in `ZoneInfo(account.timezone)` at or before `now`, returned as an aware UTC datetime.
  - `run(now) -> list[JobRun]`: for each account, `anchor = week_anchor`. If a digest `JobRun` for the account exists with `ran_at >= anchor`, skip without writing (AC-05.4; keeps the meaningful last run visible). Else decide in order: demo → `skipped`, "Skipped: demo account"; `is_empty` → `skipped`, "Skipped: nothing to report"; `not await limiter.try_acquire(now.date())` → `not_sent`, "Not sent: daily email limit reached"; send → `succeeded`, "Sent to <email>"; `EmailSendError` → `failed`, "Failed: <summary>"[:500]. Each account's run is committed independently so one failure does not block the next account (AC-05.6).
  - `preview(account, now) -> DigestPreview`: `content` plus `would_send: bool` and `skip_reason: str | None` (demo / nothing to report / already sent this week / None). Never touches the limiter or sender (AC-05.8).
  - `render(content, account) -> (subject, html, text)` in `app/services/digest_render.py`: subject `"Your week: N to chase, M coming up"`; two sections; empty section text mirrors the PRD; times rendered in the account's time zone.
- `job_run_service.py` — `latest(job_type, account_id)` helper used by the settings route and the digest de-dup check.

### Routes
- `POST /jobs/quiet-check` and `POST /jobs/digest` (`app/routers/jobs.py`), dependency `verify_qstash_signature`, no session. Response `JobRunResponse` / `list[JobRunResponse]`. Tag `jobs`. Excluded from nothing; documented in OpenAPI.
- `GET /settings/job-runs` → `JobRunsResponse { quiet_check: JobRunResponse | null, digest: JobRunResponse | null }`; digest is per account, quiet check is system-wide.
- `GET /settings/digest-preview` → `DigestPreviewResponse { would_send, skip_reason, window_start, window_end, quiet: [...], upcoming: [...] }`.
- `GET /applications?quiet=true` filters to `is_quiet`; when `quiet=true` the default sort becomes `last_activity asc` (oldest first, PRD F-04). `ApplicationSummary` gains `days_since_activity: int` (computed from `utcnow()` in the schema/service, whole days).

### Scripts
- `backend/scripts/register_schedules.py`: uses `QStash(token).schedule.create(destination=f"{public_base_url}/jobs/quiet-check", cron="15 0 * * *", schedule_id="jacc-quiet-check", retries=3)` and the digest with `cron="0 * * * *"`. Prints the schedule ids. Idempotent.

### Contract updates (`docs/API_CONTRACT.md`)
Add `INVALID_JOB_SIGNATURE` (401) to the error-code table; note `quiet=true` on `GET /applications`, `days_since_activity`, and that `/jobs/*` routes are QStash-signed, not session-authenticated.

### Carry-overs from milestone 2 (done first)
1. `tests/conftest.py`: the ASGI app gets its own session per request from the test sessionmaker instead of sharing `db_session`; remove the `db.expire` loop in `ContactService.delete`. (Do not retry `populate_existing` on `get_detail`.)
2. `application_service._validate_rules` uses `app.clock.utcnow()` converted to the account zone, not `datetime.now`.
3. `test_stages.py`: assert `last_activity_at` advances and `is_quiet` clears on stage edit, reorder, and delete (AC-04.4 full coverage).

## Error handling
- Job routes never leak provider exceptions: every failure path becomes a `failed` JobRun and a 200 response. Only signature failure returns 401.
- `run_quiet_check` failure leaves previous flags intact (rollback before writing the failed run; AC-04.7).
- Settings preview for an account with an invalid stored time zone cannot happen (validated on write); `ZoneInfo` errors are therefore not caught.

## Testing (pytest, fakes at the client boundary)
- `tests/test_jobs_quiet_check.py`: AC-04.1, 04.2, 04.3, 04.6 (run twice → same flags, two run rows), 04.7 (monkeypatch the service to raise mid-run → flags unchanged, failed run recorded), signature 401 on missing/invalid header, cross-account threshold independence.
- `tests/test_jobs_digest.py`: AC-05.1 (2 quiet + 1 stage → one send with 3 links), 05.2, 05.3, 05.4 (twice same Monday → one send, one run row), 05.5 (limiter at 5 → not_sent), 05.6 (sender raises → failed, 200), 05.7 (Asia/Tokyo anchor: Monday 08:00 JST = Sunday 23:00 UTC), 05.9 (stage at anchor + 8 days excluded; stage at anchor + 6 days included), late run (Tuesday → still sent), time zone change mid-week uses the new zone.
- `tests/test_settings.py` additions: job-runs (null when never run; per-account digest row; shared quiet row), digest-preview equals what `run` would send, preview for demo says `would_send=false`.
- `tests/test_applications.py` additions: `quiet=true` filter, ascending order, `days_since_activity`.
- `tests/test_integrations.py`: Redis limiter against a fake Redis object (INCR/EXPIRE calls, limit boundary); Resend sender wraps exceptions into `EmailSendError` (mock `resend.Emails.send_async`).
- AC-04.8 (scheduler fires on the deployed app) and NFR-06 live runs are manual → MANUAL_STEPS.md.

## Manual steps produced (appended to MANUAL_STEPS.md)
Upstash QStash account + token + signing keys; Upstash Redis REST url/token; Resend API key (and later a verified domain); deploy URL for `PUBLIC_BASE_URL`; run `register_schedules.py`; observe one real quiet-check run and one real digest email (G-03 wants two consecutive Mondays).

## Out of scope
Frontend, per-application reminder emails, automatic retries, releasing a rate-limit slot after a failed send, sub-hour digest precision, custom email templates, any AI.
