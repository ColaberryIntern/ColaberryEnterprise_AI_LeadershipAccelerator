import { sequelize } from '../config/database';

// AI Workforce Management, Checkpoint E (2026-08-31) — a proposed fact about
// an agent, pending human review before it can ever be injected into that
// agent's runtime context. Additive only: creates 1 new table, never alters
// or drops any existing column, table, or constraint.
export async function ensureAgentMemoryProposalSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_memory_proposals (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL REFERENCES ai_agents(id),
       content TEXT NOT NULL,
       evidence TEXT,
       proposed_by_email VARCHAR(255) NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'pending',
       reviewed_by_email VARCHAR(255),
       reviewed_at TIMESTAMPTZ,
       review_notes TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_memory_proposals_agent_status ON agent_memory_proposals (agent_id, status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_memory_proposals schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent memory proposal schema ensured');
}
