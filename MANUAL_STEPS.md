# Manual Steps

Actions only a human can take (accounts, secrets, DNS, payment). Not code — do not check for these before shipping a milestone's code; just keep this list current.

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

> **Counts as part of milestone 1's definition of done** (final review, 2026-09-17):
> the migration and auth flow have only run against SQLite so far. Step 4 + step 5
> against real Neon Postgres are the required live verification — until they pass,
> schema + auth are "not yet verified live" (NFR-06).

## Milestone 2 — demo data on Neon (added 2026-09-17)

`scripts/seed.py` now also rebuilds the demo account's sample data (4 companies,
8 applications, 5 stages, 4 contacts) on every run; owner data is never touched.
Once the milestone 1 Neon steps are done, re-run from `backend/`:
`uv run python scripts/seed.py` — expect the line
`demo data: companies=4, applications=8, stages=5, contacts=4, links=3`.
Verified locally against Docker Postgres 17 on 2026-09-17 (migration, seed ×2,
full CRUD smoke over HTTP, demo login lists 7 applications).

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

## Milestone 5 — frontend deployment (added 2026-11-05)

The frontend is built and checked locally (`bun run build`, `scripts/smoke.ts`
against a local API). Per NFR-06 it is "not yet verified live" until it runs
deployed against the deployed API.

1. **Deploy the frontend** to Vercel or Netlify with `frontend/` as the project
   root.
2. **On the frontend host** set `API_BASE_URL` to the API's public URL (the Render
   URL, no trailing slash). It is read only on the Next.js server, so never add
   a `NEXT_PUBLIC_` prefix.
3. **On the API host (Render)** set `APP_BASE_URL` to the frontend's public URL
   (no trailing slash). The digest links point there.
4. **Serve the frontend over HTTPS** (the Vercel/Netlify default). In production
   the `session` cookie is `Secure`, so a browser on plain HTTP won't store it
   and sign-in appears to do nothing.
5. **Verify live:** sign in with the demo credentials on the deployed URL, open
   an application, and sign out. Then run the smoke script against it from
   `frontend/`:
   `BASE_URL=https://<frontend-url> DEMO_EMAIL=... DEMO_PASSWORD=... OUT_DIR=/tmp/smoke bun scripts/smoke.ts`
   and expect `ALL PASS`. The first request may take a while as the free Render
   API wakes up (NFR-02).
