import { sequelize } from '../config/database';

// AI Workforce Reset, Phase D.1 "Inventory" (2026-08-24) — Ali signed off on
// docs/ai-governance/abac-design.md's own recommendations wholesale,
// including decision 4 (per-department scope to start) and decision 5
// (columns on AiAgent, not a separate agent_policies table). Additive-only,
// idempotent, following ensureAiAgentAutonomyLevelSchema.ts's exact shape.
//
// `department` — one of the 18 real slugs in the `departments` table
// (confirmed live in production before writing this: admissions, alumni,
// education, executive, finance, governance, growth, infrastructure,
// intelligence, marketing, operations, orchestration, partnerships,
// platform, reporting, security, strategy, student_success). No FK — agents
// and departments are populated by separate processes and a dangling
// reference here should never block an agent write. `null` for an agent not
// yet classified, or one genuinely cross-cutting (never forced into a wrong
// department) — see agentDepartmentClassifier.ts.
//
// `scope` — JSONB, default '{}'. Per abac-design.md decision 4, this repo
// starts at PER-DEPARTMENT granularity only: `department` above IS the
// scope for this phase. `scope` exists now (rather than being added later)
// so a future per-campaign/per-lead-segment grant (decision 4's deferred
// half) is an application-code change, not another migration — but nothing
// populates or reads it yet.
//
// Same posture as autonomy_level: PURELY DECLARATIVE. Nothing in this repo
// enforces or restricts an action based on department/scope — that is real
// enforcement (Phase D.3+), still gated on reviewing Phase 1's shadow-mode
// data first, per abac-design.md's own phased rollout.
export const AI_AGENT_DEPARTMENT_SCOPE_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS department VARCHAR(50)`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS scope JSONB DEFAULT '{}'::jsonb`,
];

export async function ensureAiAgentDepartmentScopeSchema(): Promise<void> {
  for (const sql of AI_AGENT_DEPARTMENT_SCOPE_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ai-agent department/scope schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] AiAgent department/scope schema ensured');
}
