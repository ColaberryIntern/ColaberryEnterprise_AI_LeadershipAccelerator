/**
 * ensureTaskClaimSchema — leases on a task, so two workers never pick up the same one. Additive.
 *
 * WHY THIS EXISTS
 *
 * The Ali Task Agent's idempotency marker is a comment on the Basecamp thread. That is the right
 * source of truth for "has ATA already acted", and it was chosen after local state files let the
 * CB runners pile 47 duplicate comments on one todo. But it is completely blind to the case that
 * matters now: a Claude Code session with a worktree open and a PR half-written leaves no trace on
 * the thread at all, so a second worker sees an untouched ticket and starts the same work.
 *
 * A Basecamp comment per claim was considered and rejected. Claims are frequent, short-lived and
 * machine-made; writing each one to a human thread turns every ticket into a log. A row is cheap,
 * expires on its own, and nobody has to read it.
 *
 * SHAPE
 *
 *   task_key    'projectId/todoId' - the same id the work order carries, so a claim can be made
 *               from a work order with nothing else in hand. TEXT, not two integers, because the
 *               key also has to cover non-Basecamp work later without a migration.
 *   holder      who holds it. A session id, a tab name, a person. Free text on purpose: the point
 *               is that a human reading it can tell who to go and ask.
 *   expires_at  NOT NULL. A lease without an expiry is a lock, and a lock held by a session that
 *               died is a ticket nobody can ever work again. This is the single most important
 *               column in the table.
 *
 * PRIMARY KEY on task_key: one live claim per task, enforced by the database rather than by a
 * read-then-write that two workers can interleave. Taking a claim is an upsert guarded on expiry,
 * so the race resolves in Postgres and not in application code.
 *
 * Additive only. One new table, no existing table altered. sequelize.sync() is off in this repo,
 * so a model alone would create nothing; this file is the only thing that makes the table exist.
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['ops_task_claims'];

export const TASK_CLAIM_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS ops_task_claims (
     task_key     TEXT PRIMARY KEY,
     holder       TEXT NOT NULL,
     purpose      TEXT,
     claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     expires_at   TIMESTAMPTZ NOT NULL,
     released_at  TIMESTAMPTZ,
     note         TEXT
   )`,
  // Expiry is the only thing ever scanned in bulk ("what is still held?"), so it is the one index.
  `CREATE INDEX IF NOT EXISTS idx_ops_task_claims_expires ON ops_task_claims (expires_at)`,
];

export async function ensureTaskClaimSchema(): Promise<void> {
  for (const sql of TASK_CLAIM_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] task claim schema stmt skipped:', err?.message);
    }
  }
  await assertTaskClaimSchema();
}

/**
 * Post-condition. Every statement above is swallowed into a console.warn, so this is the only
 * thing that actually proves the table landed — the lesson recorded against ensureSbpSchema, where
 * a loop that warned on every failure resolved identically on total success and total failure.
 *
 * It checks the COLUMNS too, not just the table. `CREATE TABLE IF NOT EXISTS` is a no-op against an
 * existing table, so a column added to the block above would silently never appear on a deployment
 * that already has it. Asserting the columns is what turns that from a silent drift into a loud one.
 */
export async function assertTaskClaimSchema(): Promise<boolean> {
  const problems: string[] = [];
  const required = ['task_key', 'holder', 'expires_at', 'claimed_at'];
  try {
    const selects = required.map((c, i) => `bool_or(column_name = '${c}') AS c${i}`).join(', ');
    const [rows] = await sequelize.query(
      `SELECT ${selects} FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ops_task_claims'`,
    );
    const row = (((rows as any[]) || [])[0] || {}) as Record<string, boolean>;
    required.forEach((c, i) => { if (!row[`c${i}`]) problems.push(`ops_task_claims.${c} missing`); });
  } catch (err: any) {
    problems.push(`schema introspection failed: ${err?.message}`);
  }

  if (problems.length === 0) {
    console.log('[DB] task claim schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event: 'schema_invariant_violation',
    outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: { schema: 'ops_task_claims', problems },
  }));
  return false;
}
