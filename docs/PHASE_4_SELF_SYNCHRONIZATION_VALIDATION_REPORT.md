# PHASE 4 SELF-SYNCHRONIZATION VALIDATION REPORT
## System Intelligence Unification — Self-Synchronizing Execution + Explainability UI

**Date:** 2026-05-06
**Status:** Complete
**Owner:** Claude (Anthropic Opus 4.7)
**Predecessors:** Phase 1 Foundation, Phase 2 Cutover, Phase 3 Telemetry
**Successor:** Phase 5 (visual critique OS, decision graph viz, telemetry density push)

---

## 1. FILES CREATED

### Backend execution layer (`backend/src/intelligence/systemStateEngine/execution/`)
- [`telemetryRequirementResolver.ts`](../backend/src/intelligence/systemStateEngine/execution/telemetryRequirementResolver.ts) — required-telemetry checklist per task type
- [`manifestCompletenessChecker.ts`](../backend/src/intelligence/systemStateEngine/execution/manifestCompletenessChecker.ts) — score + report
- [`buildCompletionValidator.ts`](../backend/src/intelligence/systemStateEngine/execution/buildCompletionValidator.ts) — DoD gate + `TelemetryValidationError`
- [`executionTelemetryPipeline.ts`](../backend/src/intelligence/systemStateEngine/execution/executionTelemetryPipeline.ts) — top-level orchestrator
- [`executionStateSynchronizer.ts`](../backend/src/intelligence/systemStateEngine/execution/executionStateSynchronizer.ts) — synchronous rebuild guarantee
- [`gitDiffTelemetryAnalyzer.ts`](../backend/src/intelligence/systemStateEngine/execution/gitDiffTelemetryAnalyzer.ts) — file → manifest field inference
- [`autoManifestGenerator.ts`](../backend/src/intelligence/systemStateEngine/execution/autoManifestGenerator.ts) — assemble draft manifests + repair suggestions
- [`queueHistoryWriter.ts`](../backend/src/intelligence/systemStateEngine/execution/queueHistoryWriter.ts) — diff + persist + read
- [`buildSessionService.ts`](../backend/src/intelligence/systemStateEngine/execution/buildSessionService.ts) — session lifecycle

### Backend models
- [`backend/src/models/QueueHistoryEntry.ts`](../backend/src/models/QueueHistoryEntry.ts)
- [`backend/src/models/BuildSession.ts`](../backend/src/models/BuildSession.ts)

### Backend tests
- [`backend/src/intelligence/systemStateEngine/__tests__/phase4.test.ts`](../backend/src/intelligence/systemStateEngine/__tests__/phase4.test.ts) — 36 tests

### Frontend
- [`frontend/src/hooks/useTaskExplain.ts`](../frontend/src/hooks/useTaskExplain.ts) — explainability data hook
- [`frontend/src/components/project/WhyIsThisNextPanel.tsx`](../frontend/src/components/project/WhyIsThisNextPanel.tsx) — full panel UI

### Documentation
- [`docs/PHASE_4_SELF_SYNCHRONIZATION_VALIDATION_REPORT.md`](../docs/PHASE_4_SELF_SYNCHRONIZATION_VALIDATION_REPORT.md) — this report

---

## 2. FILES MODIFIED

| Path | Change |
|---|---|
| [`backend/src/intelligence/systemStateEngine/refreshTriggers.ts`](../backend/src/intelligence/systemStateEngine/refreshTriggers.ts) | Replaced naive `setImmediate(buildAuthoritativeState)` with debounced/coalesced rebuild. Added per-project state map: `inFlight` lock, `lastCompletedAt` cooldown, trailing trigger queue. Added `_resetRefreshStateForTests` helper. |
| [`backend/src/intelligence/systemStateEngine/systemStateEngine.ts`](../backend/src/intelligence/systemStateEngine/systemStateEngine.ts) | Threaded `resolvedManifestConflicts` through to contradiction detector. Added queue history write at the tail of `persistSnapshot` so every snapshot emits a diff. |
| [`backend/src/intelligence/systemStateEngine/telemetry/contradictionDetector.ts`](../backend/src/intelligence/systemStateEngine/telemetry/contradictionDetector.ts) | Added 8 telemetry-aware detectors. Extended `ContradictionInput` with optional `manifests` + `resolvedConflicts`. |
| [`backend/src/models/index.ts`](../backend/src/models/index.ts) | Registered `QueueHistoryEntry` + `BuildSession`. |
| [`backend/src/routes/projectRoutes.ts`](../backend/src/routes/projectRoutes.ts) | Added 8 Phase 4 endpoints (auto-generate, completeness, build-session lifecycle, history reads). |
| [`frontend/src/services/portalBusinessProcessApi.ts`](../frontend/src/services/portalBusinessProcessApi.ts) | Added 8 Phase 4 helpers (autoGenerateManifest, checkManifestCompleteness, build-session lifecycle, history readers). |

---

## 3. TELEMETRY ENFORCEMENT STATUS

The DoD gate is now live. The flow:

1. Claude Code starts a session via `POST /build-session/start` and gets a `session_id`.
2. After the build, Claude Code emits a manifest via `POST /build-session/:id/complete`.
3. The pipeline runs `assertBuildComplete` → if any `required` telemetry is missing, returns 422 with the structured `CompletenessReport`. The session is recorded as `rejected`.
4. If completeness passes, the manifest is ingested, state is synchronously rebuilt, and the session is recorded as `completed`.

**Enforcement is opt-in per call** via `enforce_completeness: false` (defaults to `true`). Production should keep it on; CI/manual debugging may override.

The `TelemetryValidationError` carries the completeness report so the UI can render structured remediation guidance instead of generic 422 text.

---

## 4. AUTO-MANIFEST STATUS

`POST /api/portal/project/telemetry/auto-generate` accepts:
- `task_id` (required) and `bp_id`
- Optional `diff_stdout` (output of `git diff --name-status HEAD~1`) — parsed into typed file changes
- Optional `parsed_validation_report` — when the user has already run a free-text validation report through the existing parser, this fills in routes / DB / status verbatim
- Optional `task_type` — drives the repair-suggestion list
- Optional `ingest: true` — posts the draft straight to `/telemetry` if you trust it

Output: a complete BuildManifest draft + `source_summary` (how many diff files / whether a validation report was used) + `repair_suggestions` (human-readable).

Inference rules implemented:
- Backend `routes/*.ts` → API entry placeholder (method=GET, path inferred from filename stem)
- Frontend `pages/*.tsx` → frontend route + UI component (category=page)
- Frontend `components/*.tsx` → UI component (category=widget)
- `seeds/*.ts` → DB data_migration entry
- Files matching `__tests__|*.test|*.spec` → tests_added with type unit/integration/e2e

When a parsed validation report is supplied, its declared `routes` and `database` entries take precedence over the inferred ones.

---

## 5. CONTRADICTION DETECTOR STATUS

All 8 Phase 3 type-union telemetry contradiction kinds are now actively detected:

| Detector | Severity | Trigger |
|---|---|---|
| `missing_telemetry` | warning | BP user-verified or maturity ≥ L2 but no manifest ever ingested for it |
| `stale_telemetry` | warning (>90d) / info (30–90d) | Most recent manifest for a BP is older than 30d |
| `telemetry_conflict` | info | Resolver detected a conflict (e.g., re-creation after deletion) |
| `telemetry_drift` | warning | Manifest declares an API handler file not present in the repo file tree |
| `undocumented_db_change` | info | A table was touched once and the touch is >7d old, no follow-up manifest |
| `ui_drift` | info | A BP carries `frontend_route` not declared by any manifest |
| `graph_drift` | warning | A manifest references a `bp_id` that doesn't exist in the project |
| `low_confidence_validation` | warning | A manifest's `validation_results` includes any `status: "fail"` |

(`validation_regression` from the type union is deferred — it requires per-task historical comparison and is a Phase 5 detector.)

All eight pass dedicated unit tests in `phase4.test.ts`.

---

## 6. EXPLAINABILITY UI STATUS

The `WhyIsThisNextPanel` React component is shipped. It renders the full DecisionTrace from `GET /system-state/explain/:taskId` in a stacked vertical layout:

- **Task** — title, state badge, dependency chain
- **Score breakdown** — per-component progress bars (priority, blocking, maturity_gain, readiness_gain, dependency, confidence, execution_cost_penalty). Negative penalties render in red.
- **Where this task moves the needle** — readiness/coverage/maturity gap rows with current → target + gap badge
- **Expected outcomes** — bullets like "+9 readiness" / "closer to L3 maturity"
- **Projected maturity gain** — Lx → Ly with delta badge
- **Affected systems** — `bp:<uuid>` codes
- **Confidence** — color-coded badge (green ≥70, yellow 40–69, red <40) + basis
- **Telemetry sources used** — pill badges (manifest / validation / declared_map / repo_evidence)
- **Blocked by** — task ids (when blocked)
- **Related warnings** — contradiction list with severity badges
- **Reasoning** — engine-emitted reasoning chain, raw

The panel pulls from `useTaskExplain(taskId)` which calls the existing `/system-state/explain/:taskId` endpoint built in Phase 2. Loading skeleton + error fallback are both implemented. Accessibility: `role="dialog"`, `aria-label`, `aria-live` on the loading state, all interactive controls labeled.

The component is **shipped but not yet integrated into a page**. Wiring it into SystemViewV2 (next to the next-task badge) is a 1-line change deferred to Phase 5 polish.

---

## 7. QUEUE HISTORY STATUS

Append-only `queue_history_entries` table tracks rank + state changes per task per snapshot. The diff is computed by `computeQueueDiff(previousQueue, newQueue)` and persisted by `persistQueueDiff` at the tail of every successful state rebuild.

Real diff output (synthetic input — task `c` jumped from rank 2 to rank 0 and entered `in_progress`):

```json
[
  {
    "task_id": "c", "task_title": "Polish UI",
    "rank": 0, "previous_rank": 2, "rank_delta": -2,
    "state": "in_progress", "previous_state": "pending"
  },
  {
    "task_id": "b", "task_title": "Build leads",
    "rank": 1, "previous_rank": 1, "rank_delta": 0,
    "state": "ready", "previous_state": "ready"
  }
]
```

Read path: `GET /api/portal/project/history/queue?limit=200&since_hours=72`.

---

## 8. BUILD SESSION STATUS

`build_sessions` table records each Claude Code run from start to completion:

```ts
{
  id: uuid,
  project_id: uuid,
  task_id: string,
  bp_id: uuid | null,
  task_type: string,
  status: 'running' | 'completed' | 'rejected' | 'abandoned',
  started_at, completed_at,
  manifest_id: uuid | null,
  telemetry_validated: boolean,
  validation_passed: boolean,
  contradictions_detected: number,
  queue_changes_triggered: number,
  rejection_reason: string | null,
  rejection_details: jsonb | null
}
```

Lifecycle:
- `POST /build-session/start` → row created with `status='running'`
- `POST /build-session/:id/complete` → pipeline runs; row updated to `completed` (success) or `rejected` (telemetry failure / ingestion failure)
- `GET /build-sessions?limit=N` → list

The `rejection_details` field carries the structured `CompletenessReport` so the UI can show "your build was rejected because validation_results was empty — here's how to fix it" without needing a follow-up call.

---

## 9. TELEMETRY FAILURE EXAMPLE

Real output from `checkManifestCompleteness('backend', incompleteManifest)` where the manifest declared a single new file but no tests and no validation results:

```json
{
  "task_type": "backend",
  "score": 42,
  "blocking": true,
  "missing_requirements": [
    {
      "kind": "tests_added",
      "severity": "required",
      "remedy": "Add { file, type, coverage_target } entries to manifest.tests_added"
    },
    {
      "kind": "validation_results",
      "severity": "required",
      "remedy": "Add at least one { check, status } entry to manifest.validation_results (tsc, jest, build, etc.)"
    }
  ],
  "warnings": ["apis_declared"]
}
```

`POST /build-session/:id/complete` with this manifest returns **HTTP 422** carrying this exact body — the session row is updated with `status='rejected'`, `rejection_reason='telemetry_validation_failed'`, and `rejection_details` set to the report. The UI surfaces the `remedy` strings verbatim.

---

## 10. AUTO-REPAIR SUGGESTION EXAMPLE

`suggestRepairs(draft, 'backend')` for a backend draft with files but no tests/validation/APIs:

```json
[
  "No validation_results entries. Add at least one { check: \"tsc\"|\"jest\"|... , status: \"pass\"|\"fail\" } so the engine knows the build was checked.",
  "Task is a backend task but neither APIs nor DB changes were declared. Add apis_added or database_changes (most backend builds emit at least one)."
]
```

These are the human-readable strings the UI shows when an auto-generated draft is missing fields the user should review before submission.

---

## 11. SNAPSHOT HISTORY STATUS

Three read endpoints serve historical state:

| Endpoint | Returns |
|---|---|
| `GET /api/portal/project/history/queue` | Queue rank + state diffs per task per snapshot |
| `GET /api/portal/project/history/scores` | Project-level scores (readiness/coverage/maturity/health/sync_health) per snapshot |
| `GET /api/portal/project/history/contradictions` | Contradiction list per snapshot |

Score and contradiction history reads sourced directly from `system_state_snapshots`. Queue history reads from `queue_history_entries`. All bounded by `limit` (default 100).

---

## 12. ENGINE STABILITY STATUS

The `refreshSystemState` debouncer/coalescer is in place:

- **DEBOUNCE_MS = 1500** — calls within 1.5s coalesce into a single trailing rebuild
- **COOLDOWN_MS = 500** — minimum gap between consecutive rebuilds
- **In-flight lock** — at most ONE rebuild per project runs at a time
- **Trailing trigger queue** — calls during in-flight collapse into one trailing rebuild that fires on completion + cooldown

Test: 10 rapid-fire `refreshSystemState('proj-test', 'manual')` calls produce **at most 2** actual rebuilds (the leading one plus a trailing coalesced one), not 10. This eliminates the previous Phase 2 risk of "every mutation endpoint refreshing in parallel" causing engine thrashing.

---

## 13. PERFORMANCE REPORT

Measured against synthetic inputs (1 cap, 1 manifest, baseline graph):

| Operation | Timing |
|---|---|
| `checkManifestCompleteness` | <1 ms |
| `assertBuildComplete` (passes) | <1 ms |
| `assertBuildComplete` (throws TelemetryValidationError) | <1 ms |
| `analyzeDiff` (10 files) | <1 ms |
| `parseGitDiffNameStatus` (50 lines) | <1 ms |
| `generateManifestDraft` (full path with validation report) | <1 ms |
| `suggestRepairs` | <1 ms |
| `computeQueueDiff` (3 prev, 2 new tasks) | <1 ms |
| 8 telemetry contradiction detectors (combined) | ~1–3 ms |
| `runExecutionPipeline` (validate → ingest → sync) | ~120–350 ms |
| Refresh debouncer overhead | negligible (<1 ms per call) |
| Snapshot queue history write | ~5–20 ms (Sequelize bulkCreate) |

Phase 4 adds ~5–10% to a build-completion request because the pipeline now does completeness scoring + ingestion + a synchronous rebuild. The added cost is paid once per build (not per state read), so end-user dashboards are unaffected.

---

## 14. TEST RESULTS

```
PASS src/intelligence/systemStateEngine/__tests__/phase4.test.ts (49.9 s)
  checkManifestCompleteness: 5/5
  assertBuildComplete: 3/3
  analyzeDiff: 6/6
  parseGitDiffNameStatus: 3/3
  generateManifestDraft: 3/3
  suggestRepairs: 3/3
  telemetry contradiction detectors: 9/9
  computeQueueDiff: 3/3
  refreshSystemState debouncer (Phase 4 stability): 1/1

PASS src/intelligence/systemStateEngine/__tests__/telemetry.test.ts (101.5 s) — 42/42 (Phase 3)
PASS src/intelligence/systemStateEngine/__tests__/engine.test.ts (96.7 s) — 42/42 (Phase 1+2)

GRAND TOTAL: 120/120 passing
```

`npx tsc --noEmit` — backend: **clean** (exit 0).
`npx tsc --noEmit` — frontend: **clean** (exit 0).
Failing tests: **0**.

---

## 15. REMAINING MANUAL SYNCHRONIZATION POINTS

These are still human-driven and represent the gap between "self-synchronizing" and "fully autonomous":

1. **Claude Code must call `POST /build-session/start` at the beginning of a build.** No SDK-level auto-instrumentation exists. CLAUDE.md (Phase 3) instructs this; agents must comply.

2. **The user (or Claude Code) must paste a validation report or trigger `auto-generate`.** The system can't yet harvest `git diff` output without the user running it. A Phase 5 hook would shell out to `git diff --name-status` from the backend.

3. **`task_type` must be supplied at completion time.** The engine knows the type from the queue, but the build-session endpoint requires the caller to pass it explicitly. A Phase 5 enhancement could look it up from the queue snapshot using `task_id` + `project_id`.

4. **Manual `enforce_completeness: false` overrides.** A user/caller can opt out of the DoD gate per call. Production should never opt out, but no policy enforces this beyond convention.

5. **Visual reviews are still hand-driven.** Phase 3 added the schema, Phase 4 didn't add automation. Visual Critique OS execution is Phase 5.

6. **Claude Code's CLAUDE.md compliance is honor-system.** The "you MUST emit a manifest" rule lives in CLAUDE.md but no runtime check rejects builds that didn't post one (because we can't know — build sessions opt in).

---

## 16. REMAINING FRACTURE POINTS

1. **Queue history grows unbounded.** No retention policy yet. Phase 5 should reuse the snapshot retention pattern.

2. **Build sessions grow unbounded.** Same — needs retention + perhaps per-project quotas.

3. **`telemetry_sources_used` decision-trace field is still always `["repo_evidence"]`.** The engine doesn't yet thread the actual sources used per task. Threading requires `buildDecisionTrace` to know which evidence layer answered each input.

4. **`missing_requirements` in DecisionTrace is still empty.** Requires correlating manifests' `apis_added` etc. against a BP's RequirementsMap to detect satisfaction.

5. **`validation_regression` detector deferred** — requires per-task historical confidence comparison.

6. **WhyIsThisNextPanel not yet wired into a page.** Component is built and tested via type-check only. Manual integration into SystemViewV2 is a Phase 5 polish item.

7. **Decision graph UI viz** (Phase 4 §9 — interactive node/edge view of task → BP → dependencies) is **not built**. The graph data is available via `GET /graph` from Phase 3; visualization deferred.

8. **No standalone validation-result endpoint.** Validation telemetry still flows bundled inside manifests only. Phase 5 should add `POST /validation-result` for CI runs that don't produce manifests.

9. **Repair suggestions are heuristic.** The `suggestRepairs` helper is a hand-rolled rules table. Phase 5 could extend with telemetry-source-aware suggestions ("manifest is fresh but contradicts repo — confirm git status").

10. **No dashboard widget showing telemetry health.** The endpoint exists (`GET /telemetry/health` from Phase 3); no UI component reads it. Phase 5 adds a small badge to ProjectDashboard.

---

## 17. NEXT PHASE RECOMMENDATION

**Phase 5: Visualization + Density Push**

Three workstreams, mostly parallelizable:

### A) UI integration of Phase 4 surfaces
- Wire `WhyIsThisNextPanel` into SystemViewV2 next to the "Your next step" badge.
- Add a telemetry health pill to ProjectDashboard showing `sync_health_score` + manifest freshness.
- Build a build-session timeline view showing recent rejections + their `rejection_details`.
- Surface queue history as a small "what changed since yesterday" widget.

### B) Decision graph visualization
- Render `GET /graph` as an interactive force-directed view (react-flow or vis.js).
- Click a node → focus the panel on that node's incoming/outgoing edges.
- Filter by node type (api / ui / db / test) and by source layer (manifest / heuristic).

### C) Telemetry density push
- Add `POST /validation-result` standalone endpoint for CI runs.
- Wire backend to optionally invoke `git diff --name-status HEAD~1` so the auto-generate endpoint can run without user-supplied stdout.
- Implement `validation_regression` detector.
- Thread `telemetry_sources_used` through the decision-trace so each task carries its actual source mix.
- Add `missing_requirements` correlation in DecisionTrace.
- Add retention policies for `queue_history_entries` and `build_sessions`.

### D) Visual Critique OS execution architecture
- Build the visual review session model and critique-item lifecycle (the Phase 3 schema is in place).
- AI-driven critique generation hook (call OpenAI vision with screenshots → emit critique items conforming to `visual_review.schema.json`).
- Accept / reject UI for critique items.

Phase 5 should NOT introduce new contracts — Phase 3 + Phase 4 closed the contract layer. Phase 5 is about turning the working substrate into a fluid product surface users actually interact with daily.
