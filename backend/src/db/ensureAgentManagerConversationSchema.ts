import { sequelize } from '../config/database';

// AI Workforce Management, Checkpoint C (2026-08-28) — Direct Agent
// Communication, first slice: a continuous DM-style conversation thread
// between a manager and an agent. Additive only: creates 2 new tables,
// never alters or drops any existing column, table, or constraint.
export async function ensureAgentManagerConversationSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_manager_conversations (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL REFERENCES ai_agents(id),
       participant_email VARCHAR(255) NOT NULL,
       participant_org_member_id UUID REFERENCES org_members(id),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_manager_conversations_agent_participant ON agent_manager_conversations (agent_id, participant_email)`,
    `CREATE TABLE IF NOT EXISTS agent_manager_messages (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       conversation_id UUID NOT NULL REFERENCES agent_manager_conversations(id),
       role VARCHAR(20) NOT NULL,
       content TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_manager_messages_conversation ON agent_manager_messages (conversation_id, created_at)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_manager_conversation schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent manager conversation schema ensured');
}
