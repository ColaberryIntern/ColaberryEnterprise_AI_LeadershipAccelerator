import { sequelize } from '../config/database';

// AI Workforce Management, Checkpoint D (2026-08-29) — a manager's
// structured 1:1 check-in record with their agent. Additive only: creates
// 1 new table, never alters or drops any existing column, table, or
// constraint.
export async function ensureAgentOneOnOneSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_one_on_ones (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL REFERENCES ai_agents(id),
       org_member_id UUID REFERENCES org_members(id),
       created_by_email VARCHAR(255) NOT NULL,
       agenda TEXT NOT NULL,
       outcome_notes TEXT,
       status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
       held_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_one_on_ones_agent_status ON agent_one_on_ones (agent_id, status, created_at DESC)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_one_on_ones schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent one-on-one schema ensured');
}
