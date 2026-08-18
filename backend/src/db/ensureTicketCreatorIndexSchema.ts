import { sequelize } from '../config/database';

// Workforce OS perf fix (2026-08-18, session CC-20260818-wf9k) — `tickets` had a
// btree index on `assigned_to_id` but NONE on `created_by_id`, even though every
// per-agent ticket-count query (liveAgentsService.ts, agentDetailService.ts) ORs
// across both columns. Confirmed live via EXPLAIN ANALYZE on production
// (cory-engine's real per-agent count): Seq Scan on tickets, 76ms, "Rows Removed by
// Filter: 6547" — `pg_indexes` confirmed `created_by_id` genuinely has no index at
// all. For a low-cardinality agent (e.g. one of the 16 department Architects, each
// ~1-2% of the table) this index lets the planner use a Bitmap Index Scan instead
// of a full Seq Scan. For a high-cardinality agent (cory-engine: 59.5% of all
// tickets) a Seq Scan remains the objectively correct plan and this index will not
// change it — disclosed honestly, not a claim this index fixes every agent's query.
//
// Additive only, idempotent, following ensureAiAgentIdentitySchema.ts's exact
// shape: one statement, individually try/caught so a partial DB self-heals on the
// next boot, never alters or drops any existing column/table/constraint.
export const TICKET_CREATOR_INDEX_STATEMENTS: string[] = [
  `CREATE INDEX IF NOT EXISTS tickets_created_by_id ON tickets (created_by_id)`,
];

export async function ensureTicketCreatorIndexSchema(): Promise<void> {
  for (const sql of TICKET_CREATOR_INDEX_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ticket-creator index schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Workforce OS ticket-creator (created_by_id) index ensured');
}
