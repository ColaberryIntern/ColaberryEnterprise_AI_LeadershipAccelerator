# STATE_CONTRACT_V1.md
## Authoritative System State — V1

**Version:** 1.0
**Status:** Active (Phase 3)
**Owner:** SystemStateEngine
**Successor of:** `backend/src/intelligence/systemStateEngine/system/intelligence/STATE_CONTRACT.md` (Phase 2 — still valid; this V1 supersedes for telemetry-aware reads)

---

## 1. The contract — formal restatement

There is exactly one authoritative `AuthoritativeSystemState` per project, produced
by `buildAuthoritativeState(projectId)` and conforming to
[`systemState.types.ts`](../../../backend/src/intelligence/systemStateEngine/types/systemState.types.ts).

Phase 3 introduces the **telemetry preference rule**:

> The engine MUST prefer authoritative telemetry (build manifests, validation
> results, declared maps) over reverse-engineered repo evidence whenever both
> exist. Repo heuristics are fallback-only.

Source priority (high → low):

1. **Manifest telemetry** — `BuildManifest` rows ingested via `POST /telemetry`
2. **Validation telemetry** — declarative `ValidationResult` evidence
3. **Declared maps** — `database_map.json`, `ui_map.json`, `state_graph.json`
4. **Repo evidence** — file-tree pattern matching, PROGRESS.md scanning, last_execution heuristics

The first source that answers a given question wins. Lower tiers fill gaps.

---

## 2. Read paths (unchanged from Phase 2 + telemetry overlays)

| Path | When to use |
|---|---|
| `GET /api/portal/project/system-state` | Default — frontends, dashboards |
| `GET /api/portal/project/system-state?fresh=1` | After mutation, debug, tests |
| `GET /api/portal/project/telemetry` | Raw telemetry (manifest history, freshness, sources) |
| `GET /api/portal/project/telemetry/health` | Telemetry health summary |
| `GET /api/portal/project/graph` | State graph (telemetry-merged) |
| `GET /api/portal/project/database-map` | Declared DB topology |
| `GET /api/portal/project/ui-map` | Declared UI topology |
| `readOrRebuild(projectId)` (server-side) | Snapshot or rebuild |

Engine reads always run through the telemetry preference rule above — caller
doesn't need to know which source answered.

---

## 3. Write paths

| Path | What it writes |
|---|---|
| `POST /api/portal/project/telemetry` | Validates + ingests a `BuildManifest`. Triggers state rebuild. |
| Existing mutation endpoints | Each calls `refreshSystemState(projectId, trigger)` (Phase 2). |

Manifests are append-only — every build emits one row in `build_manifests`.
Older manifests for the same `(project_id, bp_id)` are NOT mutated; the freshness
monitor surfaces stale entries.

---

## 4. Conflict resolution

When two sources disagree (e.g., a manifest says `apis_added: ['/x']` but no
file in the repo actually exports `/x`):

1. Manifest wins for this snapshot.
2. A `ContradictionFlag` of kind `telemetry_drift` is raised with severity
   `warning`.
3. The freshness monitor schedules a re-validation on the next tick.

Conflicts NEVER cause the engine to throw — telemetry is informational, not
gating.

---

## 5. Forbidden patterns (post-Phase 3)

| Pattern | Why forbidden |
|---|---|
| Computing readiness from `cap.linked_backend_services` length when a manifest exists | Bypasses telemetry preference rule |
| Calling `enrichCapability` outside the BP list/detail surfaces | Phase 2 made it adapter-only — should not spread |
| Writing to `system_state_snapshots` without going through `buildAuthoritativeState` | Snapshots are engine-owned |
| Writing a parallel `databaseSynchronizer`-equivalent in another folder | One synchronizer per concern |
| Reading raw `last_execution.completed_steps` for next-step decisions | The queue answers "what's next" — no parallel inference |

---

## 6. Versioning

`SYSTEM_STATE_VERSION` lives in `systemStateEngine.ts`. V1 = `'3.0.0'` (Phase 3).

Breaking changes require a version bump + migration entry in this file.
Additive optional fields don't require a bump.

---

## 7. Observability

Every engine run logs:
- `engine.elapsed_ms`
- `engine.telemetry_sources_used` (manifest count, validation count, fallback count)
- `engine.contradictions` count by kind
- `engine.snapshot_id` (if persisted)

These power the telemetry health dashboard.
