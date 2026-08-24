import { sequelize } from '../config/database';

// AI Workforce Reset, Phase C (Ali, live, 2026-08-24): "add new ones slowly
// in a way so I can see how they perform." Additive-only, idempotent,
// following ensureAiAgentHierarchySchema.ts's exact shape: one statement per
// line, individually try/caught so a partial DB self-heals on the next boot,
// never alters or drops any existing column/table/constraint.
//
// `autonomy_level` — the 4-level ladder `docs/ai-governance/abac-design.md`
// already proposed (2026-06-22, "no code yet", still awaiting Ali's sign-off
// on 7 open decisions): 'observe' | 'suggest' | 'act_audited' | 'communicate'.
// Reused here verbatim rather than inventing a second, competing governance
// vocabulary — but this column is PURELY DECLARATIVE at this stage: nothing
// in this repo reads it to block or permit an action yet (that would be real
// enforcement, `authorizeAgentAction()`, explicitly out of scope — see
// abac-design.md's own Phase 1 "shadow mode, nothing blocked" for why this is
// consistent with that doc's own rollout plan, not a preemptive decision on
// the sign-off it's still waiting on). Required at reactivation time
// (agentReactivationService.ts) so bringing an agent back online is a
// deliberate, visible act — never a silent flip back to unlimited trust.
// DB default 'observe' (fail-closed) matches the doc's own stated default for
// "any new/unclassified agent." No DB-level check constraint on the value
// set — validated in application code (reactivationSchema.ts's Zod enum) so
// a future 5th level needs no migration to add.
export const AI_AGENT_AUTONOMY_LEVEL_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS autonomy_level VARCHAR(20) DEFAULT 'observe'`,
];

export async function ensureAiAgentAutonomyLevelSchema(): Promise<void> {
  for (const sql of AI_AGENT_AUTONOMY_LEVEL_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ai-agent autonomy_level schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] AiAgent autonomy_level schema ensured');
}
