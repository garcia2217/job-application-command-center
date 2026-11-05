# Forms, Server Actions, and Optimistic Updates

Every mutation in this app follows these patterns. Verified against Next.js 16.3.5 and React 19 docs.

## The shape of an action

Actions live in `src/actions/<resource>.ts`, one file per resource, `'use server'` at the top of the file.

An action used with `useActionState` takes `(prevState, formData)` — the state argument comes **first**.

```ts
// src/actions/applications.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { requireSession } from '@/lib/session'

// Field names are snake_case end to end (docs/API_CONTRACT.md): form input
// names match API field names, so backend errors[] keys map onto local Zod
// errors with no translation layer.
const ApplicationSchema = z
  .object({
    company_id: z.string().min(1, { error: 'Choose or create a company.' }),
    role_title: z.string().min(1, { error: 'Role title is required.' }).trim(),
    status: z.enum([
      'wishlist',
      'applied',
      'interviewing',
      'offer',
      'rejected',
      'withdrawn',
    ]),
    posting_url: z.url({ error: 'Enter a valid http(s) URL.' }).optional().or(z.literal('')),
    salary_min: z.coerce.number().int().nonnegative().optional(),
    salary_max: z.coerce.number().int().nonnegative().optional(),
  })
  .refine((d) => !d.salary_min || !d.salary_max || d.salary_min <= d.salary_max, {
    error: 'Minimum salary cannot be higher than the maximum.',
    path: ['salary_min'],
  })

export type ApplicationFormState = {
  errors?: Record<string, string[]>
  message?: string
  values?: Record<string, string>
}

export async function createApplication(
  _prevState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  await requireSession()

  const raw = Object.fromEntries(formData) as Record<string, string>
  const parsed = ApplicationSchema.safeParse(raw)

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      values: raw, // preserve what the user typed
    }
  }

  try {
    await api.applications.create(parsed.data)
  } catch (error) {
    if (error instanceof ApiError && error.fieldErrors) {
      // Backend validation (e.g. duplicate company name) — same shape, same rendering.
      return { errors: error.fieldErrors, values: raw }
    }
    if (error instanceof ApiError && error.status === 401) redirect('/sign-in')
    return { message: 'Could not save the application. Try again.', values: raw }
  }

  revalidatePath('/applications')
  redirect('/applications') // must come after revalidatePath — redirect throws
}
```

Key points:

- **Expected errors are return values.** Never `throw` for validation — a throw hits `error.tsx` and destroys the user's form.
- **Backend field errors get the same shape as local ones**, so the form renders both identically. The FastAPI side owns the real rules (uniqueness, cross-field); Zod here is a fast first pass, not the authority.
- **`values` round-trips the input** so a failed save doesn't clear the form (PRD §F-02 edge cases).
- `requireSession()` first, always. Actions are reachable by direct POST.

## The form

```tsx
// src/components/application-form.tsx
'use client'

import { useActionState } from 'react'
import { createApplication, type ApplicationFormState } from '@/actions/applications'

const initialState: ApplicationFormState = {}

export function ApplicationForm({ companies }: { companies: Company[] }) {
  const [state, formAction, pending] = useActionState(createApplication, initialState)

  return (
    <form action={formAction} noValidate>
      <Field
        label="Role title"
        name="role_title"
        defaultValue={state.values?.role_title}
        errors={state.errors?.role_title}
        required
      />
      <Field
        label="Company"
        name="company_id"
        as="select"
        options={companies}
        defaultValue={state.values?.company_id}
        errors={state.errors?.company_id}
        required
      />

      {state.message && (
        <InlineAlert tone="danger" role="alert">
          {state.message}
        </InlineAlert>
      )}

      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save application'}
      </button>
    </form>
  )
}
```

`useActionState` returns a **three-tuple**: `[state, formAction, pending]`. Use the third element for pending state — don't reach for `useFormStatus` unless the submit button is a separate component that can't see `pending`.

### The Field component

Per NFR-07, every error renders next to its field. Build this once:

```tsx
export function Field({ label, name, errors, defaultValue, ...props }: FieldProps) {
  const errorId = `${name}-error`
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        {...props}
      />
      {errors?.map((error) => (
        <p key={error} id={errorId} className="field-error">
          {error}
        </p>
      ))}
    </div>
  )
}
```

`aria-invalid` and `aria-describedby` are required, not optional polish — a screen reader user otherwise gets no indication the field failed.

`noValidate` on the `<form>` suppresses browser-native validation bubbles so our messages are the only ones shown. Keep `required` on the input for semantics.

## Optimistic updates

Used where the PRD demands an immediate change: a quiet application leaving the Needs follow-up list on new activity (F-04), and stage reordering (AC-03.4).

**Scope guard:** there is no dedicated "dismiss" or "mark followed up" endpoint — F-04 removes an application from the list only when it has *real* new activity (an application edit, status change, or stage change). `dismissFollowUp` below stands in for whatever activity-recording action the UI actually offers (per the PRD flow, the entry links to the application and the owner updates it there). The point of the example is the `useOptimistic` + `startTransition` pattern, not the endpoint.

```tsx
'use client'

import { useOptimistic, startTransition } from 'react'
import { dismissFollowUp } from '@/actions/applications'

export function FollowUpQueue({ items }: { items: FollowUp[] }) {
  const [optimisticItems, removeOptimistic] = useOptimistic(
    items,
    (current, removedId: string) => current.filter((i) => i.id !== removedId),
  )

  if (optimisticItems.length === 0) {
    return <EmptyState>Nothing needs follow-up.</EmptyState>
  }

  return (
    <ul>
      {optimisticItems.map((item) => (
        <li key={item.id}>
          <FollowUpRow item={item} />
          <button
            onClick={() => {
              startTransition(async () => {
                removeOptimistic(item.id)
                await dismissFollowUp(item.id)
              })
            }}
          >
            Mark followed up
          </button>
        </li>
      ))}
    </ul>
  )
}
```

The optimistic update must happen **inside** `startTransition`, and the action call goes in the same transition. If the action fails, React reverts to the server state automatically — which is why the action should still `revalidatePath` on success.

## Delete with confirmation

The PRD requires confirmation for deleting an application (cascades to stages and comparison) and for deleting a company. Everything else reversible should use undo instead — see DESIGN_GUIDE §6.

```tsx
'use client'

export function DeleteApplication({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(deleteApplication, {})

  return (
    <>
      <button onClick={() => setOpen(true)}>Delete</button>
      {open && (
        <Dialog onClose={() => setOpen(false)} labelledBy="delete-heading">
          <h2 id="delete-heading">Delete this application?</h2>
          <p>
            {name} and its interview stages and comparison will be permanently
            deleted.
          </p>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={pending}>
              Delete application
            </button>
          </form>
        </Dialog>
      )}
    </>
  )
}
```

The confirm button names the action — "Delete application", never "OK" or "Confirm".

## Sign-in and sign-out

The backend validates credentials and returns the session; Next sets the cookie.

```ts
// src/actions/auth.ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { api, ApiError } from '@/lib/api'

export async function signIn(_prevState: SignInState, formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    // No sign-in attempt is counted for empty fields (F-01).
    return { errors: { form: ['Enter your email and password.'] } }
  }

  let session: { token: string; expires_at: string }
  try {
    session = await api.auth.signIn({ email, password })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'ACCOUNT_LOCKED') {
      return { errors: { form: ['Too many attempts. Try again in 15 minutes.'] } }
    }
    // Generic message — never reveal which field was wrong (AC-01.2).
    return { errors: { form: ['Email or password is incorrect.'] } }
  }

  const cookieStore = await cookies()
  cookieStore.set('session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(session.expires_at), // 7 days, set by the backend
  })

  redirect('/')
}

export async function signOut() {
  await api.auth.signOut().catch(() => {}) // best effort; cookie clears regardless
  const cookieStore = await cookies()
  cookieStore.delete('session')
  redirect('/sign-in')
}
```

Cookie options are non-negotiable: `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `secure` in production. Expiry comes from the backend so the cookie and the server session agree on the 7-day window (AC-01.5).

## Filters and URL state

Status filters belong in the URL, not component state — so the view is linkable, survives refresh, and the back button works.

```tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export function StatusFilter({ counts }: { counts: Record<string, number> }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = searchParams.get('status') ?? 'all'

  function select(status: string) {
    const params = new URLSearchParams(searchParams)
    if (status === 'all') params.delete('status')
    else params.set('status', status)
    router.push(`${pathname}?${params}`, { scroll: false })
  }

  return (
    <div role="group" aria-label="Filter by status">
      {STATUSES.map((s) => (
        <button
          key={s.value}
          type="button"
          aria-pressed={active === s.value}
          onClick={() => select(s.value)}
        >
          {s.label} <span>{counts[s.value]}</span>
        </button>
      ))}
    </div>
  )
}
```

The page then reads `searchParams` (a Promise) and passes the filter to the API:

```tsx
export default async function ApplicationsPage({
  searchParams,
}: PageProps<'/applications'>) {
  const { status } = await searchParams
  const applications = await api.applications.list(status)
  // …
}
```

A component calling `useSearchParams()` must be wrapped in `<Suspense>` by its parent, or the whole route opts out of prerendering.

## Checklist for any form

- [ ] Action starts with `requireSession()`
- [ ] Validation errors returned, never thrown
- [ ] Errors render next to their field with `aria-invalid` + `aria-describedby`
- [ ] User input preserved on failure via `values`
- [ ] Submit button disabled while `pending`, with a label change
- [ ] `revalidatePath` before `redirect`
- [ ] Backend field errors render the same way as client-side ones
- [ ] Destructive confirm buttons name the action
