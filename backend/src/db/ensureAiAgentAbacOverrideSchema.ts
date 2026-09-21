import { sequelize } from '../config/database';

// Real-enforcement scoping, Phase 3 (2026-09-20): Ali, live, when approving Phase 1's EXECUTE:
// "I would like a switch for each agent so I can turn off/on Shadow mode." Additive-only,
// idempotent, following ensureAiAgentAutonomyLevelSchema.ts's exact shape: one statement per
// line, individually try/caught so a partial DB self-heals on the next boot, never alters or
// drops any existing column/table/constraint.
//
// `abac_mode_override` — 'shadow' | 'enforce' | null. NO DB default: null means "follow the
// global `abac_enforcement` SystemSetting" (agentAuthorizationService.ts's getAbacMode()),
// which is what every real agent has on the day this ships — a genuine fleet-wide no-op,
// confirmed by a dedicated regression test, not just claimed. Deliberately does NOT accept
// 'off' — that stays a global-only concept (it bypasses authorization evaluation entirely, a
// broader, riskier bypass than the shadow/enforce toggle Ali actually asked for); enforced at
// the Zod layer in the admin route that writes this column, not at the DB layer, matching this
// column's own sibling `autonomy_level`'s "no DB check constraint, validated in application
// code" precedent (see ensureAiAgentAutonomyLevelSchema.ts).
//
// `abac_mode_override_set_at` / `abac_mode_override_set_by` — null until an admin deliberately
// sets an override through the real route (agentAbacOverrideService.ts). Distinguishes "an
// operator chose this" from "no one has ever touched this agent's enforcement mode" — the same
// honesty pattern `autonomy_level_set_at` established. `_set_by` goes further than that
// precedent (which never recorded who): an authorization-enforcement switch is more
// consequential than an autonomy-level choice, so this run adds a real audit trail rather than
// matching the sparser precedent exactly.
export const AI_AGENT_ABAC_OVERRIDE_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS abac_mode_override VARCHAR(10)`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS abac_mode_override_set_at TIMESTAMP`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS abac_mode_override_set_by VARCHAR(255)`,
];

export async function ensureAiAgentAbacOverrideSchema(): Promise<void> {
  for (const sql of AI_AGENT_ABAC_OVERRIDE_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ai-agent abac_mode_override schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] AiAgent abac_mode_override schema ensured');
}
