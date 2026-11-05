# Project Status

Where the project stands and what comes next. `docs/PRD.md` defines the product; this file tracks progress against it. Update it at the end of every milestone.

**Last updated:** 2026-11-05

## Current state

| Area | State |
|---|---|
| F-01 to F-03: auth, applications, companies, contacts, stages | API and UI built; API tested, UI checked by the smoke script |
| F-04 and F-05: quiet check, weekly digest | API built and tested with test doubles; Needs follow-up, run records and digest preview in the UI; not yet verified live |
| F-06: resume comparison | API and UI built: Settings resume field with code-point counter, comparison panel with disabled reasons, stale notice and the no-requirements case |
| Frontend | Milestone 5 complete (branch `feat/milestone-5-frontend`): every screen, `src/lib/api.ts`, `types.ts` from `/openapi.json`, the contract fixture test, 259 `bun test` tests, `scripts/smoke.ts` (114 checks at 375px and 1280px) |
| Deployment and CI | None. Neon, QStash, Redis, Resend and hosting need the owner's accounts (`MANUAL_STEPS.md`, including the milestone 5 frontend host steps) |

All backend acceptance criteria for F-01 to F-06 have tests except AC-04.8, which needs a live scheduler. The milestone 5 whole-branch review found 53 acceptance criteria met in the UI and 1 partly met (NFR-03), which the final fix round completed by extending the smoke run to all 16 screens. Three have no UI half (AC-05.1, 05.4, 05.9).

## Next work

### Milestone 6: Final polish
UI and tone. Needs the owner's review. Carried in from milestone 5:
- Choose one icon set: `home.html` draws the Companies and Settings icons differently in the sidebar and the bottom nav, and the sidebar Settings gear looks broken.
- Mobile touch targets: the 32px top-bar buttons are below the guide's 44px floor (they match the prototype).
- Inputs are 14px, which makes iOS Safari zoom on focus; consider 16px inputs below 900px.
- At 1280px most company names truncate in the home table; at 900px the table scrolls inside its panel.
- Digest preview headings and empty lines differ from the email's ("Interviews this week" vs "Coming up this week"; "Nothing to report." vs the email's lines), though the items are identical (AC-05.8).
- Move up / Move down are disabled at the ends with no stated reason (DESIGN_GUIDE §5).
- A failed stage mutation shows the section's "Couldn't load this section." rather than an action-specific message.
- The bottom nav has no quiet-count badge (the spec places it in the sidebar only).

### Smaller updates
- Keep the README Status section's "not yet verified live" list accurate as integrations go live.

### Owner only
Deployment and live verification of Neon, QStash, Redis and Resend, plus the frontend host (`API_BASE_URL`, HTTPS for the Secure cookie), as listed in `MANUAL_STEPS.md`. G-03 needs two consecutive real Mondays.

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
- **Frontend architecture** (milestone 5, owner-approved 2026-11-05): the `nextjs-patterns` skill as written; `zod` for a first-pass validation in PRD wording, the backend stays the authority; `bun test` for pure helpers and the contract fixture only; snake_case field names end to end (inline company is `company.name`).
- **Frontend sessions:** `api.ts` redirects only `401 UNAUTHENTICATED` to `/session-expired`, a route handler that deletes the cookie and goes to `/sign-in` (a Server Component can't delete cookies, and a stale cookie would otherwise loop). Logout opts out of that redirect. The shell renders after a cookie-only check and streams the account label and quiet badge, so `loading.tsx` shows during a Render cold start.
- **Frontend data:** `/applications` shows 50 rows per page from the API's full list; home shows the 10 most recent. Filter, sort and page live in the URL. Offset-less API timestamps are read as UTC. Ids are asserted to be positive integers before they reach an API path. Each independently loaded section has its own error boundary (`SectionBoundary`).
- **Frontend UI choices:** Sign out sits in the prototype's Search slot (search is not built); the Applications nav badge is the quiet count; confirmation dialogs only for deleting an application or a company; the top-bar "Add application" turns secondary on screens with their own primary.
- **New endpoints for the UI:** `GET /contacts` (with `company_name`) and `GET /stages/upcoming` (`[now, now + 7 days)`, `UpcomingStageSummary` without `url`).
- **SQLite foreign keys** are enabled in the app engine (not just tests), so local SQLite cascades like Postgres.
- **Git author:** commits are authored as `garcia <emmanoelgarsia@gmail.com>` (set repo-locally in cloud sessions, whose default identity is not the owner's).

## Known open items (non-blocking)

1. No test that a failed cross-field rule rolls back an inline company on `POST /applications`.
2. `notes` and `job_description` have no length limit. A very long job description also makes a comparison slower to run (the scan is linear, so this is cost, not correctness).
3. Possible Postgres vs SQLite differences: `func.lower` on role title vs `casefold`. Tests run on SQLite, and Postgres has only been exercised by hand up to milestone 2.
4. No 404 test for `PUT` or `DELETE /applications/{foreign_id}/contacts/{cid}` (the code is correct).
5. A naive `scheduled_at` uses `fold=0` in DST-repeated hours.
6. `PATCH /applications/{id}` doesn't re-run the duplicate check when company or role changes.
7. Digest dedupe is check-then-act, so a multi-worker deployment could double-send. Fix it with a unique index on (account, week anchor) or an advisory lock if the deployment ever gains workers.
8. Most routes don't declare their 401/404/409 problem responses in OpenAPI; only the comparison routes and the two milestone 5 list routes do (`schemas/problem.py` `problem_responses()`). Retrofit the rest for NFR-01.
9. `CompanyService.list` and `ApplicationService.list` have the same `get_type_hints` shadowing issue that `ContactService.list` works around with `builtins.list` (milestone 5); fix all three together if it ever bites.
10. `/contacts/{id}` and the stale-cookie path redirect client-side after streaming starts (200 + redirect), not with a 307, because the app layout streams. Behaviour is correct; only the status code differs.
