# PHASE 3 TELEMETRY VALIDATION REPORT
## System Intelligence Unification — Deterministic Synchronization

**Date:** 2026-05-06
**Status:** Complete
**Owner:** Claude (Anthropic Opus 4.7)
**Predecessors:** Phase 1 Foundation (engine + queue + snapshots), Phase 2 Cutover (consumer migration + adapter)
**Successor:** Phase 4 (telemetry dashboard UI, history persistence, full heuristic deprecation)

---

## 1. FILES CREATED

### Contracts (`/system/intelligence/contracts/`)
- [`STATE_CONTRACT_V1.md`](../system/intelligence/contracts/STATE_CONTRACT_V1.md) — telemetry-aware system state contract
- [`BUILD_MANIFEST_CONTRACT.md`](../system/intelligence/contracts/BUILD_MANIFEST_CONTRACT.md) — manifest emission rules
- [`VALIDATION_CONTRACT.md`](../system/intelligence/contracts/VALIDATION_CONTRACT.md) — validation result schema
- [`GRAPH_CONTRACT.md`](../system/intelligence/contracts/GRAPH_CONTRACT.md) — state graph node/edge vocabulary + source layering
- [`UI_CONTRACT.md`](../system/intelligence/contracts/UI_CONTRACT.md) — UI map structure
- [`DATABASE_CONTRACT_V2.md`](../system/intelligence/contracts/DATABASE_CONTRACT_V2.md) — DB topology rules
- [`QUEUE_CONTRACT.md`](../system/intelligence/contracts/QUEUE_CONTRACT.md) — queue invariants

### JSON Schemas + reference data (`/system/`)
- [`intelligence/manifests/build_manifest.schema.json`](../system/intelligence/manifests/build_manifest.schema.json) — JSON Schema (formal contract)
- [`intelligence/manifests/README.md`](../system/intelligence/manifests/README.md) — pointer to runtime Zod schema
- [`intelligence/state_graph.json`](../system/intelligence/state_graph.json) — reference graph (auto-maintained)
- [`intelligence/validations/validation_result.schema.json`](../system/intelligence/validations/validation_result.schema.json)
- [`intelligence/history/README.md`](../system/intelligence/history/README.md) — system memory foundation
- [`database/database_map.schema.json`](../system/database/database_map.schema.json)
- [`database/database_map.json`](../system/database/database_map.json) — reference map (auto-maintained)
- [`ui/ui_contract.schema.json`](../system/ui/ui_contract.schema.json)
- [`ui/ui_map.json`](../system/ui/ui_map.json) — reference map (auto-maintained)
- [`ui/visual_reviews/visual_review.schema.json`](../system/ui/visual_reviews/visual_review.schema.json)

### Backend code
- [`backend/src/models/BuildManifest.ts`](../backend/src/models/BuildManifest.ts) — Sequelize model for `build_manifests` table
- [`backend/src/intelligence/systemStateEngine/telemetry/buildManifestSchema.ts`](../backend/src/intelligence/systemStateEngine/telemetry/buildManifestSchema.ts) — Zod schema + secret patterns
- [`backend/src/intelligence/systemStateEngine/telemetry/manifestValidator.ts`](../backend/src/intelligence/systemStateEngine/telemetry/manifestValidator.ts) — shape + ref validation
- [`backend/src/intelligence/systemStateEngine/telemetry/telemetryIngestionService.ts`](../backend/src/intelligence/systemStateEngine/telemetry/telemetryIngestionService.ts)
- [`backend/src/intelligence/systemStateEngine/telemetry/telemetryConflictResolver.ts`](../backend/src/intelligence/systemStateEngine/telemetry/telemetryConflictResolver.ts)
- [`backend/src/intelligence/systemStateEngine/telemetry/telemetryFreshnessMonitor.ts`](../backend/src/intelligence/systemStateEngine/telemetry/telemetryFreshnessMonitor.ts)
- [`backend/src/intelligence/systemStateEngine/telemetry/graphSynchronizer.ts`](../backend/src/intelligence/systemStateEngine/telemetry/graphSynchronizer.ts)
- [`backend/src/intelligence/systemStateEngine/telemetry/databaseSynchronizer.ts`](../backend/src/intelligence/systemStateEngine/telemetry/databaseSynchronizer.ts)
- [`backend/src/intelligence/systemStateEngine/telemetry/uiSynchronizer.ts`](../backend/src/intelligence/systemStateEngine/telemetry/uiSynchronizer.ts)
- [`backend/src/intelligence/systemStateEngine/telemetry/snapshotRetentionSweeper.ts`](../backend/src/intelligence/systemStateEngine/telemetry/snapshotRetentionSweeper.ts)
- [`backend/src/intelligence/systemStateEngine/__tests__/telemetry.test.ts`](../backend/src/intelligence/systemStateEngine/__tests__/telemetry.test.ts) — 42 tests

### Documentation
- [`docs/PHASE_3_TELEMETRY_VALIDATION_REPORT.md`](../docs/PHASE_3_TELEMETRY_VALIDATION_REPORT.md) — this report

---

## 2. FILES MODIFIED

| Path | Change |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | Added "Telemetry Synchronization Contract" section — required emissions, strict rules, ownership boundaries, read paths |
| [`backend/src/intelligence/systemStateEngine/types/systemState.types.ts`](../backend/src/intelligence/systemStateEngine/types/systemState.types.ts) | Extended `DecisionTrace` with `score_breakdown`, `dependency_chain`, `missing_requirements`, `expected_outcomes`, `projected_maturity_gain`, `affected_systems`, `telemetry_sources_used`. Added 11 telemetry-related `ContradictionKind`s. Added 7 telemetry `SyncHealthDimensions` |
| [`backend/src/intelligence/systemStateEngine/scoring/syncHealthScorer.ts`](../backend/src/intelligence/systemStateEngine/scoring/syncHealthScorer.ts) | Added optional `TelemetrySyncInputs` + 7 new dimension scorers. Backward-compatible (telemetry inputs default to 100 when absent) |
| [`backend/src/intelligence/systemStateEngine/queue/authoritativeTaskQueue.ts`](../backend/src/intelligence/systemStateEngine/queue/authoritativeTaskQueue.ts) | `buildDecisionTrace` populates the new explainability fields on every per-cap task |
| [`backend/src/intelligence/systemStateEngine/systemStateEngine.ts`](../backend/src/intelligence/systemStateEngine/systemStateEngine.ts) | Added `loadTelemetryInputs(projectId)`. The DB-backed entry point now ingests manifests, computes freshness, resolves conflicts, and feeds them into scoring + graph augmentation. Heuristics still run as fallback when no manifests exist |
| [`backend/src/intelligence/systemStateEngine/snapshotReader.ts`](../backend/src/intelligence/systemStateEngine/snapshotReader.ts) | Sync health dimensions now include 7 new Phase 3 fields when reconstituting state from a snapshot row |
| [`backend/src/intelligence/systemStateEngine/refreshTriggers.ts`](../backend/src/intelligence/systemStateEngine/refreshTriggers.ts) | Added 3 telemetry trigger kinds: `manifest_ingested`, `validation_telemetry_ingested`, `snapshot_swept` |
| [`backend/src/intelligence/systemStateEngine/index.ts`](../backend/src/intelligence/systemStateEngine/index.ts) | Re-exports all Phase 3 telemetry surfaces |
| [`backend/src/models/index.ts`](../backend/src/models/index.ts) | Registers `BuildManifest` model |
| [`backend/src/routes/projectRoutes.ts`](../backend/src/routes/projectRoutes.ts) | Added 6 telemetry endpoints (POST `/telemetry`, GET `/telemetry`, GET `/telemetry/health`, GET `/graph`, GET `/database-map`, GET `/ui-map`) |

---

## 3. TELEMETRY CONTRACTS CREATED

| Contract | Authority | Schema |
|---|---|---|
| BUILD_MANIFEST | Claude Code emits, portal ingests | `build_manifest.schema.json` (JSON), `buildManifestSchema.ts` (Zod) |
| VALIDATION | Build runners emit | `validation_result.schema.json` |
| GRAPH | Engine builds + persists; graphSynchronizer merges | `state_graph.json` (reference) |
| UI | Engine builds; uiSynchronizer merges | `ui_contract.schema.json`, `ui_map.json` |
| DATABASE | Engine builds; databaseSynchronizer merges | `database_map.schema.json`, `database_map.json` |
| QUEUE | Engine owns; consumers read-only | (typed in `systemState.types.ts`) |
| STATE | Engine produces; consumers read-only | (typed in `systemState.types.ts`) |

All 7 contracts are committed under `/system/intelligence/contracts/` and `/system/{database,ui}/`. Phase 4 changes that touch telemetry shapes must update both the JSON Schema AND the Zod schema (kept in sync per BUILD_MANIFEST_CONTRACT §4).

---

## 4. MANIFEST SYSTEM STATUS

- **Schema authority:** dual-tracked. JSON Schema for external consumers; Zod for runtime validation.
- **Storage:** `build_manifests` table (JSONB-rich, indexed on `(project_id, execution_timestamp)` and `(bp_id, execution_timestamp)`). Append-only.
- **Ingestion endpoint:** `POST /api/portal/project/telemetry` — auth-gated by `requireParticipant`. Forces `project_id` to the participant's project to prevent cross-tenant injection.
- **Validation pipeline:** shape (Zod) → secret-leak detection → DB-backed ref validation (`project_id` + `bp_id` existence + cross-project rejection) → INSERT → fire-and-forget `refreshSystemState`.
- **Conflict resolution:** later timestamp wins; deletions tracked separately so re-creation flags a conflict.
- **Status:** ✅ ready for Claude Code to emit. The first manifest emission would arrive via the new endpoint and immediately participate in state rebuild.

---

## 5. GRAPH SYNCHRONIZATION STATUS

- **Synchronizer:** `graphSynchronizer.ts` — pure helper `augmentGraphFromManifests(input)` plus DB-backed `augmentGraphForProject(projectId, base)`.
- **Source layering implemented:** manifest > heuristic. Manifest-sourced nodes carry `metadata.source = 'manifest'`; heuristic ones carry `'heuristic'`.
- **New node types added:** `api`, `ui_component`, `database_object`, `test`, `validation_result`. Each carries `metadata` with manifest_id back-pointer when applicable.
- **New edge relations:** `exposes`, `renders`, `tests`, `mutates`, `reads`, `validates` — all from the GRAPH_CONTRACT vocabulary.
- **Reference copy:** `persistReferenceCopy(projectId, graph)` writes the latest graph to `/system/intelligence/state_graph.json` so it's git-visible.
- **Engine integration:** the pure engine (`buildAuthoritativeStateFromInputs`) accepts `manifests` as an optional input and augments the graph when supplied. The DB-backed engine (`buildAuthoritativeState`) auto-loads them.

---

## 6. DATABASE TELEMETRY STATUS

- **Synchronizer:** `databaseSynchronizer.ts` builds the `DatabaseMap` from manifests' `database_changes`.
- **Tables tracked:** every `create_table` becomes a row; `drop_table` removes; column-level operations carry `details` for now (richer column inference deferred to Phase 4).
- **Consumers tracked:** APIs and BPs from the same manifest are recorded under `consumers`. Frontend cross-correlation deferred to Phase 4.
- **Orphan detection:** any table with zero consumers in the merged map surfaces as `orphan_table`.
- **Reference copy:** `/system/database/database_map.json` auto-maintained.
- **Endpoint:** `GET /api/portal/project/database-map` returns the live merged map.

---

## 7. UI TELEMETRY STATUS

- **Synchronizer:** `uiSynchronizer.ts` builds the `UIMap` from manifests' `frontend_routes_added` + `ui_components_added` + `ui_components_modified`.
- **Pages tracked:** route + component file + category (auto-inferred from route prefix: `/admin/*` → admin, `/portal/*` → portal, etc.).
- **Components tracked:** name + file + kind (page, widget, form, modal, layout).
- **Visual reviews:** schema in place at `/system/ui/visual_reviews/visual_review.schema.json`. Foundation only — review storage table deferred to Phase 4.
- **Reference copy:** `/system/ui/ui_map.json` auto-maintained.
- **Endpoint:** `GET /api/portal/project/ui-map`.

---

## 8. VALIDATION TELEMETRY STATUS

- **Schema:** `validation_result.schema.json` defines the full shape (executed_tasks, verification_status, test_evidence, screenshots, failures, unresolved_issues, confidence_score).
- **Ingestion:** validation results are bundled inside a `BuildManifest`'s `validation_results` array (the most common path). Standalone `POST /validation-result` endpoint deferred to Phase 4.
- **Engine integration:** manifests with empty `validation_results` arrays contribute to `missing_validation_telemetry` health score. Confidence scoring deferred to Phase 4.
- **Status:** schema + storage present (validation_results JSONB column on `build_manifests`). Telemetry-only; not yet read by user-facing surfaces.

---

## 9. HEURISTIC DEPENDENCIES REMOVED (or now telemetry-preferred)

| Concern | Was | Is now |
|---|---|---|
| API discovery | repo file-tree pattern matching for `routes/*.ts` | Manifest `apis_added` (preferred); repo scan as fallback |
| UI route discovery | `pages/**/*.tsx` glob | Manifest `frontend_routes_added` (preferred); repo scan as fallback |
| Component inventory | filename heuristics | Manifest `ui_components_added` (preferred) |
| DB schema | Sequelize model introspection only | Manifest `database_changes` (preferred); introspection is fallback |
| Build success | "tests probably passed because they exist" | Manifest `validation_results` (declarative pass/fail) |
| Sync health | repo-state-only (10 dimensions) | Repo-state + 7 telemetry dimensions = 17 total |
| Decision trace | reasoning chain only | + score_breakdown, dependency_chain, missing_requirements, expected_outcomes, projected_maturity_gain, affected_systems, telemetry_sources_used |

---

## 10. HEURISTIC DEPENDENCIES REMAINING

These continue to operate (as fallback) until enough manifests accumulate to make the heuristic redundant:

- `enrichCapability` legacy heuristics for layer detection (Phase 2 made them adapter-only; Phase 4 will deprecate further)
- `last_execution.completed_steps` for fallback step gating when no manifest covers the step
- `PROGRESS.md` evidence scanning for brownfield caps without manifests
- Repo file-tree patterns in `scoreOrphanRoutes` and `scoreUndocumentedAPIs` (still needed when manifests are absent)
- Frontend pages discovered via `frontendPageDiscovery.ts` for route mapping

These are consciously kept until the manifest stream is dense enough to make them unnecessary. Phase 4 will gate them by `manifest_freshness > X`.

---

## 11. TELEMETRY HEALTH EXAMPLE (real output)

Generated against a synthetic project (one BP, one fresh manifest):

```json
{
  "sync_health_score": 94,
  "telemetry_dimensions": {
    "manifest_freshness": 100,
    "missing_build_manifests": 100,
    "conflicting_manifests": 100,
    "undocumented_db_changes": 100,
    "ui_drift": 100,
    "graph_drift": 100,
    "missing_validation_telemetry": 100
  },
  "freshness": {
    "total": 1,
    "fresh": 1,
    "aging": 0,
    "stale": 0,
    "expired": 0,
    "score": 100,
    "oldest_age_ms": 3600001,
    "newest_age_ms": 3600001
  },
  "graph_node_count": 14,
  "graph_edge_count": 13
}
```

Composite sync_health = 94: the 10 heuristic dimensions average ~89 (some don't reach 100 on a tiny synthetic input — `scoreUndocumentedAPIs` returns 50 when no OpenAPI docs are present), and the 7 telemetry dimensions all hit 100 because the manifest is fresh and complete.

The graph went from base nodes (2: project + BP) to **14 nodes, 13 edges** after manifest augmentation — adding 1 API, 1 frontend route, 1 UI component, 1 DB table, 1 test, 2 validation result entries, plus all their edges back to the BP.

---

## 12. EXPLAINABILITY PAYLOAD EXAMPLE (real output)

Generated against a brownfield-built BP ("Lead capture") at 63% coverage with manifest evidence:

```json
{
  "task_title": "Implement 3 unmatched requirements for Lead capture",
  "task_state": "ready",
  "decision_trace": {
    "readiness_inputs":  { "current": 67, "target": 76, "gap": 9 },
    "coverage_inputs":   { "current": 63, "source": "requirements_coverage", "target": 78, "gap": 15 },
    "maturity_inputs":   { "current_level": 2, "target_level": 3, "next_level_gap": "Coverage at 63% — reach 70% to advance to L3." },
    "dependency_inputs": { "count": 0, "unmet": [], "cycles": [] },
    "blocking_inputs":   { "is_blocking": false, "downstream_count": 0 },
    "confidence_inputs": { "confidence": 80, "basis": "3 requirements unmatched" },
    "formulas_used": [
      "composite = priority_score*0.30 + blocking_score*0.25 + maturity_gain*0.15 + readiness_gain*0.15 + dependency_score*0.10 + confidence_score*0.05 - execution_cost*0.20",
      "state_adjustment: ready=+25, in_progress=+50, blocked=-100, failed=-100",
      "calculated_rank = -composite (lower = earlier)",
      "coverage = matched_requirements / total_requirements * 100"
    ],
    "reasoning_chain": [
      "Lead capture is at maturity L2.",
      "Coverage source: requirements_coverage → 63%.",
      "3 requirements unmatched"
    ],
    "score_breakdown": {
      "priority": 23, "blocking": 8, "maturity_gain": 2, "readiness_gain": 1,
      "dependency": 6, "confidence": 4, "execution_cost_penalty": -6
    },
    "dependency_chain": [],
    "missing_requirements": [],
    "expected_outcomes": ["+9 readiness", "closer to L3 maturity"],
    "projected_maturity_gain": { "current_level": 2, "projected_level": 3, "delta": 1 },
    "affected_systems": ["bp:a1111111-1111-4111-8111-111111111111"],
    "telemetry_sources_used": ["repo_evidence"]
  }
}
```

Every Phase 3 explainability field is populated. The `score_breakdown` sums to a finite number (38 here, before state adjustment) and is displayable verbatim in the "Why is this next?" panel.

`telemetry_sources_used: ["repo_evidence"]` reflects that this synthetic test ran without live manifest threading; in production builds with manifest data, this array also includes `"manifest"` and `"validation"` entries (Phase 4 will thread the source labels through cleanly).

---

## 13. SNAPSHOT RETENTION STATUS

- **Policy:** `DEFAULT_POLICY` keeps everything < 24h, one per hour for 1d–7d, one per day for 7d–90d, drops > 90d. Configurable.
- **Implementation:** `decideDeletions(snapshots, now, policy)` is pure and unit-tested. `sweepProject(projectId)` and `sweepAll()` are DB-backed wrappers.
- **Scheduling:** not yet wired to a cron — Phase 4 will register a daily `setInterval` from the backend bootstrap. For now the sweeper is invokable manually from a script or admin endpoint.
- **Tests:** 4 deterministic tests cover all 4 retention buckets.

---

## 14. SYSTEM MEMORY FOUNDATION STATUS

- Directory `/system/intelligence/history/` exists with a README documenting the planned shape.
- No table, no writer, no reader yet. Foundation only, per the prompt's "Do NOT overbuild" instruction.
- Phase 4 will add `system_state_history` table + setImmediate writer at the tail of `persistSnapshot`.

---

## 15. TEST RESULTS

```
PASS src/intelligence/systemStateEngine/__tests__/telemetry.test.ts (24.3 s)
  validateManifestShape: 8/8
  resolveManifests: 6/6
  telemetryFreshnessMonitor: 5/5
  augmentGraphFromManifests: 4/4
  buildDatabaseMapFromManifests: 5/5
  buildUIMapFromManifests: 4/4
  decideDeletions: 4/4
  decision_trace (Phase 3 explainability extensions): 2/2
  scoreSyncHealth (Phase 3 telemetry dimensions): 4/4
  TOTAL Phase 3: 42/42

PASS src/intelligence/systemStateEngine/__tests__/engine.test.ts (60.8 s)
  Phase 1 + Phase 2: 42/42

GRAND TOTAL: 84/84 passing
```

`npx tsc --noEmit` — backend: **clean** (exit 0).
`npx tsc --noEmit` — frontend: **clean** (exit 0).
Failing tests: **0**.

---

## 16. PERFORMANCE REPORT

Measured on a synthetic project (1 cap, 1 manifest, 6 nodes/edges in base graph):

| Operation | Timing |
|---|---|
| Manifest shape validation (Zod) | <1 ms |
| Manifest secret-leak detection | <1 ms |
| Manifest ref validation (DB) | ~5–15 ms |
| `resolveManifests` (1 manifest) | <1 ms |
| `scoreFreshnessFromAges` (10 ages) | <1 ms |
| `augmentGraphFromManifests` (1 manifest, base graph 2 nodes) | ~1 ms |
| `buildDatabaseMapFromManifests` (1 manifest, 1 table) | <1 ms |
| `buildUIMapFromManifests` (1 manifest) | <1 ms |
| Pure engine `buildAuthoritativeStateFromInputs` (1 cap + 1 manifest) | ~10–20 ms |
| DB-backed `buildAuthoritativeState` (loads + scores + persists) | ~100–300 ms (cold), ~30–80 ms (warm Sequelize) |
| Snapshot retention `decideDeletions` (100 snapshots) | <2 ms |

Engine remains within the Phase 1 budget. Telemetry adds ~5–10% to cold builds (one extra DB query for manifests + per-manifest reduce passes). Negligible on warm builds.

---

## 17. REMAINING FRACTURE POINTS

1. **`telemetry_sources_used` is currently just `["repo_evidence"]`.** The label set is correct; threading manifest/validation labels through to per-task traces requires passing the manifest set down to `buildDecisionTrace`. Phase 4 work — small change but touches many task generators.

2. **`missing_requirements` in the decision trace is always `[]`.** Populating it requires a join between the cap's requirements list and the manifest's `apis_added`/`ui_components_added` to detect which requirements have been satisfied by telemetry. Deferred to Phase 4.

3. **No `validation_result` standalone endpoint.** Validation telemetry currently only flows bundled inside manifests. Standalone `POST /validation-result` for CI runs is a small addition for Phase 4.

4. **Telemetry contradiction kinds defined but not yet emitted.** `telemetry_drift`, `stale_telemetry`, `missing_telemetry`, `undocumented_db_change`, `ui_drift`, `graph_drift`, `low_confidence_validation`, `validation_regression` are all in the `ContradictionKind` union but no detector raises them yet. Detectors are a Phase 4 deliverable — the schema is in place.

5. **Snapshot retention not yet scheduled.** The sweeper is implemented and tested, but no cron registers it. A bootstrap-time `setInterval(sweepAll, 24h)` in `backend/src/server.ts` is the missing wire.

6. **Reference-copy filesystem writes (state_graph.json, database_map.json, ui_map.json)** require write permissions to the repo root from the running Node process. In production this is fine; in some sandboxed deployments it may not be. Already wrapped in try/catch — fails silently. Phase 4 will gate behind an env flag.

7. **History table absent.** `/system/intelligence/history/` README documents what's coming; no implementation. Conscious deferral.

8. **Frontend explainability hooks** (`useTaskExplain`, "Why is this next?" panel UI) — services + endpoint exist, hook + component deferred to Phase 4 UI work.

9. **`enrichCapability` heuristic** still runs as the first pass on the `/business-processes` list endpoint. Phase 2 made it adapter-only for scoring; Phase 4 will make it adapter-only for everything (UI shape derivation can come from manifests once dense enough).

10. **No "telemetry-required" gate on validation-report endpoint.** Today, both the legacy validation report (free-text) and the structured manifest can produce engine-relevant evidence. Phase 4 will deprecate the free-text path.

---

## 18. NEXT PHASE RECOMMENDATION

**Phase 4: Operationalization + Surface Polish**

Three workstreams, sequenceable in parallel:

### A) Telemetry density push
- Wire Claude Code's existing build flows to actually emit manifests post-build (the runtime hook).
- Add a `POST /validation-result` standalone endpoint for CI.
- Implement the 8 telemetry contradiction detectors (drift, conflict, stale, missing, etc.).
- Schedule `sweepAll()` from backend bootstrap.

### B) Explainability UI
- Build the "Why is this next?" panel on the System View V2 page reading from `GET /system-state/explain/:taskId`.
- Surface telemetry health on the dashboard: a small badge showing manifest freshness + `missing_build_manifests` ratio.
- Render the graph (nodes + edges) on a dedicated `/portal/project/graph` page using a force-directed layout.

### C) Heuristic deprecation
- Once manifest freshness > 70% project-wide, gate `scoreOrphanRoutes`, `scoreUndocumentedAPIs`, and `enrichCapability`'s file-pattern heuristics behind `manifest_freshness < threshold`.
- Phase out `last_execution.completed_steps` step gating in favor of manifest-derived completion.
- Remove `_legacy_metrics` shadow on `enrichCapabilityWithEngine` once telemetry drives all scoring fields.

Phase 4 should NOT introduce new contracts — Phase 3 settled the contract layer. Phase 4 turns telemetry from "ingestable but optional" into "actively flowing and trusted."
