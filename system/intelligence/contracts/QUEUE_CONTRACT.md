# QUEUE_CONTRACT.md
## Authoritative task queue

**Version:** 1.0
**Status:** Active (Phase 3, supersedes Phase 2 implicit contract)

---

## 1. The contract

The authoritative task queue (`AuthoritativeSystemState.queue`) is the SINGLE
ordered list of work for a project. Lower `calculated_rank` = earlier.

Every task in the queue carries:
- `id`, `project_id`, optional `bp_id`, `title`, `type`, `state`
- Component scores (`priority_score`, `blocking_score`, `dependency_score`,
  `maturity_gain`, `readiness_gain`, `confidence_score`, `execution_cost`)
- `calculated_rank` — final composite (consumers sort by this)
- `reasoning` — short bullets for the UI
- `decision_trace` — full explainability payload (Phase 2)
- (Phase 3) `decision_trace.score_breakdown`, `dependency_chain`,
  `missing_requirements`, `expected_outcomes`, `projected_maturity_gain`,
  `affected_systems`, `telemetry_sources_used`

---

## 2. Queue invariants (all enforced by tests)

| Invariant | Statement |
|---|---|
| **Singleton** | Exactly one queue per project per snapshot. No alternate queues elsewhere. |
| **Immutable** | Frontend MUST NOT reorder. Backend re-derives only via `buildAuthoritativeState`. |
| **Deterministic** | Same inputs → same `calculated_rank` for every task. |
| **Monotonic ranks** | `queue[i].calculated_rank >= queue[i-1].calculated_rank` |
| **next_task = queue[0]** | When `next_task` is non-null and queue is non-empty. |
| **next_bp_id = next_task.bp_id** | When `next_task.bp_id` is non-null. |
| **Blocked tasks sink** | A `blocked` task ranks higher (worse) than a `ready` task with the same priority class. |

---

## 3. Telemetry preference (Phase 3)

When manifests provide evidence that a task's prerequisite is satisfied (e.g.,
`apis_added` matches the BP's required API), the engine:

- Marks the prerequisite task `validated` (state transition)
- Removes the dependency edge for downstream tasks
- Recomputes `calculated_rank` accordingly

Heuristics that previously inferred completion (e.g., `last_execution.completed_steps`)
become fallback. They are still consulted when no manifest exists for the task.

---

## 4. Forbidden patterns

- Computing a "next step" outside the queue (e.g., per-cap "what should I do
  here?" buttons that don't read from `next_task`)
- Adding a non-engine task source — every task must come from the engine's
  task generators
- Persisting queue state outside `system_state_snapshots`
