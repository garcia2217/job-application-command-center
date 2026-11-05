# API Contract

The single source of truth for the contract between the FastAPI backend and the
Next.js frontend. Where this file and any pattern guide disagree, this file wins.
The full endpoint schema is machine-generated at `/openapi.json`; this file pins
only the decisions a schema can't express.

## Authentication

- **Opaque session tokens, not JWT.** Sign-in creates a DB-backed session
  (7 days, fixed expiry); sign-out deletes it, revoking immediately.
- `POST /auth/login` returns the session token and its expiry **in the response
  body**: `{ "token": "...", "expires_at": "<ISO 8601 UTC>" }`. The frontend's sign-in Server Action stores it as a first-party
  `session` cookie (httpOnly, SameSite=Lax, and Secure in production; it is not Secure under `NODE_ENV` other than `production`, so local http works) on the Next.js domain.
- Every other endpoint expects the token via the `Cookie: session=<token>`
  header, forwarded by the frontend API client. Invalid, expired, or revoked
  sessions get `401`.
- No `WWW-Authenticate` header is sent — this is cookie auth, not Bearer.
- The browser never calls the backend directly; all calls go through the
  Next.js server (`src/lib/api.ts`, server-only).
- `POST /jobs/quiet-check` and `POST /jobs/digest` are called by Upstash QStash schedules and authenticated by signature only; the frontend never calls them.

## Error responses

Every error is `application/problem+json` with the minimal shape:

```json
{
  "type": "https://example.com/errors/validation-failed",
  "title": "Request validation failed",
  "status": 422,
  "detail": "1 field(s) failed validation",
  "code": "VALIDATION_FAILED",
  "errors": [
    { "location": "body", "field": "role_title", "message": "Field required", "type": "missing" }
  ]
}
```

- `errors` is present only on validation failures and is **an array of
  objects** (`location`, `field`, `message`, `type`), matching FastAPI's
  normalized validation output. `field` uses the backend's snake_case names.
- No `instance` or `request_id` fields in the MVP.
- The frontend maps `errors[]` into `Record<string, string[]>` (grouped by
  `field`) for next-to-the-field rendering (NFR-07).
- Clients branch on `code`, never on `detail` text. `detail` may be shown to
  users; it never contains stack traces or internals.

## Error codes

Codes are part of the contract: renaming or reusing one is a breaking change.
Initial set (grows as features land; keep this list current):

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 422 | One or more fields failed validation (`errors[]` present) |
| `UNAUTHENTICATED` | 401 | Missing, invalid, expired, or revoked session |
| `INVALID_CREDENTIALS` | 401 | Sign-in failed (never says which field was wrong) |
| `ACCOUNT_LOCKED` | 401 | 5 failed sign-ins within 15 minutes (F-01) |
| `NOT_FOUND` | 404 | Record absent — or owned by another account (AC-01.7) |
| `CONFLICT` | 409 | Generic state conflict |
| `COMPANY_NAME_TAKEN` | 409 | Company name exists case-insensitively (AC-02.4) |
| `COMPANY_HAS_APPLICATIONS` | 409 | Company deletion refused while it has applications (AC-02.6) |
| `DUPLICATE_APPLICATION` | 409 | Same company + role title exists; resend with `confirm_duplicate: true` to save anyway (AC-02.5) |
| `CONTACT_COMPANY_MISMATCH` | 409 | Contact and application belong to different companies (AC-03.2) |
| `RESUME_REQUIRED` | 409 | Compare run with no saved resume (AC-06.6) |
| `JOB_DESCRIPTION_REQUIRED` | 409 | Compare run on an application with no job description text (AC-06.6) |
| `INVALID_JOB_SIGNATURE` | 401 | `/jobs/*` called without a valid QStash `Upstash-Signature` (these routes are never session-authenticated) |
| `HTTP_ERROR` | 4xx | HTTP-level error outside the domain codes (e.g. 405 from routing) |
| `INTERNAL_ERROR` | 500 | Unexpected failure; generic body only |

### Extension members

`COMPANY_NAME_TAKEN` and `DUPLICATE_APPLICATION` responses carry `existing_id`
(integer id of the existing company / application) as an RFC 9457 extension
member, so the client can offer the existing record. No other extension members
exist in the MVP.

## Wire values

- Field names are **snake_case** in requests, responses, and `errors[].field`.
- Enums serialize **lowercase**: statuses `wishlist | applied | interviewing |
  offer | rejected | withdrawn`, stage outcomes `pending | passed | failed`,
  work arrangements `on_site | hybrid | remote`. Display casing ("Wishlist",
  "On-site") is a frontend concern.
- Timestamps are ISO 8601 in UTC; the frontend renders them in the account's
  time zone (NFR-08).
- Naive datetimes sent for `scheduled_at` are interpreted in the account's time
  zone; aware datetimes are converted. Responses are always UTC.
- `GET /applications` accepts `status=<enum>`, `sort=last_activity|date_applied`
  (default `last_activity`) and `order=asc|desc` (default `desc`); nulls sort
  last. There is no pagination in the MVP.
- Deleting an application or company needs a confirmation step in the UI; the
  API deletes on the first call.
- `GET /applications` also accepts `quiet=true|false`. With `quiet=true` and no explicit `order`, results are oldest-activity-first (the Needs follow-up list). Every summary carries `days_since_activity` (whole days, computed at response time).
- Job run statuses serialize as `succeeded | skipped | not_sent | failed`; job types as `quiet_check | digest`. `GET /settings/job-runs` returns `{quiet_check, digest}` (each `JobRun` or `null` when that job has never run; the frontend shows `quiet_check: null` as "First check pending." (PRD F-04) and `digest: null` as "No digest run yet."). `GET /settings/digest-preview` returns exactly what a send now would contain plus `would_send` and `skip_reason`.
- `GET /contacts` lists the account's contacts sorted by name (case-insensitive), each with `company_name`. `GET /stages/upcoming` lists stages scheduled in `[now, now + 7 days)`, soonest first, as `{application_id, company, role_title, stage_name, scheduled_at}`. Unlike the digest preview's window, this one starts now.
- `GET /settings` returns the account settings including `resume_tex` and `resume_updated_at`. `/auth/me` carries `has_resume` but never the resume itself.
- `resume_tex` is limited to 50,000 characters counted as Unicode code points (the frontend must count with `[...text].length`, not `.length`). An empty or blank `resume_tex` clears the resume.
- `GET /applications/{id}/comparison` always returns 200 with `{ "blocked_reason": "no_resume" | "no_job_description" | null, "comparison": {...} | null }`; the saved comparison is returned even when blocked. `POST` returns the same body with the fresh comparison on success, and `409` when blocked, with `code` matching `blocked_reason` (`RESUME_REQUIRED` for `no_resume`, `JOB_DESCRIPTION_REQUIRED` for `no_job_description`). The comparison carries `matched`, `missing`, `requirement_count`, `match_percentage`, `ran_at` and `is_stale`.
- `match_percentage: null` means "No recognised requirements found". `is_stale` drives the "Resume or job description changed since this comparison" notice. `matched` and `missing` are alphabetical canonical term names.

## Frontend types

`frontend/src/lib/types.ts` is hand-written but **derived from `/openapi.json`**,
never from memory — spot-checked against the live schema at each milestone.
Field names cross the boundary as snake_case (as the backend emits them).

## Enforcement

A shared JSON fixture (canonical error response) is asserted by a backend test
(handler produces it) and a frontend test (`api.ts` parses it into the expected
`FieldErrors`). Added in milestones 1–2; prose describes the contract, the
fixture enforces it.
