import { sequelize } from '../config/database';

// Trust Contract Phase 1 (2026-08-26) — closes a real, confirmed-absent gap:
// `AiAgent.persona_version` (ensureAiAgentIdentitySchema.ts) has always been
// "a single current version marker... Phase 1 deliberately does NOT build a
// full prompt-version-history table" (that file's own comment). Investigation
// found the ONE real place persona_version ever changes: `seedAgentRegistry()`
// (agentRegistrySeed.ts) unconditionally overwrites it from the hardcoded
// AGENT_REGISTRY entry on every boot. This table captures that real event —
// a row is written only when the incoming value genuinely differs from what
// was stored, never on every boot's no-op reseed (see
// agentPersonaVersionHistoryService.ts for the idempotency guard).
//
// Additive only: creates 1 new table, never alters or drops any existing
// column, table, or constraint. Same raw-SQL ensure pattern as
// ensureReeseOutreachSchema.ts.
export async function ensureAgentPersonaVersionHistorySchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_persona_version_history (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL REFERENCES ai_agents(id),
       agent_name VARCHAR(255) NOT NULL,
       persona_version VARCHAR(50) NOT NULL,
       previous_version VARCHAR(50),
       system_prompt TEXT,
       tools_granted JSONB,
       source VARCHAR(50) NOT NULL DEFAULT 'registry_seed',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_persona_version_history_agent ON agent_persona_version_history (agent_id, created_at DESC)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_persona_version_history schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent persona version history schema ensured');
}
