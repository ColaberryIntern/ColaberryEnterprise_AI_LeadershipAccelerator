#!/usr/bin/env node
/**
 * migrateExplorersToNextCohort.js
 *
 * One-off, idempotent data migration: move Explorer (Open House) enrollments that
 * were mis-filed into a far-out cohort by the old `getLatestOpenCohort()` bug
 * into the intended soonest-upcoming cohort.
 *
 * Context: before the 2026-07-07 cohort-placement fix, new Explorers were placed
 * under the open cohort with the LATEST start_date. With an open November-2026
 * cohort sitting after the imminent July-2026 (2026-07-23) launch, the live
 * Open-House signups (created 2026-07-05..07) landed in November instead of July.
 * This moves them.
 *
 * SAFE BY DEFAULT: dry-run unless --apply is passed. Only touches UNPAID rows with
 * enrollment_type = 'explorer' in the FROM cohort. Re-running after an apply is a no-op.
 *
 * THE UNPAID TERM IS NEW, C10.17 Phase 2, and without it this script became unsafe.
 *
 * It used to select on `enrollment_type = 'explorer'` alone, resting on the note that
 * "Explorers do not consume seats (seats_taken is only incremented on paid/standard
 * enrollment), so seat counts are intentionally left untouched". That reasoning held only
 * while an Explorer could not have paid. As of Phase 2 the payment paths no longer rewrite
 * `enrollment_type`, so a learner who signed up free and then PAID rests at
 * `enrollment_type = 'explorer'` - and `grantMembership` writes
 * `cohort_id: opts.cohortId ?? enrollment.cohort_id` (subscriptionService.ts:572), so
 * paying without choosing a new class date leaves them in the Explorer/Open-House cohort
 * they started in. They were squarely inside this script's old WHERE clause.
 *
 * An --apply run would have moved a paying student's class to a different cohort's start
 * date and schedule, and - because of the seat note above - moved them without any seat
 * accounting, over-selling the destination and under-reporting the source.
 *
 * Usage (inside the prod backend container, which has DATABASE_URL + the pg dep).
 * Copy to the container's WORKING DIRECTORY, not /tmp: node resolves `require('pg')` from
 * the script's own directory upwards, and from /tmp there is no node_modules to find.
 *   docker cp backend/src/scripts/migrateExplorersToNextCohort.js accelerator-backend:/app/
 *   docker exec accelerator-backend node /app/migrateExplorersToNextCohort.js            # dry-run
 *   docker exec accelerator-backend node /app/migrateExplorersToNextCohort.js --apply    # execute
 *
 * Options:
 *   --from "<cohort name>"   source cohort (default "Cohort - November 2026")
 *   --to   "<cohort name>"   destination cohort (default "Cohort - July 2026")
 *   --apply                  actually perform the update (omit for dry-run)
 */

const { Client } = require('pg');

function argVal(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const APPLY = process.argv.includes('--apply');
const FROM = argVal('--from', 'Cohort - November 2026');
const TO = argVal('--to', 'Cohort - July 2026');

/**
 * "A free Explorer", as ONE definition shared by the count, the dry-run sample and the
 * UPDATE. It was written out three times before, which is how a dry run can honestly
 * report a population the apply step does not actually match. The two paid terms are
 * separate because `payment_status` and `amount_paid` are set by different paths, and the
 * `<= 0` form also covers NULL after COALESCE.
 */
const FREE_EXPLORER_SQL =
  "enrollment_type = 'explorer' "
  + "AND payment_status IS DISTINCT FROM 'paid' "
  + 'AND COALESCE(amount_paid, 0) <= 0';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set — run this inside the backend container');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows: cohorts } = await client.query(
      'SELECT id, name, start_date, status FROM cohorts WHERE name = ANY($1::text[])',
      [[FROM, TO]]
    );
    const from = cohorts.find((c) => c.name === FROM);
    const to = cohorts.find((c) => c.name === TO);
    if (!from) throw new Error(`FROM cohort not found: "${FROM}"`);
    if (!to) throw new Error(`TO cohort not found: "${TO}"`);
    if (from.id === to.id) throw new Error('FROM and TO resolve to the same cohort');

    const { rows: cnt } = await client.query(
      `SELECT count(*)::int AS n FROM enrollments WHERE cohort_id = $1 AND ${FREE_EXPLORER_SQL}`,
      [from.id]
    );
    const n = cnt[0].n;

    console.log(`FROM: ${from.name} (${from.id}) [${from.status}]`);
    console.log(`TO:   ${to.name} (${to.id}) [${to.status}] starts ${to.start_date}`);
    // Wording note: "unpaid", not the other word. The outbound-copy ratchet in
    // `bannedWordOutboundCopy.test.ts` scans string literals under backend/src, and it
    // caught the first version of this line - correctly. TWC 807.172(d) is why that word is
    // not used in copy, and a CLI an operator reads is copy.
    console.log(`UNPAID Explorer enrollments in FROM: ${n}`);

    if (!APPLY) {
      const { rows: sample } = await client.query(
        'SELECT full_name, email, created_at::date AS created FROM enrollments '
          + `WHERE cohort_id = $1 AND ${FREE_EXPLORER_SQL} ORDER BY created_at DESC LIMIT 10`,
        [from.id]
      );
      console.log('\nSample (up to 10):');
      sample.forEach((r) => console.log(`  ${r.created}  ${r.full_name}  <${r.email}>`));
      console.log(`\nDRY RUN — no changes made. Re-run with --apply to move ${n} explorer(s).`);
      return;
    }

    if (n === 0) {
      console.log('Nothing to move (idempotent no-op).');
      return;
    }

    await client.query('BEGIN');
    const res = await client.query(
      `UPDATE enrollments SET cohort_id = $1 WHERE cohort_id = $2 AND ${FREE_EXPLORER_SQL}`,
      [to.id, from.id]
    );
    await client.query('COMMIT');
    console.log(`APPLIED — moved ${res.rowCount} explorer enrollment(s) from "${from.name}" to "${to.name}".`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* no active tx */
    }
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrateExplorersToNextCohort] FATAL:', err.message);
  process.exit(1);
});
