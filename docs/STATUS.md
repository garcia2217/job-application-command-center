# Project Status

Where the project stands and what comes next. `docs/PRD.md` defines the product; this file tracks progress against it. Update it at the end of every milestone.

**Last updated:** 2026-11-05

## Current state

| Area | State |
|---|---|
| F-01 to F-03: auth, applications, companies, contacts, stages | API built and tested; no UI |
| F-04 and F-05: quiet check, weekly digest | API built and tested with test doubles; not yet verified live |
| F-06: resume comparison | API built and tested: resume saving, LaTeX text preparation, 217-term vocabulary, run and read endpoints, real seeded demo comparison; no UI |
| Frontend | Not started: still the default `create-next-app` page |
| Deployment and CI | None. Neon, QStash, Redis, Resend and hosting need the owner's accounts (`MANUAL_STEPS.md`) |

All backend acceptance criteria for F-01 to F-06 have tests except AC-04.8, which needs a live scheduler. F-06 calls no external service, so nothing in it waits on live verification.

## Next work

### Milestone 5: Frontend for F-01 to F-06
F-06 contract notes for the UI (all in `docs/API_CONTRACT.md`): map `blocked_reason` to the PRD's disabled-Compare messages, show the "changed since this comparison" notice from `is_stale`, show "No recognised requirements found" when `match_percentage` is null, and count the 50,000-character resume limit with `[...text].length`, not `.length`.

Build every screen per `docs/design/DESIGN_GUIDE.md`, using the `nextjs-patterns` skill. Add `src/lib/api.ts`, `types.ts` derived from `/openapi.json`, and the frontend half of the contract test in `docs/API_CONTRACT.md`. The frontend has no test runner yet. The skill's `/follow-ups` example is illustrative: the Needs follow-up list comes from `GET /applications?quiet=true`.

### Milestone 6: Final polish
UI and tone. Needs the owner's review.

### Smaller updates
- Keep the README Status section's "not yet verified live" list accurate as integrations go live.

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
- **F-06 matching** (owner, 2026-11-05): the PRD's literal whole-word rule, so "React Native" also counts React (longest-match-wins is a possible refinement); saving an empty resume clears it; English-word terms (Express, Spring, Swift, Rust, Dart, Chef, Puppet, Make, Jest, REST, Rails, plus Spark, Helm, Bootstrap) are case-sensitive. A capitalised word at the start of a sentence ("Go to market.", "Make sure") is a known false positive (R-04), and tests document it.
- **F-06 API:** `GET`/`POST /applications/{id}/comparison` both return `{blocked_reason, comparison}`; POST returns 409 `RESUME_REQUIRED` / `JOB_DESCRIPTION_REQUIRED` when blocked. The resume and job description timestamps move only when the text actually changes. The percentage rounds halves up. Requirements are listed alphabetically.
- **Git author:** commits are authored as `garcia <emmanoelgarsia@gmail.com>` (set repo-locally in cloud sessions, whose default identity is not the owner's).

## Known open items (non-blocking)

1. No test that a failed cross-field rule rolls back an inline company on `POST /applications`.
2. `notes` and `job_description` have no length limit. A very long job description also makes a comparison slower to run (the scan is linear, so this is cost, not correctness).
3. Possible Postgres vs SQLite differences: `func.lower` on role title vs `casefold`. Tests run on SQLite, and Postgres has only been exercised by hand up to milestone 2.
4. No 404 test for `PUT` or `DELETE /applications/{foreign_id}/contacts/{cid}` (the code is correct).
5. A naive `scheduled_at` uses `fold=0` in DST-repeated hours.
6. `PATCH /applications/{id}` doesn't re-run the duplicate check when company or role changes.
7. Digest dedupe is check-then-act, so a multi-worker deployment could double-send. Fix it with a unique index on (account, week anchor) or an advisory lock if the deployment ever gains workers.
8. Most routes don't declare their 401/404/409 problem responses in OpenAPI; only the comparison routes do (`schemas/problem.py` `problem_responses()`). Retrofit the rest for NFR-01.
