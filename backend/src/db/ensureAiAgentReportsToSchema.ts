import { sequelize } from '../config/database';

// Agent Ticket Standard — "every ticket must have a home" (Ali, live, 2026-08-18,
// session CC-20260818-x4nk). Additive-only, idempotent, following
// ensureAiAgentIdentitySchema.ts / ensureTicketCreatorIndexSchema.ts's exact shape:
// one statement, individually try/caught so a partial DB self-heals on the next
// boot, never alters or drops any existing column/table/constraint.
//
// `reports_to_org_member_id` — the real human (an `org_members` row on the
// "Colaberry" org — the Business Account "Employee" roster feature, not a new
// concept) this agent is accountable to. Nullable at the column level (Postgres has
// no partial/conditional NOT NULL), but `ticketService.createTicket()` enforces the
// real requirement in application code: any non-human ticket creator whose AiAgent
// row has this null is rejected at creation time, not silently allowed through. No
// DB-level FK constraint — matches this table's and `tickets`'s own existing
// convention of NOT foreign-key-constraining actor-ref columns (see Ticket.ts's
// `created_by_id`/`assigned_to_id`, also unconstrained STRING columns) so an
// unexpected data shape can never fail an ALTER or a write; referential correctness
// is enforced at the application layer (createTicket()'s resolver, and
// validateAgentTicketStandard.ts's read-only check) instead.
export const AI_AGENT_REPORTS_TO_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS reports_to_org_member_id UUID`,
  // The model's `indexes:` array entry is documentation-only (this repo never calls
  // sequelize.sync() at boot, per Ticket.ts's own precedent comment) — this is the
  // real, runtime-created index.
  `CREATE INDEX IF NOT EXISTS idx_ai_agents_reports_to_org_member_id ON ai_agents (reports_to_org_member_id)`,
];

export async function ensureAiAgentReportsToSchema(): Promise<void> {
  for (const sql of AI_AGENT_REPORTS_TO_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ai-agent reports_to schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] AiAgent reports_to_org_member_id schema ensured');
}
