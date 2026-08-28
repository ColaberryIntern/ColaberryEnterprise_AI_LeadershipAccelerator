import { sequelize } from '../config/database';

// AI Workforce Management, Checkpoint B (2026-08-28) — the AgentRoleCharter
// model (docs/architecture/ai-workforce-management/DOMAIN_REUSE_MAP.md:
// confirmed absent, "a charter needs its own small table, FK'd to
// ai_agents.id"). One row per agent, upserted by a manager — not an
// append-only log, unlike ensureAgentPersonaVersionHistorySchema.ts.
//
// Additive only: creates 1 new table, never alters or drops any existing
// column, table, or constraint. Same raw-SQL ensure pattern as
// ensureAgentPersonaVersionHistorySchema.ts.
export async function ensureAgentRoleCharterSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_role_charters (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL UNIQUE REFERENCES ai_agents(id),
       role_title VARCHAR(255) NOT NULL,
       mission TEXT NOT NULL,
       responsibilities JSONB NOT NULL DEFAULT '[]',
       kpis JSONB NOT NULL DEFAULT '[]',
       updated_by_email VARCHAR(255) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_role_charters schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent role charter schema ensured');
}
