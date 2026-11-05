# Project Status

Where the project stands and what comes next. `docs/PRD.md` defines the product; this file tracks progress against it. Update it at the end of every milestone.

**Last updated:** 2026-11-05

## Current state

| Area | State |
|---|---|
| F-01 to F-03: auth, applications, companies, contacts, stages | API built and tested; no UI |
| F-04 and F-05: quiet check, weekly digest | API built and tested with test doubles; not yet verified live |
| F-06: resume comparison | Not started, apart from the tables and one hand-written demo comparison |
| Frontend | Not started: still the default `create-next-app` page |
| Deployment and CI | None. Neon, QStash, Redis, Resend and hosting need the owner's accounts (`MANUAL_STEPS.md`) |

All backend acceptance criteria for F-01 to F-05 have tests except AC-04.8, which needs a live scheduler.

## Next work

### Milestone 4: F-06 backend
Satisfy AC-06.1 to AC-06.10 at the API level. Already in place: `accounts.resume_tex`, `accounts.resume_updated_at`, `applications.job_description_updated_at`, and the `comparisons` table.

Needed:
- Resume saving: `PATCH /settings` doesn't accept one yet.
- LaTeX text preparation, vocabulary of at least 150 terms, and whole-word matching.
- Run and read comparison endpoints that expose what the UI needs for the disabled states (AC-06.6) and the "changed since this comparison" notice (AC-06.8).

Watch out for:
- `job_description_updated_at` is never written anywhere. Set it when the job description changes, or AC-06.8 fails for job description edits. Also confirm `resume_updated_at` is written on save.
- The seeded comparison in `backend/src/app/demo_data.py` is hand-written with lowercase terms. Regenerate it with the real algorithm from a seeded resume and job description.

### Milestone 5: Frontend for F-01 to F-06
Build every screen per `docs/design/DESIGN_GUIDE.md`, using the `nextjs-patterns` skill. Add `src/lib/api.ts`, `types.ts` derived from `/openapi.json`, and the frontend half of the contract test in `docs/API_CONTRACT.md`. The frontend has no test runner yet. The skill's `/follow-ups` example is illustrative: the Needs follow-up list comes from `GET /applications?quiet=true`.

### Milestone 6: Final polish
UI and tone. Needs the owner's review.

### Smaller updates
- `README.md`: the Status section is out of date. Keep its "not yet verified live" list accurate.
- Tag `test_expired_session_is_rejected` in `backend/tests/test_auth_service.py` with `# AC-01.5`.

### Owner only
Deployment and live verification of Neon, QStash, Redis and Resend, as listed in `MANUAL_STEPS.md`. G-03 needs two consecutive real Mondays.

## Decisions already made

- **Email:** Resend, because SendGrid retired its free plan.
- **Digest scheduling:** an hourly QStash cron, with the service deciding per account whether Monday 08:00 local has passed with no run since. Registered with `retries=0`, because the cron is its own retry and a retry during a cold start is the realistic double-send path. The quiet check keeps `retries=3`.
- **URLs:** `APP_BASE_URL` is the frontend and `PUBLIC_BASE_URL` is the API.
- **`/jobs/*`:** authenticated by QStash signature, failing closed while signing keys are `REPLACE_ME`.
- **Auth:** opaque DB-backed session tokens, not JWT.
- **Order:** F-06 backend, then the frontend, then polish.
- **Tests:** don't retry `populate_existing` on `get_detail`; it broke `test_stages.py::test_move_up`.

## Known open items (non-blocking)

1. No test that a failed cross-field rule rolls back an inline company on `POST /applications`.
2. `notes` and `job_description` have no length limit.
3. Possible Postgres vs SQLite differences: `func.lower` on role title vs `casefold`. Tests run on SQLite, and Postgres has only been exercised by hand up to milestone 2.
4. No 404 test for `PUT` or `DELETE /applications/{foreign_id}/contacts/{cid}` (the code is correct).
5. A naive `scheduled_at` uses `fold=0` in DST-repeated hours.
6. `PATCH /applications/{id}` doesn't re-run the duplicate check when company or role changes.
7. Digest dedupe is check-then-act, so a multi-worker deployment could double-send. Fix it with a unique index on (account, week anchor) or an advisory lock if the deployment ever gains workers.
