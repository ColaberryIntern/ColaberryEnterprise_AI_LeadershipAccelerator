import { sequelize } from '../config/database';

// Fleet-wide autonomy-level auto-classification, Phase 2 (2026-09-14) —
// Additive-only, idempotent, following ensureAiAgentAutonomyLevelSchema.ts's
// exact shape.
//
// `autonomy_level_source` — 'auto' | 'manual' | null. The honest marker this
// migration exists for: Ali chose to have autonomy_level auto-SET directly
// from an agent's real capabilities (agentCapabilityClassifier.ts), not
// merely suggested for a human to confirm. Without a way to tell "the
// system classified this" apart from "a human deliberately chose this via
// the reactivation flow" (agentReactivationService.ts), an auto-classified
// value would be indistinguishable from a real human decision in the UI —
// the one non-negotiable guardrail from the scoped plan. NULL for every
// existing row until the Phase 3 backfill or a real reactivateAgent() call
// touches it — never backfilled to a guessed value here; this migration
// only adds the column.
export const AI_AGENT_AUTONOMY_SOURCE_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS autonomy_level_source VARCHAR(10)`,
];

export async function ensureAiAgentAutonomySourceSchema(): Promise<void> {
  for (const sql of AI_AGENT_AUTONOMY_SOURCE_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ai-agent autonomy_level_source schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] AiAgent autonomy_level_source schema ensured');
}
