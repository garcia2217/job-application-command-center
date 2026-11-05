# Milestone 4: Resume and Job-Description Comparison Implementation Plan

**Goal:** The backend for PRD F-06. Save a LaTeX resume, extract requirements from a job description with a built-in vocabulary, compare them against the prepared resume text, and expose run and read endpoints with the disabled states and the stale notice. AC-06.1 to AC-06.10, all covered by tests.

**Architecture:** A pure package `app/comparison/` (`latex.py`, `vocabulary.py`, `matcher.py`) that never touches the database. `ComparisonService` loads the account and application, decides `blocked_reason`, computes, and upserts the single `comparisons` row. Resume and job description timestamps change only when the text changes, so `is_stale` is a pure comparison of three timestamps.

**Tech Stack:** Python 3.14, FastAPI, Pydantic v2, SQLAlchemy 2.0 async. No new dependencies. No migration: every column and table already exists.

**Spec:** `docs/superpowers/specs/2026-11-05-milestone-4-resume-comparison-design.md` (approved 2026-11-05, all three owner recommendations accepted: literal overlap rule, empty string clears the resume, case-sensitive English-word terms). PRD: `docs/PRD.md` §7 F-06. Contract: `docs/API_CONTRACT.md`.

## Global Constraints

- All backend work in `backend/`; run commands from `backend/` with `uv run …`.
- Type hints on every signature; async DB access; routes thin, services own logic and raise `AppError` subclasses (never `HTTPException`); every route declares `response_model`.
- SQLite in tests returns **naive** datetimes for `DateTime(timezone=True)` columns. Wrap every DB-read datetime in `app.clock.as_utc()` before comparing.
- Time comes only from `app.clock.utcnow()` (tests monkeypatch it).
- Running a comparison is **not** activity: never call `record_activity` on the comparison path.
- TDD: failing test first. Tests mirror source: pure-module tests in `backend/tests/comparison/` (with an empty `__init__.py`).
- Implementers never stage or commit; they list exact file paths in their report.
- Before claiming done: `uv run ruff format .`, then `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`.
- Out of scope: frontend, AI extraction, PDF upload, editing the vocabulary, longest-match suppression, automatic re-runs.

## Dispatch grouping (for the controller)

- **Dispatch A:** Task 1 (pure matching package). Sonnet. Own review: judgment-heavy, holds the product's correctness.
- **Dispatch B:** Task 2 + Task 3 (resume settings, job description timestamp, comparison service and routes, error codes, OpenAPI). Sonnet. One reviewer.
- **Dispatch C:** Task 4 (demo seed regeneration, contract doc, STATUS carry-overs). Sonnet. One reviewer.
- Then one whole-branch review against AC-06.1 to AC-06.10.

## File structure

```
backend/src/app/
  comparison/__init__.py        re-exports compare, ComparisonResult, prepare_resume_text, find_terms
  comparison/latex.py           prepare_resume_text()
  comparison/vocabulary.py      Term dataclass, TERMS tuple (>= 150)
  comparison/matcher.py         find_terms(), compare(), match_percentage(), ComparisonResult
  errors.py                     + RESUME_REQUIRED, JOB_DESCRIPTION_REQUIRED
  schemas/settings.py           + resume_tex on SettingsUpdate; SettingsResponse
  schemas/auth.py               + has_resume on AccountResponse
  schemas/comparison.py         ComparisonResponse, ComparisonStateResponse, BlockedReason
  schemas/problem.py            ProblemResponse model + problem_responses() for OpenAPI
  services/settings_service.py  resume handling + resume_updated_at
  services/application_service.py  job_description_updated_at on create/update
  services/comparison_service.py   ComparisonService, ComparisonState, ComparisonView
  routers/settings.py           GET /settings; PATCH returns SettingsResponse
  routers/comparisons.py        GET/POST /applications/{id}/comparison
  main.py                       include comparisons router
  demo_data.py                  sample resume; real comparison
backend/tests/
  comparison/__init__.py, test_latex.py, test_vocabulary.py, test_matcher.py
  test_comparisons.py           API tests
  test_settings.py, test_applications.py, test_demo_data.py  (additions)
docs/API_CONTRACT.md, docs/STATUS.md, README.md
```

---

### Task 1: Pure matching package (latex, vocabulary, matcher)

**ACs:** AC-06.1, AC-06.2, AC-06.3, AC-06.4, AC-06.5 (algorithm half), AC-06.10.

**Files:** create `backend/src/app/comparison/{__init__,latex,vocabulary,matcher}.py`, `backend/tests/comparison/{__init__,test_latex,test_vocabulary,test_matcher}.py`.

- [ ] **1a. Tests first: `tests/comparison/test_latex.py`.** One test per behavior:
  - `\textbf{PostgreSQL}` → output contains `PostgreSQL` as a whole word, no `textbf`.
  - `% Kubernetes\nPython` → no `Kubernetes`, still has `Python` (AC-06.3).
  - `50\% faster` → `50% faster` (escaped percent is literal, not a comment).
  - `line\\% hidden\nshown` → no `hidden`, has `shown` (`\\` then a comment).
  - `C\#` and `R\&D` and `snake\_case` → `C#`, `R&D`, `snake_case`.
  - `\item Go` → `Go` with no `item`. `\section*{Skills}` → `Skills`, no `*`.
  - `Andr\'e` → contains `Andr` and `e` (accent command removed, no error).
  - `ends with \` (trailing backslash) → no error, output ends without the backslash.
  - Unbalanced: `\textbf{Python`, `Python}}}`, `{{{`, `\begin{itemize` → each returns a string containing the words, never raises (AC-06.10).
  - `a~b` → `a b`.
  - Empty string → empty string.

- [ ] **1b. Implement `latex.py`** (complete code; transcribe):

```python
"""LaTeX resume source -> plain text for matching (PRD F-06 text preparation).

A one-pass scanner, not a parser: malformed input (unbalanced braces, stray
backslashes) degrades to plain text and never raises (AC-06.10).
"""

_ESCAPABLE = frozenset("&%$#_{}")
_SPACE_LIKE = frozenset("{}~")


def prepare_resume_text(tex: str) -> str:
    out: list[str] = []
    i, n = 0, len(tex)
    while i < n:
        ch = tex[i]
        if ch == "%":
            # Escaped percents are consumed by the backslash branch, so any %
            # reached here is unescaped and starts a comment.
            newline = tex.find("\n", i)
            if newline == -1:
                break
            i = newline
            continue
        if ch == "\\":
            if i + 1 >= n:
                break
            nxt = tex[i + 1]
            if nxt in _ESCAPABLE:
                out.append(nxt)
                i += 2
            elif nxt == "\\":
                out.append("\n")
                i += 2
            elif nxt.isascii() and nxt.isalpha():
                j = i + 1
                while j < n and tex[j].isascii() and tex[j].isalpha():
                    j += 1
                if j < n and tex[j] == "*":
                    j += 1
                out.append(" ")
                i = j
            else:
                # Accents and spacing commands (\' \, \ ): drop the command,
                # keep whitespace so words stay separate.
                if nxt.isspace():
                    out.append(nxt)
                i += 2
            continue
        out.append(" " if ch in _SPACE_LIKE else ch)
        i += 1
    return "".join(out)
```

- [ ] **1c. Tests first: `tests/comparison/test_vocabulary.py`.**
  - `len(TERMS) >= 150`.
  - Canonical names unique (exact).
  - No form is shared by two terms: build the set of `(form.casefold())` across every term's name, aliases and insensitive_aliases; each must map to exactly one term name.
  - Required terms present: PostgreSQL (aliases include `Postgres`, `psql`), Go (case_sensitive, `Golang` in insensitive_aliases), R and C (case_sensitive), Kubernetes, CI/CD, TDD.
  - Every case-sensitive term listed in the design is case_sensitive: Go, R, C, Express, Spring, Swift, Rust, Dart, Chef, Puppet, Make, Jest, REST.
  - Every term's name/aliases are non-empty and stripped.

- [ ] **1d. Implement `vocabulary.py`.**

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Term:
    name: str
    aliases: tuple[str, ...] = ()
    case_sensitive: bool = False  # applies to name + aliases
    insensitive_aliases: tuple[str, ...] = ()  # matched ignoring case even when case_sensitive


TERMS: tuple[Term, ...] = (
    ...
)
```

  Authoring rules (the implementer writes the list; the reviewer checks it against these rules):
  - **At least 150 terms**, grouped by comment headers: Languages, Frontend, Backend frameworks, Mobile, Databases and data stores, Messaging and streaming, Cloud platforms and services, DevOps and infrastructure, Testing, Data and ML, Practices and concepts.
  - **Mandatory entries:**
    - `Term("PostgreSQL", aliases=("Postgres", "psql"))`
    - `Term("Go", case_sensitive=True, insensitive_aliases=("Golang",))`
    - `Term("R", case_sensitive=True)`, `Term("C", case_sensitive=True)`, `Term("C++", aliases=("cpp",))`, `Term("C#", aliases=("csharp", "C Sharp"))`
    - `Term("Kubernetes", aliases=("k8s",))`, `Term("CI/CD", aliases=("CI / CD", "continuous integration", "continuous delivery", "continuous deployment"))`, `Term("TDD", aliases=("test-driven development", "test driven development"))`
    - `Term("JavaScript", aliases=("JS", "ECMAScript"))`, `Term("TypeScript", aliases=("TS",))`: `JS`/`TS` are short, so give these two `case_sensitive=True` with the long forms in `insensitive_aliases`, and keep `JS`, `TS` exact.
    - `Term("Node.js", aliases=("Node", "NodeJS"))`, `Term(".NET", aliases=("dotnet",))`, `Term("ASP.NET")`, `Term("Next.js", aliases=("NextJS",))`, `Term("React")`, `Term("React Native")`, `Term("Spring", case_sensitive=True)`, `Term("Spring Boot")`
    - `Term("Express", case_sensitive=True, insensitive_aliases=("Express.js", "ExpressJS"))`
    - `Term("REST", case_sensitive=True, aliases=("RESTful",), insensitive_aliases=("REST API", "REST APIs"))`
    - `Term("Ruby on Rails", case_sensitive=True, aliases=("Rails",), insensitive_aliases=("Ruby on Rails", "RoR"))`
    - `Term("AWS", aliases=("Amazon Web Services",))`, `Term("GCP", aliases=("Google Cloud", "Google Cloud Platform"))`, `Term("Azure", aliases=("Microsoft Azure",))`.
    - Everything the seeded job descriptions in `demo_data.py` mention: Python, FastAPI, Docker, Redis, Terraform, Prometheus, Grafana, TypeScript, Tailwind CSS (alias `Tailwind`), SQL, GraphQL.
  - **Case-sensitive set** (owner decision 3): Go, R, C, Express, Spring, Swift, Rust, Dart, Chef, Puppet, Make, Jest, REST, Ruby on Rails (for its `Rails` alias), JavaScript and TypeScript (for `JS`/`TS`). A case-sensitive term may repeat its own name in `insensitive_aliases` when only an alias is the ambiguous form.
  - **No everyday-English words as case-insensitive forms.** `Node` is allowed (rare in lowercase in postings). Words such as `rest`, `make`, `go`, `less`, `elm`, `ember`, `julia`, `crystal` or `spark` must not be case-insensitive forms: either leave the term out or make it case-sensitive (e.g. `Term("Apache Spark", case_sensitive=True, aliases=("Spark",), insensitive_aliases=("Apache Spark",))`).
  - No form may be shared across two terms once case-folded (the test enforces this). `SQL` and `NoSQL`, `MySQL`, `SQL Server` are distinct forms and fine.

- [ ] **1e. Tests first: `tests/comparison/test_matcher.py`.**
  - **AC-06.1:** `compare(r"\textbf{PostgreSQL}", "Experience with Postgres and Kubernetes")` → matched `["PostgreSQL"]`, missing `["Kubernetes"]`, `match_percentage == 50`.
  - **AC-06.2:** job description with `PostgreSQL` three times → `requirement_count == 1`, matched/missing together list it once.
  - **AC-06.3:** resume `"% Kubernetes\n"`, job description `"Kubernetes"` → `Kubernetes` missing.
  - **AC-06.4:** `"go to market"` → `"Go" not in find_terms(...)`. Also `"Golang"` and `"golang"` → `"Go"` found; `"Go"` → found.
  - **AC-06.5:** `compare("Python", "We value kindness and curiosity")` → `requirement_count == 0`, `match_percentage is None`, no exception.
  - **Traps:** `find_terms("C++ and C#")` has `C++` and `C#` but not `C`; `"R&D budget"` has no `R`; `"C-level stakeholders"` has no `C`; `"Experience with R."` has `R`; `"JavaScript"` has no `Java`; `"ASP.NET"` has `ASP.NET` and not `.NET`; `"Node.js."` has `Node.js`; `"express interest"` has no `Express`; `"Express.js"` has `Express`; `"the rest of the team"` has no `REST`; `"React Native"` has both `React Native` and `React` (owner decision 1, literal rule); `"continuous\n   integration"` has `CI/CD` (whitespace runs, line wraps); job description `"100% remote, Python"` has `Python` (job descriptions are not LaTeX-prepared).
  - **Known limitation, documented:** `"Go to market."` (capitalised, sentence start) **does** find `Go`. Test name `test_capitalised_sentence_start_is_a_known_false_positive`, with a comment pointing at PRD R-04.
  - **Rounding:** `match_percentage(1, 8) == 13`, `match_percentage(2, 3) == 67`, `match_percentage(1, 3) == 33`, `match_percentage(0, 4) == 0`, `match_percentage(0, 0) is None`.
  - **Ordering:** matched and missing sorted case-insensitively (`["AWS", "Docker", "gRPC"]`-style order; use real vocabulary terms).
  - **AC-06.10:** `compare(r"\textbf{Python", "Python")` → Python matched, no error.

- [ ] **1f. Implement `matcher.py`** (complete code; transcribe):

```python
"""Vocabulary matching (PRD F-06). Pure functions; no I/O."""

import re
from dataclasses import dataclass

from app.comparison.latex import prepare_resume_text
from app.comparison.vocabulary import TERMS, Term

# Characters that glue onto a term: letters/digits plus + # & so that C does not
# match inside C++, C#, or R&D. "." and "-" are not glue ("Python.", "Go-based").
_GLUE = "A-Za-z0-9_+#&"


def _form_pattern(form: str, *, ignore_case: bool, single_char: bool) -> str:
    glue = _GLUE + ("\\-" if single_char else "")
    body = re.escape(form).replace("\\ ", r"\s+")
    if ignore_case:
        body = f"(?i:{body})"
    return f"(?<![{glue}]){body}(?![{glue}])"


def _compile(term: Term) -> re.Pattern[str]:
    single = term.case_sensitive and len(term.name) == 1
    forms: list[tuple[str, bool]] = [
        (f, not term.case_sensitive) for f in (term.name, *term.aliases)
    ]
    forms += [(f, True) for f in term.insensitive_aliases]
    forms.sort(key=lambda item: len(item[0]), reverse=True)
    return re.compile(
        "|".join(
            _form_pattern(f, ignore_case=ic, single_char=single) for f, ic in forms
        )
    )


_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (term.name, _compile(term)) for term in TERMS
)


def find_terms(text: str) -> set[str]:
    return {name for name, pattern in _PATTERNS if pattern.search(text)}


def match_percentage(matched: int, total: int) -> int | None:
    """Nearest whole number, halves rounded up; None when nothing to divide by."""
    if total == 0:
        return None
    return (matched * 200 + total) // (total * 2)


def _ordered(names: set[str]) -> list[str]:
    return sorted(names, key=lambda name: (name.casefold(), name))


@dataclass(frozen=True)
class ComparisonResult:
    matched: list[str]
    missing: list[str]
    match_percentage: int | None

    @property
    def requirement_count(self) -> int:
        return len(self.matched) + len(self.missing)


def compare(resume_tex: str, job_description: str) -> ComparisonResult:
    requirements = find_terms(job_description)
    in_resume = find_terms(prepare_resume_text(resume_tex))
    matched = requirements & in_resume
    return ComparisonResult(
        matched=_ordered(matched),
        missing=_ordered(requirements - matched),
        match_percentage=match_percentage(len(matched), len(requirements)),
    )
```

  `comparison/__init__.py` re-exports `ComparisonResult`, `compare`, `find_terms`, `match_percentage`, `prepare_resume_text` with `__all__`.

- [ ] **1g.** Run the full verification; all new tests pass and the 116 existing tests still pass.

---

### Task 2: Resume saving and job description timestamps

**ACs:** AC-06.9, AC-06.8 (timestamp half), AC-06.6 (`has_resume`).

**Files:** `schemas/settings.py`, `schemas/auth.py`, `services/settings_service.py`, `routers/settings.py`, `services/application_service.py`, `tests/test_settings.py`, `tests/test_applications.py`.

- [ ] **2a. Tests first** (`tests/test_settings.py`):
  - `GET /settings` returns `quiet_threshold_days`, `timezone`, `resume_tex: null`, `resume_updated_at: null`, plus the `AccountResponse` fields.
  - `PATCH /settings {"resume_tex": "\\textbf{Python}"}` → 200, body has the resume and a non-null `resume_updated_at`; `GET /settings` returns the same.
  - Exactly 50,000 characters accepted; 50,001 rejected with 422, `errors[0].field == "resume_tex"`, message `"Resume must be 50,000 characters or fewer"` (AC-06.9). Also a 50,000-character string of a non-BMP character (e.g. `"😀" * 50_000`) is accepted (code points, not UTF-16 units).
  - Re-saving an identical resume leaves `resume_updated_at` unchanged (monkeypatch `app.clock.utcnow` / the service's imported `utcnow` to a later time between calls and assert the value didn't move). Saving a different resume moves it.
  - `PATCH {"timezone": ...}` alone leaves `resume_updated_at` untouched.
  - `PATCH {"resume_tex": "   "}` after a saved resume → `resume_tex: null` and `resume_updated_at` moves (owner decision 2).
  - `PATCH {"resume_tex": null}` → 422 (null rejected like the other fields).
  - `GET /auth/me` has `has_resume` false before saving, true after.
- [ ] **2b. Tests first** (`tests/test_applications.py`):
  - Create with `job_description` → `job_description_updated_at` set (read the row via `db_session`; the field is not on the response).
  - Create without one, or with whitespace only → stays null.
  - Update with a different `job_description` → set to the patched clock time; update with the same text → unchanged; update of `notes` only → unchanged.
- [ ] **2c. Implement.**

`schemas/settings.py`:

```python
from pydantic_core import PydanticCustomError

RESUME_MAX_CHARS = 50_000


def _resume_within_limit(value: str) -> str:
    if len(value) > RESUME_MAX_CHARS:
        raise PydanticCustomError(
            "resume_too_long", "Resume must be 50,000 characters or fewer"
        )
    return value


ResumeTex = Annotated[str, AfterValidator(_resume_within_limit)]


class SettingsUpdate(BaseModel):
    quiet_threshold_days: ... (unchanged)
    timezone: ... (unchanged)
    resume_tex: ResumeTex | None = None  # empty/blank string clears the resume

    _no_null = field_validator("quiet_threshold_days", "timezone", "resume_tex")(reject_null)


class SettingsResponse(AccountResponse):
    resume_tex: str | None
    resume_updated_at: datetime | None
```

  Note: no `Field(max_length=...)` on `resume_tex`, so the only over-limit error is the custom one. Check that `reject_null` runs before `_resume_within_limit` for a `None` input (field_validator default mode is "after"; with `ResumeTex | None`, None skips the AfterValidator, then `reject_null` rejects it).

`schemas/auth.py` `AccountResponse` gains:

```python
    @computed_field
    @property
    def has_resume(self) -> bool:
        return self.resume_tex is not None
```

  That needs `resume_tex` on the model. To keep the resume off `/auth/me`, add `resume_tex: str | None = Field(default=None, exclude=True)` to `AccountResponse`, and in `SettingsResponse` redeclare `resume_tex: str | None` **without** `exclude` so it serialises there. Add a test that `/auth/me` JSON has no `resume_tex` key.

`services/settings_service.py`:

```python
    async def update(self, account: Account, payload: SettingsUpdate) -> Account:
        changes = payload.model_dump(exclude_unset=True)
        if "resume_tex" in changes:
            resume = changes.pop("resume_tex")
            resume = resume if resume.strip() else None
            if resume != account.resume_tex:
                account.resume_tex = resume
                account.resume_updated_at = utcnow()
        for field, value in changes.items():
            setattr(account, field, value)
        await self.db.commit()
        return account
```

`routers/settings.py`: `PATCH ""` → `response_model=SettingsResponse`; add `GET ""` returning the current account with `response_model=SettingsResponse`.

`services/application_service.py`:
  - `create`: after building `application`, `if (application.job_description or "").strip(): application.job_description_updated_at = utcnow()` (use the same `now` as `last_activity_at`).
  - `update`: before the `setattr` loop, `jd_changed = "job_description" in changes and changes["job_description"] != application.job_description`; after the loop, `if jd_changed: application.job_description_updated_at = utcnow()`.

---

### Task 3: Comparison service, routes, error codes, OpenAPI error responses

**ACs:** AC-06.5 (API), AC-06.6, AC-06.7, AC-06.8, AC-06.10 (API), AC-01.7 for the new routes, NFR-01.

**Files:** `errors.py`, `schemas/comparison.py`, `schemas/problem.py`, `services/comparison_service.py`, `routers/comparisons.py`, `main.py`, `tests/test_comparisons.py`.

- [ ] **3a. Tests first** (`tests/test_comparisons.py`; use `make_company` / `make_application` and set `owner_account.resume_tex` via `db_session`, or `PATCH /settings`):
  - `GET` with no resume and no job description → `{"blocked_reason": "no_resume", "comparison": null}` (AC-06.6; resume reason wins).
  - Resume saved, job description null or `"  "` → `blocked_reason == "no_job_description"`.
  - `POST` while blocked → 409 with `code == "RESUME_REQUIRED"` / `"JOB_DESCRIPTION_REQUIRED"` and `detail` equal to the PRD text (`"Add your resume in Settings first."`, `"Paste the job description first."`).
  - AC-06.1 through the API: resume `\textbf{PostgreSQL}`, job description "Postgres and Kubernetes" → `matched == ["PostgreSQL"]`, `missing == ["Kubernetes"]`, `match_percentage == 50`, `requirement_count == 2`, `is_stale is False`, `blocked_reason is None`.
  - AC-06.5: job description with no terms → `match_percentage is None`, `requirement_count == 0`, 200.
  - AC-06.7: run, patch clock forward, run again → one row in `comparisons` for the application, `ran_at` equals the second time.
  - AC-06.8: run; edit the resume (different text) → `GET` shows `is_stale is True`. Separate test: run; `PATCH /applications/{id}` with a different `job_description` → stale. Separate test: run; re-save the identical resume and patch only `notes` → still not stale. Use the patched clock so "after" is strictly later.
  - AC-06.10: resume `\textbf{Python` with job description "Python" → 200, Python matched.
  - Running a comparison leaves `last_activity_at` and `is_quiet` unchanged.
  - Another account's application → 404 `NOT_FOUND` on both `GET` and `POST`.
  - Clearing the resume after a run → `GET` returns `blocked_reason == "no_resume"` **and** the old comparison (with `is_stale is True`).
  - `GET /openapi.json` lists 404 and 409 responses on `POST /applications/{application_id}/comparison`.
- [ ] **3b. Implement.**

`errors.py`: add `RESUME_REQUIRED = "RESUME_REQUIRED"` and `JOB_DESCRIPTION_REQUIRED = "JOB_DESCRIPTION_REQUIRED"` to `ErrorCode` (before `HTTP_ERROR`).

`schemas/problem.py`:

```python
from typing import Any

from pydantic import BaseModel


class ProblemResponse(BaseModel):
    """application/problem+json body (docs/API_CONTRACT.md). For OpenAPI only."""

    type: str
    title: str
    status: int
    detail: str
    code: str
    errors: list[dict[str, Any]] | None = None


def problem_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    return {
        status: {
            "model": ProblemResponse,
            "content": {"application/problem+json": {}},
        }
        for status in statuses
    }
```

`schemas/comparison.py`:

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

BlockedReason = Literal["no_resume", "no_job_description"]


class ComparisonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    matched: list[str]
    missing: list[str]
    requirement_count: int
    match_percentage: int | None  # None: "No recognised requirements found"
    ran_at: datetime
    is_stale: bool


class ComparisonStateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    blocked_reason: BlockedReason | None
    comparison: ComparisonResponse | None
```

`services/comparison_service.py`:

```python
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clock import as_utc, utcnow
from app.comparison import ComparisonResult, compare
from app.errors import ConflictError, ErrorCode, NotFoundError
from app.models import Account, Application, Comparison

_BLOCKED: dict[str, tuple[ErrorCode, str]] = {
    "no_resume": (ErrorCode.RESUME_REQUIRED, "Add your resume in Settings first."),
    "no_job_description": (
        ErrorCode.JOB_DESCRIPTION_REQUIRED,
        "Paste the job description first.",
    ),
}


@dataclass(frozen=True)
class ComparisonView:
    matched: list[str]
    missing: list[str]
    requirement_count: int
    match_percentage: int | None
    ran_at: datetime
    is_stale: bool


@dataclass(frozen=True)
class ComparisonState:
    blocked_reason: str | None
    comparison: ComparisonView | None


def _blank(text: str | None) -> bool:
    return text is None or not text.strip()


def blocked_reason(account: Account, application: Application) -> str | None:
    if _blank(account.resume_tex):
        return "no_resume"
    if _blank(application.job_description):
        return "no_job_description"
    return None


def _changed_after(edited_at: datetime | None, ran_at: datetime) -> bool:
    return edited_at is not None and as_utc(edited_at) > as_utc(ran_at)


class ComparisonService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def state(self, account: Account, application_id: int) -> ComparisonState:
        application = await self._load(account.id, application_id)
        return self._state(account, application)

    async def run(self, account: Account, application_id: int) -> ComparisonState:
        application = await self._load(account.id, application_id)
        reason = blocked_reason(account, application)
        if reason is not None:
            code, message = _BLOCKED[reason]
            raise ConflictError(message, code=code)
        result = compare(account.resume_tex or "", application.job_description or "")
        try:
            self._store(application, result)
            await self.db.commit()
        except IntegrityError:
            # A concurrent first run inserted the row; store again as an update.
            await self.db.rollback()
            await self.db.refresh(account)  # rollback expired it; no lazy IO in async
            application = await self._load(account.id, application_id)
            self._store(application, result)
            await self.db.commit()
        return self._state(account, application)

    def _store(self, application: Application, result: ComparisonResult) -> None:
        row = application.comparison
        if row is None:
            row = Comparison(application_id=application.id)
            application.comparison = row
        row.matched_terms = result.matched
        row.missing_terms = result.missing
        row.match_percentage = result.match_percentage
        row.ran_at = utcnow()

    def _state(self, account: Account, application: Application) -> ComparisonState:
        row = application.comparison
        view = None
        if row is not None:
            view = ComparisonView(
                matched=list(row.matched_terms),
                missing=list(row.missing_terms),
                requirement_count=len(row.matched_terms) + len(row.missing_terms),
                match_percentage=row.match_percentage,
                ran_at=as_utc(row.ran_at),
                is_stale=_changed_after(account.resume_updated_at, row.ran_at)
                or _changed_after(application.job_description_updated_at, row.ran_at),
            )
        return ComparisonState(blocked_reason(account, application), view)

    async def _load(self, account_id: int, application_id: int) -> Application:
        result = await self.db.execute(
            select(Application)
            .where(
                Application.id == application_id,
                Application.account_id == account_id,
            )
            .options(selectinload(Application.comparison))
            .execution_options(populate_existing=True)
        )
        application = result.scalar_one_or_none()
        if application is None:
            raise NotFoundError("Application not found")
        return application
```

  Verify against the real code before transcribing: (1) `Application.comparison` is a one-to-one (`uselist=False`) relationship; (2) assigning a fresh `Comparison` to `application.comparison` inserts it on flush; (3) `rollback()` expires every loaded object even with `expire_on_commit=False`, hence the explicit `refresh(account)` before `_state` reads its timestamps. Add a test that forces the IntegrityError path (e.g. monkeypatch `_store` to insert a competing row through a second session on its first call) and checks a 200 with one row. If any of these is wrong, stop and report rather than redesigning. Note: `populate_existing` here is on the comparison loader only, not on `get_detail` (STATUS "do not retry populate_existing on get_detail" still holds).

`routers/comparisons.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.comparison import ComparisonStateResponse
from app.schemas.problem import problem_responses
from app.services.comparison_service import ComparisonService

router = APIRouter(prefix="/applications", tags=["applications"])


def get_comparison_service(db: DbDep) -> ComparisonService:
    return ComparisonService(db)


ComparisonServiceDep = Annotated[ComparisonService, Depends(get_comparison_service)]


@router.get(
    "/{application_id}/comparison",
    response_model=ComparisonStateResponse,
    responses=problem_responses(401, 404),
)
async def get_comparison(
    application_id: int, account: CurrentAccountDep, service: ComparisonServiceDep
):
    """The saved comparison (if any) and why Compare is disabled (if it is)."""
    return await service.state(account, application_id)


@router.post(
    "/{application_id}/comparison",
    response_model=ComparisonStateResponse,
    responses=problem_responses(401, 404, 409),
)
async def run_comparison(
    application_id: int, account: CurrentAccountDep, service: ComparisonServiceDep
):
    """Run the comparison now, replacing any saved one (AC-06.7)."""
    return await service.run(account, application_id)
```

  `main.py`: import `comparisons` in the routers import and `app.include_router(comparisons.router)` after `applications.router`.

---

### Task 4: Demo seed, contract doc, STATUS carry-overs

**ACs:** AC-01.8 / G-04 (seeded comparison is real), NFR-01 docs.

**Files:** `demo_data.py`, `tests/test_demo_data.py`, `tests/test_auth_service.py` (comment only), `docs/API_CONTRACT.md`, `README.md`.

- [ ] **4a. Tests first** (`tests/test_demo_data.py`):
  - After `reset_demo_data`, the demo account has a non-null `resume_tex` and `resume_updated_at`.
  - Every seeded application with a job description has a non-null `job_description_updated_at`; those without have null.
  - The seeded comparison's `matched_terms`, `missing_terms`, `match_percentage` equal `compare(account.resume_tex, backend_acme.job_description)`; both lists are non-empty.
  - `ran_at` is strictly after `resume_updated_at` and the application's `job_description_updated_at`, so `GET /applications/{id}/comparison` for it reports `is_stale is False` (one API-level test signed in as the demo account if a fixture makes that easy; otherwise assert the timestamps).
- [ ] **4b. Implement** in `demo_data.py`:
  - `DEMO_RESUME_TEX`: a module-level raw string of roughly 25–40 lines. A realistic one-page backend resume using `\section*{}`, `\textbf{}`, `\item`, `\href{}{}`, one `%` comment line that mentions **Kubernetes** (so the comment rule is visible in the demo: Kubernetes stays Missing), and escaped characters (`\&`, `\%`). Skills present: Python, FastAPI, PostgreSQL (written as `Postgres` somewhere), Docker, REST, SQL, React, TypeScript, Git. Not present outside the comment: Kubernetes, Redis, Terraform.
  - In `reset_demo_data`: set `account.resume_tex = DEMO_RESUME_TEX`, `account.resume_updated_at = now - timedelta(days=3)`; give every seeded application whose `job_description` is set `job_description_updated_at = now - timedelta(days=<its days_quiet or 2, whichever is larger>)` so it is before the comparison's `ran_at = now - timedelta(days=1)`.
  - Replace the hand-written `Comparison(...)` with one built from `compare(DEMO_RESUME_TEX, backend_acme.job_description)`.
  - The returned counts dict is unchanged.
- [ ] **4c. Docs:**
  - `docs/API_CONTRACT.md`: add `RESUME_REQUIRED` (409, "Compare run with no saved resume (AC-06.6)") and `JOB_DESCRIPTION_REQUIRED` (409, "Compare run on an application with no job description text (AC-06.6)") to the error-code table. Under Wire values add: `GET /settings` returns the settings including `resume_tex` and `resume_updated_at`; `/auth/me` carries `has_resume` but never the resume; `resume_tex` is limited to 50,000 characters counted as Unicode code points (the frontend must count with `[...text].length`, not `.length`); an empty or blank `resume_tex` clears the resume; `GET`/`POST /applications/{id}/comparison` return `{blocked_reason: "no_resume" | "no_job_description" | null, comparison: {...} | null}`; `match_percentage: null` means "No recognised requirements found"; `is_stale` drives the "Resume or job description changed since this comparison" notice; matched and missing are alphabetical canonical names.
  - `tests/test_auth_service.py`: add `# AC-01.5` to `test_expired_session_is_rejected`.
  - `README.md`: bring the Status section up to date (F-01 to F-06 backend built and tested; frontend not started; the "not yet verified live" list stays accurate: QStash, Resend, Upstash Redis, Neon). Read the current section first and change only what is out of date.

---

## Self-review against the spec

| Spec item | Task |
|---|---|
| Resume field, 50,000 limit with a message naming it, empty clears | 2 |
| `resume_updated_at` only on change | 2 |
| `GET /settings`, `SettingsResponse`, `has_resume` on `/auth/me` | 2 |
| `job_description_updated_at` on create and changed update | 2 |
| LaTeX scanner rules 1–4 | 1 |
| Vocabulary ≥150, per-term case sensitivity, insensitive aliases, English-word terms | 1 |
| Custom boundaries, single-character hyphen rule, whitespace runs in phrases | 1 |
| Literal overlap rule (owner decision 1) | 1 (test) |
| Half-up rounding, alphabetical order, `None` percentage | 1 |
| GET/POST comparison, `blocked_reason` precedence, 409 codes, upsert, IntegrityError retry | 3 |
| `is_stale` from three timestamps | 3 |
| Comparison is not activity | 3 (test) |
| OpenAPI error responses on the new routes | 3 |
| Demo resume and real seeded comparison | 4 |
| Contract doc | 4 |

Adversarial pass over the code blocks (done before dispatch):
- `latex.py`: `%` at end of input with no newline → `break` (drops the rest, correct). `\` at the very end → `break`. `\*`: nxt `*` is non-letter, non-space → dropped. A command name followed directly by `{` leaves the brace for the next iteration → becomes a space. Unicode letters after `\` are not command names (LaTeX command names are ASCII), handled by the non-letter branch.
- `matcher.py`: `re.escape(" ")` gives `"\\ "` in Python 3.7+, so the `.replace("\\ ", r"\s+")` targets the right sequence. Character class `[A-Za-z0-9_+#&\-]` is valid; `+` and `#` need no escaping inside a class. Scoped `(?i:...)` is supported. Lookbehind is fixed-width (one character). An empty `TERMS` would compile nothing, which the vocabulary test prevents.
- `match_percentage`: `(1*200+8)//16 = 13`, `(2*200+3)//6 = 67`, `(1*200+3)//6 = 33`, `(0+4)//8 = 0`. Correct.
- Settings: `reject_null` on `resume_tex` and `ResumeTex | None`: Pydantic validates `None` against the union's `None` branch (AfterValidator not run), then the field validator rejects it. Blank string passes the limit check and is cleared in the service.
- `AccountResponse.has_resume` with an excluded `resume_tex`: `from_attributes` still reads it; `exclude=True` keeps it out of the JSON and the OpenAPI schema for `/auth/me`. The subclass redeclaration in `SettingsResponse` must not inherit `exclude`. Task 2's `/auth/me` test catches a mistake.
- Comparison service: `_changed_after` handles a `None` edit time (never edited → not stale). `ran_at` stored aware from `utcnow()`, read back naive on SQLite → `as_utc`. The error-code mapping `_BLOCKED` covers both reasons. `ErrorCode` additions are needed by `ConflictError(code=...)`. New router is wired in `main.py`.
- Demo seed: the seeded job description for `backend_acme` mentions Kubernetes and Redis, absent from the demo resume, so Missing is non-empty; it mentions Python, FastAPI, PostgreSQL and Docker, present, so Matched is non-empty.
