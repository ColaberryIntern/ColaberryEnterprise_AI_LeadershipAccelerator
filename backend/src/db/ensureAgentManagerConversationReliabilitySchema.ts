import { sequelize } from '../config/database';

// Reese Agentic AI Employee mission, Checkpoint B — the manager confirmation
// workflow. Additive only: one new JSONB column on the existing
// agent_manager_conversations table, following the ensureWorkLedgerSchema.ts
// template (ALTER TABLE ... ADD COLUMN IF NOT EXISTS, individually
// try/caught). Never alters or drops any existing column, table, or
// constraint.
//
// `pending_reliability_confirmation` holds the one pending quarantine/restore
// proposal awaiting the manager's next reply, if any — null the rest of the
// time. A conversation has at most one pending confirmation; a new
// detection overwrites an unconfirmed one rather than stacking multiple.
export const AGENT_MANAGER_CONVERSATION_RELIABILITY_STATEMENTS: string[] = [
  `ALTER TABLE agent_manager_conversations ADD COLUMN IF NOT EXISTS pending_reliability_confirmation JSONB`,
];

export async function ensureAgentManagerConversationReliabilitySchema(): Promise<void> {
  for (const sql of AGENT_MANAGER_CONVERSATION_RELIABILITY_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent-manager-conversation reliability schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent manager conversation reliability-confirmation schema ensured');
}
