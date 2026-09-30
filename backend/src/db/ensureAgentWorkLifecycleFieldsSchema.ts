import { sequelize } from '../config/database';

// Reese Agentic Employee & Manager Workspace, Phase 1, R12 — the new mission doc's
// section 4 wants a work item to carry `plan_version`, a `next_wakeup_at`, and
// `attempt_count`. Plan-audit cycle 1 (this run's own execution-contract.md) found
// a real, already-deployed schema for "the work item" -- `ticket_work_units`
// (ensureWorkGraphSchema.ts) -- that covers most of the mission's field list
// already (acceptance_criteria, status, risk_tier, approval_policy,
// assigned_agent_name) but genuinely lacks these three. Rather than a new,
// parallel table, this adds them as 3 new nullable/defaulted columns on the
// EXISTING table, matching that file's own idempotent `ADD COLUMN IF NOT EXISTS`
// convention exactly.
//
// Additive only, zero behavior change: nothing in this codebase reads or writes
// any of these 3 columns yet (confirmed by a repo-wide grep before this file was
// written) -- this is the "schema is ready" half of "design and approve... before
// extending autonomy", not the half where autonomy actually extends. That is
// Phase 2's job, when a real work loop starts creating and updating
// ticket_work_units rows for Reese specifically (nothing does today -- also
// confirmed by grep, see this run's own reconciliation memo).
//
// Columns must match backend/src/models/TicketWorkUnit.ts EXACTLY.
export async function ensureAgentWorkLifecycleFieldsSchema(): Promise<void> {
  const statements: string[] = [
    // Which revision of this work unit's plan is currently active -- the
    // mission's own "persist... plan version" ask. Defaults to 1 so every
    // existing row (there are none for Reese today, but other real callers of
    // workGraphService.ts's createWorkUnit() already have rows) reads as a
    // real, honest first version rather than NULL.
    `ALTER TABLE ticket_work_units ADD COLUMN IF NOT EXISTS plan_version INTEGER NOT NULL DEFAULT 1`,
    // When a bounded work loop should next check this unit -- nullable: a work
    // unit with no scheduled wake-up (e.g. already terminal, or waiting on a
    // human with no timeout) genuinely has none, never a fabricated time.
    `ALTER TABLE ticket_work_units ADD COLUMN IF NOT EXISTS next_wakeup_at TIMESTAMPTZ`,
    // Real attempt counter for the mission's "recoverable execution, bounded
    // retries" ask. Defaults to 0, matching plan_version's same honest-default
    // reasoning.
    `ALTER TABLE ticket_work_units ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent-work-lifecycle-fields schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent work lifecycle fields (plan_version/next_wakeup_at/attempt_count) ensured');
}
