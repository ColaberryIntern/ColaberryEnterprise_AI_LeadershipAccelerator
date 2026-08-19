import { sequelize } from '../config/database';

// AI Leadership / AI Staff hierarchy (Ali, live, 2026-08-19 — confirmed via a
// direct AskUserQuestion exchange in the orchestrating session; see
// C:\Users\ali_m\.claude\projects\...\memory\project_ai_workforce_2tier_hierarchy_confirmed.md
// for the full record). Additive-only, idempotent, following
// ensureAiAgentReportsToSchema.ts's exact shape: one statement per line,
// individually try/caught so a partial DB self-heals on the next boot, never
// alters or drops any existing column/table/constraint.
//
// `reports_to_type` — 'human' | 'agent'. `reports_to_id` — either an
// `org_members.id` (when type='human') or another `ai_agents.id` (when
// type='agent'). Together these supersede `reports_to_org_member_id` (added
// 2026-08-18) as the source of truth `ticketCreatorReportsToResolver.ts`
// reads — that column is left in place, untouched, for historical/audit
// value only, matching this repo's "never drop a column" convention. No
// DB-level FK constraint, matching `reports_to_org_member_id`'s own
// established convention (see that file's header comment) and this table's
// broader pattern of not FK-constraining actor-ref columns.
export const AI_AGENT_HIERARCHY_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS reports_to_type VARCHAR(10)`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS reports_to_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_ai_agents_reports_to_id ON ai_agents (reports_to_id)`,
];

export async function ensureAiAgentHierarchySchema(): Promise<void> {
  for (const sql of AI_AGENT_HIERARCHY_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ai-agent hierarchy schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] AiAgent reports_to_type/reports_to_id (hierarchy) schema ensured');
}
