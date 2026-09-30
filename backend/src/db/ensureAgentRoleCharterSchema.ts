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
//
// Reese Product Phase 1, R4 — additive, nullable versioning columns
// (ALTER TABLE ... ADD COLUMN IF NOT EXISTS, same convention as
// ensureReeseWelcomeSchema.ts). Every one is nullable with no default, so an
// existing row (Dara's, and Reese's until applyReeseCharterV2.ts --apply
// runs) reads back exactly as it did before this change — this is what keeps
// buildRoleCharterBlock()'s output byte-identical for any charter without a
// version. Boot never writes these columns; the only writers are the PUT
// route (role_title/mission/responsibilities/kpis, as before) and the
// applyReeseCharterV2.ts one-off script (the version/authority fields).
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
    `ALTER TABLE agent_role_charters ADD COLUMN IF NOT EXISTS version INTEGER`,
    `ALTER TABLE agent_role_charters ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ`,
    `ALTER TABLE agent_role_charters ADD COLUMN IF NOT EXISTS boundaries JSONB`,
    `ALTER TABLE agent_role_charters ADD COLUMN IF NOT EXISTS authority_autonomous JSONB`,
    `ALTER TABLE agent_role_charters ADD COLUMN IF NOT EXISTS authority_approval_required JSONB`,
    `ALTER TABLE agent_role_charters ADD COLUMN IF NOT EXISTS authority_forbidden JSONB`,
    `ALTER TABLE agent_role_charters ADD COLUMN IF NOT EXISTS escalation_policy TEXT`,
    `CREATE TABLE IF NOT EXISTS agent_role_charter_versions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL REFERENCES ai_agents(id),
       version INTEGER NOT NULL,
       effective_at TIMESTAMPTZ NOT NULL,
       role_title VARCHAR(255) NOT NULL,
       mission TEXT NOT NULL,
       responsibilities JSONB NOT NULL DEFAULT '[]',
       kpis JSONB NOT NULL DEFAULT '[]',
       boundaries JSONB NOT NULL DEFAULT '[]',
       authority_autonomous JSONB NOT NULL DEFAULT '[]',
       authority_approval_required JSONB NOT NULL DEFAULT '[]',
       authority_forbidden JSONB NOT NULL DEFAULT '[]',
       escalation_policy TEXT,
       updated_by_email VARCHAR(255) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_role_charter_versions_agent_version ON agent_role_charter_versions (agent_id, version)`,
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
