import { sequelize } from '../config/database';

// AI Workforce Management, Checkpoint C (2026-08-28) — the ManagerDirective
// model: a standing instruction from a real manager to an agent, injected
// into the agent's runtime context (see agentSystemPrompt.ts), never written
// into AiAgent.system_prompt. Append-only/versioned, same shape as
// ensureAgentPersonaVersionHistorySchema.ts's history table but with a real
// active/revoked status column since (unlike a version-change log) a
// directive's CURRENT state — is it still in force — matters at read time,
// on every single agent turn.
//
// Additive only: creates 1 new table, never alters or drops any existing
// column, table, or constraint.
export async function ensureManagerDirectiveSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS manager_directives (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL REFERENCES ai_agents(id),
       created_by_org_member_id UUID REFERENCES org_members(id),
       created_by_email VARCHAR(255) NOT NULL,
       directive_text TEXT NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'active',
       revoked_at TIMESTAMPTZ,
       revoked_by_email VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_manager_directives_agent_status ON manager_directives (agent_id, status, created_at DESC)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] manager_directives schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Manager directive schema ensured');
}
