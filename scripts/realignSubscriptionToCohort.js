#!/usr/bin/env node
/* eslint-disable */
/**
 * realignSubscriptionToCohort.js
 *
 * A ONE-OFF billing exception: start one member's current paid month on their
 * class start date instead of the day they paid.
 *
 * Since 2026-10-30 a membership renews on the day it was bought (see
 * backend/src/services/billing/billingPeriod.ts). That is the rule and this script
 * does not change it. It exists for the case Ali approved by hand on 2026-11-02:
 * Unuforeh Iyasere paid on 2026-10-30 for the class starting 2026-11-12, so her
 * month ran 10/30 to 11/30 and she would have paid again eighteen days into class.
 * Her month now runs 11/12 to 12/12. Every other member keeps the signup anchor.
 *
 * DRY RUN BY DEFAULT. A dry run makes ZERO writes: it prints the enrollment, the
 * target cohort, every subscription row and the change it WOULD make.
 *
 * Refuses (exit 1, no writes) when:
 *  - the email matches no enrollment, or more than one (pass --enrollment=<id>)
 *  - the target cohort is missing, ambiguous, a demo/Explorer/business cohort, or
 *    has no start date
 *  - the member has no active paid row, or more than one
 *  - that row is on a PaySimple schedule. A schedule bills on its own dates, so
 *    moving our dates alone would make the record lie about the next charge.
 *
 * Idempotent: a member already on the target cohort with the target dates is
 * reported as "nothing to do", so a second --apply is a no-op. Both writes run in
 * one transaction, so a failure leaves the member exactly as they were.
 *
 * Full-course access is NOT touched unless --defer-access is passed. With it,
 * enrollments.access_starts_at is set to the class start (the pattern
 * cohortCleanupAndNovemberSetup.ts used for Kepha), which hides the full course
 * until that day.
 *
 * Run inside the backend container (it holds the database credentials and the
 * compiled billing math):
 *   docker cp scripts/realignSubscriptionToCohort.js accelerator-backend:/app/
 *   docker exec -w /app accelerator-backend node realignSubscriptionToCohort.js --email=forehkragha@yahoo.com --start=2026-11-12
 *   docker exec -w /app accelerator-backend node realignSubscriptionToCohort.js --email=forehkragha@yahoo.com --start=2026-11-12 --apply
 *
 * Flags: --email=<email> (required), --start=YYYY-MM-DD or --cohort=<cohort id>
 *        (one required), --enrollment=<id>, --defer-access, --apply
 */

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : null;
};
const APPLY = process.argv.includes('--apply');
const DEFER_ACCESS = process.argv.includes('--defer-access');
const EMAIL = (arg('email') || '').toLowerCase();
const START = arg('start');
const COHORT_ID = arg('cohort');
const ENROLLMENT_ID = arg('enrollment');

// Noon UTC is 6-7am Central on the same calendar day, so the renewal date reads as
// the class date for people in Texas. Midnight UTC would read as the day before.
const ANCHOR_HOUR_UTC = 12;

function refuse(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(1);
}

if (!EMAIL) refuse('--email=<email> is required');
if (!START && !COHORT_ID) refuse('pass --start=YYYY-MM-DD or --cohort=<cohort id>');
if (START && !/^\d{4}-\d{2}-\d{2}$/.test(START)) refuse(`--start must be YYYY-MM-DD, got ${START}`);

const { sequelize } = require('./dist/config/database');
const { periodEndMs } = require('./dist/services/billing/billingPeriod');
const { isNonPayingCohortName } = require('./dist/services/subscriptionService');

const q = (sql, replacements, transaction) =>
  sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT, transaction });
const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '-');
const iso = (v) => (v ? new Date(v).toISOString() : '-');

async function resolveCohort() {
  const rows = COHORT_ID
    ? await q('SELECT id, name, start_date, status, cohort_type FROM cohorts WHERE id = :id', { id: COHORT_ID })
    : await q('SELECT id, name, start_date, status, cohort_type FROM cohorts WHERE start_date = :d', { d: START });
  const paid = rows.filter((c) => !isNonPayingCohortName(c.name) && String(c.cohort_type || '').toLowerCase() !== 'business');
  if (paid.length === 0) refuse(`no paid cohort found for ${COHORT_ID ? `id ${COHORT_ID}` : `start ${START}`} (rows seen: ${rows.map((c) => c.name).join(', ') || 'none'})`);
  if (paid.length > 1) refuse(`${paid.length} paid cohorts start ${START}: ${paid.map((c) => `${c.id} ${c.name}`).join('; ')}. Pass --cohort=<id>`);
  const cohort = paid[0];
  if (!cohort.start_date) refuse(`cohort ${cohort.name} has no start_date`);
  return cohort;
}

async function main() {
  console.log(`=== realignSubscriptionToCohort (${APPLY ? 'APPLY' : 'DRY RUN, no writes'}) ===`);

  const enrollments = ENROLLMENT_ID
    ? await q('SELECT id, email, full_name, cohort_id, access_starts_at, enrollment_type FROM enrollments WHERE id = :id AND lower(email) = :email', { id: ENROLLMENT_ID, email: EMAIL })
    : await q('SELECT id, email, full_name, cohort_id, access_starts_at, enrollment_type FROM enrollments WHERE lower(email) = :email', { email: EMAIL });
  if (enrollments.length === 0) refuse(`no enrollment for ${EMAIL}${ENROLLMENT_ID ? ` with id ${ENROLLMENT_ID}` : ''}`);

  // With several enrollments under one email, only one of them carries the paid row.
  let enrollment = enrollments[0];
  if (enrollments.length > 1) {
    const withActive = [];
    for (const e of enrollments) {
      const n = await q("SELECT count(*)::int AS n FROM subscriptions WHERE enrollment_id = :id AND status = 'active' AND plan <> 'comp'", { id: e.id });
      console.log(`  enrollment ${e.id} (${e.enrollment_type}, cohort ${e.cohort_id}): ${n[0].n} active paid row(s)`);
      if (n[0].n > 0) withActive.push(e);
    }
    if (withActive.length !== 1) refuse(`${enrollments.length} enrollments for ${EMAIL} and ${withActive.length} hold an active paid row. Pass --enrollment=<id>`);
    enrollment = withActive[0];
  }

  const cohort = await resolveCohort();
  const currentCohort = enrollment.cohort_id
    ? (await q('SELECT id, name, start_date FROM cohorts WHERE id = :id', { id: enrollment.cohort_id }))[0]
    : null;

  console.log(`Member:     ${enrollment.full_name} <${enrollment.email}>, enrollment ${enrollment.id}`);
  console.log(`Cohort now: ${currentCohort ? `${currentCohort.name} (starts ${day(currentCohort.start_date)})` : 'none'}`);
  console.log(`Target:     ${cohort.name} (starts ${day(cohort.start_date)}), cohort ${cohort.id}`);
  console.log(`Access:     access_starts_at=${enrollment.access_starts_at || 'null'}${DEFER_ACCESS ? ` -> ${day(cohort.start_date)}` : ' (unchanged; pass --defer-access to set it)'}`);

  const subs = await q(
    `SELECT id, plan, status, amount_cents, applied_credit_cents, paysimple_payment_id, paysimple_schedule_id,
            started_at, current_period_end, created_at, cancel_reason
       FROM subscriptions WHERE enrollment_id = :id ORDER BY created_at`,
    { id: enrollment.id },
  );
  console.log(`Subscription rows (${subs.length}):`);
  for (const s of subs) {
    console.log(`  ${s.id} ${s.plan}/${s.status} $${(s.amount_cents / 100).toFixed(2)} credit $${((s.applied_credit_cents || 0) / 100).toFixed(2)}`
      + ` payment ${s.paysimple_payment_id || '-'} schedule ${s.paysimple_schedule_id || '-'}`
      + ` period ${day(s.started_at)} -> ${day(s.current_period_end)} created ${day(s.created_at)}${s.cancel_reason ? ` (${s.cancel_reason})` : ''}`);
  }
  const credits = await q('SELECT amount_cents, status, reason, created_at FROM account_credits WHERE enrollment_id = :id ORDER BY created_at', { id: enrollment.id })
    .catch((err) => { console.log(`  (account credits not readable: ${err.message})`); return []; });
  for (const c of credits) console.log(`  credit $${(c.amount_cents / 100).toFixed(2)} ${c.status} ${c.reason || ''} ${day(c.created_at)}`);

  const active = subs.filter((s) => s.status === 'active' && s.plan !== 'comp');
  if (active.length === 0) refuse('no active paid subscription row to move');
  if (active.length > 1) refuse(`${active.length} active paid rows; clean those up first so the move is unambiguous`);
  const sub = active[0];
  if (sub.paysimple_schedule_id) refuse(`row ${sub.id} is on PaySimple schedule ${sub.paysimple_schedule_id}; edit the schedule in PaySimple, not here`);

  const startYmd = day(cohort.start_date);
  const [y, m, d] = startYmd.split('-').map(Number);
  const anchorMs = Date.UTC(y, m - 1, d, ANCHOR_HOUR_UTC);
  const endMs = periodEndMs(anchorMs, sub.plan === 'annual' ? 'year' : 'month');

  const datesMatch = sub.started_at && new Date(sub.started_at).getTime() === anchorMs
    && sub.current_period_end && new Date(sub.current_period_end).getTime() === endMs;
  const cohortMatches = enrollment.cohort_id === cohort.id;
  const accessMatches = !DEFER_ACCESS || day(enrollment.access_starts_at) === startYmd;

  console.log(`Change:     row ${sub.id} period ${iso(sub.started_at)} -> ${iso(sub.current_period_end)}`);
  console.log(`        to  ${iso(anchorMs)} -> ${iso(endMs)}${datesMatch ? ' (already set)' : ''}`);
  console.log(`            enrollment cohort -> ${cohort.name}${cohortMatches ? ' (already set)' : ''}`);

  if (datesMatch && cohortMatches && accessMatches) {
    console.log('Nothing to do: already aligned.');
    return;
  }
  if (!APPLY) {
    console.log('DRY RUN: no writes made. Re-run with --apply to make the change above.');
    return;
  }

  await sequelize.transaction(async (t) => {
    const now = new Date();
    if (!datesMatch) {
      await sequelize.query(
        'UPDATE subscriptions SET started_at = :s, current_period_end = :e, updated_at = :now WHERE id = :id AND status = \'active\'',
        { replacements: { s: new Date(anchorMs), e: new Date(endMs), now, id: sub.id }, transaction: t },
      );
    }
    if (!cohortMatches || !accessMatches) {
      await sequelize.query(
        `UPDATE enrollments SET cohort_id = :c${DEFER_ACCESS ? ', access_starts_at = :a' : ''} WHERE id = :id`,
        { replacements: { c: cohort.id, a: startYmd, id: enrollment.id }, transaction: t },
      );
    }
  });

  const after = (await q('SELECT started_at, current_period_end FROM subscriptions WHERE id = :id', { id: sub.id }))[0];
  console.log(`APPLIED. Row ${sub.id} now ${iso(after.started_at)} -> ${iso(after.current_period_end)}.`);
}

main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error(`FAILED (${err.name || 'Error'}): ${err.message}`);
    try { await sequelize.close(); } catch (closeErr) { console.error(`close failed: ${closeErr.message}`); }
    process.exit(1);
  });
