---
name: nextjs-patterns
description: Next.js 16 App Router patterns for this project — Server/Client component boundary, the typed API client against the FastAPI backend, session cookie forwarding, Server Actions with field-level validation errors, optimistic updates, loading/error/not-found conventions, and the caching model. Use this skill whenever building, reviewing, refactoring, or debugging anything in `frontend/`, including pages, layouts, components, forms, data fetching, mutations, auth-gated routes, or route handlers — even if the request only says "the UI", "the frontend", or names a screen.
metadata:
  origin: project
---

# Next.js Patterns — Job Application Command Center

App Router patterns for **this** project. Verified against the Next.js 16.3.5 docs (docs last updated 2026-08-25), not from memory.

Target stack: Next.js 16.3.5, React 19.2.8, TypeScript strict, Tailwind 4, bun.

**Scope boundary:** this skill covers frontend *architecture*. Visual design — tokens, components, spacing, layout, states — lives in `docs/design/DESIGN_GUIDE.md` and `docs/design/home.html`. Product behavior lives in `docs/PRD.md`. Don't duplicate or contradict those here.

## Reference files (read when relevant)

| File | Read when |
| --- | --- |
| `references/forms-and-actions.md` | Building any form, Server Action, validation, optimistic update, or pending state. Every mutation in this app goes through those patterns. |

## Core rules

1. **Server Components by default.** `"use client"` only for state, event handlers, effects, or browser APIs — and push it to the smallest leaf that needs it.
2. **All backend calls go through `src/lib/api.ts`.** No scattered `fetch` with hand-typed responses. The API client is the only thing that knows the backend URL, forwards the session cookie, and maps errors.
3. **Do not enable `cacheComponents`.** See [Caching](#caching-do-not-over-engineer-this).
4. **Every Server Action re-verifies auth.** Server Actions are reachable by direct POST, not just through your UI.
5. **Every route segment that fetches gets a `loading.tsx`.** The API sleeps on Render's free tier (NFR-02); a cold start with no skeleton looks broken.
6. **TypeScript strict, no `any`** unless justified with a comment. Named exports except where Next requires a default (`page`, `layout`, `loading`, `error`, `not-found`, `proxy`).

## Next.js 16 API changes — do not write these from memory

These differ from Next.js 13–15 and from most training data. Getting them wrong produces code that compiles but misbehaves, or fails to build.

| Thing | Next 16 truth |
| --- | --- |
| `middleware.ts` | **Renamed to `proxy.ts`**, exporting `export default async function proxy(req: NextRequest)`. Runs on the Node.js runtime. |
| `error.tsx` props | `{ error, retry }` — **`retry`, not `reset`**. |
| `fetch` caching | **Not cached by default.** Opt in per call with `{ cache: 'force-cache' }`. (The old "cached by default" behavior is gone.) |
| `params` / `searchParams` | **Promises.** `const { id } = await params`. |
| `cookies()` / `headers()` | **Async.** `const cookieStore = await cookies()`. |
| Router refresh after mutation | `refresh()` imported from `next/cache`, called inside a Server Action. Does **not** revalidate tagged data. |
| Route type helpers | `PageProps<'/applications/[id]'>` and `LayoutProps<'/applications/[id]'>` are globally available — use them instead of hand-writing param types. |
| Component-level error boundary | `catchError` from `next/error`. |
| Cache Components / `use cache` | Opt-in via `cacheComponents: true`. **We do not use it.** |

If you need an API not listed here and you are not certain of its current shape, fetch the docs. `https://nextjs.org/docs/llms.txt` indexes everything; pages accept `Accept: text/markdown`.

## Architecture

The frontend is a **thin client over the FastAPI backend**. It owns no business logic and talks to no database. Every rule below follows from that.

```
frontend/src/
├── app/
│   ├── layout.tsx              # root: <html>, fonts, globals.css
│   ├── globals.css             # Tailwind + @theme tokens (DESIGN_GUIDE §2)
│   ├── (auth)/
│   │   └── sign-in/page.tsx    # public
│   └── (app)/                  # authed shell: sidebar + top bar
│       ├── layout.tsx
│       ├── page.tsx            # home — the Needs follow-up screen
│       ├── loading.tsx
│       ├── error.tsx
│       ├── applications/
│       │   ├── page.tsx
│       │   ├── new/page.tsx
│       │   └── [id]/
│       │       ├── page.tsx
│       │       ├── loading.tsx
│       │       └── not-found.tsx
│       ├── companies/…
│       ├── contacts/…
│       └── settings/page.tsx
├── components/                 # DESIGN_GUIDE §3 components
├── lib/
│   ├── api.ts                  # THE typed API client
│   ├── session.ts              # cookie read/set/delete
│   └── types.ts                # shared response types
└── actions/                    # Server Actions, grouped by resource
    ├── applications.ts
    ├── companies.ts
    └── auth.ts
```

Route groups `(auth)` and `(app)` don't appear in URLs; they exist so the authed shell layout wraps only authed routes.

## The API client

One module. It is the project's data access layer. Response and error shapes
follow `docs/API_CONTRACT.md` — the backend sends field errors as an **array**
of `{ location, field, message, type }`, which this client maps into
`FieldErrors` for rendering, and every error carries a stable `code` that
callers branch on (never on message text).

```ts
// src/lib/api.ts
import 'server-only'
import { cookies } from 'next/headers'

const BASE_URL = process.env.API_BASE_URL! // server-only, never NEXT_PUBLIC_

export type FieldErrors = Record<string, string[]>

type ProblemFieldError = {
  location: string
  field: string | null
  message: string
  type: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message)
  }
}

// Backend errors[] is an array (see docs/API_CONTRACT.md); group by field
// so form components can look errors up by name.
function toFieldErrors(errors?: ProblemFieldError[]): FieldErrors | undefined {
  if (!errors?.length) return undefined
  const out: FieldErrors = {}
  for (const e of errors) {
    const key = e.field ?? '_'
    ;(out[key] ??= []).push(e.message)
  }
  return out
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = (await cookies()).get('session')?.value

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(session ? { cookie: `session=${session}` } : {}),
      ...init.headers,
    },
    // Next 16 does not cache fetch by default; this is here as documentation
    // of intent, since every response in this app is per-account and private.
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      res.status,
      body.code ?? 'HTTP_ERROR',
      body.detail ?? 'Request failed',
      toFieldErrors(body.errors),
    )
  }

  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  applications: {
    list: (status?: string) =>
      request<Application[]>(`/applications${status ? `?status=${status}` : ''}`),
    get: (id: string) => request<Application>(`/applications/${id}`),
    create: (data: ApplicationInput) =>
      request<Application>('/applications', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<void>(`/applications/${id}`, { method: 'DELETE' }),
  },
  followUps: {
    list: () => request<FollowUp[]>('/follow-ups'),
  },
  // …one namespace per resource
}
```

Rules:

- `import 'server-only'` at the top. This module reads cookies and the API base URL; it must never reach the client bundle.
- `API_BASE_URL` is **not** `NEXT_PUBLIC_`. The browser never talks to the API directly.
- The backend owns authorization. A 404 from the backend for another account's record (AC-01.7) is a real 404 — surface it with `notFound()`.
- Never `catch` and return `null` from the client to paper over an error. Let it throw; the caller decides.

## Fetching data

In Server Components, call the API client directly. No `useEffect`, no SWR, no react-query.

```tsx
// app/(app)/applications/[id]/page.tsx
import { notFound } from 'next/navigation'
import { api, ApiError } from '@/lib/api'

export default async function ApplicationPage({
  params,
}: PageProps<'/applications/[id]'>) {
  const { id } = await params

  try {
    const application = await api.applications.get(id)
    return <ApplicationDetail application={application} />
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error // real failures bubble to error.tsx
  }
}
```

**Deduplicate** within a render pass with React's `cache` when two components need the same record:

```ts
// src/lib/api.ts
import { cache } from 'react'
export const getApplication = cache((id: string) =>
  request<Application>(`/applications/${id}`),
)
```

**Parallel fetches** — don't await sequentially when the calls are independent:

```tsx
const [followUps, upcoming] = await Promise.all([
  api.followUps.list(),
  api.stages.upcoming(),
])
```

**Stream slow sections.** The home screen's three sections are independent; don't let the slowest block the others:

```tsx
export default function HomePage() {
  return (
    <>
      <PageHeader />
      <Suspense fallback={<QueueSkeleton />}>
        <FollowUpQueue />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <ApplicationsTable />
      </Suspense>
    </>
  )
}
```

## Auth and sessions

The **FastAPI backend owns authentication**: it validates credentials, applies lockout, and issues the session. Next.js holds the cookie and forwards it. Do not re-implement session logic here.

```ts
// src/lib/session.ts
import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

export const requireSession = cache(async () => {
  const session = (await cookies()).get('session')?.value
  if (!session) redirect('/sign-in')
  return session
})
```

Three rules, in order of importance:

1. **Check close to the data, not in the layout.** A layout does not control whether nested segments render, and it does not re-run on client-side navigation. The real gate is the backend returning 401; the `requireSession()` call in each page is a fast path, not the security boundary.
2. **`proxy.ts` is an optimistic redirect only.** Use it to bounce cookie-less requests away from `(app)` routes so users don't see a flash of empty shell. Read the cookie's presence only — no backend calls, since it runs on every request including prefetches.
3. **A 401 anywhere means redirect to sign-in.** Catch `ApiError` with status 401 at the page level and `redirect('/sign-in')`.

```ts
// proxy.ts  (project root — NOT middleware.ts)
import { NextRequest, NextResponse } from 'next/server'

export default async function proxy(req: NextRequest) {
  const hasSession = req.cookies.has('session')
  const { pathname } = req.nextUrl

  if (!hasSession && pathname !== '/sign-in') {
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

Sign-in and sign-out set and clear the cookie in a Server Action — see `references/forms-and-actions.md`.

## Mutations

Full patterns in `references/forms-and-actions.md`. The essentials:

- Mutations are **Server Actions** in `src/actions/*.ts`, files starting with `'use server'`.
- Every action calls `requireSession()` first. Server Actions are public POST endpoints.
- **Expected errors are return values, not throws.** Validation failures return `{ errors: { field: [...] } }` for `useActionState`. Only unexpected failures throw.
- After a successful mutation: `revalidatePath(...)`, then `redirect(...)` if navigating. `redirect` throws a control-flow exception, so call `revalidatePath` **before** it.
- Use `refresh()` from `next/cache` when you want the current page's server data re-rendered without changing routes.

## Caching — do not over-engineer this

**Do not set `cacheComponents: true`.** Every page in this app is behind a session and shows one account's private data. Partial Prerendering, `use cache`, `cacheLife`, and `use cache: private` exist to make *shared or static* content fast. Here they would add Suspense-boundary requirements and cache-key reasoning for zero benefit, and risk the worst possible bug in a job tracker: one account seeing another's data.

The rules that follow:

- `fetch` is uncached by default in Next 16. That is exactly what we want. Don't add `force-cache`.
- Don't use `unstable_cache`, `cacheTag`, or `cacheLife`.
- Do use React `cache()` for per-render deduplication — that's request-scoped memoization, not a cache.
- `revalidatePath()` after mutations exists to clear the **client router cache** so navigating back shows fresh data.

The only thing worth optimizing is perceived latency from Render's cold start, and the tool for that is `loading.tsx` + `<Suspense>`, not caching.

## Loading, error, and not-found

```tsx
// app/(app)/applications/loading.tsx — skeleton matching the real layout
export default function Loading() {
  return <ApplicationsTableSkeleton />
}
```

Skeletons mirror the real row height (60px per DESIGN_GUIDE §3) so the page doesn't jump. No spinners for list content; spinners only inside buttons.

```tsx
// app/(app)/error.tsx
'use client' // error boundaries must be Client Components

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <InlineAlert tone="danger">
      <p>Something went wrong loading this page.</p>
      <button onClick={() => retry()}>Try again</button>
    </InlineAlert>
  )
}
```

Note the prop is **`retry`**, not `reset`. Never render `error.message` to the user — NFR-07 forbids raw errors in the UI. Log it in an effect if you need it.

`not-found.tsx` per segment handles `notFound()` from a 404. Copy comes from the PRD.

## Component boundary in practice

Applied to the screens in this app:

| Piece | Type | Why |
| --- | --- | --- |
| Page, layout, sidebar, top bar | Server | No interactivity |
| Follow-up queue, applications table rows | Server | Rendered data + `<Link>` |
| Status filter chips | Client | `onClick`, URL state |
| Application form | Client | `useActionState` |
| Delete confirmation dialog | Client | Open/close state |
| Stage reorder controls | Client | `useOptimistic` |
| Digest preview | Server | Static render of API data |

Patterns that keep the client bundle small:

- Pass Server Components as `children` into a Client Component rather than importing them into it. A `<Dialog>` can be a Client Component whose contents are server-rendered.
- Marking a file `"use client"` pulls **everything it imports** into the client bundle. Put the directive on the leaf, not the page.
- Props crossing to a Client Component must be serializable. Pass plain data, not class instances or `Date` methods.
- React Context is unavailable in Server Components. This app needs none — pass props.

## Anti-patterns

```tsx
// Bad: client-side fetching in an RSC app.
'use client'
useEffect(() => { fetch('/api/applications').then(setApps) }, [])

// Good: fetch in the Server Component.
const applications = await api.applications.list()
```

```tsx
// Bad: "use client" at the top of the page to make one chip interactive.
// Drags the whole table into the client bundle.

// Good: page stays a Server Component; only StatusFilter is a Client Component.
```

```ts
// Bad: throwing validation errors from a Server Action.
if (!title) throw new Error('Role title is required') // → hits error.tsx, loses the form

// Good: return them as state for useActionState.
if (!title) return { errors: { roleTitle: ['Role title is required'] } }
```

```ts
// Bad: redirect before revalidate — redirect throws, so this never runs.
redirect('/applications')
revalidatePath('/applications')

// Good.
revalidatePath('/applications')
redirect('/applications')
```

```ts
// Bad: trusting the client. Server Actions are reachable by direct POST.
export async function deleteApplication(id: string) {
  'use server'
  await api.applications.remove(id)
}

// Good: verify first.
export async function deleteApplication(id: string) {
  'use server'
  await requireSession()
  await api.applications.remove(id)
}
```

```ts
// Bad: exposing the API to the browser.
NEXT_PUBLIC_API_BASE_URL=...   // browser can now call the backend directly

// Good: server-only env var; the browser only ever talks to Next.
API_BASE_URL=...
```

## Checklist

Before calling frontend work done:

- [ ] `bun run lint` and `bun run build` both pass
- [ ] No `any` without a justifying comment
- [ ] `"use client"` appears only on leaves that need it
- [ ] All backend calls go through `src/lib/api.ts`
- [ ] Every Server Action calls `requireSession()` first
- [ ] Every fetching segment has `loading.tsx`; every risky one has `error.tsx`
- [ ] Validation errors render next to their field (NFR-07)
- [ ] User input survives a failed submit
- [ ] Usable at 375px with no horizontal page scroll (NFR-03)
- [ ] Components and tokens match `docs/design/DESIGN_GUIDE.md`
