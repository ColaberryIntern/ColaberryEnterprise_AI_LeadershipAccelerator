import { sequelize } from '../config/database';

// AI Workforce Reset, Phase C (Ali, live, 2026-08-24): "add new ones slowly
// in a way so I can see how they perform." Additive-only, idempotent,
// following ensureAiAgentHierarchySchema.ts's exact shape: one statement per
// line, individually try/caught so a partial DB self-heals on the next boot,
// never alters or drops any existing column/table/constraint.
//
// `autonomy_level` — the 4-level ladder `docs/ai-governance/abac-design.md`
// proposed (2026-06-22): 'observe' | 'suggest' | 'act_audited' | 'communicate'.
// Reused here verbatim rather than inventing a second, competing governance
// vocabulary. CORRECTION (2026-08-25): this column's original header comment
// claimed `authorizeAgentAction()` was "explicitly out of scope" and the design
// doc had "no code yet" — both were wrong. A real chokepoint has existed and
// run in shadow mode since PR #69 (2026-06-23, session CC-20260622-r468),
// deriving its own autonomy level from the pre-existing `agentPermissionService`
// tier map, with no knowledge of this column. See
// agentAuthorizationService.ts's `resolveLevel()` (2026-08-25) for how the two
// are now reconciled: this column governs ONLY when `autonomy_level_set_at`
// is non-null (an operator deliberately chose it via the reactivation flow) —
// otherwise the existing tier-derived level keeps governing, unchanged, for
// every agent this column has never applied to. Required at reactivation time
// (agentReactivationService.ts) so bringing an agent back online is a
// deliberate, visible act — never a silent flip back to unlimited trust.
// DB default 'observe' (fail-closed) matches the design doc's stated default
// for "any new/unclassified agent." No DB-level check constraint on the value
// set — validated in application code (reactivationSchema.ts's Zod enum) so
// a future 5th level needs no migration to add.
//
// `autonomy_level_set_at` (2026-08-25) — null until `reactivateAgent()` sets
// it in the same update as `autonomy_level`. The honest marker distinguishing
// "an operator chose this" from "the migration's untouched default sitting on
// every agent that has never been through the reactivation flow" — without
// it, `autonomy_level`'s DB default ('observe') would be indistinguishable
// from a deliberate choice, and wiring the gate to prefer it would silently
// demote the entire existing fleet (Reese, cory-engine, every long-running
// agent) to observe-only in the shadow signal the moment this shipped.
export const AI_AGENT_AUTONOMY_LEVEL_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS autonomy_level VARCHAR(20) DEFAULT 'observe'`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS autonomy_level_set_at TIMESTAMP`,
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
