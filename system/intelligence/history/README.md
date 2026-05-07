# /system/intelligence/history/

Foundation for system memory (Phase 3, deferred build-out).

This directory will collect time-series records that survive snapshot
rotation:

- Historical queue changes (how priorities shifted over time)
- Historical contradictions (what kinds appear/disappear)
- Score regressions (when a project went backward and why)
- Repeated failures (which BPs keep flagging the same issue)
- User overrides (manual interventions that disagree with the engine)
- Rejected recommendations (Cory said X, user did Y instead)

**Status:** Foundation only. The directory exists; the table + writer are
TBD in Phase 4. Do not over-engineer.

**Storage plan:**
- Table `system_state_history` (append-only)
- Trigger: `setImmediate` at the tail of every snapshot persist
- Retention: keep one row per (project_id, day) by collapsing intra-day
  changes to the daily diff
