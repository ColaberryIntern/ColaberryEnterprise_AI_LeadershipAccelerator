# Database Contract — System State Persistence

**Status:** Active (Phase 2)
**Owner:** SystemStateEngine
**Tables:** `system_state_snapshots`

---

## 1. Tables

### `system_state_snapshots`

Append-only history of authoritative system states. One row per
`buildAuthoritativeState(projectId, { persist: true })` invocation.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `project_id` | UUID | FK → `projects.id` |
| `generated_at` | TIMESTAMPTZ | indexed for `ORDER BY generated_at DESC LIMIT 1` |
| `engine_version` | TEXT | `SYSTEM_STATE_VERSION` at time of snapshot |
| `readiness_score` | INTEGER | 0-100 |
| `coverage_score` | INTEGER | 0-100 |
| `maturity_score` | INTEGER | 0-100 |
| `health_score` | INTEGER | 0-100 |
| `sync_health_score` | INTEGER | 0-100 |
| `backend_score` | INTEGER | 0-100 |
| `frontend_score` | INTEGER | 0-100 |
| `intelligence_score` | INTEGER | 0-100 |
| `observability_score` | INTEGER | 0-100 |
| `next_task_id` | TEXT | denormalized for fast `WHERE` lookup |
| `next_bp_id` | UUID | denormalized for fast `WHERE` lookup |
| `authoritative_queue` | JSONB | full `AuthoritativeTask[]` |
| `contradiction_flags` | JSONB | full `ContradictionFlag[]` |
| `state_graph` | JSONB | full `StateGraph` |
| `metadata` | JSONB | per-snapshot context (trigger, elapsed_ms, etc.) |

**Indexes:**
- `(project_id, generated_at DESC)` — primary read path
- `(project_id, next_task_id)` — task lookup
- GIN on `authoritative_queue` for queue-state queries (TBD)

---

## 2. Read patterns

| Read | Path | Index used |
|---|---|---|
| Most recent snapshot for project | `getLatestSystemSnapshot(projectId)` | `(project_id, generated_at DESC)` |
| Snapshot history (analytics) | `findAll({ project_id, order: [['generated_at', 'DESC']], limit: N })` | same |
| Specific task lookup | `findOne({ project_id, where: { next_task_id: x } })` | `(project_id, next_task_id)` |

**Stale threshold:** 5 minutes (`STALE_THRESHOLD_MS` in `snapshotReader.ts`).
Reads older than this trigger a rebuild via `readOrRebuild`.

---

## 3. Write patterns

Only `buildAuthoritativeState(projectId, { persist: true })` writes. Refresh
triggers route through it. No other code path is permitted to write to
`system_state_snapshots`.

Writes are append-only — snapshots are immutable history. The engine NEVER
updates a previous snapshot.

---

## 4. Retention

Snapshots accumulate. A retention policy will be added in Phase 3:
- Keep all snapshots from the last 24h
- Keep one per hour for 7 days
- Keep one per day for 90 days
- Drop everything older

Until retention ships, manual cleanup via:
```sql
DELETE FROM system_state_snapshots
WHERE generated_at < NOW() - INTERVAL '30 days';
```

---

## 5. Forbidden patterns

- Reading `readiness` / `coverage` / `maturity` directly from `capabilities` or
  `requirements_map` for any user-facing surface. Always go through
  `getLatestSystemSnapshot` or the API endpoint.
- Computing `next_step` from `last_execution.completed_steps` outside the
  engine.
- Storing engine-derived values back onto `capabilities.metrics` or similar
  legacy columns. The engine is the only writer of those values; legacy
  columns are deprecated.
- Joining `system_state_snapshots` with itself to "diff" snapshots — use the
  engine's contradiction detector instead.

---

## 6. Migration notes

Phase 1 created the table with all columns above. Phase 2 added:
- `engine_version` text column (defaults to `'2.0.0'`)
- GIN indexes for queue-state queries (deferred)

Future schema changes must:
1. Be additive (no DROP COLUMN)
2. Bump `engine_version`
3. Document migration here
