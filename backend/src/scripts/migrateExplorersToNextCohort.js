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
 * SAFE BY DEFAULT: dry-run unless --apply is passed. Only touches rows with
 * enrollment_type = 'explorer' in the FROM cohort. Explorers do not consume seats
 * (seats_taken is only incremented on paid/standard enrollment), so seat counts
 * are intentionally left untouched. Re-running after an apply is a no-op.
 *
 * Usage (inside the prod backend container, which has DATABASE_URL + the pg dep):
 *   docker cp backend/src/scripts/migrateExplorersToNextCohort.js accelerator-backend:/tmp/
 *   docker exec accelerator-backend node /tmp/migrateExplorersToNextCohort.js            # dry-run
 *   docker exec accelerator-backend node /tmp/migrateExplorersToNextCohort.js --apply    # execute
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
      "SELECT count(*)::int AS n FROM enrollments WHERE cohort_id = $1 AND enrollment_type = 'explorer'",
      [from.id]
    );
    const n = cnt[0].n;

    console.log(`FROM: ${from.name} (${from.id}) [${from.status}]`);
    console.log(`TO:   ${to.name} (${to.id}) [${to.status}] starts ${to.start_date}`);
    console.log(`Explorer enrollments in FROM: ${n}`);

    if (!APPLY) {
      const { rows: sample } = await client.query(
        "SELECT full_name, email, created_at::date AS created FROM enrollments " +
          "WHERE cohort_id = $1 AND enrollment_type = 'explorer' ORDER BY created_at DESC LIMIT 10",
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
      "UPDATE enrollments SET cohort_id = $1 WHERE cohort_id = $2 AND enrollment_type = 'explorer'",
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
