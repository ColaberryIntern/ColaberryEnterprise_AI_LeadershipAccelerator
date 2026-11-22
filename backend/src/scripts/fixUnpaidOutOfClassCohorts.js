#!/usr/bin/env node
/**
 * Move every UNPAID enrollment out of a class cohort and back into the Explorer bucket.
 *
 * Ali, 2026-11-22: "Only paid people go into a cohort." Cohort - November 2026 showed 85
 * active enrollments, but only 28 had paid. The other 57 got there through the portal's
 * "Reserve my spot" step (Settings -> Enrollment), which wrote `enrollments.cohort_id`
 * before any payment; 17 of them also started a checkout. portalEnrollmentService no longer
 * does that (an unpaid pick is now a `class_seat_reserved` intent signal); this script
 * cleans up the rows it already moved, so Maya / Explorer Growth can reach them.
 *
 * Per row, in ONE transaction:
 *   1. Backfill a `class_seat_reserved` row in student_navigation_events so the reservation
 *      becomes buying intent. Stamped at the enrollment's created_at: the real click time
 *      was never recorded, and the earliest possible time is the conservative one (it can
 *      only under-weight the signal, never inflate it). Skipped if one already exists.
 *   2. cohort_id -> the cohort_type='explorer' cohort.
 *   3. enrollment_type 'standard' -> 'explorer' for the few unpaid rows the RETIRED
 *      create-invoice route labelled 'standard' at checkout start. Explorer Growth only
 *      reads enrollment_type='explorer', so without this Maya never reaches them. No paid
 *      row is ever relabelled (the WHERE clause excludes paid).
 *   4. A dated note on the row saying what moved and why.
 *
 * Never touched: paid rows, rows with an active non-comp subscription, withdrawn rows,
 * staff addresses (--keep-domain, default colaberry.com), seats_taken (a reservation never
 * took a seat). Rows with payment_status 'pending_invoice' DID take a seat, so they are
 * reported and refused rather than moved.
 *
 * Idempotent: a re-run finds nothing to move and inserts nothing.
 * Dry run by default; prints a JSON snapshot of every row's prior state for rollback.
 *
 * Run (prod backend container has DATABASE_URL + pg; copy to /app so `pg` resolves):
 *   docker cp fixUnpaidOutOfClassCohorts.js accelerator-backend:/app/
 *   docker exec accelerator-backend node /app/fixUnpaidOutOfClassCohorts.js            # dry run
 *   docker exec accelerator-backend node /app/fixUnpaidOutOfClassCohorts.js --apply    # execute
 *
 * Options: --cohort "<name>" (default "Cohort - November 2026"), --keep-domain <d>, --apply
 */

const { Client } = require('pg');

function argVal(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const COHORT_NAME = argVal('--cohort', 'Cohort - November 2026');
const KEEP_DOMAIN = argVal('--keep-domain', 'colaberry.com').toLowerCase();
const APPLY = process.argv.includes('--apply');
const TODAY = new Date().toISOString().slice(0, 10);

const CANDIDATES_SQL = `
  SELECT e.id, e.cohort_id, e.enrollment_type, e.payment_status, e.created_at, e.notes,
         split_part(lower(e.email), '@', 2) AS domain,
         EXISTS (SELECT 1 FROM subscriptions s WHERE s.enrollment_id = e.id
                 AND s.status = 'active' AND s.plan IS DISTINCT FROM 'comp') AS has_active_sub,
         EXISTS (SELECT 1 FROM subscriptions s WHERE s.enrollment_id = e.id
                 AND s.paysimple_payment_id IS NULL AND s.plan IS DISTINCT FROM 'comp') AS started_checkout
  FROM enrollments e
  WHERE e.cohort_id = $1 AND e.status = 'active' AND e.payment_status <> 'paid'
  ORDER BY e.created_at`;

function log(event, context) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'scripts', event, context }));
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error('FATAL: DATABASE_URL not set.'); process.exit(1); }
  const db = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 30000 });
  await db.connect();
  try {
    const from = (await db.query(
      `SELECT id, name, cohort_type FROM cohorts WHERE name = $1`, [COHORT_NAME])).rows;
    if (from.length !== 1) throw new Error(`Expected exactly one cohort named "${COHORT_NAME}", found ${from.length}`);
    if (from[0].cohort_type !== 'accelerator') throw new Error(`"${COHORT_NAME}" is ${from[0].cohort_type}, not a class cohort`);
    const to = (await db.query(
      `SELECT id, name FROM cohorts WHERE cohort_type = 'explorer' ORDER BY created_at ASC`)).rows;
    if (to.length !== 1) throw new Error(`Expected exactly one explorer cohort, found ${to.length}`);

    const rows = (await db.query(CANDIDATES_SQL, [from[0].id])).rows;
    const skip = (r) => (r.domain === KEEP_DOMAIN ? 'staff' : r.has_active_sub ? 'active_subscription'
      : r.payment_status === 'pending_invoice' ? 'pending_invoice_holds_seat' : null);
    const moving = rows.filter((r) => !skip(r));
    const skipped = rows.filter((r) => skip(r)).map((r) => ({ id: r.id, reason: skip(r) }));

    log('plan', {
      apply: APPLY, from: from[0].name, to: to[0].name, unpaid_active: rows.length, moving: moving.length,
      started_checkout: moving.filter((r) => r.started_checkout).length,
      relabel_standard_to_explorer: moving.filter((r) => r.enrollment_type !== 'explorer').length, skipped,
    });
    // Rollback snapshot: prior state of every row this run would change.
    log('rollback_snapshot', moving.map((r) => ({ id: r.id, cohort_id: r.cohort_id, enrollment_type: r.enrollment_type, notes: r.notes })));
    if (!APPLY) { log('dry_run_complete', { hint: 'pass --apply to execute' }); return; }

    await db.query('BEGIN');
    let events = 0;
    for (const r of moving) {
      const ins = await db.query(
        `INSERT INTO student_navigation_events (id, enrollment_id, event_type, page, metadata, created_at)
         SELECT gen_random_uuid(), $1, 'class_seat_reserved', 'settings/enrollment', $2::jsonb, $3
         WHERE NOT EXISTS (SELECT 1 FROM student_navigation_events
                           WHERE enrollment_id = $1 AND event_type = 'class_seat_reserved')`,
        [r.id, JSON.stringify({ cohort_id: from[0].id, cohort_name: from[0].name, backfill: true, source: 'fixUnpaidOutOfClassCohorts' }), r.created_at]);
      events += ins.rowCount;
      const note = `Moved ${TODAY} from ${from[0].name} to ${to[0].name}: unpaid (only paid members sit in a class cohort); reservation kept as buying intent`;
      await db.query(
        `UPDATE enrollments SET cohort_id = $2, enrollment_type = 'explorer',
                notes = CASE WHEN notes IS NULL OR notes = '' THEN $3 ELSE notes || ' | ' || $3 END
         WHERE id = $1 AND payment_status <> 'paid' AND cohort_id = $4`,
        [r.id, to[0].id, note, from[0].id]);
    }
    await db.query('COMMIT');
    const left = (await db.query(CANDIDATES_SQL, [from[0].id])).rows.length;
    log('applied', { moved: moving.length, intent_events_inserted: events, unpaid_left_in_cohort: left, skipped: skipped.length });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(JSON.stringify({ event: 'failed', level: 'error', error_class: err.name || 'MigrationError', detail: err.message }));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
