# Job Application Command Center — Agent Instructions

## What This Is
A job-application tracker built as a **portfolio project for backend/fullstack job applications**. Two goals, in order:
1. Demonstrate real backend engineering depth (background jobs, relational modeling, auth, documented API — not just AI-wrapper UI).
2. Be genuinely useful daily during the owner's active job search.

## Product Spec — Read `docs/PRD.md` First
`docs/PRD.md` is the single source of truth for **what** to build: scope and non-goals, the MVP feature set (F-01…F-06) with acceptance criteria, user flows, data/content rules, non-functional requirements, constraints, and the post-launch backlog. Read it before planning or implementing any feature, and treat its acceptance criteria as the definition of done.

This file (`AGENTS.md`) covers **how** to build: stack, layout, conventions, verification, and workflow. Where the two overlap, the PRD wins on product behavior; AGENTS.md wins on engineering process. If a request conflicts with the PRD, stop and ask the owner rather than silently expanding scope.

## Committed Tech Stack
| Layer | Choice | Notes |
|---|---|---|
| Backend | **Python 3.14 + FastAPI**, managed with **uv** | `backend/`, src layout (`backend/src/app/`) |
| Backend tests | pytest + pytest-asyncio | `backend/tests/` |
| Lint/format | ruff | |
| Frontend | **Next.js 16 + React 19 + Tailwind 4**, managed with **bun** | `frontend/` |
| Database | Neon Postgres (free tier) | |
| Cache / rate limiting | Upstash Redis (free tier) | |
| Background jobs | Upstash QStash (serverless queue — no dedicated worker) | |
| Email | Resend | SendGrid retired its free plan |
| Hosting | Frontend: Vercel/Netlify. API: Render free tier (spins down after ~15 min idle — note this tradeoff in README) | |

Do not swap stack pieces without asking the owner.

## Repo Layout
```
backend/    FastAPI app (uv project)
frontend/   Next.js app (bun project)
docs/       PRD.md (product spec — read first), STATUS.md (current state and next work), API_CONTRACT.md, design/ (DESIGN_GUIDE.md + home.html prototype — UI source of truth), superpowers/ (milestone specs and plans)
```

## Verification Commands
Run these before claiming any work is done:
```bash
# Backend (from backend/)
uv run pytest
uv run ruff check .
uv run ruff format --check .

# Frontend (from frontend/)
bun run lint
bun run build
```

## Delivery Workflow
Every milestone runs in this order. Don't skip steps.
1. **Design:** read the PRD features involved and `docs/STATUS.md`, raise any open questions, and write a short design to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`. **Stop for the owner's approval before planning.**
2. **Plan:** write the task list to `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, mapping each task to its acceptance criteria. Follow the plan conventions below.
3. **Build:** the `implementer` subagent works test-first; the `reviewer` subagent reviews each batch. Fix every Critical and Important finding before moving on.
4. **Whole-branch review:** before finishing, run one fresh review of the full milestone diff against the PRD acceptance criteria. Auth, session and email paths get a dedicated look.
5. **Verify and report:** run every verification command, update `docs/STATUS.md`, push the feature branch, then stop and report: commits, verification output, each acceptance criterion's status, decisions made where the PRD was silent, anything not yet verified live, and the human steps needed.

## Workflow Rules
- **Planner/Implementer split:** the main session plans, makes architecture decisions, adjudicates review findings, and commits. All actual code writing is delegated to the `implementer` subagent (`.claude/agents/implementer.md`, Opus at `medium` effort) via the Agent tool; reviews go to the `reviewer` subagent (`.claude/agents/reviewer.md`, Opus at `medium` effort). The main session does not write boilerplate itself.
- **Subagents report to files, not to the controller's context.** Every subagent — implementer, reviewer, re-reviewer — writes its full report to a file in `docs/superpowers/plans/reports/` (gitignored) and returns at most ~10 lines: verdict (✅/❌), one line per Critical/Important finding, and the report path. The controller opens the file only when a finding needs adjudication. Never let a multi-paragraph report land in the main session.
- **Batch small tasks into one dispatch.** Group same-shape or small tasks (one or two files, transcription of plan-provided code) into a single implementer dispatch with an itemized brief. Reserve one-task-per-dispatch for work that needs its own judgment or its own review surface. Target 3–4 dispatches for a CRUD-style milestone, not 8–9.
- **Batch reviews too.** One reviewer per dispatch batch (2–3 related tasks), not one per task. Security-critical or judgment-heavy diffs — auth logic, session handling, job scheduling, money/email paths — still get their own dedicated review.
- **Model selection:**
  - Never use `fork` for fix rounds or lookups — a fork inherits the whole controller context at controller prices. Fix rounds resume the original implementer via SendMessage (its context is intact and cheap).
  - Implementer and reviewer dispatches, including scoped re-reviews and transcription-grade tasks, use the agents' configured model (Opus, `medium` effort). Don't pass a `model` override on these dispatches.
- **Implementers never commit.** The controller stages exactly the files the implementer lists in its report and commits only reviewed code.
- **Plan conventions** (before any dispatch from a saved plan):
  - Run one adversarial self-review pass over the plan's *code blocks* specifically — error paths, null/None cases, enum and `__init__.py` exports, interface promises between tasks, error-code mappings. Most real review findings in milestone 1 were defects in plan-embedded code, catchable here.
  - Validate the plan file's headings right after saving: `grep -c '^### Task' <plan>` must equal the task count, and no heading may be glued to a preceding `---`.
- **TDD:** write the failing test first, then the implementation.
- **Real docs, not memory:** when integrating third-party APIs (QStash, Resend, Gmail, OAuth), fetch and follow the official current docs — never build from remembered API shapes.
- Keep secrets out of git; use `.env` files with a committed `.env.example`.
- **Commits carry no AI attribution.** Never add `Co-Authored-By: Claude ...`, "Generated with Claude Code", session links, or any other model credit to commit messages or PR bodies. Write plain conventional commit messages authored as the repo owner.
- Agent instructions, plans and specs are tracked and public. `docs/OPERATOR_RUNBOOK.md`, `scripts/autonomous-run.sh`, `logs/`, `.agents/`, `.codex/`, `.claude/settings.local.json`, the `fastapi-patterns` and `product-design` skills, and `docs/superpowers/plans/reports/` stay out of git: never force-add them.
- **Git:** work on a feature branch and push feature branches only. Never push to or merge into `master`, and never force-push. The owner merges.

## Code Conventions

**Backend (Python/FastAPI):**
- Type hints on all function signatures; let ruff enforce style/imports (`uv run ruff format .` before finishing).
- Pydantic models for every API request/response schema — no raw dicts across the API boundary. Keep OpenAPI schemas accurate (response models declared on routes).
- Async route handlers and async DB access throughout; no blocking I/O in request paths.
- Layering: routes (thin) → service functions (business logic) → repository/DB layer. No business logic in route handlers.
- Config via a single Pydantic Settings object reading env vars; never `os.getenv` scattered through the code.
- Raise `HTTPException` (or domain exceptions mapped in one handler) — don't return error dicts.
- Tests mirror the source layout in `backend/tests/`; use pytest fixtures over setup duplication; mock external services (email, QStash, Gmail) at the client boundary, not deep internals.

**Frontend (Next.js/TypeScript):**
- TypeScript strict mode; no `any` unless justified with a comment.
- Named exports for components (default export only where Next.js requires it: pages, layouts).
- Server Components by default; add `"use client"` only when interactivity requires it.
- All backend calls go through a single typed API client module (`src/lib/api.ts`) — no scattered `fetch` calls with hand-typed responses.
- Tailwind for styling; no separate CSS files beyond `globals.css`.
- **Architecture follows the `nextjs-patterns` skill** — Server/Client boundary, the `src/lib/api.ts` client, Server Actions, session cookie handling, loading/error conventions, and the caching decision are settled there. Invoke it before writing anything in `frontend/`.
- **UI follows `docs/design/DESIGN_GUIDE.md`** — design tokens, components, responsive rules and states are already decided there. Define tokens once in `globals.css` via `@theme`; never hardcode a hex or pixel value in a component. `docs/design/home.html` is the reference implementation of the home screen; when it and the guide disagree, the prototype wins.

**Both:**
- Small, focused files — a file doing too much gets split, not extended.
- Comments only for non-obvious constraints or "why", never narrating what the code does.
- Conventional commit messages (`feat:`, `fix:`, `chore:`, ...), no AI attribution (see Workflow Rules).

## Milestone Plan
Checkpoint with the owner **between** milestones; run autonomously **within** them.

1. **Schema + auth** — build, then owner reviews briefly (~5 min) before continuing.
2. **CRUD API + tests** — autonomous OK, gated by tests passing.
3. **Reminder scheduler (QStash) + weekly digest email** — autonomous OK, gated by tests passing.
4. **JD keyword extraction vs. resume comparison** — autonomous OK, gated by tests passing.
5. **Frontend for F-01…F-06** — its own milestone, by owner decision (2026-09-18); gated by lint, build and the API contract fixture test.
6. **Final polish pass (UI/tone)** — needs owner review; "looks right" isn't agent-verifiable.

Milestones are delivery sequencing only — the behavior each one must deliver is defined by the corresponding PRD features. Build the MVP scope (PRD §7) and nothing else: anything in the PRD's Non-goals (§5) or Future Features (§14) stays unbuilt, documented as a v2 note in the README if worth mentioning.

## App Features
Defined in `docs/PRD.md` §7 (features F-01…F-06, each with acceptance criteria), with scope boundaries in §5 and data rules in §8. Do not restate or re-derive product requirements here — go to the PRD.

## Stub-and-Defer Rule (within a milestone)
When a task needs a human action (account creation, OAuth app registration, API keys, DNS, payment):
1. Use a placeholder (e.g. `GMAIL_CLIENT_ID=REPLACE_ME`) so the code still runs and compiles.
2. Build against the **official API docs** with mocked responses for tests.
3. Append the required human action to `MANUAL_STEPS.md` with exact instructions.
4. Continue to the next task within the milestone — don't block waiting.

This rule does **not** override milestone checkpoints: at the end of a milestone, stop and report (including any accumulated manual steps). Mocked ≠ verified — anything stubbed (especially OAuth) needs one real end-to-end test with live credentials before it counts as done.

## Reference Docs
- `docs/PRD.md` — product spec. What to build; acceptance criteria are the definition of done.
- `docs/STATUS.md` — where the project stands, what comes next, decisions already made, known open items. Read it at the start of every session and update it at the end of every milestone.
- `docs/API_CONTRACT.md` — the backend↔frontend contract: auth mechanism, error shape, error codes, wire naming. Overrides any pattern skill's defaults; read before writing anything that crosses the API boundary.
- `docs/design/DESIGN_GUIDE.md` — UI source of truth. Tokens, components, layout, states, accessibility floor. Read before building any screen.
- `docs/design/home.html` — static prototype of the home screen; the reference implementation for the guide.
