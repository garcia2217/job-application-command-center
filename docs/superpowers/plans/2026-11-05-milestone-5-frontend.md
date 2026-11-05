# Milestone 5: Frontend for F-01 to F-06 Implementation Plan

**Goal:** Every MVP screen in Next.js, over the existing FastAPI backend: sign-in, home with Needs follow-up, applications, the application form and detail (stages, contacts, comparison), companies, contacts, settings and digest preview. Plus two read-only backend endpoints the screens need.

**Architecture:** The `nextjs-patterns` skill, unchanged. Server Components fetch through `src/lib/api.ts` (server-only, forwards the `session` cookie). Mutations are Server Actions in `src/actions/`. `proxy.ts` gives the optimistic redirect; the backend's 401 is the real gate. Pure helpers (`problem.ts`, `format.ts`, `labels.ts`, `payload.ts`, `nav.ts`) hold every rule worth testing and run under `bun test`.

**Tech Stack:** Next.js 16.3.5, React 19.2.8, Tailwind 4, TypeScript strict, bun 1.4. New dependencies: `zod@^4.6` and `server-only`. Backend: Python 3.14, FastAPI, no migration.

**Spec:** `docs/superpowers/specs/2026-11-05-milestone-5-frontend-design.md` (approved 2026-11-05 with all three recommendations: add `GET /contacts` and `GET /stages/upcoming`; drop Search and put Sign out in its slot; add `zod`). PRD: `docs/PRD.md` §7. Contract: `docs/API_CONTRACT.md`. UI: `docs/design/DESIGN_GUIDE.md` and `docs/design/home.html`.

**Refinement made while planning:** `GET /stages/upcoming` returns a new `UpcomingStageSummary` (the digest's `UpcomingStageResponse` minus `url`), because `url` needs `APP_BASE_URL` and the frontend links by `application_id`. The spec is updated to match.

## Global Constraints

- **Read first:** `AGENTS.md`, the `nextjs-patterns` skill and its `references/forms-and-actions.md`, `docs/API_CONTRACT.md`, `docs/design/DESIGN_GUIDE.md`, `docs/design/home.html`. The design spec's "Screens" section is the layout and copy source for every screen except home, where `home.html` wins.
- Frontend commands run from `frontend/`: `bun test`, `bun run lint`, `bun run build`. Backend from `backend/`: `uv run pytest`, `uv run ruff check .`, `uv run ruff format .`.
- **Next 16 shapes** (verified in `frontend/node_modules/next/dist/docs/` on 2026-11-05): `proxy.ts` lives in **`frontend/src/proxy.ts`** (same level as `app/`), default export `proxy`; `error.tsx` gets `{ error, retry }`; `params` and `searchParams` are Promises; `cookies()` is async and `.set` / `.delete` work only in Server Actions and Route Handlers; `refresh()` comes from `next/cache`. For anything else, read the bundled docs, never memory.
- **zod 4 shapes** (verified in a scratch install of 4.6.7): `z.flattenError(result.error).fieldErrors`, `z.url({ protocol: /^https?$/, error: '…' })`, messages via `{ error: '…' }`.
- **Redirects and catch blocks:** `redirect()` and `notFound()` throw. Every `catch` in an action or page must rethrow anything that isn't an `ApiError`: `if (!(error instanceof ApiError)) throw error`. Otherwise a 401 redirect gets swallowed.
- Every Server Action starts with `await requireSession()`. Expected errors are returned as state, never thrown. `revalidatePath` before `redirect`.
- **Field names are snake_case end to end.** Form `name` attributes equal API field names; the inline company name is `company.name` (the backend reports nested fields joined with `.`).
- **No hardcoded hex or px in components.** Every color, font size and fixed width comes from a `@theme` token in `globals.css` (Task 3). Spacing uses Tailwind's 4px scale steps `1, 2, 3, 4, 6, 8, 12` only.
- `"use client"` only on leaves that need state, effects, event handlers or `usePathname`/`useSearchParams`. A component using `useSearchParams` is wrapped in `<Suspense>` by its parent.
- Every fetching route segment has `loading.tsx` (60px skeleton rows). Never render `error.message`.
- One primary button per screen (see `hasOwnPrimary` in Task 2). `EmptyState` actions are secondary buttons.
- TDD for every pure helper: write the `*.test.ts` first, watch it fail, then implement. Tests sit next to their module (`src/lib/format.test.ts`).
- Implementers never stage or commit. Reports go to `docs/superpowers/plans/reports/<dispatch>-implementer.md`; the final message is at most ~10 lines.
- Out of scope: search, toasts, undo, a theme toggle, the digest email template, anything in PRD §5 or §14, tone and polish (milestone 6).

## Dispatch grouping (for the controller)

| Dispatch | Tasks | Review |
|---|---|---|
| A | 1 (backend endpoints + contract doc) | One reviewer |
| B | 2, 3 (frontend libs, tokens, components) | One reviewer |
| C | 4 (auth, session, proxy, shell) | **Dedicated** auth/session review |
| D | 5, 6 (home, applications list) | One reviewer |
| E | 7, 8 (application form, application detail) | One reviewer |
| F | 9, 10 (stages, comparison) | One reviewer |
| G | 11, 12, 13 (companies, contacts, settings + digest preview) | One reviewer |
| H | 14 (docs, smoke script) | Controller checks; then the whole-branch review |

Dispatches run in order; each starts after the previous batch's Critical and Important findings are fixed.

## File structure

```
backend/src/app/
  schemas/contact.py            + ContactListItem
  schemas/interview_stage.py    + UpcomingStageSummary
  services/contact_service.py   + list()
  services/stage_service.py     + upcoming()
  routers/contacts.py           + GET /contacts
  routers/stages.py             + upcoming_router: GET /stages/upcoming
  main.py                       + include upcoming_router
backend/tests/test_contacts.py, test_stages.py   + list / upcoming tests

frontend/
  .env.example                  API_BASE_URL=http://localhost:8000
  package.json                  + zod, server-only; "test": "bun test"
  src/proxy.ts
  src/app/
    layout.tsx                  root html/body, globals.css, metadata
    globals.css                 Tailwind + @theme tokens + dark overrides
    session-expired/route.ts    GET: delete cookie, redirect /sign-in
    (auth)/sign-in/page.tsx
    (app)/layout.tsx            shell: TopBar, SideNav, BottomNav
    (app)/loading.tsx, error.tsx, page.tsx (home)
    (app)/applications/page.tsx, loading.tsx
    (app)/applications/new/page.tsx, loading.tsx
    (app)/applications/[id]/page.tsx, loading.tsx, not-found.tsx
    (app)/applications/[id]/edit/page.tsx
    (app)/companies/page.tsx, loading.tsx, new/page.tsx
    (app)/companies/[id]/page.tsx, loading.tsx, not-found.tsx, edit/page.tsx
    (app)/contacts/page.tsx, loading.tsx, new/page.tsx
    (app)/contacts/[id]/edit/page.tsx, not-found.tsx
    (app)/settings/page.tsx, loading.tsx
    (app)/settings/digest-preview/page.tsx, loading.tsx
  src/lib/
    types.ts                    hand-written from /openapi.json
    problem.ts (+ .test.ts)     parseProblem, toFieldErrors (pure)
    api.ts                      server-only client
    session.ts                  requireSession, SESSION_COOKIE
    labels.ts (+ .test.ts)      enum display words, job run wording
    format.ts (+ .test.ts)      zone-aware dates, relative activity, code points
    payload.ts (+ .test.ts)     FormData → API payloads
    nav.ts (+ .test.ts)         NAV_ITEMS, isActive, hasOwnPrimary
    validation.ts               zod schemas (application, company, contact, stage, settings, sign-in)
  src/actions/
    auth.ts, applications.ts, stages.ts, comparisons.ts, companies.ts, contacts.ts, settings.ts
    form-state.ts               FormState type + apiErrorState()
  src/components/
    ui/  panel, section-head, row, status-indicator, silent-badge, button, filter-chip,
         empty-state, inline-alert, field, dialog, skeleton, definition-list
    shell/  top-bar, add-application-button (client), side-nav (client), bottom-nav (client), nav-icons
    applications/  applications-table, application-cards, status-filter (client), sort-header,
                   pagination, application-form (client), delete-application (client),
                   follow-up-queue, upcoming-list, automation-panel
    stages/  stage-list (client), stage-form (client)
    comparison/  comparison-panel, compare-button (client)
    contacts/  linked-contacts, link-contact-form (client), contact-form (client)
    companies/  company-form (client), delete-company (client)
    settings/  settings-form (client), resume-field (client), job-run-summary
```

Names under `components/` are a guide; split or merge files to keep each one small, but keep the `ui/` set exactly as DESIGN_GUIDE §3 names it.

---

### Task 1: Backend: `GET /contacts` and `GET /stages/upcoming`

**ACs:** supports AC-03.1 (contacts visible), F-03 Contacts screen, the home "Next 7 days" rail; NFR-01 (both declare 401 problem responses).

**Files:** `backend/src/app/schemas/contact.py`, `schemas/interview_stage.py`, `services/contact_service.py`, `services/stage_service.py`, `routers/contacts.py`, `routers/stages.py`, `main.py`, `backend/tests/test_contacts.py`, `backend/tests/test_stages.py`, `docs/API_CONTRACT.md`.

- [ ] **1a. Tests first** (`tests/test_contacts.py`), using the existing `owner_client`, `other_client`, `make_company` fixtures/helpers:
  - No session → 401 `UNAUTHENTICATED`.
  - No contacts → `[]`.
  - Contacts "bob", "Alice", "carol" across two companies → names in order Alice, bob, carol; each item has `company_id`, `company_name` matching its company, and every `ContactResponse` field.
  - Another account's contacts are not listed.
- [ ] **1b. Tests first** (`tests/test_stages.py`), monkeypatching the clock the service imports (as existing time-dependent tests do):
  - No session → 401.
  - With `now` fixed: stages at `now + 1h`, `now + 6d23h59m` are listed soonest first; `now - 1m`, exactly `now + 7d`, and an unscheduled stage are not; a stage at exactly `now` is listed (window is `[now, now + 7d)`).
  - Each item: `application_id`, `company` (name), `role_title`, `stage_name`, `scheduled_at` (UTC, aware).
  - Another account's stages are not listed. Ties on `scheduled_at` order by stage id.
- [ ] **1c. Implement.**

`schemas/contact.py`:
```python
class ContactListItem(ContactResponse):
    company_name: str
```

`schemas/interview_stage.py`:
```python
class UpcomingStageSummary(BaseModel):
    application_id: int
    company: str
    role_title: str
    stage_name: str
    scheduled_at: datetime
```

`ContactService.list(account_id) -> list[ContactListItem]`: `select(Contact).where(Contact.account_id == account_id).options(selectinload(Contact.company)).order_by(func.lower(Contact.name), Contact.id)`; build each item with `ContactListItem(**ContactResponse.model_validate(c).model_dump(), company_name=c.company.name)`.

`StageService.upcoming(account_id, now: datetime) -> list[UpcomingStageSummary]`: the same query shape as `DigestService.build`'s stage query (join `Application`, filter by account and `scheduled_at >= now`, `< now + timedelta(days=7)`, `selectinload(application → company)`, order `scheduled_at, id`), `scheduled_at=as_utc(s.scheduled_at)`. The route passes `utcnow()` from `app.clock`.

Routes:
```python
# routers/contacts.py — declared before "/{contact_id}"
@router.get("", response_model=list[ContactListItem], responses=problem_responses(401))
async def list_contacts(account: CurrentAccountDep, service: ContactServiceDep):
    return await service.list(account.id)

# routers/stages.py
upcoming_router = APIRouter(prefix="/stages", tags=["stages"])

@upcoming_router.get(
    "/upcoming", response_model=list[UpcomingStageSummary], responses=problem_responses(401)
)
async def upcoming_stages(account: CurrentAccountDep, service: StageServiceDep):
    return await service.upcoming(account.id, utcnow())
```
`main.py`: `app.include_router(stages.upcoming_router)`.

- [ ] **1d. Contract doc.** `docs/API_CONTRACT.md` "Wire values" gains: "`GET /contacts` lists the account's contacts sorted by name (case-insensitive), each with `company_name`. `GET /stages/upcoming` lists stages scheduled in `[now, now + 7 days)`, soonest first, as `{application_id, company, role_title, stage_name, scheduled_at}`. Unlike the digest preview's window, this one starts now."
- [ ] **1e. Verify:** `uv run ruff format .`, `uv run pytest`, `uv run ruff check .`.

---

### Task 2: Frontend libraries, contract test and tooling

**ACs:** the AGENTS.md milestone 5 gate (contract fixture test); NFR-07 (field error mapping); NFR-08 (formatting in the account's zone).

**Files:** `frontend/package.json`, `bun.lock`, `.env.example`, `src/lib/{types,problem,api,session,labels,format,payload,nav,validation}.ts`, the four `*.test.ts`.

- [ ] **2a. Tooling.** `bun add zod@^4.6 server-only`. Add `"test": "bun test"` to `scripts`. Create `frontend/.env.example` with `API_BASE_URL=http://localhost:8000` and a comment that it is server-only (never `NEXT_PUBLIC_`). Confirm `bun test` resolves `@/` paths from `tsconfig.json`.

- [ ] **2b. `types.ts`.** Hand-write one exported type per schema in the OpenAPI snapshot the controller provides at `docs/superpowers/plans/reports/openapi.json` (regenerate it if missing: from `backend/`, `DATABASE_URL=sqlite+aiosqlite:///:memory: uv run python -c "import json; from app.main import create_app; print(json.dumps(create_app().openapi()))" > ../docs/superpowers/plans/reports/openapi.json`, after Task 1 lands). Rules: enums as string-literal unions (`ApplicationStatus = 'wishlist' | …`) plus `as const` arrays `APPLICATION_STATUSES`, `STAGE_OUTCOMES`, `WORK_ARRANGEMENTS`; nullable fields as `T | null`; datetimes and dates as `string`; request types (`ApplicationCreate`, `ApplicationUpdate`, `CompanyCreate`, `CompanyUpdate`, `ContactCreate`, `ContactUpdate`, `StageCreate`, `StageUpdate`, `SettingsUpdate`) with optional properties exactly as the schema makes them optional. Include `ContactListItem` and `UpcomingStageSummary` from Task 1. Skip `/jobs/*` request types (the frontend never calls them) but keep `JobRunResponse`, `JobRunsResponse`, `JobStatus` and `JobType`.

- [ ] **2c. `problem.ts` — tests first** (`problem.test.ts`):
  - The fixture: `const body = await Bun.file(new URL('../../../docs/api-fixtures/validation-error.json', import.meta.url)).json()`; `parseProblem(422, body)` equals `{ status: 422, code: 'VALIDATION_FAILED', detail: '1 field(s) failed validation', fieldErrors: { role_title: ['Field required'] }, existingId: undefined }`.
  - Two errors on one field keep both messages in order; `field: null` groups under `_`.
  - No `errors` member → `fieldErrors` undefined. Empty array → undefined.
  - Non-object body (`null`, a string, the result of a failed JSON parse) → `code: 'HTTP_ERROR'`, `detail: 'Request failed'`, status kept.
  - `{ code: 'COMPANY_NAME_TAKEN', existing_id: 7, … }` → `existingId: 7`; a non-integer `existing_id` → undefined.
  - Malformed `errors` entries (missing `message`) are skipped, not thrown on.

```ts
// src/lib/problem.ts — pure: no 'server-only', no next/* imports
export type FieldErrors = Record<string, string[]>

export type Problem = {
  status: number
  code: string
  detail: string
  fieldErrors?: FieldErrors
  existingId?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toFieldErrors(errors: unknown): FieldErrors | undefined {
  if (!Array.isArray(errors)) return undefined
  const out: FieldErrors = {}
  for (const entry of errors) {
    if (!isRecord(entry) || typeof entry.message !== 'string') continue
    const key = typeof entry.field === 'string' && entry.field ? entry.field : '_'
    ;(out[key] ??= []).push(entry.message)
  }
  return Object.keys(out).length ? out : undefined
}

export function parseProblem(status: number, body: unknown): Problem {
  if (!isRecord(body)) return { status, code: 'HTTP_ERROR', detail: 'Request failed' }
  const existing = body.existing_id
  return {
    status,
    code: typeof body.code === 'string' ? body.code : 'HTTP_ERROR',
    detail: typeof body.detail === 'string' ? body.detail : 'Request failed',
    fieldErrors: toFieldErrors(body.errors),
    existingId: Number.isInteger(existing) ? (existing as number) : undefined,
  }
}
```

- [ ] **2d. `api.ts`** (no unit test: it reads cookies; covered by the smoke run).

```ts
// src/lib/api.ts
import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { parseProblem, type FieldErrors } from './problem'
import { SESSION_COOKIE } from './session'
import type { /* every response/request type used below */ } from './types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: FieldErrors,
    readonly existingId?: number,
  ) {
    super(message)
  }
}

type RequestOptions = RequestInit & {
  // logout must not bounce through /session-expired; it clears the cookie itself
  redirectOnUnauthenticated?: boolean
}

function baseUrl(): string {
  const url = process.env.API_BASE_URL
  if (!url) throw new Error('API_BASE_URL is not set')
  return url.replace(/\/$/, '')
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { redirectOnUnauthenticated = true, headers, ...init } = options
  const session = (await cookies()).get(SESSION_COOKIE)?.value
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(session ? { cookie: `${SESSION_COOKIE}=${session}` } : {}),
      ...headers,
    },
    cache: 'no-store', // every response is private to one account
  })
  if (!res.ok) {
    const problem = parseProblem(res.status, await res.json().catch(() => null))
    if (res.status === 401 && problem.code === 'UNAUTHENTICATED' && redirectOnUnauthenticated) {
      redirect('/session-expired')
    }
    throw new ApiError(problem.status, problem.code, problem.detail, problem.fieldErrors, problem.existingId)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

const json = (body: unknown) => JSON.stringify(body)
const query = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export type ListParams = { status?: ApplicationStatus; quiet?: boolean; sort?: 'last_activity' | 'date_applied'; order?: 'asc' | 'desc' }

export const api = {
  auth: {
    login: (body: LoginRequest) => request<LoginResponse>('/auth/login', { method: 'POST', body: json(body) }),
    logout: () => request<void>('/auth/logout', { method: 'POST', redirectOnUnauthenticated: false }),
    me: cache(() => request<AccountResponse>('/auth/me')),
  },
  settings: {
    get: () => request<SettingsResponse>('/settings'),
    update: (body: SettingsUpdate) => request<SettingsResponse>('/settings', { method: 'PATCH', body: json(body) }),
    jobRuns: cache(() => request<JobRunsResponse>('/settings/job-runs')),
    digestPreview: () => request<DigestPreviewResponse>('/settings/digest-preview'),
  },
  applications: {
    list: (p: ListParams = {}) =>
      request<ApplicationSummary[]>(`/applications${query({ status: p.status, quiet: p.quiet === undefined ? undefined : String(p.quiet), sort: p.sort, order: p.order })}`),
    quiet: cache(() => request<ApplicationSummary[]>('/applications?quiet=true')),
    get: cache((id: number) => request<ApplicationDetailResponse>(`/applications/${id}`)),
    create: (body: ApplicationCreate) => request<ApplicationDetailResponse>('/applications', { method: 'POST', body: json(body) }),
    update: (id: number, body: ApplicationUpdate) => request<ApplicationDetailResponse>(`/applications/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (id: number) => request<void>(`/applications/${id}`, { method: 'DELETE' }),
  },
  comparisons: {
    get: (id: number) => request<ComparisonStateResponse>(`/applications/${id}/comparison`),
    run: (id: number) => request<ComparisonStateResponse>(`/applications/${id}/comparison`, { method: 'POST' }),
  },
  stages: {
    upcoming: cache(() => request<UpcomingStageSummary[]>('/stages/upcoming')),
    create: (appId: number, body: StageCreate) => request<StageResponse>(`/applications/${appId}/stages`, { method: 'POST', body: json(body) }),
    update: (appId: number, id: number, body: StageUpdate) => request<StageResponse>(`/applications/${appId}/stages/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (appId: number, id: number) => request<void>(`/applications/${appId}/stages/${id}`, { method: 'DELETE' }),
    move: (appId: number, id: number, direction: 'up' | 'down') =>
      request<StageResponse>(`/applications/${appId}/stages/${id}/move`, { method: 'POST', body: json({ direction }) }),
  },
  companies: {
    list: cache(() => request<CompanyResponse[]>('/companies')),
    get: cache((id: number) => request<CompanyDetailResponse>(`/companies/${id}`)),
    create: (body: CompanyCreate) => request<CompanyResponse>('/companies', { method: 'POST', body: json(body) }),
    update: (id: number, body: CompanyUpdate) => request<CompanyResponse>(`/companies/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (id: number) => request<void>(`/companies/${id}`, { method: 'DELETE' }),
  },
  contacts: {
    list: () => request<ContactListItem[]>('/contacts'),
    get: (id: number) => request<ContactResponse>(`/contacts/${id}`),
    create: (body: ContactCreate) => request<ContactResponse>('/contacts', { method: 'POST', body: json(body) }),
    update: (id: number, body: ContactUpdate) => request<ContactResponse>(`/contacts/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (id: number) => request<void>(`/contacts/${id}`, { method: 'DELETE' }),
    link: (appId: number, id: number) => request<void>(`/applications/${appId}/contacts/${id}`, { method: 'PUT' }),
    unlink: (appId: number, id: number) => request<void>(`/applications/${appId}/contacts/${id}`, { method: 'DELETE' }),
  },
}

/** Route param → positive integer id, or notFound() for anything else. */
export function parseId(raw: string): number
```
`parseId` returns the integer for `/^[1-9]\d*$/` and calls `notFound()` (from `next/navigation`) otherwise, so `/applications/abc` is a 404 rather than an API 422. `cache()`-wrapped GETs are request-scoped deduplication only (skill "Caching"); mutations are never wrapped.

- [ ] **2e. `session.ts`:**
```ts
import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

export const SESSION_COOKIE = 'session'

export const requireSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) redirect('/sign-in')
  return token
})
```
`api.ts` imports `SESSION_COOKIE` from here; `proxy.ts` (Task 4) can't import a `server-only` module, so it repeats the literal `'session'` with a comment pointing here.

- [ ] **2f. `labels.ts` — tests first.** `STATUS_LABEL` (Wishlist, Applied, Interviewing, Offer, Rejected, Withdrawn), `OUTCOME_LABEL` (Pending, Passed, Failed), `ARRANGEMENT_LABEL` (On-site, Hybrid, Remote), and `jobRunText(run: JobRunResponse | null): string`:
  - `null` → `'First check pending.'`
  - `succeeded` → `'Succeeded'`; `skipped` → `` `Skipped: ${detail}` `` (detail is the backend's reason, e.g. "nothing to report"; plain `'Skipped'` if `detail` is null); `not_sent` → `'Not sent: daily email limit reached'`; `failed` → `` `Failed: ${detail ?? 'unknown error'}` ``.
  - Tests assert every enum value has a label (iterate the `as const` arrays from `types.ts`) and each `jobRunText` branch.
  - The implementer checks the backend's actual `detail` strings in `backend/src/app/services/digest_service.py` and `quiet_check_service.py` and makes the test fixtures match them; if the stored detail already contains "Skipped:", strip the duplication in `jobRunText` and say so in the report.

- [ ] **2g. `format.ts` — tests first.** All functions take an IANA `timeZone` and never use the host zone. Use `Intl.DateTimeFormat('en-GB', …)` with `hourCycle: 'h23'`.

| Function | Behaviour (test cases) |
|---|---|
| `formatDay(iso, tz, now = new Date())` | `'12 Feb'`; adds the year when it differs from `now`'s year in `tz` (`'12 Feb 2025'`). `2026-03-01T00:30:00Z` in `America/New_York` is `'28 Feb'`. |
| `formatDateOnly(date)` | For `YYYY-MM-DD` values (`date_applied`), never shifted by a zone: `'2026-02-12'` → `'12 Feb'`, year rule as above using UTC. |
| `formatDateTime(iso, tz)` | `'5 Nov, 14:02'` (`'5 Nov 2025, 14:02'` in another year). Midnight renders `00:00`, never `24:00`. |
| `toLocalInput(iso, tz)` | `datetime-local` value: `2026-11-05T05:02:00Z` in `Asia/Tokyo` → `'2026-11-05T14:02'`. `null` → `''`. |
| `todayTitle(now, tz)` | `'Thursday, 5 November'` (en-GB weekday, day, month; no year). Near midnight UTC the zone decides the day. |
| `relativeActivity(days)` | `0` → `'Today'`, `1` → `'Yesterday'`, `n` → `` `${n} days ago` ``. |
| `upcomingParts(iso, tz, now)` | `{ day: 'Today' \| 'Thu', date: '16', time: '15:00' }`; `day` is `'Today'` when the stage's local date equals `now`'s local date. |
| `codePointLength(text)` | `[...text].length`; `'😀'.repeat(3)` → 3 while `.length` is 6. |
| `isUrgentSilence(days, threshold)` | `days >= threshold * 3` (SilentBadge danger). |

- [ ] **2h. `payload.ts` — tests first.** Pure FormData → payload mappers, used by the actions. Shared rules: trim strings; on **create** a blank optional field is omitted; on **update** a blank optional field becomes `null` (clears it) and every field the form holds is sent; integers parse with `/^\d+$/` (anything else is left as the raw string so zod reports it); `''` select values for enums are omitted (create) or `null` (update) except required ones.
  - `applicationPayload(form, mode: 'create' | 'update')`: company handling only on create: `company_id === '__new__'` → `{ company: { name: form['company.name'] } }`, otherwise `{ company_id: Number(…) }`; `confirm_duplicate: form.confirm_duplicate === 'true'` on create. On update, `company_id` is sent as a number (the edit form keeps the company select but has no "New company…" option).
  - `stagePayload(form, mode)`: `scheduled_at` is the raw `datetime-local` string (naive, read by the backend in the account's zone) or omitted/`null`; `outcome` defaults to omitted on create (backend defaults Pending, AC-03.5).
  - `companyPayload`, `contactPayload` (with `company_id` number on create only), `settingsPayload` (`quiet_threshold_days` number, `timezone`, `resume_tex` sent as-is **including** an empty string, which clears the resume — never `null`, which the backend rejects).
  - Tests: one per rule above, including `salary_min: '100'` → `100`, `'1e3'` → kept as string, blank `posting_url` → omitted (create) / `null` (update), `__new__` company, empty resume → `''`.

- [ ] **2i. `nav.ts` — tests first.**
```ts
export const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/applications', label: 'Applications', icon: 'applications' },
  { href: '/companies', label: 'Companies', icon: 'companies' },
  { href: '/contacts', label: 'Contacts', icon: 'contacts' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
] as const

// '/' matches only '/', others match their prefix at a segment boundary
export function isActive(href: string, pathname: string): boolean

// Screens with their own primary action render the top-bar "Add application" as secondary
export function hasOwnPrimary(pathname: string): boolean
```
`hasOwnPrimary` is true for `/applications/new`, `/applications/<id>`, `/applications/<id>/edit`, `/companies/new`, `/companies/<id>/edit`, `/contacts/new`, `/contacts/<id>/edit`, `/settings` (not `/settings/digest-preview`), and false for `/`, `/applications`, `/companies`, `/companies/<id>`, `/contacts`. Test every one of those paths, plus `isActive('/applications', '/applications/12')` true and `isActive('/', '/applications')` false and `isActive('/applications', '/applicationsx')` false.

- [ ] **2j. `validation.ts`** (zod, the fast first pass; messages are PRD copy). Not unit tested beyond what the actions exercise, but the implementer adds one test file `validation.test.ts` covering each refine below.
  - `signInSchema`: `email` trimmed, min 1 → "Enter your email."; `password` min 1 → "Enter your password."
  - `applicationSchema` over the `payload.ts` output: `role_title` min 1 → "Role title is required." (AC-02.2); create requires `company_id` or `company.name` → "Choose or create a company." on `company_id`, or "Company name is required." on `company.name`; `posting_url` http(s) → "Enter a valid http(s) URL."; `salary_min`/`salary_max` non-negative integers → "Enter a whole number."; refine min ≤ max → "Minimum salary can't be higher than the maximum." on `salary_max` (AC-02.3; the backend uses the same field); refine currency present when either salary is → "Add a currency code for the salary." on `salary_currency`; `status` in the six values.
  - `companySchema`: `name` required "Company name is required."; `website` http(s) URL.
  - `contactSchema`: `name` required "Name is required."; `email` → "Enter a valid email address." (AC-03.7); `linkedin_url` http(s) → "Enter a valid URL."
  - `stageSchema`: `name` required "Stage name is required."
  - `settingsSchema`: `quiet_threshold_days` integer 1–90 → "Enter a whole number from 1 to 90." (AC-04.9); `resume_tex` refine `codePointLength ≤ 50_000` → "Resume must be 50,000 characters or fewer" (AC-06.9, the backend's exact wording).
  - Each schema's errors flatten with `z.flattenError(...).fieldErrors`, keyed by the same snake_case names the backend uses.

- [ ] **2k. Verify:** `bun test`, `bun run lint`, `bun run build`.

---

### Task 3: Tokens and UI components

**ACs:** DESIGN_GUIDE §2, §3, §7; NFR-03; NFR-07 (`Field`).

**Files:** `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/*`.

- [ ] **3a. `globals.css`.** Replace the scaffold. `@import "tailwindcss";` then:
```css
@theme {
  --breakpoint-*: initial;
  --breakpoint-desk: 900px;   /* the guide's only layout breakpoint */
  --breakpoint-wide: 1280px;  /* rail grows to 360px */

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;

  /* every color token from DESIGN_GUIDE §2, verbatim names and light values */
  --color-bg: #f7f7f8;
  /* … surface, surface-sunken, border, border-strong, text, text-muted, text-faint,
       accent, accent-hover, accent-soft, warn, warn-soft, danger, ok, status-* … */
  --color-on-accent: #fff;
  --color-danger-soft: color-mix(in srgb, var(--color-danger) 12%, transparent);

  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px;
  --shadow-panel: 0 1px 2px rgba(20,20,30,.06), 0 1px 3px rgba(20,20,30,.04);

  --text-title: 26px; --text-title-sm: 22px; --text-section: 15px;
  --text-body: 14px; --text-meta: 13px; --text-label: 12px; --text-nav: 11px;
  --text-week-date: 18px;

  --spacing-row: 60px; --spacing-topbar: 57px; --spacing-bottomnav: 56px;
  --spacing-nav-clear: 96px; --spacing-sidebar: 220px; --spacing-rail: 320px;
  --spacing-rail-wide: 360px; --spacing-main: 1200px; --spacing-form: 640px;
  --spacing-when: 58px; --spacing-dot: 7px;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* the dark values from DESIGN_GUIDE §2, same names; status-* unchanged */
    --color-on-accent: #14142a;
    --shadow-panel: 0 1px 2px rgba(0,0,0,.4);
  }
}

@layer base {
  html { -webkit-text-size-adjust: 100%; }
  body { @apply bg-bg text-text font-sans; font-size: 16px; line-height: 1.5; }
  h1, h2, h3 { font-weight: 600; letter-spacing: -0.01em; }
  :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
}
```
Fill in every elided token from the guide; nothing may be invented. The `@layer base` px values are the guide's own and are allowed here (this file is where tokens and base styles live). Check that Tailwind 4 emits `max-w-main`, `w-sidebar`, `min-h-row`, `text-meta`, `desk:` and `wide:` from these tokens; adjust the namespace (for example `--container-*` for max widths) if the build shows a class doesn't resolve, and report the change.

- [ ] **3b. Root `layout.tsx`:** `<html lang="en">`, imports `globals.css`, `metadata = { title: 'Job Application Command Center' }`, no web fonts (remove the scaffold's `next/font`). Delete the scaffold `page.tsx` and the unused `public/*.svg` files.

- [ ] **3c. Components** (`src/components/ui/`), each a named export, Server Components unless noted, styled only with tokens, matching `home.html`'s CSS for the same element:
  - `Panel` (`children`, optional `padded` for the 16px inner padding used by text panels like Automation).
  - `SectionHead` (`id` for `aria-labelledby`, `title`, optional `count`, optional `hint` (right side, faint), optional `link {href,label}`).
  - `Row` (full-row `next/link`, min-h-row, padding 12/16, hover sunken; parent renders `<ul>` with `li + li` borders: export `RowList` for that).
  - `StatusIndicator` (`status`): dot + word from `STATUS_LABEL`, dot color `bg-status-<status>`; the word is always rendered.
  - `SilentBadge` (`days`, `threshold`, `compact?`): `24d silent` or `24d`; danger tone when `isUrgentSilence`.
  - `Button` + `ButtonLink` (`variant: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'destructive-filled'`, `size: 'md' | 'sm'`, `pending?` shows an inline spinner and sets `aria-busy`, keeps the label). `destructive-filled` is for confirmation dialogs only.
  - `FilterChip` (`pressed`, `count`, `onClick` — rendered inside the client `StatusFilter`, so this file is a plain component with no directive and no hooks).
  - `EmptyState` (`title`, `body`, optional `action {href,label}` rendered as a secondary `ButtonLink`).
  - `InlineAlert` (`tone: 'warn' | 'danger' | 'info'`, `role?`, `children`): soft tint, radius-sm, 14px. `info` uses `accent-soft`.
  - `Field` (client-agnostic, no hooks): props `label`, `name`, `errors?: string[]`, `hint?`, `as?: 'input' | 'textarea' | 'select'`, plus native props. Renders a persistent `<label htmlFor>`, the control with `id={name}`, `aria-invalid`, `aria-describedby` pointing at the error and hint ids, border switched to danger on error, and each error as a 13px danger `<p>` directly under the control. Dots in `name` (`company.name`) are replaced with `-` for the `id`.
  - `Dialog` (`'use client'`): native `<dialog>` opened with `showModal()` from an effect when `open` becomes true, `aria-labelledby`, closes on Escape via the native `cancel` event → `onClose`. No custom focus trap (native modal dialogs trap focus).
  - `Skeleton` (`rows`, `variant: 'row' | 'block'`): `surface-sunken` blocks at min-h-row inside a `Panel`; `aria-hidden`, plus a visually hidden "Loading…" live text.
  - `DefinitionList` (`items: {term, value: ReactNode}[]`, skips `null`/empty values).
  - `PageHeader` (`title`, optional `subtitle`, optional `actions`): `h1` 22px mobile / 26px desk, subtitle 14px muted.
  - `VisuallyHidden`.
- [ ] **3d. Verify:** `bun test`, `bun run lint`, `bun run build`.

---

### Task 4: Auth, session expiry, proxy and the app shell

**ACs:** AC-01.1, AC-01.2 (UI half), AC-01.3 (message), AC-01.4 (sign out ends the session), AC-01.6 (redirect), AC-01.9 (no sign-up); F-01 empty-field rule; DESIGN_GUIDE §4 shell.

**Files:** `src/proxy.ts`, `src/app/session-expired/route.ts`, `src/app/(auth)/sign-in/page.tsx`, `src/components/auth/sign-in-form.tsx`, `src/actions/auth.ts`, `src/actions/form-state.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/error.tsx`, `src/app/(app)/loading.tsx`, `src/components/shell/*`.

- [ ] **4a. `proxy.ts`:**
```ts
import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = 'session' // same literal as src/lib/session.ts (server-only, not importable here)
const PUBLIC_PATHS = new Set(['/sign-in', '/session-expired'])

export default async function proxy(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE)
  const { pathname } = req.nextUrl
  if (!hasSession && !PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL('/sign-in', req.nextUrl))
  }
  if (hasSession && pathname === '/sign-in') {
    return NextResponse.redirect(new URL('/', req.nextUrl))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```
Cookie presence only; no backend calls.

- [ ] **4b. `session-expired/route.ts`:**
```ts
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

export async function GET(req: NextRequest) {
  ;(await cookies()).delete(SESSION_COOKIE)
  return NextResponse.redirect(new URL('/sign-in', req.nextUrl))
}
```
This is the only place a stale cookie is cleared outside sign-out; `api.ts` sends every `UNAUTHENTICATED` 401 here. Without it, `/sign-in` → `/` → 401 → `/sign-in` loops (proxy bounces cookie holders off `/sign-in`).

- [ ] **4c. `form-state.ts`:**
```ts
import type { FieldErrors } from '@/lib/problem'

export type FormState = {
  errors?: FieldErrors
  message?: string            // form-level InlineAlert
  values?: Record<string, string>
  duplicateOf?: number        // DUPLICATE_APPLICATION existing_id
  existingCompany?: { id: number; name: string }  // COMPANY_NAME_TAKEN
  ok?: boolean                // inline forms that stay on the page (stages, link contact)
}

export function formValues(formData: FormData): Record<string, string>
// string entries only; never includes 'password'

export function apiErrorState(error: unknown, values: Record<string, string>, fallback: string): FormState
// Rethrows non-ApiError (keeps redirect/notFound working). VALIDATION_FAILED → { errors: fieldErrors, values }.
// Other ApiError → { message: fallback, values }. Callers handle domain codes (409s) before calling this.
```
Not a `'use server'` file (it exports a type and sync helpers); actions import it.

- [ ] **4d. `actions/auth.ts`** (`'use server'`):
  - `signIn(prev, formData)`: parse with `signInSchema`; on failure return field errors and `values: { email }` and **make no API call** (no attempt counted). Call `api.auth.login`. `ACCOUNT_LOCKED` → `message: 'Too many attempts. Try again in 15 minutes.'`; `INVALID_CREDENTIALS` or `VALIDATION_FAILED` (a malformed email) → `message: 'Email or password is incorrect.'`; anything else → rethrow non-ApiError, else `message: 'Sign-in is unavailable right now. Try again.'`. Success: `(await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: new Date(expires_at) })`, then `redirect('/')`. `signIn` does not call `requireSession()` (it is the one public action).
  - `signOut()`: `await requireSession()`; `try { await api.auth.logout() } catch (e) { if (!(e instanceof ApiError)) throw e }` (best effort; the cookie clears regardless); delete the cookie; `redirect('/sign-in')`.
- [ ] **4e. Sign-in page:** outside the shell, centred `Panel` at form width, `h1` "Sign in" with the brand name above it. Client `SignInForm` with `useActionState(signIn, {})`: `Field` Email (`type="email"`, `autoComplete="username"`, `defaultValue={state.values?.email}`), `Field` Password (`type="password"`, `autoComplete="current-password"`, never repopulated), `InlineAlert tone="danger" role="alert"` for `state.message`, primary "Sign in" (pending label "Signing in…"). `noValidate`. No sign-up link or copy anywhere.
- [ ] **4f. Shell `(app)/layout.tsx`:** Server Component. `await requireSession()`; `const [me, quiet] = await Promise.all([api.auth.me(), api.applications.quiet()])`. Renders:
  - `TopBar`: brand "Command Center" + `<span>` faint "· demo account" if `me.is_demo` else "· {me.email}" (truncate with ellipsis on mobile); spacer; Sign out as a `<form action={signOut}>` with a ghost `sm` button; `AddApplicationButton` (client leaf: `usePathname()` → `hasOwnPrimary` → `variant` secondary or primary, `sm`, links to `/applications/new`).
  - `SideNav` (client leaf for `aria-current`): `nav aria-label="Main"`, hidden below desk, sticky under the top bar, `NAV_ITEMS` with the icons from `home.html` (copy the SVG paths into `nav-icons.tsx`), Applications badge = `quiet.length` (warn tone, hidden at 0, with visually hidden " need follow-up").
  - `BottomNav` (client leaf): fixed, desk:hidden, same items, icon over 11px label, `padding-bottom: env(safe-area-inset-bottom)` (allowed inline: it isn't a token value).
  - `<main>` with mobile padding 24/16/96 and desk padding 32/32/48, max width 1200, centred.
  - Landmark labels stay unique: the sidebar is `aria-label="Main"`, the bottom nav `aria-label="Main (mobile)"`.
- [ ] **4g. `(app)/error.tsx`** (`'use client'`, `{ error, retry }`): `InlineAlert tone="danger"` "Something went wrong loading this page." + secondary "Try again" calling `retry()`. Log `error` in a `useEffect` with `console.error`; never render it. **`(app)/loading.tsx`:** a `PageHeader`-height block and `Skeleton rows={5}`.
- [ ] **4h. Verify:** `bun test`, `bun run lint`, `bun run build`. Then, against a local backend (the controller's smoke setup, Task 14), sign in as demo and sign out once by hand or with a short Playwright script, and report what happened.

---

### Task 5: Home

**ACs:** AC-02.9 (empty state with action), AC-04.1 / AC-04.4 (list shows the latest flags; leaves on activity via revalidation), F-04 "First check pending." / "Nothing needs follow-up.", F-04 list fields and order, F-05 run summary and preview link, US-04.

**Files:** `src/app/(app)/page.tsx`, `src/components/applications/{follow-up-queue,upcoming-list,automation-panel,applications-table,application-cards,status-filter}.tsx`.

- [ ] **5a. Page:** `searchParams` → `status` (ignored unless one of the six). Header: `todayTitle(new Date(), me.timezone)`; subtitle from `quiet.length` and `upcoming.length`: "3 applications have gone quiet · 2 interviews in the next 7 days" (singular forms "1 application has gone quiet", "1 interview"; omit a zero half; omit the line when both are 0). The subtitle needs `quiet` and `upcoming` before streaming the sections: fetch both (deduped by `cache()`) at the top of the page; the sections below still each sit in `<Suspense>` so `applications` and `jobRuns` stream.
- [ ] **5b. Layout:** the `home.html` two-column grid (`desk:grid-cols-[minmax(0,1fr)_var(--spacing-rail)] wide:…rail-wide`, gap 32). Main column: Needs follow-up, then Applications. Rail: Next 7 days, then Automation.
- [ ] **5c. `FollowUpQueue`** (server): `SectionHead` "Needs follow-up", count, hint "Quiet after {me.quiet_threshold_days} days". Rows link to `/applications/{id}`: title "Company · role" (role muted, truncates), meta `StatusIndicator` · "Applied 12 Feb" from `date_applied` (omitted when it is null), `SilentBadge` with `days_since_activity`. Empty: `jobRuns.quiet_check === null` → `EmptyState` "First check pending." with body "The daily check hasn't run yet."; else "Nothing needs follow-up." with body "Every active application has recent activity." No action button in either.
- [ ] **5d. Applications section:** one `api.applications.list()` call (default sort). Counts per status from the full list; rows = filtered by `status` param, first 10. `SectionHead` "Applications" + link "View all {total}" to `/applications` (carrying `?status=` when set). `StatusFilter` (client; skill pattern with `router.push(…, { scroll: false })`, `role="group" aria-label="Filter by status"`, chips All + six, `aria-pressed`, counts). Then `ApplicationsTable` (desk) and `ApplicationCards` (mobile) — both server components reused in Task 6:
  - Table: `<th scope="col">` Company, Role, Status, Applied, Last activity. On home the headers are plain (no sorting); Task 6 passes sort props. Company cell links to the application; quiet rows get the `●` flagged mark with visually hidden text "Needs follow-up" (the prototype's `title` is not enough for screen readers).
  - Cards: company + compact `SilentBadge` when quiet, role, `StatusIndicator` + "Last activity {relativeActivity}" lowercased after the prefix ("Last activity today").
  - Empty (no applications at all): `EmptyState` "No applications yet" / "Log one to start tracking it." / action "Add your first application" → `/applications/new` (AC-02.9). Filtered empty: "No applications with this status." / action "Clear filter" → `/`.
- [ ] **5e. `UpcomingList`:** `SectionHead` "Next 7 days" + count; rows link to the application: the `when` column from `upcomingParts` (Today in accent, weight 600), stage name, "Company · role". Empty: "No interviews in the next 7 days." with no body action.
- [ ] **5f. `AutomationPanel`:** `SectionHead` "Automation"; `Panel padded` 13px muted: "Daily check: {jobRunText} · {formatDateTime(ran_at)}" (time omitted when never run), "Weekly digest: {jobRunText} · {time}", link "Preview digest →" to `/settings/digest-preview`. Shared with Settings (Task 13) as `JobRunSummary`.
- [ ] **5g. Suspense fallbacks** for the applications section, upcoming and automation use `Skeleton`. **Verify** lint and build.

---

### Task 6: Applications list

**ACs:** AC-02.8, AC-02.9, F-02 list columns, sort options and default; DESIGN_GUIDE §5 Large N.

**Files:** `src/app/(app)/applications/page.tsx`, `loading.tsx`, `src/components/applications/{sort-header,pagination}.tsx`, small additions to the table/cards for sort props.

- [ ] **6a.** `searchParams`: `status` (validated), `sort` ∈ `last_activity | date_applied` (default `last_activity`), `order` ∈ `asc | desc` (default `desc`), `page` (positive integer, default 1, clamped to the last page). One call `api.applications.list({ sort, order })`; counts from the full result; rows filtered by status then sliced 50 per page.
- [ ] **6b.** `PageHeader` "Applications", subtitle "{total} applications · {quietCount} quiet" (singulars; drop "· 0 quiet"). `StatusFilter` (resets `page`). Table headers "Applied" and "Last activity" are `SortHeader` links: `aria-sort` on the `th` (`ascending`/`descending`/`none`), arrow ↑/↓ on the active one, clicking the active header flips `order`, clicking the other sets it with `desc`; links keep `status` and drop `page`. On mobile, a compact "Sort: Last activity ↓ · Applied" link row above the cards gives the same options (cards have no headers).
- [ ] **6c.** `Pagination` below the panel when more than one page: "Previous" / "Next" secondary `sm` links plus "Page 2 of 10" (tabular numerals); hidden on a single page.
- [ ] **6d.** Empty and filtered-empty states as in 5d (Clear filter → `/applications`). `loading.tsx`: header block + chip row + `Skeleton rows={8}`.
- [ ] **6e. Verify** lint and build.

---

### Task 7: Add and edit application

**ACs:** AC-02.1, AC-02.2, AC-02.3, AC-02.4 (inline company name taken → offer existing), AC-02.5, AC-02.10 (status is a select of the six), F-02 URL / future date / currency rules, NFR-07, DESIGN_GUIDE §6 input preserved.

**Files:** `src/app/(app)/applications/new/page.tsx`, `loading.tsx`, `src/app/(app)/applications/[id]/edit/page.tsx`, `src/components/applications/application-form.tsx`, `src/actions/applications.ts`.

- [ ] **7a. Actions** (`'use server'`):
  - `createApplication(prev, formData)`: `requireSession`; `values = formValues(formData)`; `payload = applicationPayload(values, 'create')`; zod → errors + values. `api.applications.create`. Catch: `DUPLICATE_APPLICATION` → `{ duplicateOf: existingId, values }`; `COMPANY_NAME_TAKEN` → look up the name with `api.companies.list()` by `existingId` and return `{ existingCompany: { id, name }, errors: { 'company.name': [`A company named ${name} already exists.`] }, values }`; else `apiErrorState(error, values, 'Could not save the application. Try again.')`. Success: `revalidatePath('/', 'layout')` (refreshes home, lists and the nav badge), `redirect(`/applications/${created.id}`)`.
  - `updateApplication(id, prev, formData)` (bound with `.bind(null, id)` in the page): same, with `'update'` mode; no duplicate check exists on update (known open item 6), so no duplicate branch. Success: `revalidatePath('/', 'layout')`, redirect to the detail.
- [ ] **7b. `ApplicationForm`** (client, `useActionState`), props `mode`, `action`, `companies`, `initial?: ApplicationDetailResponse`, `timezone`. Field order and controls per the spec's "Add / edit application". Values come from `state.values ?? initial` so a failed save keeps every input. Specifics:
  - Company select: options from `companies` (alphabetical), plus on create a final option "New company…" (`value="__new__"`). Selecting it reveals a `Field name="company.name"`. The company select is the one **controlled** input (`useState`, re-initialised from `state.values?.company_id` in an effect whenever `state` changes); every other input is uncontrolled with `defaultValue` from `state.values ?? initial`. React 19 resets uncontrolled fields after each action completes, and they come back with the round-tripped `values`, so nothing typed is lost. When `state.existingCompany` is set, a secondary `sm` "Use {name}" button sets the select to that id, which hides the new-name field; the user then saves again.
  - Duplicate: when `state.duplicateOf` is set, a warn `InlineAlert` above the actions: "You already have an application for this role at this company." + link "View it" → `/applications/{duplicateOf}`, a primary "Save anyway" submit with `name="confirm_duplicate" value="true"`, and a ghost "Cancel" link back. While the alert shows, the normal Save button is not rendered (still one primary).
  - Status `<select>` with the six labels, default Applied (AC-02.1, AC-02.10); Work arrangement select with an empty "Not set" option; Date applied `type="date"` with `max` = today in `timezone` (a hint only; the backend is the authority); salary min/max `inputMode="numeric"` + currency `maxLength=3` uppercase hint "e.g. EUR"; textareas for job description (rows 8) and notes (rows 4).
  - `state.message` → danger `InlineAlert role="alert"`; `state.errors?._` (model-level) renders there too.
  - Submit primary "Save application" / pending "Saving…"; ghost "Cancel" link to the detail (edit) or `/applications` (create).
- [ ] **7c. Pages:** `new/page.tsx` fetches `companies` and `me` in parallel; `edit/page.tsx` parses the id with `parseId`, fetches the application (`ApiError` 404 → `notFound()`), companies and `me`. Titles: "Add application", "Edit application" with subtitle "{company} · {role}". `loading.tsx` for `new` (and the edit route is covered by `[id]/loading.tsx` from Task 8).
- [ ] **7d. Verify** `bun test` (payload/validation tests from Task 2 cover the mapping), lint, build.

---

### Task 8: Application detail (header, delete, details, job description, contacts)

**ACs:** AC-02.7 (delete with confirmation; cascade is the backend's), AC-03.2 (mismatch message), AC-03.3 (link once), AC-03.6, F-03 "No contacts linked.", AC-01.7 (404 → not-found page), DESIGN_GUIDE §4 page layout.

**Files:** `src/app/(app)/applications/[id]/page.tsx`, `loading.tsx`, `not-found.tsx`, `src/components/applications/delete-application.tsx`, `src/components/contacts/{linked-contacts,link-contact-form}.tsx`, `src/actions/applications.ts` (delete), `src/actions/contacts.ts` (link, unlink).

- [ ] **8a. Page data:** `parseId`; `Promise.all([api.applications.get(id), api.comparisons.get(id), api.auth.me()])`, catching `ApiError` 404 → `notFound()` (rethrow everything else). Then `api.companies.get(application.company.id)` for the company's contacts (linkable list). 
- [ ] **8b. Header:** `PageHeader` with `h1` "{company} · {role}" (company is a link to `/companies/{id}`; the full text wraps, no truncation in detail), subtitle row: `StatusIndicator`, `SilentBadge` when `is_quiet`, "Last activity {relativeActivity}". Actions: secondary "Edit" → `/edit`, `DeleteApplication`.
- [ ] **8c. `DeleteApplication`** (client): destructive button "Delete" opens `Dialog` "Delete this application?" with body "{company} · {role} and its interview stages and comparison will be permanently deleted." and actions ghost "Cancel" + `destructive-filled` "Delete application" (pending "Deleting…") submitting a form bound to `deleteApplication(id)`. Action: `requireSession`, `api.applications.remove(id)` (404 → treat as already deleted), `revalidatePath('/', 'layout')`, `redirect('/applications')`.
- [ ] **8d. Layout:** main column: Comparison (Task 10) and Interview stages (Task 9) — Dispatch E leaves two clearly marked slots in the page that Dispatch F fills — then a `<details>` "Job description" (summary 15px/600; body `whitespace-pre-wrap` 14px in a padded `Panel`; when empty: "No job description yet." with link "Add one" → edit). Rail: "Details" `DefinitionList` (Applied via `formatDateOnly`, Posting (external link, `rel="noopener noreferrer"`, `target="_blank"`), Location, Arrangement, Salary "100,000–150,000 EUR" using `Intl.NumberFormat('en-GB')` with a single value when only one bound is set, Source), then Notes (pre-wrap), then Contacts.
- [ ] **8e. Contacts:** `LinkedContacts` lists `application.contacts`: name (15px/500), title muted, email as `mailto:` link, LinkedIn link; each row has a ghost `sm` "Unlink" (a form bound to `unlinkContact(appId, contactId)`). Empty: "No contacts linked." Below, `LinkContactForm` (client, `useActionState`) with a select of `company.contacts` not already linked (hidden when none are left) and a secondary `sm` "Link"; then a link "Add contact" → `/contacts/new?company_id={companyId}&application_id={appId}`.
  - `linkContact(appId, prev, formData)`: `requireSession`, `contact_id` must be a positive integer, `api.contacts.link`; `CONTACT_COMPANY_MISMATCH` → `{ errors: { contact_id: ['This contact works at a different company.'] } }` (AC-03.2; unreachable from the select, but the action is a public endpoint); success → `revalidatePath(`/applications/${appId}`)` and `{ ok: true }`. Linking does not change activity (backend) so the home list is unaffected.
  - `unlinkContact(appId, contactId)`: `requireSession`, `api.contacts.unlink`, `revalidatePath(`/applications/${appId}`)`.
- [ ] **8f. `not-found.tsx`:** `EmptyState` "This application doesn't exist or was deleted." / action "Back to applications". **`loading.tsx`:** header block + two-column skeleton.
- [ ] **8g. Verify** lint, build.

---

### Task 9: Interview stages

**ACs:** AC-03.4, AC-03.5, F-03 "No interview stages yet.", stage name required, times entered and shown in the account's zone (NFR-08), AC-04.4 (adding a stage clears quiet; home revalidated).

**Files:** `src/components/stages/{stage-list,stage-form}.tsx`, `src/actions/stages.ts`, wired into the detail page.

- [ ] **9a. Actions** (`'use server'`, each starts with `requireSession`, each success calls `revalidatePath('/', 'layout')` because stage changes are activity that can clear a quiet flag):
  - `createStage(appId, prev, formData)` → zod, `stagePayload(…, 'create')`, `api.stages.create`; returns `{ ok: true }` (React 19 resets the uncontrolled form after the action, and with no `values` returned it comes back empty) or errors + values (which repopulate it).
  - `updateStage(appId, stageId, prev, formData)` → `'update'` mode; `{ ok: true }` closes the inline editor.
  - `deleteStage(appId, stageId)` and `moveStage(appId, stageId, direction)`: no state; rethrow non-ApiError; a 404 means it's already gone, then still revalidate.
- [ ] **9b. `StageList`** (client) props `appId`, `stages` (sorted by `position`), `timezone`. `useOptimistic(stages, (current, { id, direction }) => swap(current, id, direction))` where `swap` moves the stage one place and is exported from `src/lib/stages.ts` with a `bun test` (tests first: moving 3 up in [1,2,3] gives [1,3,2] (AC-03.4); moving the first up or the last down returns the same order). Move buttons call `startTransition(async () => { applyOptimistic(...); await moveStage(...) })`. Each `li`: name (15px/500), meta "{formatDateTime(scheduled_at, tz)} · {OUTCOME_LABEL}" (or "Not scheduled · Pending"), notes muted; buttons secondary `sm` "Move up" / "Move down" (`disabled` at the ends, with `aria-label` "Move {name} up"), ghost `sm` "Edit" (toggles an inline `StageForm` in edit mode in place of the row content) and ghost `sm` "Delete". Buttons wrap below the text on mobile so nothing overflows at 375px. Empty: "No interview stages yet."
- [ ] **9c. `StageForm`** (client): Name*, Scheduled (`datetime-local`, `defaultValue={toLocalInput(stage.scheduled_at, tz)}`, hint "In {timezone}"), Outcome select (on create the first option reads "Pending" with value `''`, which `stagePayload` omits so the backend default applies, AC-03.5; on edit the options are the three outcomes with the stored one selected), Notes. Create mode renders under the list headed "Add stage" with a secondary "Add stage" submit (the detail page's primary is Compare). Edit mode: secondary "Save stage" + ghost "Cancel".
- [ ] **9d. Verify** `bun test`, lint, build.

---

### Task 10: Comparison panel

**ACs:** AC-06.1 (shows Matched / Missing / percentage), AC-06.2 (listed once, by the backend), AC-06.5, AC-06.6, AC-06.7 (new run time shown), AC-06.8, F-06 run time shown.

**Files:** `src/components/comparison/{comparison-panel,compare-button}.tsx`, `src/actions/comparisons.ts`.

- [ ] **10a. Action** `runComparison(appId, prev, formData)` (`'use server'`): `requireSession`; `api.comparisons.run`; `RESUME_REQUIRED` → `{ message: 'Add your resume in Settings first.' }`, `JOB_DESCRIPTION_REQUIRED` → `{ message: 'Paste the job description first.' }` (the page was stale; the refreshed page will show the disabled state); success → `refresh()` from `next/cache` and `{ ok: true }`. Running a comparison is not activity, so no home revalidation.
- [ ] **10b. `ComparisonPanel`** (server) props `state: ComparisonStateResponse`, `appId`, `timezone`. `SectionHead` "Comparison". Inside one `Panel padded`:
  - Blocked (`blocked_reason` set): `CompareButton disabled` and, beside it, the reason text: `no_resume` → "Add your resume in Settings first." with "Settings" as a link to `/settings`; `no_job_description` → "Paste the job description first." with a link to the edit page. Map with a `BLOCKED_REASON_TEXT` record in `labels.ts` (add a test).
  - Never run and not blocked: one line "Compare this job description against your resume." + `CompareButton`.
  - Result: `is_stale` → warn `InlineAlert` "Resume or job description changed since this comparison." first. Then, when `match_percentage !== null`: "{pct}% match" at the page-title size, tabular numerals, then "{matched.length} of {requirement_count} requirements". When `null`: "No recognised requirements found." and no percentage. Then "Ran {formatDateTime(ran_at, tz)}" faint, then two lists side by side at desk and stacked on mobile: "Matched ({n})" and "Missing ({n})", each a `<ul>` of term names (14px; missing terms in `text`, the headings carry the meaning — no colored pills). Empty group shows "None". The `CompareButton` (label "Compare again") sits in the panel's head row.
- [ ] **10c. `CompareButton`** (client): `useActionState(runComparison.bind(null, appId), {})`; primary "Compare" / "Compare again", pending "Comparing…" with the in-button spinner; `disabled` prop for the blocked state (dimmed, `aria-describedby` pointing to the reason text id); `state.message` → danger text under it in a live region (`role="status"`).
- [ ] **10d. Verify** `bun test`, lint, build.

---

### Task 11: Companies

**ACs:** AC-02.4 (name taken → offer existing), AC-02.6, F-02 company view lists applications and contacts, delete with confirmation (cascades contacts), AC-03.1 (contact appears on the company view).

**Files:** `src/app/(app)/companies/{page,loading}.tsx`, `new/page.tsx`, `[id]/{page,loading,not-found}.tsx`, `[id]/edit/page.tsx`, `src/components/companies/{company-form,delete-company}.tsx`, `src/actions/companies.ts`.

- [ ] **11a. Actions:** `createCompany` (zod `companySchema`; `COMPANY_NAME_TAKEN` → field error on `name` "A company named {name} already exists." plus `existingCompany` so the form shows a "View {name}" link; success → `revalidatePath('/companies')`, redirect to the new company), `updateCompany(id, …)` (same name-taken branch; success → `revalidatePath('/', 'layout')` since company names appear on application rows; redirect to the company), `deleteCompany(id, prev, formData)` (`COMPANY_HAS_APPLICATIONS` → `{ message: "Delete or move this company's applications first." }`; success → `revalidatePath('/', 'layout')`, `redirect('/companies')`).
- [ ] **11b. List:** `PageHeader` "Companies", subtitle "{n} companies"; `RowList` sorted by name (case-insensitive) — primary name, meta website host (no protocol) or nothing. Empty: "No companies yet" / "Companies are added with an application or here." / action "Add company" → `/companies/new`. A secondary "Add company" link in the header actions when the list isn't empty.
- [ ] **11c. Detail:** `PageHeader` name, subtitle website link; actions secondary "Edit", `DeleteCompany`. Notes (pre-wrap) in a padded `Panel` when present. Sections: "Applications" (count; reuse `ApplicationsTable`/`ApplicationCards`; empty "No applications at this company."), "Contacts" (count; `RowList` rows → `/contacts/{id}/edit` with name and "title · email"; empty "No contacts yet."; section-head link "Add contact" → `/contacts/new?company_id={id}`).
- [ ] **11d. `DeleteCompany`** (client): destructive "Delete" → `Dialog`. With `applicationCount > 0`: heading "This company can't be deleted", body "Delete or move this company's applications first." and only a secondary "Close". Otherwise: heading "Delete this company?", body "{name} and its {n} contacts will be permanently deleted." (or "…will be permanently deleted." with no contacts), ghost "Cancel" + `destructive-filled` "Delete company"; `state.message` (the 409 race) shows inside the dialog as a danger `InlineAlert`.
- [ ] **11e. Form:** Name*, Website, Notes; primary "Save company"; ghost "Cancel". Pages: new, edit (404 → `notFound()`). `not-found.tsx`: "This company doesn't exist or was deleted."
- [ ] **11f. Verify** lint, build.

---

### Task 12: Contacts

**ACs:** AC-03.1, AC-03.6 (deleting removes links; backend), AC-03.7, F-03 contact fields and validation.

**Files:** `src/app/(app)/contacts/{page,loading}.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`, `[id]/not-found.tsx`, `src/components/contacts/contact-form.tsx`, `src/actions/contacts.ts` (create, update, delete).

- [ ] **12a. Actions:** `createContact(prev, formData)`: zod; `contactPayload('create')`; `api.contacts.create`; if the hidden `application_id` is a positive integer, `api.contacts.link(applicationId, contact.id)` next (a link failure after a successful create returns `{ message: 'The contact was saved but could not be linked. Link it from the application.' }` — never lose the created contact silently); success → `revalidatePath('/contacts')`, `revalidatePath(`/companies/${companyId}`)`, then redirect to the application when linking, else to the company. `updateContact(id, …)` → revalidate contacts, the company and `'/applications'` layout-wide (`revalidatePath('/', 'layout')`), redirect to `/contacts`. `deleteContact(id)` → delete, `revalidatePath('/', 'layout')`, `redirect('/contacts')`.
- [ ] **12b. List:** `PageHeader` "Contacts", subtitle "{n} contacts"; `RowList` from `api.contacts.list()` (already sorted): primary "name · title" (title muted), meta "{company_name} · {email}". Rows → edit page. Empty: "No contacts yet" / "Add the people you talk to at each company." / action "Add contact".
- [ ] **12c. Form:** Company* select (from `api.companies.list()`; when `company_id` is in `searchParams` it is preselected and rendered as read-only text plus a hidden input, since a contact belongs to one company; on edit the company is read-only text because `ContactUpdate` has no `company_id`), Name*, Title, Email (`type="email"`), LinkedIn URL, Notes; hidden `application_id` passthrough from `searchParams`. Primary "Save contact"; ghost "Cancel". Edit page adds a destructive `sm` "Delete contact" (immediate, a separate `<form>` so it isn't nested). With no companies at all, the new page shows `EmptyState` "Add a company first" / action "Add company".
- [ ] **12d. Verify** lint, build.

---

### Task 13: Settings and digest preview

**ACs:** AC-04.7 (Settings shows the failed run and its time), AC-04.9, F-04 "takes effect at the next daily run", AC-05.8 (preview page), F-05 run result wording, AC-06.9, F-06 resume text area, resume clearing (milestone 4 decision).

**Files:** `src/app/(app)/settings/{page,loading}.tsx`, `settings/digest-preview/{page,loading}.tsx`, `src/components/settings/{settings-form,resume-field,job-run-summary}.tsx`, `src/actions/settings.ts`.

- [ ] **13a. Action** `updateSettings(prev, formData)`: zod `settingsSchema`; `settingsPayload`; `api.settings.update`; validation errors (including the backend's `resume_tex` and `timezone` errors) back onto the fields with values; success → `revalidatePath('/', 'layout')` (threshold appears on home, time zone changes every date) and `{ ok: true }`; the form shows "Settings saved." in a `role="status"` live region next to the button (the change is otherwise invisible — no toast).
- [ ] **13b. Page:** `Promise.all([api.settings.get(), api.settings.jobRuns()])`. `PageHeader` "Settings", subtitle "{email}{is_demo ? ' · demo account' : ''}". Sections:
  - "Follow-up and time zone" + "Resume" inside one form (one primary "Save settings"): Quiet threshold (`type="number"`, `min=1 max=90 step=1`, hint "Applications with no activity for this many days need follow-up. Takes effect at the next daily check."); Time zone select (options: `'UTC'` first, then `Intl.supportedValuesOf('timeZone')` computed on the server, plus the saved value if it isn't in the list); `ResumeField` (client): `textarea` rows 16, monospace via a `--font-mono` token added in Task 3 if missing (report it), hint "Paste your LaTeX (.tex) source. Saving an empty box removes your resume.", live counter "{n} / 50,000 characters" from `codePointLength` (tabular numerals, `aria-live="polite"`, danger color over the limit; submit is still allowed so the server's error shows), the saved "Last saved {formatDateTime(resume_updated_at)}" when set.
  - "Automation": `JobRunSummary` for both runs (from Task 5), with "Preview digest →".
- [ ] **13c. Digest preview page:** `api.settings.digestPreview()` + `me`. `PageHeader` "Digest preview", subtitle: `would_send` → "This is what a digest sent now would contain." else "Nothing would be sent now: {skip_reason}." Then "Window: {formatDateTime(window_start)} – {formatDateTime(window_end)}". Sections "Needs follow-up" (rows: company · role, `StatusIndicator`, `SilentBadge`; link to `/applications/{application_id}`, not the email's absolute `url`) and "Interviews this week" (rows: stage name, "company · role", date and time). Each empty section says "Nothing to report." Back link "← Settings". Read-only; no send action.
- [ ] **13d. Verify** lint, build.

---

### Task 14: Docs, manual steps and the smoke script

**Files:** `docs/STATUS.md`, `README.md`, `MANUAL_STEPS.md`, `docs/design/DESIGN_GUIDE.md` §8, `frontend/scripts/smoke.mjs` (or `.ts`, run with `bun`), `docs/superpowers/specs/2026-11-05-milestone-5-frontend-design.md` (status line).

- [ ] **14a. Smoke script** (`frontend/scripts/smoke.ts`, run by the controller, not part of `bun test`): uses the preinstalled `playwright` (`require('playwright')`, `chromium.launch()`; never `playwright install`). Inputs from env: `BASE_URL` (default `http://localhost:3000`), `DEMO_EMAIL`, `DEMO_PASSWORD`, `OUT_DIR`. Steps: sign in with a wrong password (expect "Email or password is incorrect."); sign in as demo; visit `/`, `/applications`, `/applications?status=interviewing`, the first application with a comparison, its edit page, `/companies`, the first company, `/contacts`, `/settings`, `/settings/digest-preview`; on each, at viewports 375×812 and 1280×800, assert `document.documentElement.scrollWidth <= window.innerWidth` (NFR-03) and that exactly one `h1` exists, and save a screenshot (`deviceScaleFactor: 2`) to `OUT_DIR`; set an invalid `session` cookie and load `/` → expect to land on `/sign-in` with the cookie gone; sign out → expect `/sign-in`, then `/` redirects to `/sign-in`. Print a pass/fail line per check and exit non-zero on any failure.
- [ ] **14b. Docs:** `DESIGN_GUIDE.md` §8: the list now points to the milestone 5 design spec as the settled layout for those screens (digest email template: built in milestone 3). `MANUAL_STEPS.md`: a milestone 5 section — set `API_BASE_URL` on the frontend host (Vercel/Netlify) to the API's public URL; set the API's `APP_BASE_URL` to the frontend URL; the frontend must be served over HTTPS so the `Secure` cookie is stored. `README.md`: frontend run instructions (`bun install`, copy `.env.example` to `.env.local`, `bun run dev`), `bun test`, the Status section, and a v2 note that search is deliberately not built. `STATUS.md` is updated by the controller at the end (step 5 of the workflow), not here.
- [x] **14c. Spec status** (done by the controller with the plan): change the design spec's status line to "approved by owner (chat, 2026-11-05), with all three recommendations", and replace "the existing digest schema" under "Backend additions" with `UpcomingStageSummary` (no `url`).

---

## Self-review against the spec

| Spec item | Task |
|---|---|
| Architecture, api.ts, proxy, Server Actions | 2, 4 |
| snake_case field names, `company.name` | 2h, 2j, 7 |
| zod first pass, backend authority | 2j, every action |
| `bun test`, problem.ts split, contract fixture | 2a, 2c |
| types.ts from openapi.json | 2b |
| labels, format (zone-aware, datetime-local round trip, relative activity) | 2f, 2g |
| Expired session route | 2d, 4b |
| 50 per page, home top 10 | 5d, 6 |
| URL state for filter and sort | 5d, 6b |
| Optimistic stage reorder only; revalidation clears follow-ups | 9b, 7a, 9a |
| Confirmation only for application and company delete | 8c, 11d, 9b, 12c |
| Account label, quiet badge | 4f |
| Sign out in the Search slot | 4f |
| Every screen in "Screens" | 4–13 |
| Loading, error, not-found | 4g, 6d, 8f, 11e, 12, 13 |
| Backend endpoints + contract doc | 1 |
| Smoke run (375px, screenshots, stale cookie) | 14a |

**Adversarial pass over the plan's code (done before saving):**
- `api.ts` redirects only on `401 + UNAUTHENTICATED`, so `INVALID_CREDENTIALS` and `ACCOUNT_LOCKED` from `/auth/login` reach the sign-in action instead of bouncing to `/session-expired`. Logout opts out so sign-out with an already-expired session still clears the cookie and lands on `/sign-in`.
- `redirect()` inside `request()` throws inside callers' `try` blocks. Every catch rethrows non-`ApiError` (Global Constraints, `apiErrorState`, `signOut`).
- `proxy.ts` lets `/session-expired` through with or without a cookie, so the route always runs and always ends on `/sign-in`; with a stale cookie the chain is `/` → 401 → `/session-expired` (cookie deleted) → `/sign-in`, with no loop.
- `parseProblem` never throws on a non-JSON or malformed body; `res.json().catch(() => null)` feeds it `null`.
- `existing_id` is read only when it's an integer.
- `cache()` wraps only GETs, never mutations, and is request-scoped.
- `parseId` rejects `0`, negatives, decimals and non-digits before any API call.
- `settingsPayload` never sends `null` for `resume_tex` (the backend rejects it); an empty string clears.
- `applicationPayload('update')` never sends `company`/`confirm_duplicate`, which `ApplicationUpdate` doesn't accept; required fields (`role_title`, `status`, `company_id`) are never sent as `null` (the backend rejects null for them) — blank `role_title` is caught by zod first.
- `stagePayload('create')` omits a blank outcome so the backend default (Pending) applies.
- `revalidatePath('/', 'layout')` after every activity-producing mutation also refreshes the layout's quiet badge.
- `hasOwnPrimary` keeps one primary per screen; the duplicate-warning state swaps Save for "Save anyway" rather than adding a second primary; the stage form's submit is secondary because Compare is the detail page's primary.
- Two `nav` landmarks get distinct labels.
