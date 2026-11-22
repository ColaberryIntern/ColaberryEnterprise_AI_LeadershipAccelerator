#!/usr/bin/env node
/**
 * Reset every seat-limited cohort's `seats_taken` to the true count from its enrollment rows.
 *
 * Ali, 2026-11-22: "Fix the counter." Cohort - November 2026 read 4 seats with 30 paid
 * members. The code fix (services/cohortSeatCounter.ts) makes every payment path recount
 * from the rows; this script corrects the counts that had already drifted.
 *
 * A seat = an `active` enrollment with payment_status 'paid' or 'pending_invoice'. Explorer
 * and AI Internship cohorts (no seat limit) are left alone. The SQL is the same as
 * cohortSeatCounter.ts; keep the two in step.
 *
 * Completed cohorts are skipped (same rule as cohortSeatCounter.ts). The counter matters where seats are still sold ("N seats left"). A
 * finished class's counter is history: measured 2026-11-22, Cohort — April 2026 reads 13
 * while every one of its rows is now 'withdrawn', so a recount would rewrite that history
 * to 0. Finished cohorts are left as they are.
 *
 * Dry run by default: prints every cohort whose counter is wrong (before -> after).
 * --apply writes them in one statement. Idempotent: a re-run reports nothing to change.
 *
 * Run (copy to /app so `pg` resolves):
 *   docker cp fixCohortSeatCounts.js accelerator-backend:/app/
 *   docker exec accelerator-backend node /app/fixCohortSeatCounts.js            # dry run
 *   docker exec accelerator-backend node /app/fixCohortSeatCounts.js --apply    # execute
 */

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const UNLIMITED = ['explorer', 'ai_internship'];

const TRUE_COUNT = `
  SELECT count(*)::int FROM enrollments e
  WHERE e.cohort_id = c.id AND e.status = 'active'
    AND e.payment_status IN ('paid', 'pending_invoice')`;

const DIFF_SQL = `
  SELECT c.id, c.name, c.cohort_type, c.status, c.max_seats, c.seats_taken AS before, (${TRUE_COUNT}) AS after
  FROM cohorts c
  WHERE COALESCE(c.cohort_type, 'accelerator') <> ALL($1::text[]) AND c.status IS DISTINCT FROM 'completed'
    AND c.seats_taken IS DISTINCT FROM (${TRUE_COUNT})
  ORDER BY c.start_date`;

const APPLY_SQL = `
  UPDATE cohorts c SET seats_taken = (${TRUE_COUNT})
  WHERE COALESCE(c.cohort_type, 'accelerator') <> ALL($1::text[]) AND c.status IS DISTINCT FROM 'completed'
    AND c.seats_taken IS DISTINCT FROM (${TRUE_COUNT})`;

function log(event, context) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'scripts', event, context }));
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error('FATAL: DATABASE_URL not set.'); process.exit(1); }
  const db = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 30000 });
  await db.connect();
  try {
    const diffs = (await db.query(DIFF_SQL, [UNLIMITED])).rows;
    log('plan', { apply: APPLY, cohorts_wrong: diffs.length, changes: diffs });
    if (!APPLY) { log('dry_run_complete', { hint: 'pass --apply to execute' }); return; }
    const res = await db.query(APPLY_SQL, [UNLIMITED]);
    const left = (await db.query(DIFF_SQL, [UNLIMITED])).rows.length;
    log('applied', { cohorts_updated: res.rowCount, still_wrong: left });
  } catch (err) {
    console.error(JSON.stringify({ event: 'failed', level: 'error', error_class: err.name || 'SeatRecountError', detail: err.message }));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
