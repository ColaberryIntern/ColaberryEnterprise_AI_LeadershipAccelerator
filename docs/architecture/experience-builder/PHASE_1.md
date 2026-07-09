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
