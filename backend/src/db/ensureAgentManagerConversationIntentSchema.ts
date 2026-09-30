import { sequelize } from '../config/database';

// Reese Agentic AI Employee mission, Capability 8 — the generic pending-
// intent-confirmation workflow. Additive only: one new JSONB column on the
// existing agent_manager_conversations table, following the exact
// ensureAgentManagerConversationReliabilitySchema.ts template (ALTER TABLE
// ... ADD COLUMN IF NOT EXISTS, individually try/caught). Never alters or
// drops any existing column, table, or constraint — in particular, never
// touches pending_reliability_confirmation, which keeps its own column and
// flow unchanged.
//
// `pending_intent_confirmation` holds the one pending, non-reliability
// intent-confirmation proposal (e.g. CHANGE_GOAL) awaiting the manager's
// next reply, if any — null the rest of the time. A conversation has at
// most one pending intent confirmation at a time; a new detection
// overwrites an unconfirmed one rather than stacking multiple.
export const AGENT_MANAGER_CONVERSATION_INTENT_STATEMENTS: string[] = [
  `ALTER TABLE agent_manager_conversations ADD COLUMN IF NOT EXISTS pending_intent_confirmation JSONB`,
];

export async function ensureAgentManagerConversationIntentSchema(): Promise<void> {
  for (const sql of AGENT_MANAGER_CONVERSATION_INTENT_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent-manager-conversation intent schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent manager conversation pending-intent-confirmation schema ensured');
}
