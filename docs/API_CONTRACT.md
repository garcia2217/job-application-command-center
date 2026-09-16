# API Contract

The single source of truth for the contract between the FastAPI backend and the
Next.js frontend. Where this file and any pattern guide disagree, this file wins.
The full endpoint schema is machine-generated at `/openapi.json`; this file pins
only the decisions a schema can't express.

## Authentication

- **Opaque session tokens, not JWT.** Sign-in creates a DB-backed session
  (7 days, fixed expiry); sign-out deletes it, revoking immediately.
- `POST /auth/login` returns the session token and its expiry **in the response
  body**. The frontend's sign-in Server Action stores it as a first-party
  `session` cookie (httpOnly, Secure, SameSite=Lax) on the Next.js domain.
- Every other endpoint expects the token via the `Cookie: session=<token>`
  header, forwarded by the frontend API client. Invalid, expired, or revoked
  sessions get `401`.
- No `WWW-Authenticate` header is sent — this is cookie auth, not Bearer.
- The browser never calls the backend directly; all calls go through the
  Next.js server (`src/lib/api.ts`, server-only).

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
| `INTERNAL_ERROR` | 500 | Unexpected failure; generic body only |

## Frontend types

`frontend/src/lib/types.ts` is hand-written but **derived from `/openapi.json`**,
never from memory — spot-checked against the live schema at each milestone.
Field names cross the boundary as snake_case (as the backend emits them).

## Enforcement

A shared JSON fixture (canonical error response) is asserted by a backend test
(handler produces it) and a frontend test (`api.ts` parses it into the expected
`FieldErrors`). Added in milestones 1–2; prose describes the contract, the
fixture enforces it.
