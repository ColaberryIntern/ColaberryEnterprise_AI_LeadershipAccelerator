/**
 * An index on `page_events (visitor_id, timestamp DESC)`.
 *
 * ## Why
 *
 * `page_events` is the largest table in this schema (~1.15M rows as of 11 Nov 2026) and had four
 * indexes, none of them on `visitor_id`:
 *
 *   page_events_pkey                        (id)
 *   idx_page_events_lead_id                 (lead_id)
 *   idx_page_events_lead_event              (lead_id, event_type) WHERE lead_id IS NOT NULL
 *   idx_page_events_tenant_brand_timestamp  (tenant_id, brand_id, timestamp)
 *
 * So every read keyed on the VISITOR rather than the lead planned as a sequential scan over the
 * whole table:
 *
 *   Seq Scan on page_events  (cost=0.00..60372.25 rows=1192125 width=96)
 *
 * Found by Kalkidan Bezabeh on 11 Nov 2026, reporting a failed read of the admissions signals
 * endpoint. That endpoint's other defect, an unbounded fetch, is fixed separately in
 * `admissionsSignalsReader.ts`; capping the rows stopped the memory risk but could not stop the
 * scan, because a cap bounds what is RETURNED and an index is what bounds what is EXAMINED. Two
 * different problems that looked like one.
 *
 * ## Why both columns, and why DESC
 *
 * The query this serves is `WHERE visitor_id = ANY($1) ORDER BY timestamp DESC`, per visitor. A
 * single-column index on `visitor_id` alone would find the rows and then sort them; the trailing
 * `timestamp DESC` lets the newest-first ordering be read straight off the index, which is the
 * whole shape of `ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY timestamp DESC)`.
 *
 * ## The cost, stated rather than buried
 *
 * `CREATE INDEX` takes a SHARE lock on `page_events`, which blocks writes for the duration. On
 * ~1.15M rows that is a few seconds, once, on the first boot after this merges. It is not
 * `CONCURRENTLY`: that cannot run inside a transaction, takes substantially longer, and leaves an
 * INVALID index behind if it fails partway, which is a worse thing to own at boot than a few
 * seconds of blocked inserts.
 *
 * The few seconds land during a deploy, when the backend is restarting and therefore not serving
 * tracker writes anyway. That is the argument for accepting the lock, and it is the reason this is
 * a boot-time statement rather than hand-run DDL.
 *
 * ## This file does not own `page_events`
 *
 * Every sibling in this folder creates its own net-new table. This one does not: it adds an index
 * to a table that already exists and that other code writes to constantly. So it has no
 * `CREATE TABLE`, it asserts the table rather than creating it, and its rollback drops only the
 * index it added. If `page_events` were ever absent, this must report that and change nothing,
 * not conjure a table that the tracker would then write into with the wrong shape.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['page_events'];

export const INDEX_NAME = 'idx_page_events_visitor_timestamp';

export const REQUIRED_INDEXES: ReadonlyArray<string> = [INDEX_NAME];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE INDEX IF NOT EXISTS ${INDEX_NAME}
     ON page_events (visitor_id, "timestamp" DESC)`,
];

/**
 * Net-new, so it reverts whole, and dropping an index is safe in a way dropping a table is not:
 * nothing reads an index directly, so the only effect of a rollback is that the scan comes back.
 * `page_events` itself is never mentioned here, because this file did not create it.
 */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  `DROP INDEX IF EXISTS ${INDEX_NAME}`,
];

export async function ensurePageEventVisitorIndex(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching the siblings. `assert` below is what actually decides, because
      // a loop that swallows every failure resolves identically on success and on total failure.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'page_event_visitor_index_statement_failed',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }
}

/**
 * Read one column of names using the shape PROVEN against this driver: a NAMED bind, and
 * `normalizeNameRows` because a single-column select comes back as raw arrays.
 */
async function readNames(sql: string, names: ReadonlyArray<string>): Promise<string[]> {
  const rows = await sequelize.query(sql, {
    bind: { names: names as string[] },
    type: QueryTypes.SELECT,
  });
  return normalizeNameRows(rows);
}

export async function assertPageEventVisitorIndex(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  // Only ask about the index if the table arrived. A missing table makes the index "missing" too,
  // and reporting both would bury the finding that actually explains it.
  if (problems.length === 0) {
    const idx = await readNames(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($names)`,
      REQUIRED_TABLES,
    );
    for (const i of REQUIRED_INDEXES) if (!idx.includes(i)) problems.push(`missing index ${i}`);
  }

  if (problems.length > 0) {
    throw new Error(`SchemaInvariantViolation: ${problems.join('; ')}`);
  }
}

export interface GuardedPageEventVisitorIndexResult {
  ok: boolean;
  error_class?: string;
}

/**
 * Boot entry point. CANNOT REJECT — a missing index is a performance problem, not a correctness
 * one, and it must never be the reason the backend fails to come up. Same contract as the
 * siblings, which is why `server.ts` can await it bare.
 */
export async function ensurePageEventVisitorIndexGuarded(
): Promise<GuardedPageEventVisitorIndexResult> {
  try {
    await ensurePageEventVisitorIndex();
    await assertPageEventVisitorIndex();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'page_event_visitor_index_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
