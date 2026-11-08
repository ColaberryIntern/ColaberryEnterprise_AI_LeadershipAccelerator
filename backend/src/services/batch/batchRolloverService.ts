/**
 * Monthly batch rollover — on the 1st, close the month that ended and open the incoming
 * one, so exactly one batch is ever open.
 *
 * This is step A of `directives/run-monthly-enrollment-batches.md` with nobody having to
 * remember it. Before this, closing was "a one-at-a-time PATCH today" and there was no
 * scheduled transition anywhere in the tree.
 *
 * ── WHY "EXACTLY ONE OPEN" IS THE INVARIANT, NOT A TIDINESS RULE ────────────────────
 * `open` is the only status `GET /api/cohorts` returns, so it drives every public
 * surface; and `getNextCohort()` (`schedulerService.ts`) orders open cohorts by
 * `start_date ASC` with no date filter, so a second open batch makes briefing and
 * campaign copy start advertising the OLDEST one. Closing does not remove access —
 * portal, curriculum and gating all key off `Enrollment.status` and `portal_enabled`,
 * never `Cohort.status` — which is what makes an automatic close safe to run unattended.
 *
 * ── WHY IT RUNS EVERY DAY AND NOT ONLY ON THE 1st ───────────────────────────────────
 * It is idempotent: on any day where the open batch is already the current month's it
 * writes nothing. Running daily means a container restart, a deploy, or a month that
 * started while the process was down cannot leave the rollover missed until someone
 * notices — the directive's "a missed rollover: the previous month stays open and takes
 * this month's signups" repairs itself on the next tick. A once-a-month timer has exactly
 * one chance a month to be up.
 *
 * ── THE FAILURE PATH, STATED BEFORE THE HAPPY ONE ───────────────────────────────────
 * If no batch row exists for the current month, this CLOSES NOTHING and returns a skip.
 * Zero open batches is worse than one stale open batch: it empties the public cohort list
 * and blocks enrollment outright, where a stale batch still admits members. The directive
 * keeps three months of rows ahead precisely so this skip stays theoretical, and the skip
 * is logged at warn so it is visible when it is not.
 *
 * Rows are changed ONE AT A TIME, by id, with the previous value recorded in the report
 * and in the log — the directive's safety constraint, because "a batch row with
 * enrollments attached is a live group of people". There is no bulk update here.
 */
import { Op } from 'sequelize';
import { Cohort } from '../../models';
import { env } from '../../config/env';
import { BATCH_COHORT_TYPE, batchMonthOf } from './batchCohort';
import { batchMonthKey, findBatchForMonth } from './batchPlacementService';

const SERVICE = 'batch-rollover';

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: SERVICE, event,
    outcome: level === 'error' ? 'failure' : 'success', context,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export interface RolloverChange {
  cohortId: string;
  name: string;
  month: string | null;
  /** The value before this run — recorded so a change can be reversed by hand. */
  from: string;
  to: string;
}

export interface RolloverReport {
  /** The month this run resolved, 'YYYY-MM' Central. */
  month: string;
  /** False for a dry run: everything is resolved and reported, nothing is written. */
  executed: boolean;
  opened: RolloverChange | null;
  closed: RolloverChange[];
  /** The batch's own room, CONFIRMED to exist (not necessarily created by this run).
   *  Null on a dry run or when community rooms are switched off. */
  roomSlug: string | null;
  /** Non-null means nothing was changed, and why. */
  skipped: string | null;
}

/**
 * Bring the batch statuses in line with the calendar.
 *
 * Idempotent: a second run on the same day reports `opened: null, closed: []`.
 * `now` and `execute` are injected so the operator script can dry-run it and the tests
 * can run it on an arbitrary date without touching the clock.
 */
export async function rollBatches(
  opts: { now?: Date; execute?: boolean } = {},
): Promise<RolloverReport> {
  const now = opts.now ?? new Date();
  const execute = opts.execute ?? false;
  const month = batchMonthKey(now);
  const report: RolloverReport = {
    month, executed: execute, opened: null, closed: [], roomSlug: null, skipped: null,
  };

  const target = await findBatchForMonth(month);
  if (!target) {
    report.skipped = `no batch row for ${month}; nothing closed, because zero open batches blocks enrollment outright`;
    log('warn', 'no_batch_row_for_current_month', { month });
    return report;
  }

  // Only rows this module can IDENTIFY as a batch of another month are closed. An open
  // accelerator row with no resolvable month (a demo or fixture row) is left alone: it is
  // not a batch, so "exactly one batch open" says nothing about it, and closing a row we
  // cannot name would be a bulk status change wearing a filter.
  const openRows = await Cohort.findAll({
    where: {
      [Op.and]: [
        { [Op.or]: [{ cohort_type: BATCH_COHORT_TYPE }, { cohort_type: null }] },
        { status: 'open' },
      ],
    } as any,
    order: [['start_date', 'ASC'], ['id', 'ASC']],
  });

  for (const row of openRows || []) {
    if (row.id === target.id) continue;
    const rowMonth = batchMonthOf(row as any);
    if (!rowMonth) continue;
    const change: RolloverChange = {
      cohortId: row.id, name: row.name, month: rowMonth, from: row.status, to: 'closed',
    };
    if (execute) await row.update({ status: 'closed' });
    report.closed.push(change);
    log('info', execute ? 'batch_closed' : 'batch_would_close', { ...change, month });
  }

  if (target.status !== 'open') {
    report.opened = {
      cohortId: target.id, name: target.name, month, from: target.status, to: 'open',
    };
    if (execute) await target.update({ status: 'open' });
    log('info', execute ? 'batch_opened' : 'batch_would_open', { ...report.opened });
  }

  report.roomSlug = await ensureBatchRoom(target, execute);
  return report;
}

/**
 * The directive's step A6 as a check rather than a task: `createCohort` mints a batch room
 * automatically, but batch rows are inserted by a script (there is no POST route for
 * cohorts), and a script insert bypasses that. `ensureRoomForCohort` is idempotent, so
 * calling it on the month a batch opens closes the one remaining manual step.
 *
 * Non-fatal and dynamically imported, matching `cohortService.resolveBatchRoom`: a room
 * failure must never stop a status rollover that has already been decided.
 */
async function ensureBatchRoom(target: Cohort, execute: boolean): Promise<string | null> {
  if (!execute || !env.communityRoomsEnabled) return null;
  try {
    const { ensureRoomForCohort, cohortRoomSlug } = await import('../communityRooms/cohortRoomService');
    const room = await ensureRoomForCohort(target as any);
    return room && room.slug === cohortRoomSlug(target.id) ? room.slug : null;
  } catch (err: any) {
    log('error', 'ensure_room_failed', {
      error_class: err?.error_class || err?.name || 'Error', message: err?.message, cohort_id: target.id,
    });
    return null;
  }
}
