import { sequelize } from '../config/database';

// Reese Phase 1 — agent-transparency columns on the existing `ai_agents` table.
// Additive only, idempotent, following the ensureWorkLedgerSchema.ts template:
// every statement is ALTER TABLE ... ADD COLUMN IF NOT EXISTS, individually
// try/caught so a partial DB self-heals on the next boot. Never alters or drops
// any existing column, table, or constraint.
//
// `system_prompt` — the agent's real, current system prompt text (Ali's explicit
// ask: be able to see, as real data, what an agent's system prompt is).
// `tools_granted` — structured JSON list of what the agent can actually do today
// (not an aspirational list — see reeseIdentitySeed.ts).
// `persona_version` — a single current version marker (date-stamp string); Phase 1
// deliberately does NOT build a full prompt-version-history table.
export const AI_AGENT_IDENTITY_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS system_prompt TEXT`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tools_granted JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS persona_version VARCHAR(50)`,
];

export async function ensureAiAgentIdentitySchema(): Promise<void> {
  for (const sql of AI_AGENT_IDENTITY_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ai-agent identity schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Reese agent identity/transparency schema ensured');
}
