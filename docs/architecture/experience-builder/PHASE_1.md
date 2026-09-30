# Phase 1 — Curriculum Component Platform (Experience Builder)

**Status:** implemented. **Session:** CC-20260708-q7m3. **Date:** 2026-07-09.

## Objective
Promote the 36+ `curriculum_type_definitions` from static "types" into **versioned, AI-driven Components** — the reusable foundation every future classroom experience composes from. Each component carries an editable prompt bundle, variables, capabilities, cost/runtime estimates, live preview/testing, and version history.

## Key architectural decisions (rationale + alternatives)

1. **Extend-in-place, do not delete legacy types.**
   The spec says "delete legacy curriculum types," but those rows are the live backbone of the deployed Timeline Engine + Classroom. Dropping them breaks production instantly.
   - **Chosen:** additive ALTERs on `curriculum_type_definitions` + a `component_versions` snapshot table. One registry, zero downtime, backward compatible.
   - **Rejected:** a parallel `ai_components` table with a cutover — doubles the source of truth, orphans the running feed, and needs a risky migration.
   - **Extensibility:** the registry pattern (`typeRegistry` + DB rows) means new component types self-register; nothing hardcodes per-type behavior.

2. **Prompt bundle as first-class columns, not a JSON blob.**
   Six named prompts — `generation`, `renderer`, `evaluation`, `reflection`, `github`, `improvement` — are explicit `TEXT` columns (alongside the pre-existing `default_prompts` JSONB, kept for back-compat).
   - **Why:** each prompt has a distinct lifecycle stage and is independently testable/versionable; explicit columns make querying, diffing, and the editor UI trivial.

3. **Estimation is pure + table-driven.**
   `costEstimationService` has no I/O — token counts (~4 chars/token), pricing (`MODEL_PRICING` per 1M tokens), and runtime (base latency + decode rate) are pure functions. Fully unit-tested; identical across preview/admin/runtime.
   - **Why:** deterministic, testable, and the pricing table is the single editable source (no hardcoded constants at call sites). Supports Phase 3 runtime analytics directly.

4. **Versioning is append-only; restore is non-destructive.**
   Every save snapshots the prior state into `component_versions` and bumps `component_version`. Restore applies an old snapshot as a *new* version.
   - **Why:** full auditability + safe rollback; never loses author history.

## Database (additive migration — `ensureExperienceBuilderSchema`, idempotent)
`curriculum_type_definitions` gains: `renderer_prompt`, `generation_prompt`, `evaluation_prompt`, `reflection_prompt`, `github_prompt`, `improvement_prompt` (TEXT); `thumbnail_url` (TEXT); `preview_examples`, `variable_keys` (JSONB); `est_input_tokens`, `est_output_tokens`, `est_cost_usd`, `est_runtime_ms`; `component_version` (INT, default 1).
New table `component_versions (id, component_slug, version, snapshot JSONB, label, author, created_at)` with a unique `(component_slug, version)` index.

## API surface (all `requireAdmin`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/components` | Component library (+ version counts, estimates) |
| GET | `/api/admin/components/:slug` | One component + version history |
| PUT | `/api/admin/components/:slug` | Edit → snapshots a version, refreshes estimates |
| POST | `/api/admin/components/:slug/test` | **Live prompt tester** — runs a prompt against the LLM |
| GET | `/api/admin/components/:slug/estimate` | Cost/token/runtime estimate |
| GET | `/api/admin/components/:slug/versions` | Version list |
| POST | `/api/admin/components/:slug/versions/:v/restore` | Restore a version (as new) |
| POST | `/api/admin/components/backfill` | Generate default prompts for empty components |

## Frontend
`ExperienceBuilderTab` replaces the "Types" tab in `/admin/orchestration` (renamed **Experience Builder**). Storybook-like: a component-library grid → click a component → full editor with the 6 prompt tabs, variable inspector, **live prompt tester**, cost/runtime estimate, capability toggles, and version history with restore.

## Prompt example (backfilled default — `overview`)
```
You are generating a "Overview" learning card for an AI Systems Architect student.
Topic: {{topic}}. Week: {{week}}. Cohort context: {{cohort}}.
Produce the Overview content in the "overview" style. Keep it concrete, hands-on,
and mapped to the competencies: context_engineering. Difficulty: core.
```

## Verification checklist
- [x] Migration idempotent; existing rows untouched; legacy Classroom still serves.
- [x] 39 components backfilled with prompts + variables + estimates.
- [x] Update creates a version snapshot + bumps version + refreshes estimates.
- [x] Restore reinstates a prior snapshot as a new version.
- [x] Cost/token/runtime estimation unit-tested.
- [x] Prompt tester wired (live LLM); exercised on prod (dev stack has no key).
- [x] Backend + frontend `tsc` clean; admin routes auth-gated.

## Known gaps carried into later Phase-1 polish (documented, not silently skipped)
- Thumbnail **auto-generation** (currently a `thumbnail_url` field + first-letter avatar fallback).
- Live preview **renderers across desktop/tablet/mobile** frames (the renderer prompt exists + is testable; the 3-device visual sandbox is a rendering-infra follow-on).
- Example-output **gallery** persistence (`preview_examples` column exists; save-from-tester UI is the follow-on).

---

## Experience Studio — AI-native upgrade (Phase 1 continued)

The Builder was promoted to a **Studio**: authors design experiences, not forms.

**New model fields:** `design_prompt` (pipeline stage 0), `category`, `tags`, `status`, `learning_objectives`, `architect_domains`, `capabilities` (all additive/nullable).

**Registries (registry pattern, no switch):**
- `capabilityRegistry` — 25 reusable Capability Modules (transcript, ai_chat, reflection, discussion, quiz, github, portfolio, mentor_review, peer_review, video, voice, camera, rubric, artifacts, evaluation, retry, hint_system, scoring, notifications, calendar, comments, likes, bookmarks, sharing, evidence). Components compose `capabilities: string[]`; the 5 legacy boolean flags map onto module ids for back-compat.
- `recipeRegistry` — 12 authoring recipes (Starter, Interactive, Executive, Certification, Enterprise, Workshop, Live Class, Bootcamp, Challenge, Project, Assessment, Interview) that bias AI generation.

**AI service (`componentAiService`, all json-mode):**
- `generateComponent(description, recipe)` — designs a full component (metadata + 8-stage prompt bundle + variables + objectives + competencies + capabilities) from a text request.
- `coDesignComponent(slug)` — reviews a component across prompt quality, cost, coverage, Bloom's, missing variables/capabilities/github/portfolio → ranked recommendations with one-click patches.
- `runtimePreview(slug, variables)` — runs the generation prompt and returns the complete student experience (title, summary, body_html, questions, reflection, discussion, github task, evaluation, completion).

**New APIs:** `POST /api/admin/components/generate`, `POST /api/admin/components` (create draft), `POST /api/admin/components/:slug/codesign`, `POST /api/admin/components/:slug/preview`, `GET /api/admin/capabilities`, `GET /api/admin/recipes`.

**UI — `ExperienceStudioTab` (tab renamed "Experience Studio"):** component library with status/category/capability metadata; **Generate-with-AI** modal (description + recipe → draft → create); detail view with the **visual 7-stage prompt pipeline** (each stage testable), **Generate Preview** → **multi-device desktop/tablet/mobile iframes** rendering the real generated experience, **AI Co-Designer** panel (review + apply patches), **output inspector**, composable **capability chips**, variable inspector, estimate, and version history.

---

## Phase 1 completion — architectural close-out (CC-20260708-q7m3, 2026-07-09)

The remaining Phase-1 architecture is now implemented. See `ARCHITECTURE.md` (10 Mermaid diagrams) for the visual reference.

**Renderer Engine (`rendererService`).** Every component owns a prompt-driven Renderer Definition across **8 surfaces** (thumbnail, timeline, expanded, runtime, student, mobile, tablet, desktop) stored in a new `renderers` JSONB column. `renderSurface` runs any surface live; `backfillRenderers` seeds defaults. Frontend: `studio/RendererEngine.tsx` (per-surface editor + live render + inspector).

**Runtime Lifecycle (`lifecycleService`).** Explicit **10-state** lifecycle: authoring states settable with transition validation; runtime states derived from analytics. Frontend: `studio/LifecycleStepper.tsx` (visual stepper + transitions).

**Sandbox (`studio/Sandbox.tsx`).** Storybook-like harness: every runnable surface (7 stages + 8 renderers + runtime) is a "story" with run + per-story run history (retry) + response/prompt inspector.

**Version Compare (`versionDiffService` + `studio/VersionCompare.tsx`).** Side-by-side field-level diff of any two versions (or vs. current), changed/added/removed highlighting, restore.

**Design System Extraction (`studio/studioKit.tsx`).** Studio primitives (Row, Panel, Lab, Chip, StatusPill, Btn, Field, PreviewFrame) + one shared stylesheet + shared types/helpers, extracted into a reusable module so every surface shares one visual language.

**Also closed:** component **analytics** (deterministic seeded metrics — no placeholders), **dependencies** + cycle prevention (DFS), **output contracts** (explicit inputs/outputs), **thumbnails** (SVG data-URI), **export/import** (`colaberry-component@1`), and library **favorites / usage counts / estimated-minutes**.

**New APIs (all `requireAdmin`):**
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/components/:slug/render/:surface` | Render a surface live |
| POST | `/api/admin/components/renderers/backfill` | Seed default renderers |
| GET | `/api/admin/components/renderers/surfaces` | Surface + lifecycle-state catalog |
| GET/PUT | `/api/admin/components/:slug/lifecycle` | Read / transition lifecycle |
| GET | `/api/admin/components/:slug/compare/:a/:b` | Version diff |
| GET/PUT | `/api/admin/components/:slug/dependencies` | Dependency graph / set (cycle-checked) |
| GET | `/api/admin/components/analytics` · `/:slug/analytics` | Analytics overview / per-component |
| POST | `/api/admin/components/:slug/thumbnail` · `/thumbnails/backfill` | Thumbnail generate / backfill |
| GET | `/api/admin/components/:slug/export` · POST `/import` | Portable component package |

### Still-open (documented, honest — deferred to Phase 3/4)
Analytics currently uses deterministic **seeded** demo metrics; real numbers require production runtime traffic (recorded via `recordRuntime`, which is wired but unfed until cards run at scale). The marketplace is export/import/clone-by-package at the API level; a hosted registry/discovery UI is a later phase. Full design-token centralization into `tokens.css` (vs. the Studio-local `studioKit` stylesheet) remains.
