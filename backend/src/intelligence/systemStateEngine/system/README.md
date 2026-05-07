# SystemStateEngine — `system/` directory

This directory holds the **contracts** that govern how state flows in and out
of the engine. Read these BEFORE adding any new consumer of system state.

| File | What's in it |
|---|---|
| [`intelligence/STATE_CONTRACT.md`](./intelligence/STATE_CONTRACT.md) | The authoritative-state contract: read paths, write paths, refresh triggers, the canonical shape, forbidden patterns |
| [`database/DATABASE_CONTRACT.md`](./database/DATABASE_CONTRACT.md) | The `system_state_snapshots` table: schema, read/write patterns, retention, migrations |

## TL;DR

- Read state via `GET /api/portal/project/system-state` (or `readOrRebuild` server-side)
- Mutate via the existing endpoints — they fire `refreshSystemState(...)`
  fire-and-forget after success
- Never re-derive readiness, coverage, maturity, queue order, or next-action.
  The engine is the single source of truth.

## Why this directory exists

Phase 1 of System Intelligence Unification built the engine. Phase 2 cut over
every consumer to read from it. These contracts exist so Phase 3 (and every
new feature after it) doesn't reintroduce fragmentation.

If you find yourself writing logic that computes state from scratch, route it
through the engine instead. Open a follow-up ticket if the engine is missing
a dimension you need; do not duplicate the calculation.
