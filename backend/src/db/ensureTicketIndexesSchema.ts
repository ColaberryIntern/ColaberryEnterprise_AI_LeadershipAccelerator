import { sequelize } from '../config/database';

// Ticket Board Performance fix (2026-08-18) — the founder reported the ticket
// board "takes forever to load." Live production investigation (EXPLAIN ANALYZE
// against accelerator_prod, 16,186 rows) found the real cause: `getTicketsForBoard()`
// has no default status filter and no LIMIT, so a normal page load runs the
// equivalent of `SELECT * FROM tickets` — every column (including JSONB metadata
// and TEXT description/summary_current), every row, every time. An index on
// `status` alone (already present in prod as `tickets_status`) does not help this:
// `status <> 'done'` matches ~33% of rows, well past the selectivity threshold
// where Postgres's planner correctly prefers a sequential scan over an index scan.
// The real fix (see AdminTicketBoardPage.tsx / ticketService.ts, this same commit)
// is a "last 7 days" default view, which cuts the default row count from 16,186 to
// ~550 (a ~29x reduction) — but that filter is only fast, and stays fast as the
// table keeps growing (~500+ tickets/week from agent activity alone), if
// `created_at` itself is indexed. No such index exists today.
//
// `CONCURRENTLY` (not a plain CREATE INDEX) because `tickets` is write-heavy — 16+
// autonomous agents insert into it continuously — matching the established
// precedent in server.ts's ensureCommunicationIndexes() (interaction_outcomes,
// also write-heavy) rather than the plain CREATE INDEX IF NOT EXISTS pattern most
// other ensure*Schema files use for lower-traffic tables. CONCURRENTLY cannot run
// inside a transaction block; each statement is its own top-level sequelize.query()
// call (never wrapped in sequelize.transaction()), same as every other statement in
// this file family. Each statement has its own try/catch so a partial index build
// (or a duplicate CONCURRENTLY invalid-index left over from an interrupted prior
// run) self-heals on the next boot rather than blocking startup.
export async function ensureTicketIndexesSchema(): Promise<void> {
  const statements: string[] = [
    // Powers the new "last 7 days" default board view directly — the board's most
    // common query shape going forward has no status predicate, only a created_at
    // lower bound, so this needs to be its own leading-column index (a composite
    // index led by status would not be used for a created_at-only filter).
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_created_at ON tickets (created_at)`,
    // Composite for the flat /api/admin/tickets list endpoint (and any future
    // caller) that combines a status filter with recency — the exact shape the
    // founder's own reported query (`status <> 'done'`) takes once it is also
    // date-bounded.
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_status_created_at ON tickets (status, created_at)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ticket index ensure stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Ticket board performance indexes ensured');
}
