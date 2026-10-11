import { sequelize } from '../config/database';

/**
 * The audit trail for operator actions on somebody else's work.
 *
 * WHY THIS TABLE EXISTS. Rematching a recording, releasing a slot or correcting a
 * publication all reassign work a student did. "Why is my recording on someone else's
 * task" is a question that gets asked weeks later, by which time the only honest
 * answer has to come from a row written at the time.
 *
 * APPEND-ONLY BY INTENT. There is no update path and no delete path in the service —
 * an audit you can edit is not an audit. That is a property of the code rather than a
 * grant, because a `DELETE` would still work if somebody wrote one; the suite asserts
 * the service never does.
 *
 * `from_state` and `to_state` are stored as the plain sentences the operator was shown
 * in the preview, not as internal enums. Whoever reads this later is a human trying to
 * understand what happened, and `state: 3` tells them nothing.
 *
 * Every column in the CREATE body also gets its own ALTER, because
 * `CREATE TABLE IF NOT EXISTS` is a no-op where the table already exists.
 */

export const PRESENTATION_OPS_TABLES = ['presentation_ops_audit'] as const;

export const PRESENTATION_OPS_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS presentation_ops_audit (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     actor VARCHAR(160) NOT NULL,
     op_kind VARCHAR(40) NOT NULL,
     target_id VARCHAR(80) NOT NULL,
     from_state TEXT,
     to_state TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_ops_audit ADD COLUMN IF NOT EXISTS actor VARCHAR(160)`,
  `ALTER TABLE presentation_ops_audit ADD COLUMN IF NOT EXISTS op_kind VARCHAR(40)`,
  `ALTER TABLE presentation_ops_audit ADD COLUMN IF NOT EXISTS target_id VARCHAR(80)`,
  `ALTER TABLE presentation_ops_audit ADD COLUMN IF NOT EXISTS from_state TEXT`,
  `ALTER TABLE presentation_ops_audit ADD COLUMN IF NOT EXISTS to_state TEXT`,
  `ALTER TABLE presentation_ops_audit ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,

  // "What happened to this recording" is the question, so the target leads the index.
  `CREATE INDEX IF NOT EXISTS presentation_ops_audit_target
     ON presentation_ops_audit (target_id, created_at DESC)`,
  // "What did this operator do today" is the second question.
  `CREATE INDEX IF NOT EXISTS presentation_ops_audit_actor
     ON presentation_ops_audit (actor, created_at DESC)`,
];

export async function ensurePresentationOpsSchema(): Promise<void> {
  for (const sql of PRESENTATION_OPS_STATEMENTS) {
    await sequelize.query(sql);
  }
}

export default ensurePresentationOpsSchema;
