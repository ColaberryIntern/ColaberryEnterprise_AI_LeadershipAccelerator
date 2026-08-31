import { sequelize } from '../config/database';

// AI Workforce Management, Checkpoint D (2026-08-30) — a manager-set target
// for a real, computable metric on an agent. Additive only: creates 1 new
// table, never alters or drops any existing column, table, or constraint.
export async function ensureAgentGoalSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_goals (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL REFERENCES ai_agents(id),
       org_member_id UUID REFERENCES org_members(id),
       created_by_email VARCHAR(255) NOT NULL,
       metric_key VARCHAR(50) NOT NULL,
       comparison VARCHAR(20) NOT NULL,
       target_value DOUBLE PRECISION NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'active',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_goals_agent_status ON agent_goals (agent_id, status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_goals schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent goal schema ensured');
}
