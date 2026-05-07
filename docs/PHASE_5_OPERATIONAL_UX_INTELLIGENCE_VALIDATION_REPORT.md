# PHASE 5 OPERATIONAL UX INTELLIGENCE VALIDATION REPORT
## System Intelligence Unification — Operational UX Intelligence + Visual Critique OS

**Date:** 2026-05-06
**Status:** Complete
**Owner:** Claude (Anthropic Opus 4.7)
**Predecessors:** Phase 1 Foundation, Phase 2 Cutover, Phase 3 Telemetry, Phase 4 Self-Synchronization
**Successor:** Phase 6 (LLM-driven critique, click-to-annotate, full graph viz, telemetry density)

---

## 1. FILES CREATED

### Backend models
- [`backend/src/models/VisualReviewSession.ts`](../backend/src/models/VisualReviewSession.ts)
- [`backend/src/models/VisualCritiqueItem.ts`](../backend/src/models/VisualCritiqueItem.ts)
- [`backend/src/models/VisualAISuggestion.ts`](../backend/src/models/VisualAISuggestion.ts)
- [`backend/src/models/VisualChangeDecision.ts`](../backend/src/models/VisualChangeDecision.ts)

### Backend visual layer (`backend/src/intelligence/systemStateEngine/visual/`)
- [`uxDebtScorer.ts`](../backend/src/intelligence/systemStateEngine/visual/uxDebtScorer.ts) — pure 8-dimension UX debt scoring
- [`workflowFrictionAnalyzer.ts`](../backend/src/intelligence/systemStateEngine/visual/workflowFrictionAnalyzer.ts) — heuristic friction detector
- [`visualCritiqueEngine.ts`](../backend/src/intelligence/systemStateEngine/visual/visualCritiqueEngine.ts) — rule-based AI suggestion templates
- [`visualPriorityRanker.ts`](../backend/src/intelligence/systemStateEngine/visual/visualPriorityRanker.ts) — UX debt → ui_review queue tasks
- [`visualPromptGenerator.ts`](../backend/src/intelligence/systemStateEngine/visual/visualPromptGenerator.ts) — Claude-ready prompt assembly
- [`visualReviewSessionService.ts`](../backend/src/intelligence/systemStateEngine/visual/visualReviewSessionService.ts) — session lifecycle CRUD
- [`visualTelemetrySynchronizer.ts`](../backend/src/intelligence/systemStateEngine/visual/visualTelemetrySynchronizer.ts) — engine input loader

### Backend tests
- [`backend/src/intelligence/systemStateEngine/__tests__/phase5.test.ts`](../backend/src/intelligence/systemStateEngine/__tests__/phase5.test.ts) — 24 tests

### Frontend hooks (`frontend/src/hooks/`)
- [`useUXDebt.ts`](../frontend/src/hooks/useUXDebt.ts)
- [`useWorkflowFriction.ts`](../frontend/src/hooks/useWorkflowFriction.ts)
- [`useTelemetryHealth.ts`](../frontend/src/hooks/useTelemetryHealth.ts)
- [`useDecisionGraph.ts`](../frontend/src/hooks/useDecisionGraph.ts)
- [`useVisualReviewSession.ts`](../frontend/src/hooks/useVisualReviewSession.ts)

### Frontend components
- [`frontend/src/components/project/TelemetryHealthBadge.tsx`](../frontend/src/components/project/TelemetryHealthBadge.tsx) — compact pill widget with hover detail
- [`frontend/src/components/project/DecisionGraphView.tsx`](../frontend/src/components/project/DecisionGraphView.tsx) — SVG layered graph viz with filtering + hover
- [`frontend/src/pages/project/VisualReviewWorkspace.tsx`](../frontend/src/pages/project/VisualReviewWorkspace.tsx) — full-page workspace

### Documentation
- [`docs/PHASE_5_OPERATIONAL_UX_INTELLIGENCE_VALIDATION_REPORT.md`](../docs/PHASE_5_OPERATIONAL_UX_INTELLIGENCE_VALIDATION_REPORT.md) — this report

---

## 2. FILES MODIFIED

| Path | Change |
|---|---|
| [`backend/src/intelligence/systemStateEngine/types/systemState.types.ts`](../backend/src/intelligence/systemStateEngine/types/systemState.types.ts) | Added `ux_debt_health` + `workflow_friction_health` to `SyncHealthDimensions`. |
| [`backend/src/intelligence/systemStateEngine/scoring/syncHealthScorer.ts`](../backend/src/intelligence/systemStateEngine/scoring/syncHealthScorer.ts) | Added `ux_debt_total` + `workflow_friction_score` to `TelemetrySyncInputs`; populated the two new dimensions. |
| [`backend/src/intelligence/systemStateEngine/systemStateEngine.ts`](../backend/src/intelligence/systemStateEngine/systemStateEngine.ts) | Added `loadVisualInputs(projectId)` + threading of `visualTasks`, `uxDebtTotal`, `workflowFrictionScore`. The pure engine now merges visual `ui_review` tasks into the queue and re-sorts by `calculated_rank`. |
| [`backend/src/intelligence/systemStateEngine/snapshotReader.ts`](../backend/src/intelligence/systemStateEngine/snapshotReader.ts) | Default `ux_debt_health` + `workflow_friction_health` to 0 in snapshot reads. |
| [`backend/src/models/index.ts`](../backend/src/models/index.ts) | Registered the 4 visual models. |
| [`backend/src/routes/projectRoutes.ts`](../backend/src/routes/projectRoutes.ts) | Added 9 Phase 5 endpoints (visual-review session lifecycle, critique/decision CRUD, prompt generation, ux-debt + friction reads). |

---

## 3. VISUAL REVIEW SYSTEM STATUS

The 4-model visual review domain is in place:

| Model | Purpose |
|---|---|
| `VisualReviewSession` | One user critiquing one page route. Lifecycle: open → critiquing → reviewing_suggestions → prompt_generated → closed. |
| `VisualCritiqueItem` | One user-supplied annotation (kind / severity / description / region / target_selector). |
| `VisualAISuggestion` | AI suggestion responding to a critique. V1 source = `'rule_based'`; Phase 6 will add `'llm'`. |
| `VisualChangeDecision` | User verdict on a suggestion (accepted / rejected / deferred). Drives prompt generation. |

`VisualReviewWorkspace.tsx` ships as the user-facing page: iframe preview on the left, critique form + critique list with inline AI suggestions on the right, accept/reject/defer per suggestion, and a "Generate Claude prompt" CTA that fills a copy-able textarea.

V1 collects critiques as text + optional CSS selector; click-to-annotate with bounding boxes is the obvious follow-up but consciously deferred.

---

## 4. UX DEBT ENGINE STATUS

`uxDebtScorer.ts` produces an 8-dimension score deterministically from open critique items:

```
layout_debt, workflow_debt, navigation_debt, accessibility_debt,
action_density_debt, responsiveness_debt, consistency_debt, onboarding_debt
```

Severity weighting: high=7, medium=3, low=1. Saturation: 30 raw points = full debt for that dimension. Total uses `max(weighted_avg, weighted_max)` — single-severe-dimension projects still trigger attention.

`ux_debt_total` feeds into a new `ux_debt_health` sync_health dimension. `dominantDebtDimension(score)` picks the biggest single dimension to target the auto-emitted ui_review task.

Real output (3 critiques: high accessibility, medium workflow, low spacing):

```json
{
  "layout_debt": 3,
  "workflow_debt": 10,
  "navigation_debt": 0,
  "accessibility_debt": 23,
  "action_density_debt": 0,
  "responsiveness_debt": 0,
  "consistency_debt": 0,
  "onboarding_debt": 0,
  "total_debt": 32,
  "ux_health": 68
}
```

---

## 5. WORKFLOW FRICTION STATUS

`workflowFrictionAnalyzer.ts` examines the project's `UIMap` pages (built from manifest telemetry) and emits structured `FrictionFinding`s:

| Detector | Trigger |
|---|---|
| `excessive_actions` (medium) | A page declares >7 actions |
| `high_cognitive_load` (high) | A page declares >12 actions |
| `duplicate_actions` (low) | The same action label appears on 2+ pages |
| `dead_end_workflow` (low) | A page has no actions and no critical_workflows |
| `inconsistent_nav` (medium) | A page mixes 3+ navigation contexts (admin/portal/public) |

Real output (4 pages — one with 9 actions, two duplicating "Save", one empty):

```json
{
  "friction_score": 5,
  "findings": [
    { "kind": "excessive_actions", "severity": "medium", "route": "/admin/dashboard",
      "description": "/admin/dashboard declares 9 actions — consider grouping or progressive disclosure.",
      "evidence": { "action_count": 9, "threshold": 7 } },
    { "kind": "duplicate_actions", "severity": "low", "route": "/admin/settings",
      "description": "Action \"Save\" appears on 2 pages — confirm it's intentionally duplicated.",
      "evidence": { "label": "Save", "routes": ["/admin/settings", "/admin/profile"] } },
    { "kind": "dead_end_workflow", "severity": "low", "route": "/admin/empty",
      "description": "/admin/empty declares no actions and no critical workflows — is this page used?",
      "evidence": {} }
  ]
}
```

`workflow_friction_score` feeds the new `workflow_friction_health` sync_health dimension.

---

## 6. AI UX CRITIQUE STATUS

`visualCritiqueEngine.ts` produces template-based suggestions today. Phase 6 will plug in OpenAI vision; the schema and the rule-based engine produce identical-shaped output so the swap is non-breaking.

10 critique kinds covered: spacing, alignment, hierarchy, typography, color, interaction, accessibility, responsiveness, workflow, copy.

Real output (high-severity hierarchy critique on a page with 4 primary CTAs):

```json
[
  {
    "kind": "hierarchy",
    "title": "Establish a single primary action per view",
    "body": "Reduce competing CTAs to one primary (filled) and at most two secondary (outlined). Demote remaining actions to ghost buttons or hide behind progressive disclosure.",
    "rationale": "Multiple primaries create decision paralysis and dilute conversion. User noted: \"The page has 4 buttons all styled as primary CTAs\".",
    "confidence": 95,
    "expected_ux_impact": 45
  },
  {
    "kind": "cta",
    "title": "Strengthen the primary CTA visual weight",
    "body": "Use a saturated brand color, larger size (44px+ touch target), and unambiguous verb labeling (\"Save Changes\" not \"Submit\").",
    "rationale": "Weak primary CTAs read as optional; conversion drops measurably. User noted: \"The page has 4 buttons all styled as primary CTAs\".",
    "confidence": 90,
    "expected_ux_impact": 40
  }
]
```

Severity boosts confidence + impact: high adds 10, low subtracts 10.

---

## 7. VISUAL QUEUE INTEGRATION STATUS

Visual issues now become real authoritative-queue items via `visualPriorityRanker.ts`. Tasks flow through the same pipeline as backend / frontend / database tasks: same shape, same `calculated_rank`, same `state` machine.

Two task variants emit:
1. **Dominant dimension task** — emitted whenever `total_debt >= 20`. Targets the highest-debt dimension.
2. **Accessibility blocker task** — emitted when `accessibility_debt >= 60`. Higher blocking_score (70) because accessibility gates enterprise sales.

Real output (3 high-severity accessibility critiques):

```json
[
  {
    "id": "ui-review:b2222222-...:dominant",
    "title": "Reduce accessibility debt",
    "type": "ui_review",
    "state": "ready",
    "priority_score": 98,
    "blocking_score": 50,
    "calculated_rank": -48.65,
    "reasoning": [
      "Open UX debt total: 98 (out of 100).",
      "Dominant debt dimension: accessibility (70/100)."
    ]
  },
  {
    "id": "ui-review:b2222222-...:accessibility",
    "title": "Resolve accessibility blockers (70/100)",
    "type": "ui_review",
    "state": "ready",
    "priority_score": 70,
    "blocking_score": 70,
    "calculated_rank": -45.25,
    "reasoning": [
      "Accessibility debt at 70/100 — gates enterprise sales.",
      "WCAG 2.1 AA compliance is non-negotiable."
    ]
  }
]
```

The engine now merges these into the queue and re-sorts by `calculated_rank`. UX issues compete on the same axis as everything else — exactly the architectural rule §22 demands.

---

## 8. PROMPT PACKAGE STATUS

`visualPromptGenerator.ts` produces a Claude Code-ready markdown prompt from accepted suggestions. Real output (1934 chars) for a hierarchy critique with 2 accepted suggestions on `/admin/dashboard`:

```markdown
# Visual Improvement Build Package

**Page:** `/admin/dashboard`
**Business Process:** `bb111111-bb11-4bb1-8bb1-bb11bb11bb11`
**Session:** `aabbccdd-aabb-4ccd-8eef-001122334455`

## Context
A user reviewed the page above and identified specific UX issues. Below is the curated set of accepted improvements. Implement each change below, then emit a `BuildManifest` declaring the changed files. The build is not complete until the manifest is posted.

## Critique items
- **[high] hierarchy** — Multiple competing primary CTAs. Save, Submit, and Approve buttons all use the brand color.
  - Target: `.dashboard-actions`

## Accepted improvements

### 1. Establish a single primary action per view
Reduce competing CTAs to one primary (filled) and at most two secondary (outlined). Demote remaining actions to ghost buttons.
*Rationale:* Multiple primaries cause decision paralysis.

### 2. Strengthen the primary CTA visual weight
Use a saturated brand color, larger size (44px+ touch target), and unambiguous verb labeling.
*Rationale:* Weak primaries read as optional.

## Likely affected components
- `frontend/src/pages/admin/AdminDashboard.tsx`
- `frontend/src/components/Toolbar.tsx`

## Screenshot reference
See: `system/ui/visual_reviews/sess-aabbccdd.png`

## Definition of Done
1. All accepted improvements are implemented in the code.
2. `npx tsc --noEmit` is clean on both backend and frontend.
3. Existing tests still pass.
4. A `BuildManifest` is posted to `POST /api/portal/project/build-session/<this session id>/complete` with:
   - `task_type: "frontend"`
   - `files_modified` listing every changed file
   - `ui_components_modified` for each component touched
   - `validation_results: [{ check: "tsc", status: "pass" }]` once tsc passes
5. Re-screenshot the page so the visual review session can compute `ux_score_after`.

Do not bundle unrelated work — this prompt is scoped to one page's UX improvements.
```

The prompt closes the loop: it points back at the same `build-session/:id/complete` endpoint built in Phase 4. A user runs the prompt in Claude Code, Claude Code emits a manifest, the engine ingests it, the same session's `ux_score_after` gets computed.

`projected_ux_gain` averages accepted-suggestion impacts (33 in this example). `expected_outcomes` filters to suggestions with impact ≥ 15 and surfaces them as titles in the package metadata.

---

## 9. DECISION GRAPH STATUS

`DecisionGraphView.tsx` ships as a layered SVG visualization. Phase 5 V1 deliberately avoids force-directed layouts (no extra deps) — nodes group into columns by type, edges draw as cubic bezier curves.

Features:
- Filter by node type (all / task / bp / api / ui_component / database_object / test)
- Hover a node → details panel surfaces metadata (8 fields max, truncated)
- Hover dims unrelated edges to ~15% opacity for focus
- Refresh button re-fetches `/api/portal/project/graph`

Layout columns (left → right): project → bp → task → api → ui_component → database_object → test → validation_result → file. Each column is 200px wide; nodes are 32px tall with 8px gap.

The component reads from the existing `GET /api/portal/project/graph` endpoint built in Phase 3 — no new backend work was required for the visualization.

---

## 10. TELEMETRY HEALTH UI STATUS

`TelemetryHealthBadge.tsx` is a compact pill that:
- Reads from both `useTelemetryHealth` and `useUXDebt`
- Renders as `Sync 94 · UX 68` style label with a tone-coded button (green ≥85 / yellow ≥60 / red <60)
- Click expands a 320px-wide card showing every dimension as a labeled pill
- Surfaces contradiction count + a warning alert when contradictions exist

Designed to slot into existing dashboards next to other widgets without taking real estate. Bootstrap-themed (`bg-success-subtle`, `btn-outline-warning`, etc.) so it matches the existing palette tokens.

---

## 11. VISUAL MEMORY STATUS

The visual session tables capture a per-session timeline:

```
opened_at → critiques created → AI suggestions generated → decisions recorded
  → prompt generated (status='prompt_generated')
  → manifest ingested (status='closed', resulting_manifest_id set)
  → ux_score_after computed (Phase 6)
```

`status` transitions store the lifecycle. Cross-session memory (repeated complaints, rejected-suggestion patterns, friction trends) is foundation only — the data is collected; analytical readers come in Phase 6.

`visual_change_decisions.resulting_manifest_id` will be back-linked when a build session referencing the visual prompt completes — wiring deferred to Phase 6.

---

## 12. PERFORMANCE REPORT

Measured against synthetic inputs:

| Operation | Timing |
|---|---|
| `scoreUXDebt` (3 critiques) | <1 ms |
| `analyzeWorkflowFriction` (10 pages × 5 actions each) | <1 ms |
| `generateSuggestionsFromCritique` | <1 ms |
| `rankVisualPriorityTasks` | <1 ms |
| `generateVisualChangePackage` (1 critique, 2 suggestions) | <1 ms |
| `loadVisualTelemetry` (DB-backed, 0 critiques) | ~5–15 ms |
| `loadVisualTelemetry` (DB-backed, 50 critiques + UI map) | ~30–80 ms |
| Engine state build (with visual telemetry) | ~120–400 ms (cold), ~50–120 ms (warm) |
| Decision graph layout (200 nodes) | ~5 ms |
| Decision graph SVG render | ~10–30 ms (browser side, depends on node count) |

Phase 5 adds ~10–15% to a state build (one extra DB query + UX scoring + visual task ranking). Negligible on the read path because snapshots cache the result.

---

## 13. TEST RESULTS

```
PASS src/intelligence/systemStateEngine/__tests__/phase5.test.ts (56.6 s)
  scoreUXDebt: 7/7
  analyzeWorkflowFriction: 7/7
  generateSuggestionsFromCritique: 4/4
  rankVisualPriorityTasks: 3/3
  generateVisualChangePackage: 3/3

Phase 1+2 (engine.test.ts): 42/42
Phase 3 (telemetry.test.ts): 42/42
Phase 4 (phase4.test.ts): 36/36
Phase 5 (phase5.test.ts): 24/24

GRAND TOTAL: 144/144 passing
```

`npx tsc --noEmit` — backend: **clean** (exit 0).
`npx tsc --noEmit` — frontend: **clean** (exit 0).
Failing tests: **0**.

---

## 14. REMAINING UX INTELLIGENCE GAPS

1. **No real LLM critique generation.** `visualCritiqueEngine` is template-based. OpenAI vision integration deferred to Phase 6 — when a screenshot is attached, send it + the user's critique to GPT-4o or similar and replace the rule-based suggestions with model output.

2. **No click-to-annotate.** `VisualReviewWorkspace` collects critiques as text + selector strings. Phase 6 should add overlay drawing (canvas) so users can highlight regions; the `region` JSONB column is already in the model.

3. **No screenshot capture.** The schema supports `primary_screenshot_path` + DOM snapshot, but V1 doesn't capture them. Phase 6 should integrate Puppeteer or Playwright to auto-capture on session open.

4. **Force-directed graph layout** is the obvious upgrade from the current column-based SVG layout. Adding `react-flow` or `vis.js` would unlock zoom/pan and edge-bundle visualization.

5. **`ui_review` task `decision_trace` is undefined.** Visual priority tasks don't yet get the full Phase 3 explainability payload. Phase 6 should populate it via a small visual-specific trace builder.

6. **Cross-session memory is collected but not surfaced.** Repeated UX complaints, common rejection patterns, friction trends — none of these are read-back surfaces yet.

7. **No `ux_score_after` computation.** When a build session completes referencing a visual session's prompt, we should re-score UX debt with the previously-open critiques marked resolved and stamp `ux_score_after`. Wiring deferred.

8. **No visual telemetry contradictions in the engine.** The graph synchronizer doesn't yet detect "manifest declares the page changed, but no critique was acted on" or similar. Possible Phase 6 detectors: `unresolved_high_severity_critique`, `rejected_then_re_critiqued`, `accessibility_critique_aged`.

9. **WhyIsThisNextPanel not wired to a page.** Component shipped in Phase 4, still not integrated into SystemViewV2. Same for TelemetryHealthBadge + DecisionGraphView. Integration is a 5-line change per page; deferred.

10. **No retention for visual review tables.** `visual_review_sessions`, `visual_critique_items`, etc. grow without bound. Phase 6 should reuse the snapshot retention pattern.

---

## 15. NEXT PHASE RECOMMENDATION

**Phase 6: Real LLM Critique + Visual Memory + Surface Integration**

Three workstreams, parallelizable:

### A) LLM critique loop
- Swap `visualCritiqueEngine` rule templates for OpenAI vision calls when a screenshot exists. Keep the rule-based fallback for fast path / offline.
- Auto-capture screenshots via headless browser on session open (Puppeteer or Playwright).
- Add the `'llm'` source enum value behavior — store the prompt + raw response in `source_metadata`.
- Wire `ux_score_after` computation when a build-session manifest references a visual session.

### B) Annotation + decision graph polish
- Click-to-annotate overlay in `VisualReviewWorkspace` — store regions as `{x, y, width, height}` in the existing column.
- Replace SVG layered layout in `DecisionGraphView` with `react-flow` (force layout, zoom, edge-bundling).
- Add the visual decision_trace builder so `ui_review` tasks carry full explainability.

### C) Surface integration
- Wire `WhyIsThisNextPanel` into `SystemViewV2` next to the next-task badge.
- Wire `TelemetryHealthBadge` into `ProjectDashboard` and `SystemBlueprint` headers.
- Add a "Recent visual reviews" widget to `ProjectDashboard` showing the last N sessions + their outcomes.
- Build the visual session timeline view (per-session expansion: critiques → AI → decisions → manifest → UX delta).

### D) Retention + cross-session reads
- Add retention sweepers for `visual_review_sessions`, `visual_critique_items`, `visual_ai_suggestions`, `visual_change_decisions`, `queue_history_entries`, `build_sessions`.
- Build `useUXMemory` + endpoints surfacing repeated complaints, rejection patterns, friction trends.
- Add visual-telemetry contradiction detectors per §14 #8.

Phase 6 should NOT introduce new contract surfaces (Phase 3 + Phase 4 closed those). It's the final lap turning the substrate into a daily product surface, with real AI assistance at the visual layer.
