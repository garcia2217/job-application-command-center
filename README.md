# Job Application Command Center

A personal job-application tracker: log applications and companies, track contacts and interview stages, get flagged when an application has gone quiet, receive a weekly digest email, and compare a job description against your resume for fit.

Built as a portfolio project to demonstrate backend engineering depth — background jobs, relational modeling, auth, a documented API — as well as day-to-day usefulness during an active job search.

## Status

🚧 In development. The backend for F-01 to F-06 (accounts, applications and companies, contacts and interview stages, quiet-check, weekly digest, resume comparison) is built and covered by tests. The frontend has not been started. This README will be updated with live demo credentials and URLs once the app is deployed.

Not yet verified live (covered by tests with doubles only): Upstash QStash schedules, Resend email, Upstash Redis rate limiting, and the Neon Postgres deployment.

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
uv run fastapi dev src/app/main.py
```

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
bun run dev
```

Build and lint:

```bash
bun run lint
bun run build
```

## Background jobs and email

- **Daily quiet check** (`POST /jobs/quiet-check`, QStash cron `15 0 * * *` UTC) flags active applications with no activity for the account's threshold and records a run visible in Settings.
- **Weekly digest** (`POST /jobs/digest`, QStash cron hourly) emails each account on Monday 08:00 in its own time zone via Resend, at most once per Monday and at most 5 emails per UTC day system-wide (Upstash Redis counter). The demo account never sends; both accounts can preview the digest. QStash retries are disabled for this schedule — the hourly cron is its own retry.
- Both routes are authenticated by QStash request signatures, not sessions, and are idempotent, so a late trigger (the free API host sleeps) still does the right thing.
- Register the schedules once with `uv run python scripts/register_schedules.py` after deploying.
- Not yet verified live: the scheduler, Redis limiter and email send are covered by tests with doubles; each needs one real end-to-end run before it counts as done (NFR-06).

## Repository Layout

```
backend/    FastAPI app (uv project, src layout)
frontend/   Next.js app (bun project)
docs/       Product spec (PRD.md) and design docs
```
