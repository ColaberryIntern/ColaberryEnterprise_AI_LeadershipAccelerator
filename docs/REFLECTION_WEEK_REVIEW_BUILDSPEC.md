# Build Spec — Reflection "Week in Review" (per-student layer)

**Status:** roster-injection shipped in this PR; the per-student layer below is the follow-up.
**Owner:** Ali (DRI). **Author:** Claude Code, Session CC-20260722-r9k4.

## Where we are

The `reflection` curriculum type is the weekly **week-closer**. As of this PR it is a
`SECTION_ROSTER_TYPES` member, so its generation receives the week's real activity
roster ("THIS WEEK'S ACTIVITIES") on top of the blueprint. The authored prompt
(`REFLECTION_GENERATION_PROMPT` in `seedComponentAuthoring.ts`) renders a light
"Ledger": a header, three stat tiles, **every activity grouped by phase**, and two
strategic signal prompts (Readiness, Application), as self-contained styled `body_html`.

Verified on dev (Week 1, production `generateCardContent` path @ 3200 tokens):
title *"Your Week in Review — Claude Code Foundations + Workspace"*, **15/15** real
activity titles captured across all six phases, the reflection card correctly excluded
from its own roster, light theme, no scripts.

### What this gives us
A correct, class-wide reflection that **names every activity the week contained**,
grounded in the real curriculum — no more generic "what did you learn?".

### What it still cannot do (this is the follow-up)
The generated `body_html` is **class-wide and cached ~30 days** (per
`cardContentService.ensureFreshContent`), and the runtime forbids scripts in it. So
it cannot show, per student:
- **Actual results** — this student's quiz/eval scores, commits, completions, time-on-task.
- **Skill deltas / Growth Score** — needs the student's history to compute movement.
- **Interactive capture** — the Readiness slider and chips can't run (no scripts in body_html).
- **AI Memory / journey** — "three weeks ago you wrote…", filling concept mastery.

Those are the pieces from the approved Ledger/workspace mockups that require code.

## Proposed build

### 1. `reflectionStudioContext(userId, programId, week)` — cross-card history service
New service `backend/src/services/timeline/reflectionStudioContext.ts`. Aggregates the
student's real activity for the week (and cumulative, for deltas), reading across **every**
card type:

| Signal | Source |
|---|---|
| Per-activity completion + timestamps | `timeline_card_progress` (by user, program, week) |
| Quiz / evaluation scores | `assessmentService` results / `timeline_card_progress` payloads for `knowledge_check`, `evaluation` |
| Survey responses | `timeline_survey_responses` |
| GitHub commits / build artifacts | card `github` / `artifact_ids` + progress evidence |
| Prompt-lab / implementation submissions | progress evidence for `prompt_lab`, `implementation_task`, `setup_lab` |
| Time invested | summed dwell/`estimated_time` on completed cards |
| Skill deltas | this week's competency gains vs. the running `user_curriculum_profiles` skill vector |
| Prior reflections | previous weeks' saved reflection entries (for AI Memory / journey) |

Returns a **typed** `ReflectionStudioContext` (no untyped JSON blobs — CLAUDE.md contract
rule). Graceful-degrade to `null`/empty like `blueprintContext` (never throws into the
render path). Pure aggregation is unit-tested; the DB reads are integration-tested against
the dev sandbox.

### 2. Persistence for the captured signals
New table `reflection_entries` (or a typed column set), keyed `(user_id, program_id, week)`
— **unique**, so re-submitting updates in place (idempotent). Stores: `readiness` (1-5),
`application` (enum + free text), `direction` (enum), `biggest_insight` (text), `flagged_concepts`
(string[]), `created_at`, `updated_at`. Downstream consumers: spaced-review scheduler, mentor
focus, sponsor/employer ROI reporting, and the career-path recommender.

### 3. API
- `GET  /api/portal/reflection/:programId/:week/context` → `ReflectionStudioContext` for the current user (auth: session + ownership).
- `POST /api/portal/reflection/:programId/:week/signals` → upsert a `reflection_entry` (Zod-validated body; 400 on malformed; unique-key upsert = idempotent).

### 4. Bespoke `reflection` renderer (frontend)
A dedicated renderer for the `reflection` render band (three surfaces from the mockups:
**thumbnail** feed tile, **right-side popup** drawer, **workspace**). It renders the
**class-wide `body_html` evidence list** (already correct from this PR) and hydrates the
**per-student layer** from `GET …/context`: real Growth Score, skill gain-meters, concept
mastery, journey rail, and the interactive Readiness slider + Application/Direction chips
that `POST` to `…/signals`. This is real render behavior → code, not a component edit.
Reference mockups (this session): the locked **Ledger** drawer and the 3-view Week-1 page.

### 5. Failure-first (CLAUDE.md)
- Context service fails → render the class-wide `body_html` alone; per-student widgets show a quiet "your stats will appear as you complete activities" state. No blank card.
- Signals POST fails → optimistic UI with retry; the reflection is never blocked on the write.
- All external/DB reads time-boxed; correlation id through the request.

### 6. Tests (per feature: happy / failure / boundary / idempotency)
- Unit: `reflectionStudioContext` aggregation (mocked rows), score/delta math, empty-week.
- Integration: context endpoint against dev sandbox; signals upsert twice → one row (idempotency).
- Contract: `ReflectionStudioContext` type + Zod request schema.

## Phasing
1. **Service + persistence + API** (backend, testable in isolation).
2. **Renderer — drawer surface** (the primary popup), wired to the API.
3. **Thumbnail + workspace surfaces**.
4. **Downstream consumers** (spaced review, mentor focus, ROI, recommender) — separate PRs.

## Out of scope here
Deploy to prod (after-hours + review). This spec is for approval before build.
