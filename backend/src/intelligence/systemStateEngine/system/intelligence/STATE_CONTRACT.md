# State Contract — Authoritative System State

**Status:** Active (Phase 2)
**Owner:** SystemStateEngine
**Consumers:** every dashboard, every BP surface, Cory orchestrator, Blueprint, System View V2

---

## 1. The contract

There is exactly **one** authoritative description of "what is the state of this project".
It is produced by `buildAuthoritativeState(projectId)` and conforms to the
`AuthoritativeSystemState` interface in
`backend/src/intelligence/systemStateEngine/types/systemState.types.ts`.

Every consumer who needs to know:

- a project's readiness / coverage / maturity / health / sync_health
- a capability's score breakdown
- the next task / next BP for a user
- the queue of upcoming work
- contradictions between sub-systems
- the explanation for why a task is next

…**must read** from this state. Re-deriving any of those values elsewhere is a
contract violation.

---

## 2. Read paths (in order of preference)

| Path | When to use | Latency |
|---|---|---|
| `GET /api/portal/project/system-state` | Default — frontends, dashboards | Snapshot ~10–40 ms |
| `GET /api/portal/project/system-state?fresh=1` | After mutation, debug, tests | Full rebuild ~200–800 ms |
| `getLatestSystemSnapshot(projectId)` (server-side) | Inside Express handlers that need state for a single request | Single DB query |
| `readOrRebuild(projectId)` | Defaults to snapshot, falls back to rebuild if stale (>5 min) | Snapshot or rebuild |
| `memoizedReadOrRebuild(reqToken, projectId)` | Multiple endpoints in the same request | Cached per request via WeakMap |
| `buildAuthoritativeState(projectId, { persist: true })` | Refresh triggers, never the user-facing read path | Full rebuild |

---

## 3. Write path (snapshot persistence)

`buildAuthoritativeState` with `persist: true` writes a row to
`SystemStateSnapshot` with the fully-denormalized state. Snapshots are immutable
history — never updated, only appended. Old snapshots accumulate; a periodic
sweeper trims them per project (TBD).

Refresh triggers (fire-and-forget, never block the request):

| Trigger | Endpoint |
|---|---|
| `validation_report` | POST `/business-processes/:id/validation-report` |
| `kickoff_sync` | POST `/kickoff-sync` |
| `kickoff_reset` | POST `/kickoff-sync/reset` |
| `user_status_change` | PUT `/business-processes/:id/user-status`, POST `/business-processes/bulk-verify` |
| `lifecycle_change` | PUT `/business-processes/:id/lifecycle`, PUT `/business-processes/:id/mode` |
| `visual_review` | POST `/business-processes/:id/analyze-page`, PUT `/business-processes/:id/element-feedback/bulk-resolve` |
| `frontend_route_change` | PUT `/business-processes/:id/frontend-route` |
| `capability_added` | POST `/business-processes/add` |
| `target_mode_change` | PUT `/target-mode` |
| `brownfield_discovery` | POST `/setup/brownfield-discover` |

Non-blocking: each trigger calls `setImmediate(() => buildAuthoritativeState)`,
errors only log a warning.

---

## 4. The shape (canonical types)

```ts
interface AuthoritativeSystemState {
  project_id: string;
  generated_at: string;       // ISO

  scores: ProjectScores;      // { readiness, coverage, maturity, health,
                              //   sync_health, backend, frontend,
                              //   intelligence, observability, per_capability[] }
  queue: AuthoritativeTask[]; // ordered: queue[0] = next task; immutable
  contradictions: ContradictionFlag[];
  graph: StateGraph;

  next_task: AuthoritativeTask | null;
  next_bp_id: string | null;

  sync_health: SyncHealthResult;
}
```

Every `AuthoritativeTask` carries:
- `calculated_rank` (lower = earlier)
- `state` (`pending`, `ready`, `blocked`, `in_progress`, `validated`, `failed`)
- `reasoning` (short, UI-renderable bullets)
- `decision_trace` (full explainability — the "Why is this next?" panel)

---

## 5. Forbidden patterns (contract violations)

The following patterns indicate the consumer is computing state itself instead
of reading from the engine:

- `priority = (a, b) => a.completion - b.completion` (re-deriving order)
- `Math.round(matched / total * 100)` for coverage outside `enrichCapability`
- `if (cap.is_complete) ...` based on the consumer's own threshold logic
- Standalone "next step" generators that don't go through the queue
- Frontend that re-sorts the engine queue by anything other than what's already in the queue

If any of these appear, route the work back through `buildAuthoritativeState`
and add to the engine instead of duplicating in the consumer.

---

## 6. Versioning

The contract is versioned by changes to `systemState.types.ts`. Breaking
changes (renaming fields, changing types) require:
1. Bump `SYSTEM_STATE_VERSION` in `systemStateEngine.ts`
2. Add migration notes here
3. Run all tests (engine + consumer surfaces) before merging

Additive changes (new optional fields) do not require a version bump.
