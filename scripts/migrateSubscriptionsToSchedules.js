#!/usr/bin/env node
/* eslint-disable */
/**
 * migrateSubscriptionsToSchedules.js
 *
 * Puts existing paying members onto standing PaySimple schedules.
 *
 * DRY RUN BY DEFAULT. A dry run makes ZERO writes and ZERO gateway mutations: it
 * reads subscriptions, resolves each member's real payment account with GET-only
 * calls, computes the schedule it WOULD create, and prints the lot for a human to
 * read. With ~25 rows the whole plan fits on a screen, which is the point.
 *
 * The invariant that matters most: the first scheduled charge is never earlier
 * than what the member was told. That is NOT simply current_period_end. The
 * consent notice promised the August cohort one more manual payment, so for them
 * automatic billing starts the cycle AFTER their next renewal; see
 * firstScheduledCharge. Using current_period_end for everyone would have billed 15
 * members a month early, which is exactly the surprise the notice existed to
 * prevent. Nobody is back-charged either: if any computed start lands in the past
 * the run refuses rather than inventing a catch-up charge.
 *
 * Exclusions come from subscriptionScheduleService, not from this file, so the
 * migration and the rest of the system cannot disagree about who may be billed.
 *
 * Idempotent: a member who already has paysimple_schedule_id is skipped, so a
 * second run cannot give anyone a second schedule and therefore a second charge.
 *
 * Run inside the backend container (it holds the credentials and the compiled
 * service):
 *   docker cp scripts/migrateSubscriptionsToSchedules.js accelerator-backend:/app/
 *   docker exec -w /app accelerator-backend node migrateSubscriptionsToSchedules.js
 *   docker exec -w /app accelerator-backend node migrateSubscriptionsToSchedules.js --apply
 *
 * Flags: --apply (write), --only=<email> (single member, for a first cautious run)
 */

const APPLY = process.argv.includes('--apply');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice('--only='.length).trim().toLowerCase() : null;

const { sequelize } = require('./dist/config/database');
const { exclusionFor, scheduleSubscription, resolveAccountForSubscription } =
  require('./dist/services/subscriptionScheduleService');
const { cadenceFor } = require('./dist/services/paysimpleRecurring');

/**
 * ONE row per member, never one per subscription row.
 *
 * A manual renewal leaves the member holding TWO active rows: the period that just
 * ended and the new one. Liza Ayele renewed on 2026-08-22 and immediately had rows
 * ending 2026-08-23 and 2026-09-22, both 'active'. Selecting rows rather than
 * people would have created a schedule for each and charged her twice a month.
 *
 * This is not a one-off and it grows: every member who renews before the migration
 * runs adds another pair. DISTINCT ON takes the LATEST period per enrollment, which
 * is the live one. The assertion after the query is the real safety net, because a
 * silent duplicate here is money out of somebody's account.
 */
const SELECT = `
  SELECT DISTINCT ON (s.enrollment_id)
         s.id, s.enrollment_id, s.plan, s.status, s.amount_cents,
         s.current_period_end, s.paysimple_payment_id, s.paysimple_schedule_id,
         e.email, e.full_name
    FROM subscriptions s
    JOIN enrollments e ON e.id = s.enrollment_id
   WHERE s.status = 'active'
   ORDER BY s.enrollment_id, s.current_period_end DESC`;

const money = (c) => `$${(c / 100).toFixed(2)}`;

/**
 * The consent notice sent 2026-08-21 told every member renewing on or before
 * 2026-08-31 that their NEXT payment stays manual ("your payment on August 27 you
 * will still make yourself using the link we send") and that automatic billing
 * begins the cycle AFTER it. Members renewing 2026-09-03 or later were told
 * automatic starts at their next renewal.
 *
 * So the first scheduled charge is NOT simply current_period_end. For the August
 * cohort that would bill them a full month earlier than they were told, which is
 * precisely the surprise charge the consent notice existed to prevent. This
 * encodes the promise instead of re-deriving it.
 */
const MANUAL_THROUGH = Date.UTC(2026, 7, 31, 23, 59, 59); // 2026-08-31, end of day UTC

function firstScheduledCharge(periodEnd, plan) {
  if (periodEnd.getTime() > MANUAL_THROUGH) return new Date(periodEnd.getTime());
  const next = new Date(periodEnd.getTime());
  if (plan === 'annual') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
  }
  const day = periodEnd.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

(async () => {
  const startedAt = new Date();
  console.log(`[migrate] mode=${APPLY ? 'APPLY (CREATES REAL SCHEDULES)' : 'DRY RUN (no writes, no gateway mutations)'}`);
  console.log(`[migrate] started ${startedAt.toISOString()}${ONLY ? `  only=${ONLY}` : ''}\n`);

  const [rows] = await sequelize.query(SELECT);
  const planned = [];
  const skipped = [];

  for (const r of rows) {
    if (ONLY && String(r.email).trim().toLowerCase() !== ONLY) continue;

    const why = exclusionFor({
      email: r.email,
      plan: r.plan,
      status: r.status,
      paysimple_schedule_id: r.paysimple_schedule_id,
      paysimple_payment_id: r.paysimple_payment_id,
    });
    if (why) { skipped.push({ name: r.full_name, email: r.email, why }); continue; }

    const periodEnd = new Date(r.current_period_end);
    const firstChargeOn = firstScheduledCharge(periodEnd, r.plan);
    let account;
    try {
      account = await resolveAccountForSubscription(r.paysimple_payment_id);
    } catch (e) {
      skipped.push({ name: r.full_name, email: r.email, why: { code: 'account_unresolved', detail: e.message } });
      continue;
    }

    planned.push({
      subscriptionId: r.id,
      enrollmentId: r.enrollment_id,
      email: r.email,
      fullName: r.full_name,
      plan: r.plan,
      amount: r.amount_cents / 100,
      amountCents: r.amount_cents,
      periodEnd,
      firstChargeOn,
      paysimplePaymentId: r.paysimple_payment_id,
      accountId: account.accountId,
      // Cadence comes from the member's REAL anchor, not the shifted first charge.
      // The August-31 cohort shifts to 30 September, and deriving from that would
      // put them on SpecificDayofMonth 30 forever, quietly moving them off the
      // month-end anchor they have actually been billed on (31 Jul, 31 Aug).
      cadence: cadenceFor(r.plan, periodEnd.getUTCDate()),
    });
  }

  console.log('WOULD SCHEDULE');
  console.log('member                 plan     amount    renews      1st auto charge  cadence');
  console.log('---------------------- -------- --------- ----------  ---------------  -------------------------');
  planned.forEach((p) => {
    const cad = p.cadence.ExecutionFrequencyType
      + (p.cadence.ExecutionFrequencyParameter ? ` (day ${p.cadence.ExecutionFrequencyParameter})` : '');
    console.log(
      `${String(p.fullName).slice(0, 22).padEnd(22)} ${p.plan.padEnd(8)} ${money(p.amountCents).padEnd(9)} `
      + `${p.periodEnd.toISOString().slice(0, 10)}  ${p.firstChargeOn.toISOString().slice(0, 10)}       ${cad}`,
    );
  });

  console.log('\nHELD BACK');
  skipped.forEach((s) => console.log(`  ${String(s.name).slice(0, 22).padEnd(22)} ${s.why.code.padEnd(18)} ${s.why.detail}`));

  // Belt and braces on top of DISTINCT ON: if two planned schedules ever share an
  // enrollment, stop. Double-charging a real member is the worst outcome this
  // script can produce, so it refuses rather than proceeding on a near miss.
  const byEnrollment = new Map();
  planned.forEach((p) => byEnrollment.set(p.enrollmentId, (byEnrollment.get(p.enrollmentId) || 0) + 1));
  const doubled = [...byEnrollment.entries()].filter(([, n]) => n > 1);
  if (doubled.length) {
    console.log(`
REFUSING: ${doubled.length} member(s) would receive more than one schedule.`);
    doubled.forEach(([id, n]) => {
      const who = planned.find((p) => p.enrollmentId === id);
      console.log(`  ${who ? who.fullName : id}: ${n} schedules`);
    });
    process.exit(4);
  }
  console.log(`checked: ${byEnrollment.size} distinct members, one schedule each.`);

  const total = planned.reduce((sum, p) => sum + p.amountCents, 0);
  console.log(`\nplanned=${planned.length}  held=${skipped.length}  first-cycle value=${money(total)}`);

  // Nobody is ever back-charged. If this trips, something upstream is wrong and the
  // run stops rather than creating a schedule that bills a period already past.
  const past = planned.filter((p) => p.firstChargeOn < startedAt);
  if (past.length) {
    console.log(`\nREFUSING: ${past.length} would start in the past: ${past.map((p) => p.fullName).join(', ')}`);
    console.log('A lapsed period is written off, never collected. Fix the dates first.');
    process.exit(3);
  }
  console.log('checked: every first charge is on or after today, so nobody is back-charged.');

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written, no schedule created. Re-run with --apply.');
    return;
  }

  let ok = 0;
  const failed = [];
  for (const p of planned) {
    try {
      const res = await scheduleSubscription(p, { nowMs: Date.now() });
      if (res.scheduled) { ok++; console.log(`  scheduled ${p.fullName} -> schedule ${res.scheduleId}`); }
      else { failed.push({ name: p.fullName, error: res.reason || 'not scheduled' }); }
    } catch (e) {
      // One member's failure must not abort the run and leave the rest unmigrated
      // with no record of where it stopped.
      failed.push({ name: p.fullName, error: e.message });
      console.error(`  FAILED ${p.fullName}: ${e.message}`);
    }
  }
  console.log(`\n[migrate] created=${ok} failed=${failed.length}`);
  if (failed.length) process.exit(1);
})().then(() => process.exit(0)).catch((e) => { console.error('[migrate] FATAL', e); process.exit(1); });
