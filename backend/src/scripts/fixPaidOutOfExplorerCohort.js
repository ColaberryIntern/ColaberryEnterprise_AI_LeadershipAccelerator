#!/usr/bin/env node
/**
 * Move real PAYERS out of the Explorer bucket into a class cohort, and stop canceled comp
 * grants reading as paid.
 *
 * Ali, 2026-11-22: "Only paid people go into a cohort." The reverse of
 * fixUnpaidOutOfClassCohorts.js: Explorer — Prospects held 22 active rows with
 * payment_status='paid'. Measured that day, only 2 had paid money ($250 each, July 2026);
 * 18 are active free-access (comp) grants, 7 of them colaberry.com staff, and 2 are comp
 * grants that were canceled but still say 'paid'. Ali chose: move the 2 payers into
 * Cohort - November 2026, leave every comp grant where it is, and mark the 2 canceled comps
 * not-paid.
 *
 * Selection is by rule, not by hardcoded id, so a re-run picks up the same shape again:
 *   PAYER          active, paid, in the explorer cohort, amount_paid > 0, and no active comp.
 *   CANCELED COMP  active, paid, in the explorer cohort, amount_paid 0 / null, no PaySimple
 *                  payment id, at least one comp subscription, and NO active subscription
 *                  of any plan.
 * Everyone else (active comp grants) is reported and left alone.
 *
 * What a canceled comp gets: payment_status 'paid' -> 'pending', plus a note. tier, portal
 * access and the cohort are NOT touched, matching revokeFreeAccess (subscriptionService),
 * which deliberately never locks anyone out: that is a separate, explicit admin action.
 *
 * Seats: each moved payer takes a November seat and frees an Explorer one (floored at 0),
 * matching markEnrollmentPaid's convention that a paid row holds a seat where it sits.
 *
 * One transaction. Idempotent: a re-run matches nothing. Dry run by default, with a
 * rollback snapshot of every row's prior state.
 *
 * Run (copy to /app so `pg` resolves):
 *   docker cp fixPaidOutOfExplorerCohort.js accelerator-backend:/app/
 *   docker exec accelerator-backend node /app/fixPaidOutOfExplorerCohort.js            # dry run
 *   docker exec accelerator-backend node /app/fixPaidOutOfExplorerCohort.js --apply    # execute
 *
 * Options: --to "<cohort name>" (default "Cohort - November 2026"), --apply
 */

const { Client } = require('pg');

function argVal(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const TO_NAME = argVal('--to', 'Cohort - November 2026');
const APPLY = process.argv.includes('--apply');
const TODAY = new Date().toISOString().slice(0, 10);

const ROWS_SQL = `
  SELECT e.id, e.cohort_id, e.payment_status, e.amount_paid, e.paysimple_payment_id, e.notes,
         EXISTS (SELECT 1 FROM subscriptions s WHERE s.enrollment_id = e.id
                 AND s.plan = 'comp' AND s.status = 'active') AS active_comp,
         EXISTS (SELECT 1 FROM subscriptions s WHERE s.enrollment_id = e.id AND s.plan = 'comp') AS any_comp,
         EXISTS (SELECT 1 FROM subscriptions s WHERE s.enrollment_id = e.id AND s.status = 'active') AS any_active_sub
  FROM enrollments e
  WHERE e.cohort_id = $1 AND e.status = 'active' AND e.payment_status = 'paid'
  ORDER BY e.created_at`;

function classify(r) {
  const amount = Number(r.amount_paid || 0);
  if (amount > 0 && !r.active_comp) return 'payer';
  if (amount === 0 && !r.paysimple_payment_id && r.any_comp && !r.any_active_sub) return 'canceled_comp';
  return r.active_comp ? 'active_comp_left' : 'unclassified_left';
}

function log(event, context) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'scripts', event, context }));
}

const appendNote = `CASE WHEN notes IS NULL OR notes = '' THEN $2 ELSE notes || ' | ' || $2 END`;

async function main() {
  if (!process.env.DATABASE_URL) { console.error('FATAL: DATABASE_URL not set.'); process.exit(1); }
  const db = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 30000 });
  await db.connect();
  try {
    const explorer = (await db.query(`SELECT id, name FROM cohorts WHERE cohort_type = 'explorer'`)).rows;
    if (explorer.length !== 1) throw new Error(`Expected exactly one explorer cohort, found ${explorer.length}`);
    const to = (await db.query(`SELECT id, name, cohort_type, status FROM cohorts WHERE name = $1`, [TO_NAME])).rows;
    if (to.length !== 1) throw new Error(`Expected exactly one cohort named "${TO_NAME}", found ${to.length}`);
    if (to[0].cohort_type !== 'accelerator' || to[0].status !== 'open') {
      throw new Error(`"${TO_NAME}" is ${to[0].cohort_type}/${to[0].status}, not an open class cohort`);
    }

    const rows = (await db.query(ROWS_SQL, [explorer[0].id])).rows.map((r) => ({ ...r, kind: classify(r) }));
    const payers = rows.filter((r) => r.kind === 'payer');
    const canceled = rows.filter((r) => r.kind === 'canceled_comp');
    const counts = rows.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {});
    log('plan', { apply: APPLY, from: explorer[0].name, to: to[0].name, paid_active_in_explorer: rows.length, counts });
    log('rollback_snapshot', [...payers, ...canceled].map((r) => ({
      id: r.id, kind: r.kind, cohort_id: r.cohort_id, payment_status: r.payment_status, notes: r.notes })));
    if (!APPLY) { log('dry_run_complete', { hint: 'pass --apply to execute' }); return; }

    await db.query('BEGIN');
    let moved = 0;
    for (const r of payers) {
      const note = `Moved ${TODAY} from ${explorer[0].name} to ${to[0].name}: paid member (only paid members sit in a class cohort)`;
      const u = await db.query(
        `UPDATE enrollments SET cohort_id = $3, notes = ${appendNote}
         WHERE id = $1 AND payment_status = 'paid' AND cohort_id = $4`,
        [r.id, note, to[0].id, explorer[0].id]);
      moved += u.rowCount;
    }
    if (moved > 0) {
      await db.query(`UPDATE cohorts SET seats_taken = seats_taken + $2 WHERE id = $1`, [to[0].id, moved]);
      await db.query(`UPDATE cohorts SET seats_taken = GREATEST(seats_taken - $2, 0) WHERE id = $1`, [explorer[0].id, moved]);
    }
    let unpaid = 0;
    for (const r of canceled) {
      const note = `Marked not-paid ${TODAY}: comp (complimentary access) grant was canceled and no payment exists; access unchanged`;
      const u = await db.query(
        `UPDATE enrollments SET payment_status = 'pending', notes = ${appendNote}
         WHERE id = $1 AND payment_status = 'paid' AND COALESCE(amount_paid, 0) = 0`,
        [r.id, note]);
      unpaid += u.rowCount;
    }
    await db.query('COMMIT');
    const after = (await db.query(ROWS_SQL, [explorer[0].id])).rows.map(classify);
    log('applied', {
      payers_moved: moved, canceled_comps_marked_unpaid: unpaid,
      paid_left_in_explorer: after.length, payers_left: after.filter((k) => k === 'payer').length,
    });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(JSON.stringify({ event: 'failed', level: 'error', error_class: err.name || 'MigrationError', detail: err.message }));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
