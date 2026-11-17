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
    // AF11.8 — Ali's standing instructions, attached to A CAPABILITY rather than to the whole
    // agent. Ali, 16 Nov 2026: *"when approving the functionality, I should be able to add my
    // details of how the agent should work and respond."*
    //
    // WHY THIS COLUMN AND NOT A NEW TABLE. The hard part of a standing instruction is being in
    // front of the agent on every turn, and this table already does that: agentSystemPrompt.ts
    // injects active directives into the assembled prompt, the restrict-only boundary is already
    // enforced there, and creation and revocation are already attributed to a real email. A
    // second instructions table would mean two places an agent's standing instructions live and
    // a merge step in the hot path to decide which wins, which is a second source of truth about
    // how an agent behaves in production.
    //
    // NULL means agent-wide, which is every directive that exists today: production held ZERO
    // rows on 17 Nov 2026, so nothing is reinterpreted by this column arriving. A non-null value
    // means the instruction is only in front of the agent when THAT capability runs, which is
    // what getActiveDirectiveTexts() enforces, and a capability-scoped instruction leaking into
    // an unrelated turn is the failure that would make this column worse than useless.
    `ALTER TABLE manager_directives ADD COLUMN IF NOT EXISTS capability_id TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_manager_directives_capability ON manager_directives (agent_id, capability_id, status)`,
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
