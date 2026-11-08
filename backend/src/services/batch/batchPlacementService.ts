/**
 * Batch placement — the batch a member joins when their payment lands.
 *
 * Ali, 6 November 2026, verbatim: "when a user signs up and pays for a membership, they
 * should automatically be moved into the cohort for that month." This module is that
 * sentence, and it is the only place in the tree that decides it.
 *
 * ── WHY THIS IS A LOOKUP AND NOT A SORT ─────────────────────────────────────────────
 * The batch is the one whose month CONTAINS the payment date. It is deliberately NOT
 * `selectNextOpenCohort()` (`cohortService.ts`), which returns the soonest open cohort
 * whose `start_date` is in the future: from 13 November onward that files a November
 * payment into the December batch, because a batch's `start_date` holds its ORIENTATION
 * date and November's orientation is in December. The directive forbids it by name.
 *
 * It is also not `resolvePaidCohortFor()` (`subscriptionService.ts`), which is the rule
 * that runs today: it reroutes a paying Explorer to "the soonest open cohort that is a
 * real paid cohort", ordered `start_date ASC`. That agrees with this module only while
 * exactly one batch is open. It diverges the moment a rollover is missed (two open
 * batches: it picks the older) or runs early in a month before the rollover (the right
 * batch is still `closed`: it picks a later one). So placement is resolved here first and
 * that resolver is left for the display path it also feeds.
 *
 * ── WHAT IT IS ALLOWED TO MOVE, AND WHEN ────────────────────────────────────────────
 * Placement fires on the UNPAID → PAID transition only. A renewal must never move a
 * member out of the batch they joined: the batch is "when you joined", not "when you last
 * paid", and `activateByRef` runs on every renewal. Every caller therefore reports
 * whether the row was already paid before its write, and this returns null for those.
 *
 * It moves members out of the Explorer lane and between accelerator batches (the missed-
 * rollover repair the directive describes). It never touches the corporate, sponsor or
 * internship lanes, which the directive places by their own `cohort_type` lookups.
 *
 * ── SEATS ───────────────────────────────────────────────────────────────────────────
 * No seat arithmetic here, on purpose. `seats_taken` is a paid-capacity counter that the
 * Explorer path never increments (`enrollmentService`: "Explorers are not paying students
 * and must never consume a paid seat"), so a free Explorer who pays has nothing to
 * decrement anywhere. The three callers that do increment already read the enrollment's
 * own `cohort_id` AFTER their write, so placing the member first makes their existing
 * increment land on the correct batch with no new seat logic at all.
 */
import { Op } from 'sequelize';
import type { Cohort } from '../../models';
import { centralDateKey } from '../centralDate';
import { BATCH_COHORT_TYPE, batchMonthOf } from './batchCohort';

const SERVICE = 'batch-placement';

/**
 * The model layer is loaded LAZILY, and that is load-bearing rather than a style choice.
 *
 * `paymentSyncService` is one of the four writers that calls this module, and it is
 * deliberately model-free: it marks rows paid in raw SQL and never imports
 * `models/index`. A static `import { Cohort } from '../../models'` here put the entire
 * Sequelize model graph into that module's import chain, and its whole test suite stopped
 * being able to load — `Cohort.init` threw "Cannot read properties of undefined (reading
 * 'define')" before a single test ran. A leaf that four unrelated writers import must not
 * decide on their behalf when the model layer is initialised.
 *
 * `import type` above is erased at compile time, so the type is available and nothing is
 * required at import. Every caller here is already async, so the await costs nothing.
 * `batchPlacementWiring.test.ts` asserts this file keeps no static value import of
 * `../../models`, because the symptom appeared two modules away from the cause.
 */
async function cohortModel(): Promise<typeof Cohort> {
  const models = await import('../../models');
  return models.Cohort;
}

/**
 * Cohort types a member may be placed OUT of by month. Everything else — corporate,
 * sponsor, ai_internship, business — is placed by its own lane and is left alone.
 *
 * A frozen ARRAY rather than a `Set`, and that is not a style preference. The T203
 * learner-writer tripwire (`__tests__/learnerWriterTripwire.test.ts`) looks for a SQL write
 * keyword near an `'explorer'` literal using `/\b(SET|INSERT INTO enrollments|VALUES)\b/i`,
 * and that pattern is case-INSENSITIVE, so JavaScript's `new Set([... 'explorer'])` reads to
 * it as `SET ... 'explorer'`. This module writes neither `enrollment_type` nor `tier`, so
 * allow-listing it there would have been a false statement about the file. Do not "tidy"
 * this back into a Set without checking that guard.
 */
const PLACEABLE_FROM: readonly string[] = [BATCH_COHORT_TYPE, 'explorer'];

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: SERVICE, event,
    outcome: level === 'error' ? 'failure' : 'success', context,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * The batch month an instant falls in, as 'YYYY-MM' — read in CENTRAL time, not UTC.
 *
 * This is the whole reason the timezone is named. A payment at 23:30 on 30 November
 * Central is 05:30 on 1 December UTC, so a UTC month would put that member in the
 * December batch when they paid in November. "The month you paid in" is a business month
 * in the company's own timezone, and `centralDate` is where that boundary already lives.
 */
export function batchMonthKey(at: Date | number): string {
  const ms = at instanceof Date ? at.getTime() : at;
  return centralDateKey(ms).slice(0, 7);
}

/** Every batch row that could still take members: accelerator (or an untyped row, which
 *  the column default makes accelerator) and not already finished. */
function batchRowScope() {
  return {
    [Op.and]: [
      { [Op.or]: [{ cohort_type: BATCH_COHORT_TYPE }, { cohort_type: null }] },
      { status: { [Op.ne]: 'completed' } },
    ],
  } as any;
}

/**
 * The batch row for a month key, or null.
 *
 * Status is NOT part of the match. Future batches sit `closed` until their month arrives
 * (the directive's status convention), so a payment early in a month whose rollover has
 * not run yet must still find its batch. `completed` rows are excluded — that group has
 * finished and nobody new joins it.
 *
 * A month with two rows is the directive's "duplicate batch splits a month's members"
 * failure mode. It is reported and resolved deterministically rather than left to
 * whichever row the database returns first: prefer the open one, else the earliest
 * `start_date`, else the lowest id.
 */
export async function findBatchForMonth(monthKey: string): Promise<Cohort | null> {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey ?? ''))) return null;

  const model = await cohortModel();
  const rows = await model.findAll({
    where: batchRowScope(),
    order: [['start_date', 'ASC'], ['id', 'ASC']],
  });
  const matches = (rows || []).filter((r) => batchMonthOf(r as any) === monthKey);
  if (!matches.length) return null;
  if (matches.length > 1) {
    log('warn', 'duplicate_batch_rows_for_month', {
      month: monthKey, names: matches.map((m) => m.name), chosen_rule: 'open, else earliest start_date',
    });
  }
  return matches.find((m) => m.status === 'open') ?? matches[0];
}

export interface PlacementInput {
  /** The cohort the caller would otherwise store — i.e. `opts.cohortId ?? enrollment.cohort_id`,
   *  the row's DESTINATION, not necessarily where it sits now. The lane guard reads this,
   *  so a caller that has already routed someone to a corporate cohort is not overridden. */
  currentCohortId: string | null | undefined;
  /** Whether this enrollment was ALREADY `payment_status='paid'` before the caller's write.
   *  True means this is a renewal or a re-run, and placement does not fire. */
  alreadyPaid: boolean;
  /** When the money arrived. Not when this code ran — a webhook repaired weeks later must
   *  still place the member in the month they actually paid in. */
  paidAt: Date;
}

/**
 * The `cohort_id` a newly paid enrollment belongs in, or **null meaning change nothing**.
 *
 * Null is returned — and nothing is written — when: the row was already paid (not a
 * transition); no batch row exists for the payment month; the destination is already that
 * batch; or the destination is a lane this rule does not govern.
 *
 * NEVER THROWS. A payment that cleared must land even if placement cannot be computed:
 * the member being in the wrong batch is an admin correction, whereas a thrown error here
 * would leave a paying member unpaid in the database. The single try/catch lives here
 * rather than being copied into four call sites.
 */
export async function resolvePaidBatchPlacement(input: PlacementInput): Promise<string | null> {
  try {
    if (input.alreadyPaid) return null;

    const month = batchMonthKey(input.paidAt);
    const target = await findBatchForMonth(month);
    if (!target) {
      log('warn', 'no_batch_for_payment_month', { month, left_cohort_id: input.currentCohortId ?? null });
      return null;
    }
    if (!input.currentCohortId) {
      log('info', 'placed_from_no_cohort', { month, batch: target.name, cohort_id: target.id });
      return target.id;
    }
    if (input.currentCohortId === target.id) return null;

    const current = await (await cohortModel()).findByPk(input.currentCohortId);
    if (!current) {
      // A cohort_id pointing at a row that no longer exists is not a lane we must respect.
      log('info', 'placed_from_missing_cohort', { month, batch: target.name, cohort_id: target.id });
      return target.id;
    }
    const currentType = String(current.cohort_type ?? BATCH_COHORT_TYPE);
    if (!PLACEABLE_FROM.includes(currentType)) {
      log('info', 'left_in_other_lane', { month, lane: currentType, cohort: current.name });
      return null;
    }

    log('info', 'placed', {
      month, from: current.name, from_type: currentType, to: target.name, cohort_id: target.id,
    });
    return target.id;
  } catch (err: any) {
    log('error', 'placement_failed', {
      error_class: err?.error_class || err?.name || 'Error',
      message: err?.message,
      left_cohort_id: input.currentCohortId ?? null,
    });
    return null;
  }
}
