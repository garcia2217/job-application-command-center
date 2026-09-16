# Job Application Command Center

A personal job-application tracker: log applications and companies, track contacts and interview stages, get flagged when an application has gone quiet, receive a weekly digest email, and compare a job description against your resume for fit.

Built as a portfolio project to demonstrate backend engineering depth — background jobs, relational modeling, auth, a documented API — as well as day-to-day usefulness during an active job search.

## Status

🚧 Early development. Project scaffolding is in place; core features are being built milestone by milestone. This README will be updated with live demo credentials and URLs once the app is deployed.

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
| Email                 | Resend or SendGrid                                                                  |
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

## Repository Layout

```
backend/    FastAPI app (uv project, src layout)
frontend/   Next.js app (bun project)
docs/       Product spec (PRD.md) and design docs
```
