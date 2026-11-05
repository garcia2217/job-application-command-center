# Milestone 5 Design: Frontend for F-01 to F-06

**Date:** 2026-11-05 · **Status:** approved by owner (chat, 2026-11-05), with all three recommendations below
**PRD features:** F-01 to F-06 (the UI half of every acceptance criterion), NFR-03, NFR-07, NFR-08.
**Gate (AGENTS.md):** `bun run lint`, `bun run build`, and the frontend half of the API contract fixture test.
**Scope:** `frontend/`, plus two small read-only backend endpoints if the owner approves decision 1 below. Tone and visual polish belong to milestone 6.

## Starting point

- `frontend/` is the default `create-next-app` page: Next.js 16.3.5, React 19.2.8, Tailwind 4, bun. No test runner, no `src/lib`, no components.
- The backend serves every route the screens need **except two** (checked against `/openapi.json` on 2026-11-05):
  - **No contacts list.** Contacts can be read only per company (`GET /companies/{id}`) or one at a time. The Contacts screen (a bottom-nav destination in DESIGN_GUIDE §4) has nothing to call.
  - **No "next 7 days" stages.** `GET /settings/digest-preview` returns upcoming stages for the *digest week* (the most recent Monday 08:00 plus 7 days), not the 7 days from now. On a Friday that window has 3 days left, so it can't feed the home screen's "Next 7 days" rail.
- Optional fields on `PATCH` accept an explicit `null` to clear them; required fields reject `null`. The edit forms rely on this to clear a posting URL, salary or schedule.
- DESIGN_GUIDE §8 lists every screen except home as "still to be designed". This document settles their layouts from the guide's existing components only (no new tokens, components or patterns). Once approved, the layouts here are the reference for those screens and §8 is updated to point here.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Architecture | Exactly the `nextjs-patterns` skill: Server Components by default, `src/lib/api.ts` (server-only) as the only backend caller, Server Actions in `src/actions/`, `proxy.ts` for the optimistic redirect, no `cacheComponents` | Already settled for this project |
| Field names | snake_case end to end: form input `name`s equal API field names, so backend `errors[]` and local errors share keys | API_CONTRACT: "field uses the backend's snake_case names" |
| Client-side validation | Add `zod` (v4) for a fast first pass with the PRD's wording; the backend stays the authority and its field errors render identically | The skill's form pattern; the backend's Pydantic messages ("Field required") are not the PRD's copy |
| Test runner | `bun test` (built in, no new dependency) via a `"test"` script. Covers the contract fixture and the pure helpers only; no component or browser tests in this milestone | AGENTS.md gate names only the fixture test; TDD still applies to every pure helper |
| Problem parsing | Split out of `api.ts` into `src/lib/problem.ts` (pure, no `server-only`, no `next/headers`) so `bun test` can import it. `api.ts` uses it | `api.ts` reads cookies and can't be imported outside a request |
| `types.ts` | Hand-written from `/openapi.json` (snapshot taken this session), one type per schema, enums as string-literal unions | API_CONTRACT "Frontend types" |
| Display casing | One module, `src/lib/labels.ts`, maps wire enums to display words ("on_site" → "On-site") | API_CONTRACT: display casing is a frontend concern |
| Dates and times | All formatting through `src/lib/format.ts` using `Intl.DateTimeFormat` with the account's `timezone` from `/auth/me` (NFR-08). Stage times are sent as naive `YYYY-MM-DDTHH:mm` from `<input type="datetime-local">`; the backend reads them in the account's zone. Edit forms convert the stored UTC value back to account-local for `defaultValue` | API_CONTRACT wire rules; no client-side timezone library |
| Relative activity | From `days_since_activity`: 0 → "Today", 1 → "Yesterday", n → "n days ago" | The prototype's wording; the backend already computes the count |
| Expired session | `api.ts` turns any 401 into `redirect('/session-expired')`. That route handler deletes the `session` cookie and redirects to `/sign-in` | A Server Component can't delete a cookie, and redirecting straight to `/sign-in` with a stale cookie loops: `proxy.ts` sends cookie holders from `/sign-in` back to `/` |
| Large N | `/applications` renders 50 rows per page (`?page=`), slicing the API's full list on the server. Home shows the 10 most recent by last activity with "View all n" | DESIGN_GUIDE §5 "Large N"; the API has no pagination and returns 500 rows within NFR-02 |
| Filter and sort state | In the URL (`?status=`, `?sort=`, `?order=`, `?page=`). Sortable column headers are links carrying `aria-sort`; only the status chips are a Client Component | Skill "Filters and URL state"; keeps the table server-rendered |
| Optimistic updates | Stage reorder only (`useOptimistic`). Quiet applications leave Needs follow-up because every mutating action calls `revalidatePath('/')` and the backend already clears `is_quiet` on activity | Skill: optimistic where the PRD demands immediacy; the follow-up list is never on the same screen as the activity |
| Confirmation | Dialog only for deleting an application or a company (PRD). Deleting a stage or a contact, and unlinking a contact, happen immediately | DESIGN_GUIDE §6: confirmation only where the PRD requires it |
| Account label | Top bar shows "· demo account" when `is_demo`, otherwise the sign-in email | Prototype shows the account name in `text-faint` |
| Sidebar badge | The Applications nav badge is the **quiet** count (warn colors), hidden when 0 | Prototype styles it warn; principle 4 says amber means silent |

## Screens

All screens use the app shell from `home.html`: sticky top bar, 220px sidebar at ≥900px, bottom nav below 900px, one `h1` per page with a factual situation line under it.

### Shell (`app/(app)/layout.tsx`)
- Top bar: brand + account label; **Sign out** (ghost, a form posting to the `signOut` action) in the slot the prototype gives to Search; **Add application** (primary) on the right. On screens that have their own primary action (forms, application detail, settings) the top-bar button renders as secondary so each screen keeps exactly one primary. This needs `usePathname`, so the button is a tiny client leaf.
- Sidebar and bottom nav: Home, Applications, Companies, Contacts, Settings, with `aria-current="page"` from a client leaf. Icons copied from `home.html`.
- The layout fetches `/auth/me` and the quiet count. `api.ts` wraps both in React `cache()` so pages reuse them in the same render.

### Sign-in (`app/(auth)/sign-in/page.tsx`) — F-01
- One panel, centred: Email, Password, **Sign in** (primary). No sign-up link (AC-01.9). Demo credentials stay README-only (OQ-03 default).
- Empty email or password: a `FieldError` under that field and no API call, so no attempt is counted.
- `INVALID_CREDENTIALS` → "Email or password is incorrect." `ACCOUNT_LOCKED` → "Too many attempts. Try again in 15 minutes." Both shown as one `InlineAlert` above the button (a form-level error: it belongs to neither field and must not reveal which was wrong). The email value survives; the password does not.
- Success sets the `session` cookie (httpOnly, `sameSite: 'lax'`, `path: '/'`, `secure` in production, `expires` from the backend's `expires_at`) and redirects to `/` (AC-01.1).

### Home (`app/(app)/page.tsx`) — F-02, F-04, F-05
Matches `home.html`. Title: today's date in the account's zone ("Thursday, 5 November"). Situation line: "n applications have gone quiet · m interviews this week" (a half is dropped when its count is 0, and the line is omitted when both are).
- **Needs follow-up** (`GET /applications?quiet=true`, oldest first): rows with company · role, status, date applied, `SilentBadge` ("24d silent"; danger past 3× threshold). Head shows "Quiet after n days". Empty: "First check pending." when `job-runs.quiet_check` is `null`, otherwise "Nothing needs follow-up."
- **Applications**: status chips with counts, then the 10 most recent (table ≥900px, cards below), quiet rows marked. "View all n" links to `/applications`. First use: `EmptyState` "No applications yet" + **Add your first application** (AC-02.9).
- **Next 7 days** (right rail): stages from the new upcoming endpoint (decision 1), day / date / time column as in the prototype. Empty: "No interviews in the next 7 days."
- **Automation** (right rail): last daily check and last digest run (time and result in words), and "Preview digest →".
- Each section sits in its own `<Suspense>` with a skeleton, so one slow call doesn't block the others.

### Applications list (`/applications`) — F-02
Page title "Applications", situation line "n applications · m quiet". Chips (All + 6 statuses, with counts), table/cards as on home, sortable "Applied" and "Last activity" headers (default last activity, newest first), 50 per page with Previous/Next. Filtered empty: "No applications with this status." + **Clear filter** (AC-02.8).

### Add / edit application (`/applications/new`, `/applications/[id]/edit`) — F-02
One column, max form width 640px, persistent labels, `noValidate`, validation on submit.
- **Company:** a `<select>` of existing companies plus a "New company…" option that reveals a Name field (inline creation). `COMPANY_NAME_TAKEN` puts a `FieldError` on the new-company name, "A company named Acme already exists.", with a **Use Acme** button that switches the select to the existing company and keeps every other value (AC-02.4).
- **Fields** in order: Role title*, Status (default Applied), Date applied, Posting URL, Location, Work arrangement, Salary min / max / currency (one row ≥900px), Source, Job description (textarea), Notes.
- **Duplicate:** `DUPLICATE_APPLICATION` shows an `InlineAlert` (warn) "You already have an application for this role at this company." with a link to it, **Save anyway** (resubmits with `confirm_duplicate=true`, all values kept) and **Cancel** (AC-02.5).
- Local rules with PRD wording: role title required (AC-02.2), salary min ≤ max (AC-02.3), currency required with a salary, posting URL must be http(s), date applied not in the future (checked on the backend only, in the account's zone). Backend errors land on the same fields.
- Edit sends only the fields the form holds; an emptied optional field is sent as `null` so it clears.
- Save → redirect to the application detail; Cancel → back.

### Application detail (`/applications/[id]`) — F-02, F-03, F-06
Header: company (link) · role as the `h1`, status indicator, `SilentBadge` if quiet, "Last activity …". Actions: **Edit** (secondary), **Delete** (destructive → dialog "Delete this application?" naming the cascade, confirm "Delete application", AC-02.7).
Sections, single column below 900px, main + right rail at ≥900px:
- **Main: Comparison** (F-06). **Compare** is the screen's one primary button. Blocked: dimmed button plus the PRD reason beside it ("Add your resume in Settings first." with a link to Settings, or "Paste the job description first."). Result: match percentage as the strongest number on the page ("67% match · 4 of 6"), "Ran 5 Nov, 14:02", then **Matched** and **Missing** as two lists. `is_stale` → warn `InlineAlert` "Resume or job description changed since this comparison." `match_percentage: null` → "No recognised requirements found." with no percentage. A saved comparison still shows when running is blocked. Running uses a Server Action and `refresh()`; the button shows a spinner while pending.
- **Main: Interview stages** (F-03). Ordered list: name, scheduled time in the account's zone (or "Not scheduled"), outcome word, notes. Each row has **Move up** / **Move down** (`sm` secondary; the first can't move up, the last can't move down) with an optimistic reorder (AC-03.4), plus **Edit** (expands an inline form in the row) and **Delete**. An "Add stage" form sits under the list: Name*, Scheduled (datetime-local), Outcome (default Pending, AC-03.5), Notes. Empty: "No interview stages yet."
- **Rail: Details.** A definition list of the remaining fields (date applied, posting URL as an external link, location, arrangement, salary with currency, source), then notes.
- **Rail: Contacts.** Linked contacts (name, title, email link) with **Unlink**. "Link a contact" select of this company's contacts not yet linked (relinking is impossible from the UI, and the API ignores it anyway, AC-03.3). "Add contact" link to `/contacts/new?company_id=…&application_id=…`, which creates the contact and links it in one action. Empty: "No contacts linked."
- **Job description**: collapsed `<details>` below the main column, full text in a pre-wrapped block.

### Companies (`/companies`, `/companies/new`, `/companies/[id]`, `/companies/[id]/edit`) — F-02, F-03
- List: name and website, alphabetical, rows linking to detail. Empty: "No companies yet" + **Add company**.
- Detail: name as `h1`, website, notes. Sections **Applications** (same rows as the applications list) and **Contacts** (rows linking to the contact edit page, plus "Add contact"). **Delete** (destructive): with applications the button stays enabled and the dialog explains "Delete or move this company's applications first." with no confirm button; the 409 `COMPANY_HAS_APPLICATIONS` path shows the same text in case the list changed (AC-02.6). Without applications the dialog confirms with "Delete company" and says its contacts go too.
- Form (new/edit): Name*, Website, Notes. `COMPANY_NAME_TAKEN` on create: `FieldError` "A company named Acme already exists." with a link to it (AC-02.4).

### Contacts (`/contacts`, `/contacts/new`, `/contacts/[id]/edit`) — F-03
- List (new endpoint): name · title, company, email, sorted by name. Empty: "No contacts yet" + **Add contact**.
- Form: Company* (select; fixed when arriving from a company or application), Name*, Title, Email, LinkedIn URL, Notes. Invalid email → field message (AC-03.7). Edit page has **Delete** (immediate, then back to the list). AC-03.6 needs no extra UI: deleting removes the links on the backend.

### Settings (`/settings`, `/settings/digest-preview`) — F-04, F-05, F-06
- One form, one **Save settings** primary: Quiet threshold (number, 1–90, hint "Takes effect at the next daily check."), Time zone (select of `Intl.supportedValuesOf('timeZone')` with UTC first), Resume (LaTeX) textarea with a live counter "12,345 / 50,000 characters" counted with `[...text].length` that turns danger past the limit; the server error names the limit (AC-06.9). Saving an empty resume clears it (milestone 4 decision).
- **Automation** panel: last daily check and last digest run, each with time in the account's zone, result in words (Succeeded, Skipped: reason, Not sent: daily email limit reached, Failed: summary), or "First check pending." when never run (AC-04.7).
- **Preview digest** link to `/settings/digest-preview`: a page (not a modal) showing "Would send now" or the skip reason, the window, then the two sections exactly as the API returns them, each item linking to its application. Both empty: the PRD's empty case (AC-05.8).

### Loading, error, not found
Every fetching segment has `loading.tsx` with 60px skeleton rows. `(app)/error.tsx` shows an `InlineAlert` "Something went wrong loading this page." with **Try again** (`retry`), never `error.message`. `[id]` segments have `not-found.tsx` ("This application doesn't exist or was deleted."), reached from a 404 including another account's record (AC-01.7).

## Backend additions (decision 1)

Both read-only, session-authenticated, scoped to the account, with `response_model`s and pytest coverage, written test-first:
- `GET /contacts` → `ContactListItem[]` = `ContactResponse` + `company_name`, sorted by name (case-insensitive), then id.
- `GET /stages/upcoming` → `UpcomingStageSummary[]` (`application_id`, `company`, `role_title`, `stage_name`, `scheduled_at`: the digest's item minus `url`, which needs `APP_BASE_URL`) for stages with `scheduled_at` in `[now, now + 7 days)`, soonest first. Reuses the digest's stage query with a different window.

`docs/API_CONTRACT.md` gets both routes.

## Contract test

`frontend/src/lib/problem.test.ts` reads `docs/api-fixtures/validation-error.json` and asserts that `parseProblem` yields `status 422`, `code "VALIDATION_FAILED"` and `fieldErrors { role_title: ["Field required"] }`. Further cases: a body with no `errors`, a non-JSON body (→ `HTTP_ERROR`), a `null` field (→ key `_`), `existing_id` carried through for `COMPANY_NAME_TAKEN` and `DUPLICATE_APPLICATION`.

Pure helpers also get `bun test` coverage written first: `format.ts` (zone-aware formatting, UTC → datetime-local round trip, relative activity), `labels.ts`, the resume code-point counter, and the FormData → payload mappers in each action (blank optional → `null` on edit, omitted on create).

## Verification beyond the gate

`lint`, `build` and `bun test` can't show that screens work, so before reporting the controller also runs the backend on SQLite with the demo seed, `next build && next start` against it, and uses Playwright to: sign in as demo, walk every nav destination, open an application with a comparison, check that no page scrolls horizontally at 375px (NFR-03), and take 375px and 1280px screenshots of each screen for the owner. Sign-in lockout and session expiry are covered by backend tests and are not re-tested in the browser.

## Planned work order (detailed in the plan once approved)

1. **Foundation:** tokens and dark mode in `globals.css`, `types.ts`, `problem.ts` + contract test, `api.ts`, `session.ts`, `proxy.ts`, `/session-expired`, `format.ts`, `labels.ts`, and the DESIGN_GUIDE §3 components (Panel, SectionHead, Row, StatusIndicator, SilentBadge, Button, FilterChip, EmptyState, InlineAlert, Field/FieldError, Dialog, Skeleton).
2. **Auth and shell:** sign-in, sign-out, app layout, nav. Its own dedicated review (auth and session path).
3. **Backend additions**, then **home** and **applications list**.
4. **Application form and detail:** stages, contacts, comparison, delete.
5. **Companies, contacts, settings, digest preview.**
6. Whole-branch review against every AC, Playwright smoke, STATUS and README updates.

## Owner decisions needed

1. **Two small backend endpoints** (`GET /contacts`, `GET /stages/upcoming`). Milestone 5 is "frontend", but without them the Contacts screen and the home "Next 7 days" rail have no data. The alternative is to fan out from the frontend (one `GET /companies/{id}` per company, one `GET /applications/{id}` per active application), which is slow on Render and breaks NFR-02's spirit at 500 applications. **Recommendation:** add both endpoints in this milestone.
2. **Top-bar Search.** The prototype has a Search button but the PRD has no search feature, so it would be a new feature. **Recommendation:** drop it and put Sign out in that slot; note search as a v2 idea in the README.
3. **New frontend dependencies:** `zod` for form validation (the skill's pattern) and nothing else; `bun test` needs no package. **Recommendation:** accept.

## Out of scope

Search, toasts (every change in this milestone is visible in place), undo, dark-mode toggle (it follows the system), the digest email template (built in milestone 3), anything in PRD §5 non-goals or §14, and UI tone and polish (milestone 6).
