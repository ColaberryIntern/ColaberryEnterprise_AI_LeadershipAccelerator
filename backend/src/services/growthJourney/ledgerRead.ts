import { Op, type WhereOptions } from 'sequelize';
import { sequelize } from '../../config/database';
import { EventLedger } from '../../models';
import { classifyError } from '../../utils/errorClassifier';
import type { JourneyEntityType } from './ledger';

/**
 * The Growth Journey ledger's ONE bounded read (Phase 6, T602).
 *
 * `ledger.ts` is the one door IN: every journey event is one `event_ledger`
 * row. This is the one door OUT for the journey's own code. The table is
 * written on every event the platform records, it had no index at all until
 * this task added three, and a read of it from a boot-time executor or an
 * admin page must never be the thing that holds a connection for a minute
 * because a window happened to be wide. So every read here is:
 *
 *   - BOUNDED: an entity type, an explicit id list (an empty list is an empty
 *     answer without a query), an optional event type and lower bound, and a
 *     row limit capped at `LEDGER_READ_MAX_ROWS`, newest first;
 *   - TIMED: inside its own transaction, with `SET LOCAL statement_timeout`
 *     issued FIRST on that transaction, so the limit applies to this query and
 *     nothing else on the connection (a session-level SET would leak to the
 *     next borrower of the pooled connection);
 *   - FAIL-OPEN BY CONTRACT, like the write: a timeout answers `timed_out: true`
 *     and no rows; any other failure answers no rows with its class. The caller
 *     decides what an unknown history means for it (the executor's refusal
 *     memory treats it as "nothing remembered", exactly as it did before, and
 *     logs). Nothing here throws.
 *
 * Postgres names a statement timeout `57014` (query_canceled); Sequelize wraps
 * it, so the code is read off `original` / `parent`, with the message as the
 * fallback the driver has always used.
 */

export const LEDGER_READ_TIMEOUT_MS = 5000;
export const LEDGER_READ_DEFAULT_ROWS = 500;
export const LEDGER_READ_MAX_ROWS = 5000;

export interface JourneyLedgerQuery {
  entityType: JourneyEntityType;
  entityIds: readonly string[];
  eventType?: string;
  since?: Date;
  limit?: number;
}

export interface JourneyLedgerRow {
  entity_id: string;
  event_type: string;
  created_at: Date;
  payload: Record<string, unknown> | null;
}

export type JourneyLedgerRead =
  | { rows: JourneyLedgerRow[]; timed_out: false }
  | { rows: []; timed_out: boolean; error_class: string };

const STATEMENT_TIMEOUT_CODE = '57014';

function isStatementTimeout(err: unknown): boolean {
  const e = err as { original?: { code?: string }; parent?: { code?: string }; message?: string } | null;
  return e?.original?.code === STATEMENT_TIMEOUT_CODE || e?.parent?.code === STATEMENT_TIMEOUT_CODE || /statement timeout/i.test(e?.message ?? '');
}

export async function readJourneyEvents(q: JourneyLedgerQuery): Promise<JourneyLedgerRead> {
  if (q.entityIds.length === 0) return { rows: [], timed_out: false };
  const limit = Math.min(Math.max(1, Math.floor(q.limit ?? LEDGER_READ_DEFAULT_ROWS)), LEDGER_READ_MAX_ROWS);
  const where: WhereOptions = { entity_type: q.entityType, entity_id: { [Op.in]: [...q.entityIds] } };
  if (q.eventType) (where as Record<string, unknown>).event_type = q.eventType;
  if (q.since) (where as Record<string, unknown>).created_at = { [Op.gte]: q.since };
  try {
    const rows = await sequelize.transaction(async (transaction) => {
      await sequelize.query(`SET LOCAL statement_timeout = ${LEDGER_READ_TIMEOUT_MS}`, { transaction });
      return EventLedger.findAll({ where, attributes: ['entity_id', 'event_type', 'created_at', 'payload'], order: [['created_at', 'DESC']], limit, transaction });
    });
    return {
      rows: rows.map((r) => ({ entity_id: String(r.get('entity_id')), event_type: String(r.get('event_type')), created_at: r.get('created_at') as Date, payload: (r.get('payload') as Record<string, unknown> | null) ?? null })),
      timed_out: false,
    };
  } catch (err: unknown) {
    const timed_out = isStatementTimeout(err);
    const error_class = timed_out ? 'TimeoutError' : classifyError(err);
    console.warn(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event: 'growth_journey.ledger.read_failed', entity_type: q.entityType, event_type: q.eventType ?? null, ids: q.entityIds.length, limit, timed_out, error_class }));
    return { rows: [], timed_out, error_class };
  }
}
