# Job Application Command Center

A personal job-application tracker: log applications and companies, track contacts and interview stages, get flagged when an application has gone quiet, receive a weekly digest email, and compare a job description against your resume for fit.

Built as a portfolio project to demonstrate backend engineering depth — background jobs, relational modeling, auth, a documented API — as well as day-to-day usefulness during an active job search.

## Status

🚧 In development. F-01 to F-06 (accounts, applications and companies, contacts and interview stages, quiet-check, weekly digest, resume comparison) are built end to end: the FastAPI backend is covered by tests, and the Next.js frontend has every MVP screen (sign-in, home with Needs follow-up, applications, application detail with stages, contacts and comparison, companies, contacts, settings and digest preview). It has been checked locally with the smoke script below. The final UI and tone polish is still to come. This README will be updated with live demo credentials and URLs once the app is deployed.

Not yet verified live (covered by tests with doubles only): Upstash QStash schedules, Resend email, Upstash Redis rate limiting, the Neon Postgres deployment, and the deployed frontend (Vercel/Netlify) talking to the deployed API.

## Features (planned MVP)

- **Sign-in and accounts** — one owner account, one seeded demo account for reviewers
- **Applications and companies** — track role, status, salary, source, dates and notes
- **Contacts and interview stages** — per-application timeline of who you talked to and when
- **Needs follow-up** — automatic detection of applications that have gone quiet
- **Weekly digest email** — a Monday summary of what needs attention and what's coming up
- **Resume ↔ job description comparison** — see which requirements your resume matches

See `docs/PRD.md` for full product scope and acceptance criteria.

## Tech Stack

| Layer                 | Choice                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| Backend               | Python 3.14 + FastAPI, managed with [uv](https://docs.astral.sh/uv/)                |
| Frontend              | Next.js 16 + React 19 + Tailwind 4, managed with [bun](https://bun.sh/)             |
| Database              | Neon Postgres                                                                       |
| Cache / rate limiting | Upstash Redis                                                                       |
| Background jobs       | Upstash QStash                                                                      |
| Email                 | Resend                                                                              |
| Hosting               | Frontend on Vercel/Netlify, API on Render (free tier spins down after ~15 min idle) |

## Getting Started

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:create_app --factory --reload
```

Copy `backend/.env.example` to `backend/.env` first; `MANUAL_STEPS.md` covers the database and seed (`uv run alembic upgrade head`, then `uv run python scripts/seed.py`).

Run tests and checks:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

### Frontend

```bash
cd frontend
bun install
cp .env.example .env.local   # API_BASE_URL points at the backend (default http://localhost:8000)
bun run dev
```

Open http://localhost:3000 and sign in with an account created by the seed script. The backend must be running. The browser never calls it directly: Server Components and Server Actions call it from the Next.js server, forwarding the `session` cookie.

Unit tests (the pure helpers in `src/lib/`), lint and build:

```bash
bun test
bun run lint
bun run build
```

Smoke run in a real browser. It runs against a running frontend and backend and is not part of `bun test`. It uses a preinstalled Playwright, which is not a project dependency:

```bash
DEMO_EMAIL=demo@example.com DEMO_PASSWORD=... OUT_DIR=/tmp/smoke bun scripts/smoke.ts
```

It checks the wrong-password message and demo sign-in. It then visits every main screen at 375 and 1280 px wide, checking for no horizontal scroll and exactly one `h1`, and saves a screenshot of each to `OUT_DIR`. Last, it checks that a stale session cookie and sign-out both land on `/sign-in`. It prints a PASS/FAIL line for each check and exits non-zero if any check fails. `BASE_URL` defaults to `http://localhost:3000`.

## Background jobs and email

- **Daily quiet check** (`POST /jobs/quiet-check`, QStash cron `15 0 * * *` UTC) flags active applications with no activity for the account's threshold and records a run visible in Settings.
- **Weekly digest** (`POST /jobs/digest`, QStash cron hourly) emails each account on Monday 08:00 in its own time zone via Resend, at most once per Monday and at most 5 emails per UTC day system-wide (Upstash Redis counter). The demo account never sends; both accounts can preview the digest. QStash retries are disabled for this schedule — the hourly cron is its own retry.
- Both routes are authenticated by QStash request signatures, not sessions, and are idempotent, so a late trigger (the free API host sleeps) still does the right thing.
- Register the schedules once with `uv run python scripts/register_schedules.py` after deploying.
- Not yet verified live: the scheduler, Redis limiter and email send are covered by tests with doubles; each needs one real end-to-end run before it counts as done (NFR-06).

## Not built (v2)

- **Search** is deliberately not built: the PRD's MVP has no search feature. The applications list has a status filter and sorting instead, and Sign out sits in the top-bar slot the design prototype gave to Search. It's a candidate for v2.

## Repository Layout

```
backend/    FastAPI app (uv project, src layout)
frontend/   Next.js app (bun project)
docs/       Product spec (PRD.md) and design docs
```
