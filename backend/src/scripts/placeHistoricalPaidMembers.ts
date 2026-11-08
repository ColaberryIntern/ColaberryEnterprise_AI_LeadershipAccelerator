/**
 * One-time repair: the paid members who were never placed in a batch.
 *
 * WHY A SEPARATE SCRIPT AND NOT PART OF THE FEATURE. C10.13's resolver fires on the
 * unpaid -> paid transition, which for these members already happened - so shipping it
 * fixes every FUTURE payment and none of the existing ones.
 *
 * WHAT IT ACTUALLY FINDS TODAY: NOTHING TO MOVE, and that is the correct answer. Measured
 * on production 2026-11-08, 22 paid and active enrollments sit in the Explorer prospect
 * pool, and their `enrolled_at` months are 2026-07 (8), 2026-08 (6) and 2026-09 (8) -
 * every one of them BEFORE the batch model was decided on 2026-11-05. There is no
 * placeable batch for any of those months: July 2026 is `completed`, and August and
 * September 2026 have no row at all. So this script reports all 22 as
 * `no-batch-for-month` and moves zero.
 *
 * That is the point of running it rather than assuming. These people are not a placement
 * failure under the new rule - they predate the rule. Filing them into the November batch
 * would state that they joined in November, which is false. Whether they should be given a
 * batch at all (retroactive rows for those months, or a deliberate move into the current
 * one) is a product decision, not an implementation detail, so this script will not make
 * it. What it remains is the documented recovery path for the directive's "a payment
 * arriving in a month with no batch row leaves the member where they were" failure mode.
 *
 * It is deliberately NOT a scheduled sweep. A recurring job that re-places paid members by
 * month would move RENEWING members out of the batch they joined, every month, which is the
 * exact hazard the resolver's transition guard exists to prevent. Run once, by hand, read
 * the dry run, then execute.
 *
 * WHICH MONTH IT USES, AND THE HONEST LIMIT. `enrolled_at` - the timestamp every payment
 * writer stamps when the money lands. It is the best available proxy and it is not the
 * payment date itself: a row whose `enrolled_at` was backfilled or set by a late repair
 * carries the repair's month, not the payment's. The real payment dates live in PaySimple
 * behind `paysimple_payment_id`, and fetching them is a different job with a different
 * blast radius. So the dry run PRINTS the date it used for every row, and a row with no
 * `enrolled_at` at all is reported and skipped rather than guessed at.
 *
 * SAFETY. Only moves an enrollment that is `payment_status = 'paid'` AND `status = 'active'`
 * AND currently sits in a cohort that is not a batch and is in the Explorer lane (or none at
 * all). The corporate, sponsor, internship and business lanes are placed by their own rules
 * and are never touched. Seats are left alone: `seats_taken` is a paid-capacity counter the
 * Explorer path never incremented for these rows, so there is nothing to decrement, and
 * incrementing the target would double-count anyone whose payment DID increment some other
 * cohort. Seat counts are a separate, known problem (four increment sites, no decrement
 * site) and this script does not pretend to fix them.
 *
 * Idempotent: a second run finds every row already in its batch and moves nothing.
 *
 * Usage, inside the production container:
 *   node dist/scripts/placeHistoricalPaidMembers.js              (dry run - default)
 *   node dist/scripts/placeHistoricalPaidMembers.js --execute
 */

import { Cohort, Enrollment } from '../models';
import { batchMonthOf } from '../services/batch/batchCohort';
import { batchMonthKey, findBatchForMonth } from '../services/batch/batchPlacementService';

/** Lanes whose members are placed by their own rules, never by month. */
const PLACEABLE_FROM = ['explorer'];

export interface RepairRow {
  email: string;
  enrollmentId: string;
  from: string;
  fromType: string;
  /** The `enrolled_at` this used, as a date key, or null when the row has none. */
  paidOn: string | null;
  month: string | null;
  to: string | null;
  action: 'moved' | 'would-move' | 'already-in-a-batch' | 'no-batch-for-month'
    | 'no-enrolled-at' | 'other-lane';
}

export async function run(execute: boolean): Promise<RepairRow[]> {
  const paid = await Enrollment.findAll({
    where: { payment_status: 'paid', status: 'active' } as any,
    order: [['enrolled_at', 'ASC']],
  });

  const cohortCache = new Map<string, Cohort | null>();
  const loadCohort = async (id: string | null): Promise<Cohort | null> => {
    if (!id) return null;
    if (!cohortCache.has(id)) cohortCache.set(id, await Cohort.findByPk(id));
    return cohortCache.get(id) ?? null;
  };

  const rows: RepairRow[] = [];
  for (const e of paid) {
    const current = await loadCohort((e as any).cohort_id ?? null);
    const fromType = String(current?.cohort_type ?? (current ? 'accelerator' : 'none'));
    const base = {
      email: e.email,
      enrollmentId: e.id,
      from: current?.name ?? '(no cohort)',
      fromType,
    };

    // Already in a batch of some month: leave it. Their batch is when they joined.
    if (current && batchMonthOf(current as any)) {
      rows.push({ ...base, paidOn: null, month: null, to: null, action: 'already-in-a-batch' });
      continue;
    }
    if (current && !PLACEABLE_FROM.includes(fromType)) {
      rows.push({ ...base, paidOn: null, month: null, to: null, action: 'other-lane' });
      continue;
    }

    const enrolledAt = (e as any).enrolled_at ? new Date((e as any).enrolled_at) : null;
    if (!enrolledAt || Number.isNaN(enrolledAt.getTime())) {
      rows.push({ ...base, paidOn: null, month: null, to: null, action: 'no-enrolled-at' });
      continue;
    }
    const month = batchMonthKey(enrolledAt);
    const paidOn = enrolledAt.toISOString().slice(0, 10);
    const target = await findBatchForMonth(month);
    if (!target) {
      rows.push({ ...base, paidOn, month, to: null, action: 'no-batch-for-month' });
      continue;
    }
    if (!execute) {
      rows.push({ ...base, paidOn, month, to: target.name, action: 'would-move' });
      continue;
    }
    await e.update({ cohort_id: target.id });
    rows.push({ ...base, paidOn, month, to: target.name, action: 'moved' });
  }
  return rows;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const rows = await run(execute);

  console.log(`=== Historical paid members (${execute ? 'EXECUTE' : 'DRY RUN'}) ===`);
  const interesting = rows.filter((r) => r.action !== 'already-in-a-batch' && r.action !== 'other-lane');
  for (const r of interesting) {
    console.log(
      `[${r.action}] ${r.email}  from="${r.from}" (${r.fromType})  paid=${r.paidOn ?? '-'}  ` +
      `month=${r.month ?? '-'}  to="${r.to ?? '-'}"`
    );
  }

  const count = (a: RepairRow['action']) => rows.filter((r) => r.action === a).length;
  console.log(
    `\n${rows.length} paid+active enrollment(s): ${count('already-in-a-batch')} already in a batch, ` +
    `${count('other-lane')} in another lane (untouched), ` +
    `${execute ? `${count('moved')} moved` : `${count('would-move')} would move`}, ` +
    `${count('no-batch-for-month')} with no batch row for their month, ` +
    `${count('no-enrolled-at')} with no enrolled_at.`
  );
  if (count('no-batch-for-month') || count('no-enrolled-at')) {
    console.log('The two categories above need a human: this script will not guess a batch.');
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}
