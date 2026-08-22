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
 * The invariant that matters most: a schedule's first charge is the member's
 * EXISTING current_period_end, never sooner. Nobody is back-charged for a period
 * that already lapsed, and nobody's date moves. If any computed start date is in
 * the past, the run refuses rather than inventing a catch-up charge.
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

const SELECT = `
  SELECT s.id, s.enrollment_id, s.plan, s.status, s.amount_cents,
         s.current_period_end, s.paysimple_payment_id, s.paysimple_schedule_id,
         e.email, e.full_name
    FROM subscriptions s
    JOIN enrollments e ON e.id = s.enrollment_id
   WHERE s.status = 'active'
   ORDER BY s.current_period_end`;

const money = (c) => `$${(c / 100).toFixed(2)}`;

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

    const firstChargeOn = new Date(r.current_period_end);
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
      firstChargeOn,
      paysimplePaymentId: r.paysimple_payment_id,
      accountId: account.accountId,
      cadence: cadenceFor(r.plan, firstChargeOn.getUTCDate()),
    });
  }

  console.log('WOULD SCHEDULE');
  console.log('member                 plan     amount    first charge   cadence');
  console.log('---------------------- -------- --------- -------------- --------------------------');
  planned.forEach((p) => {
    const cad = p.cadence.ExecutionFrequencyType
      + (p.cadence.ExecutionFrequencyParameter ? ` (day ${p.cadence.ExecutionFrequencyParameter})` : '');
    console.log(
      `${String(p.fullName).slice(0, 22).padEnd(22)} ${p.plan.padEnd(8)} ${money(p.amountCents).padEnd(9)} `
      + `${p.firstChargeOn.toISOString().slice(0, 10)}     ${cad}`,
    );
  });

  console.log('\nHELD BACK');
  skipped.forEach((s) => console.log(`  ${String(s.name).slice(0, 22).padEnd(22)} ${s.why.code.padEnd(18)} ${s.why.detail}`));

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
