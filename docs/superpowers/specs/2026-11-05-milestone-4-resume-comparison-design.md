# Milestone 4 Design: Resume and Job-Description Comparison (F-06 backend)

**Date:** 2026-11-05 · **Status:** approved by owner (chat, 2026-11-05), with all three recommendations below
**PRD features:** F-06 (AC-06.1 to AC-06.10). Also touches F-01 (demo seed, AC-01.8) and NFR-01.
**Scope:** backend only. The Settings text area and the comparison view belong to milestone 5.

## Starting point

Already in place from milestone 1: `accounts.resume_tex`, `accounts.resume_updated_at`, `applications.job_description_updated_at` and the `comparisons` table (one row per application, `matched_terms`, `missing_terms`, `match_percentage` nullable, `ran_at`). **No migration is needed.**

Gaps found while reading the code:
- `PATCH /settings` has no resume field, and nothing exposes the saved resume.
- Nothing ever writes `job_description_updated_at`. Without it, AC-06.8 can't hold for job description edits.
- `demo_data.py` writes a hand-made comparison with lowercase terms that the real algorithm would never produce.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Where matching lives | Pure module `app/comparison/`, which doesn't touch the database. The service layer does the DB work | Matching can be tested without a database, and the module is the easiest part of the code to show off |
| LaTeX handling | One-pass character scanner, not a parser | AC-06.10: you can't get a parse error from something that never parses. Bad input just becomes text |
| Vocabulary | A Python tuple in `app/comparison/vocabulary.py`. Not stored in the DB | PRD §8: "part of the product, not editable in the app" |
| Case sensitivity | Set per term, and a case-sensitive term can list some aliases that ignore case | "Go" must match exactly, but "golang" should match in any case (PRD F-06 example) |
| Overlapping terms | Follow the PRD literally: every term whose name or alias appears as a whole word counts, so "React Native" also counts as React | It is what the PRD definition says (owner decision 1) |
| Percentage rounding | Round half up: `(matched * 200 + total) // (total * 2)` | Python's `round()` rounds 12.5 to 12. Nobody reading "nearest whole number" expects that |
| Requirement order | Alphabetical by canonical name, ignoring case, within each group | Same output every run, easy to scan, and easy to assert in tests |
| Stale notice | `is_stale = resume_updated_at > ran_at or job_description_updated_at > ran_at`. Both timestamps change only when the value actually changes | The Settings form will re-send an unchanged resume along with the time zone. That re-send must not set off the "changed since" notice |
| Disabled states | The API returns a reason code (`no_resume`, `no_job_description`). The UI maps each code to the PRD's wording | The contract says clients branch on codes, not on detail text |

## Components

### 1. Resume saving (settings)
- `SettingsUpdate` gains `resume_tex: str | None`, `max_length=50_000` counted in characters (Unicode code points, as Pydantic counts them). Like the other fields, an explicit `null` is rejected. Sending an empty or whitespace-only string clears the resume (stored as `NULL`). That makes "no resume" a state you can return to, and the PRD says nothing either way (open question 2).
- Going over the limit is a normal `VALIDATION_FAILED` 422 with `field: "resume_tex"` and a message that names the limit: "Resume must be 50,000 characters or fewer" (AC-06.9). This is a custom message, not Pydantic's default.
- `SettingsService.update` sets `resume_updated_at = utcnow()` only when the stored value changes.
- New `SettingsResponse(AccountResponse)` adds `resume_tex: str | None` and `resume_updated_at: datetime | None`. Both `PATCH /settings` and a new `GET /settings` return it. `SettingsResponse` is a superset of `AccountResponse`, so existing callers still work.
- `AccountResponse` (used by `/auth/me`) gains `has_resume: bool` only. The resume can be up to 50 KB, so it stays off the response the frontend asks for on every page load.

### 2. Job description timestamp
- `ApplicationService.create`: when `job_description` is non-blank, set `job_description_updated_at = utcnow()`.
- `ApplicationService.update`: when `job_description` is in the payload and differs from the stored value, set it to `utcnow()`. Editing the job description is already an application edit, so `record_activity` still runs as it does today. Running a comparison is **not** activity (PRD F-04), so the comparison path never calls `record_activity`.

### 3. Text preparation (`app/comparison/latex.py`)
`prepare_resume_text(tex: str) -> str`, a single left-to-right scan that never raises:
1. **Comments:** an unescaped `%` drops everything up to the end of the line. "Unescaped" means an even number of backslashes comes right before it, so `\%` is a literal percent sign while `\\%` (a line break, then a comment) starts a comment (AC-06.3).
2. **Escaped characters:** `\&`, `\%`, `\$`, `\#`, `\_`, `\{` and `\}` become the literal character, so `C\#` reads as `C#`. `\\` becomes a newline.
3. **Commands:** a backslash followed by letters (and an optional `*`) becomes a space, so `\textbf`, `\item` and `\href` disappear. A backslash followed by any other character (accents such as `\'`) is removed and the following character is kept. A backslash at the very end of the input is dropped.
4. **Braces and `~`:** each becomes a space. Text inside braces stays, including URLs and environment names. That's harmless, and per R-05 it's the safer way to fail. Unbalanced braces are just characters (AC-06.10).

Job descriptions are plain text and are **not** prepared, so "100% remote, Python" keeps Python.

### 4. Vocabulary (`app/comparison/vocabulary.py`)
```python
@dataclass(frozen=True)
class Term:
    name: str                                  # canonical, shown in results
    aliases: tuple[str, ...] = ()
    case_sensitive: bool = False               # applies to name + aliases
    insensitive_aliases: tuple[str, ...] = ()  # e.g. Go -> ("Golang",)
```
- **At least 150 terms** across languages, frameworks, databases, cloud platforms, tools and practices (CI/CD, TDD and so on). It includes the PRD's examples: PostgreSQL with the aliases Postgres and psql; Go as case-sensitive, with "Golang" as an alias that ignores case.
- **Case-sensitive terms:** the short ones the PRD names (Go, R, C) plus terms that are also everyday English words: Express, Spring, Swift, Rust, Dart, Chef, Puppet, Make. Their lowercase forms ("express interest", "spring", "make") must not count. A capitalised word at the start of a sentence still counts ("Go to market."). That's the known R-04 limitation, and it's documented in a test.
- **Tests check the list itself:** at least 150 terms, unique canonical names, and no alias form that two terms share once case is ignored.

### 5. Matching (`app/comparison/matcher.py`)
- Each term compiles once, at import time, to one regex: all its forms, longest first. Case-insensitive forms get `(?i:...)`.
- **Whole word or phrase:** standard `\b` fails on `C++`, `C#` and `.NET`, so each form is wrapped in custom boundaries:
  `(?<![A-Za-z0-9_+#&])` … `(?![A-Za-z0-9_+#&])`.
  Including `+`, `#` and `&` means C doesn't match inside `C++`, `C#` or `R&D`, and Java doesn't match inside JavaScript (letters already block that). A `.` or `-` next to a term doesn't block it, so "Python." and "Go-based" still count.
  A single-character case-sensitive term (C, R) also refuses an adjacent `-`, so "C-level" and "R-rated" don't count.
- **Phrases:** spaces in a form match any run of whitespace. A phrase that LaTeX wrapped across lines still counts.
- `find_terms(text) -> set[str]` returns canonical names.
- `compare(resume_tex, job_description) -> ComparisonResult(matched, missing, match_percentage)`:
  requirements = `find_terms(job_description)` (each term once, AC-06.2); matched = requirements ∩ `find_terms(prepare_resume_text(resume_tex))`; missing = the rest. No requirements → `match_percentage = None` and no division (AC-06.5).
- Cost: about 150 compiled regexes over at most 50 KB of text, a few milliseconds per run. It runs synchronously inside the request.

### 6. Comparison service and routes
`app/services/comparison_service.py`, `ComparisonService(db)`:
- `state(account, application_id) -> ComparisonState`: looks up the application (another account's application → 404, as AC-01.7 requires), works out the `blocked_reason`, and loads the saved comparison (if any) with `is_stale`.
- `run(account, application_id) -> ComparisonState`: if `blocked_reason` is set, raises `ConflictError` with that reason's code. Otherwise it computes, then updates the existing row in place or inserts one. Either way it sets `ran_at = utcnow()` (AC-06.7: still one row, with a new time) and commits. If two first-ever runs race and hit the unique constraint (`IntegrityError`), it rolls back and repeats the run once as an update.
- `blocked_reason` precedence: `no_resume` first, then `no_job_description`, the order the PRD lists them. Blank or whitespace-only text counts as missing.

Routes, in `app/routers/comparisons.py` under the `applications` tag:

| Route | Response | Errors |
|---|---|---|
| `GET /applications/{id}/comparison` | 200 `ComparisonStateResponse` | 404 `NOT_FOUND` |
| `POST /applications/{id}/comparison` | 200 `ComparisonStateResponse` (fresh) | 404 `NOT_FOUND`; 409 `RESUME_REQUIRED`; 409 `JOB_DESCRIPTION_REQUIRED` |

```
ComparisonStateResponse {
  blocked_reason: "no_resume" | "no_job_description" | null   # AC-06.6
  comparison: ComparisonResponse | null                        # null = never run
}
ComparisonResponse {
  matched: string[]              # canonical names, alphabetical
  missing: string[]
  requirement_count: int
  match_percentage: int | null   # null = "No recognised requirements found" (AC-06.5)
  ran_at: datetime (UTC)
  is_stale: bool                 # AC-06.8 notice
}
```
Even when running is blocked, `GET` still returns any saved comparison. It shows the old result and the disabled button together, for example after the resume was cleared.

Both responses are declared with `response_model`, and the 404 and 409 responses are listed in OpenAPI (NFR-01).

### 7. Errors and contract
- New `ErrorCode` values `RESUME_REQUIRED` and `JOB_DESCRIPTION_REQUIRED` (409). `docs/API_CONTRACT.md` gets both rows, the two comparison routes, `GET /settings`, `has_resume`, the `blocked_reason` values, and the rule that the resume limit counts code points. That last point matters because JavaScript's `.length` counts UTF-16 units, so milestone 5 must count with `[...text].length`.

### 8. Demo seed
- The demo account gets a short sample LaTeX resume, with macros, a comment line and escaped characters, so its saved comparison also exercises the text preparation.
- Seeded applications that have a job description get `job_description_updated_at` set at seed time.
- The seeded comparison comes from `compare(resume, backend_acme.job_description)`, using real canonical names. `ran_at` is after both timestamps, so `is_stale` is false. A test asserts that the seeded row equals a fresh `compare()` and contains both Matched and Missing terms.

## Testing (pytest, written before the code)
- `tests/comparison/test_latex.py`: comments; escaped versus unescaped `%`; `\\%`; `\textbf{PostgreSQL}` → PostgreSQL; `C\#` → C#; accents; a trailing backslash; unbalanced braces in both directions, which must not raise (AC-06.10).
- `tests/comparison/test_vocabulary.py`: at least 150 terms, unique names, no shared alias forms.
- `tests/comparison/test_matcher.py`: AC-06.1 (Matched / Missing / 50), AC-06.2, AC-06.3, AC-06.4, AC-06.5. Traps: C++ / C# / C, Java / JavaScript, `.NET`, Node.js, R&D, C-level, "express interest", "golang" in lowercase, a line-wrapped phrase, a job description with "100%". Rounding: 1 of 8 gives 13, 2 of 3 gives 67.
- `tests/test_comparisons.py` (API): GET before any run; AC-06.6 (`blocked_reason` for no resume, then for no job description; POST returns 409 with the matching code); AC-06.7 (run twice, one row, `ran_at` moves forward); AC-06.8 (edit the resume, then the job description: each sets `is_stale`; re-saving an identical resume does not); 404 for another account's application; a run doesn't change `last_activity_at`; deleting the application removes the comparison (already covered by AC-02.7, re-checked).
- `tests/test_settings.py` additions: save and read the resume; 50,000 characters accepted and 50,001 rejected with `field: "resume_tex"` (AC-06.9); `resume_updated_at` set only when the value changes; an empty string clears the resume; `has_resume` on `/auth/me`.
- `tests/test_applications.py` additions: `job_description_updated_at` set on create and on a changed update, left alone on an unchanged update or a different field's update.
- Demo seed: the seeded comparison equals the real algorithm's output.

## Planned work order (detailed in the plan once approved)
1. Pure matching module (latex, vocabulary, matcher) with its tests. One dispatch, since it's judgment-heavy.
2. Resume settings and job description timestamps. One dispatch.
3. Comparison service, routes, errors and contract doc. One dispatch.
4. Demo seed regeneration, the STATUS carry-overs (README Status section, the `# AC-01.5` tag), then the whole-branch review.

## Manual steps
None new. F-06 calls no external service, so everything can be checked with tests. The existing `MANUAL_STEPS.md` list (deployment, Neon, QStash, Redis, Resend) still applies.

## Owner decisions (resolved 2026-11-05: all three recommendations accepted)
1. **Overlapping terms.** With the PRD's literal rule, a posting that says "React Native" also lists React as a requirement, and "Spring Boot" also lists Spring. The alternative is longest-match-wins, where a longer match claims its text so shorter terms inside it don't count. That's more accurate, but it bends the PRD's definition. **Recommendation:** use the literal rule now, and add longest-match to PRD §14 as a candidate refinement.
2. **Clearing the resume.** The PRD doesn't say whether the owner can remove a resume. **Recommendation:** saving empty text clears it, and Compare goes back to "Add your resume in Settings first."
3. **Case-sensitive English-word terms** (Express, Spring, Swift, Rust, Dart, Chef, Puppet, Make). The PRD names only short terms. **Recommendation:** make these case-sensitive too, since otherwise ordinary words like "make" and "spring" count as skills.

## Out of scope
AI extraction (FF-03), PDF upload (FF-02), editing the vocabulary, required versus nice-to-have weighting, re-running comparisons automatically on change, and any frontend.
