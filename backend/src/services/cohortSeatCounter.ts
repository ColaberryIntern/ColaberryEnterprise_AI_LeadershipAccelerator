import { QueryTypes, Transaction } from 'sequelize';

/** Lazy, so importing this module (from four payment paths) never opens the DB config at
 *  load time; the same reason batchPlacementService resolves its model lazily. */
async function db() {
  return (await import('../config/database')).sequelize;
}

/**
 * cohortSeatCounter — `cohorts.seats_taken` is SET from the enrollment rows, never added to.
 *
 * WHY. Ali, 2026-11-22: "Fix the counter." Cohort - November 2026 read `seats_taken = 4`
 * while 30 paid members sat in it. Two causes, both structural:
 *   1. The self-serve subscription path (`activateByRef` -> `grantMembership`), which is
 *      how almost everyone pays now, never incremented the counter at all.
 *   2. The paths that did increment (legacy webhook, reconciliation sweep, invoice request,
 *      admin enroll, sponsor seat) only ever added. Nothing subtracted on a withdrawal, a
 *      batch placement that moved a member, or a cleanup script, so the number could only
 *      drift.
 * A recount from the rows fixes both: it is correct however the row got there, and running
 * it twice gives the same answer (idempotent by construction, unlike `+1`).
 *
 * WHAT A SEAT IS: an `active` enrollment in the cohort whose `payment_status` is `paid` or
 * `pending_invoice`. `pending_invoice` is included because `createInvoiceEnrollment` has
 * always reserved the seat at request time, and an invoiced company has committed to it.
 * A comp (free-access) grant sitting in a class cohort is `paid` and takes a seat: the
 * person is in the room. Unpaid Explorers never do ("only paid people sit in a cohort").
 *
 * SCOPE: every cohort that sells seats (accelerator, sponsor, business, ...) EXCEPT the
 * Explorer bucket and the internship cohort, which have no seat limit (max 100000 / 9999)
 * and whose counters mean nothing; rewriting them would only create noise. COMPLETED
 * cohorts are skipped too: a finished class's counter is history, and its rows are often
 * withdrawn afterwards (April 2026 reads 13 with every row withdrawn), so a recount
 * triggered by a member paying their way out of an old class would erase that history.
 *
 * FAILURE: `recountCohortSeats` never throws. It is called right after a payment has
 * been recorded, and a stale counter is an admin-display defect while a thrown error there
 * would fail a payment that cleared. A failure is logged with an error_class and the next
 * recount (any payment into that cohort, or the one-off script) corrects it. Inside a
 * caller's transaction it DOES rethrow, because the caller then owns the rollback.
 */

export const SEAT_STATUSES = ['paid', 'pending_invoice'] as const;
/** Cohort types with no seat limit, whose counter is left alone. */
export const UNLIMITED_COHORT_TYPES = ['explorer', 'ai_internship'] as const;

const RECOUNT_SQL = `
  UPDATE cohorts c
  SET seats_taken = (
    SELECT count(*)::int FROM enrollments e
    WHERE e.cohort_id = c.id AND e.status = 'active'
      AND e.payment_status IN ('paid', 'pending_invoice'))
  WHERE COALESCE(c.cohort_type, 'accelerator') NOT IN (:unlimited)
    AND c.status IS DISTINCT FROM 'completed' AND c.id IN (:ids)
  RETURNING c.id, c.seats_taken`;

const RECOUNT_ALL_SQL = `
  UPDATE cohorts c
  SET seats_taken = (
    SELECT count(*)::int FROM enrollments e
    WHERE e.cohort_id = c.id AND e.status = 'active'
      AND e.payment_status IN ('paid', 'pending_invoice'))
  WHERE COALESCE(c.cohort_type, 'accelerator') NOT IN (:unlimited)
    AND c.status IS DISTINCT FROM 'completed'
  RETURNING c.id, c.name, c.seats_taken`;

export interface SeatRecount { id: string; name?: string; seats_taken: number }

function logFailure(err: unknown, ids: string[]): void {
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'cohort_seat_recount_failed', outcome: 'failure',
    error_class: e?.name || 'SeatRecountError', context: { cohort_ids: ids, detail: e?.message },
  }));
}

/**
 * Recount the seat counter for these cohorts. Null/duplicate ids are dropped; an empty
 * list is a no-op. Returns the new values (empty on failure outside a transaction).
 */
export async function recountCohortSeats(
  cohortIds: Array<string | null | undefined>,
  options: { transaction?: Transaction } = {},
): Promise<SeatRecount[]> {
  const ids = Array.from(new Set(cohortIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (!ids.length) return [];
  try {
    const [rows] = (await (await db()).query(RECOUNT_SQL, {
      replacements: { ids, unlimited: [...UNLIMITED_COHORT_TYPES] }, type: QueryTypes.UPDATE, transaction: options.transaction,
    })) as unknown as [SeatRecount[], number];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logFailure(err, ids);
    if (options.transaction) throw err;
    return [];
  }
}

/** Recount every class cohort. Used by the one-off repair script; throws on failure. */
export async function recountAllCohortSeats(): Promise<SeatRecount[]> {
  const [rows] = (await (await db()).query(RECOUNT_ALL_SQL, {
    replacements: { unlimited: [...UNLIMITED_COHORT_TYPES] }, type: QueryTypes.UPDATE,
  })) as unknown as [SeatRecount[], number];
  return Array.isArray(rows) ? rows : [];
}
