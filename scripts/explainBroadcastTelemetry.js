/**
 * explainBroadcastTelemetry.js - record the query plan for the active-selection query.
 *
 * WHY THIS EXISTS AS A SCRIPT RATHER THAN A TEST. There is no local Postgres in this
 * repository, so the plan for "who is watching now" cannot be asserted in jest. Ali's decision
 * on P3-06 was a deploy-time check instead: run it against the real database, read the plan,
 * and keep the output with the ticket.
 *
 * `broadcastTelemetryService` has referred to this file since it was written. It did not
 * exist until L4.6.
 *
 * WHAT IT CAN AND CANNOT TELL YOU, stated plainly because the distinction matters:
 *
 *   - It CAN tell you the query is plannable, that `idx_bvs_active` exists, and what the
 *     planner chooses right now.
 *   - It CANNOT fail you for a sequential scan on a small table, because that choice is
 *     CORRECT on a small table. Postgres reads a few pages rather than an index, and forcing
 *     an index there would be slower. A Seq Scan with 40 rows in the table proves nothing
 *     about 40,000, so this reports it rather than pretending to a verdict it has not earned.
 *
 * Read-only: EXPLAIN without ANALYZE plans the statement and does not execute it.
 *
 * Usage, on the production backend:
 *   docker exec accelerator-backend node /tmp/explainBroadcastTelemetry.js
 */
const { Sequelize, QueryTypes } = require('/app/node_modules/sequelize');

const EXPECTED_INDEX = 'idx_bvs_active';

/**
 * The same shape as readLiveAudience's query. Kept in step by the text assertions in
 * broadcastTelemetryQuery.test.ts; if that suite and this script ever disagree, the test is
 * the authority and this is stale.
 */
const ACTIVE_SELECTION = `
  SELECT p.intent, p.access_mode, COUNT(DISTINCT s.enrollment_id)::text AS people
    FROM broadcast_viewer_sessions s
    JOIN broadcast_viewer_people p
      ON p.occurrence_id = s.occurrence_id AND p.enrollment_id = s.enrollment_id
   WHERE s.occurrence_id = $1
     AND s.last_beat_at >= $2
     AND (
       s.state = 'playing'
       OR (s.state = 'buffering' AND s.last_playing_at IS NOT NULL AND s.last_playing_at >= $3)
     )
     AND (p.is_staff = FALSE AND p.is_test = FALSE)
   GROUP BY p.intent, p.access_mode`;

async function main() {
  const sequelize = new Sequelize(
    process.env.DB_NAME || process.env.POSTGRES_DB,
    process.env.DB_USER || process.env.POSTGRES_USER,
    process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
    {
      host: process.env.DB_HOST || 'accelerator-db',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      dialect: 'postgres',
      logging: false,
    },
  );
  const q = (sql, opts) => sequelize.query(sql, Object.assign({ type: QueryTypes.SELECT }, opts || {}));

  console.log('1. DOES THE INDEX EXIST?');
  const idx = await q(
    `SELECT indexname::text AS name, indexdef::text AS def
       FROM pg_indexes
      WHERE tablename = 'broadcast_viewer_sessions'
      ORDER BY indexname`,
  );
  if (!idx.length) {
    console.log('   NO INDEXES on broadcast_viewer_sessions - has ensureBroadcastTelemetrySchema run?');
    await sequelize.close();
    process.exit(1);
  }
  idx.forEach((r) => console.log('   ' + r.name));
  const hasExpected = idx.some((r) => r.name === EXPECTED_INDEX);
  console.log('   ' + EXPECTED_INDEX + ': ' + (hasExpected ? 'PRESENT' : 'MISSING'));
  if (hasExpected) {
    console.log('   def: ' + idx.find((r) => r.name === EXPECTED_INDEX).def);
  }

  console.log('\n2. TABLE SIZE (the plan below is only meaningful against this)');
  const [sizes] = await q(
    `SELECT (SELECT COUNT(*) FROM broadcast_viewer_sessions)::text AS sessions,
            (SELECT COUNT(*) FROM broadcast_viewer_people)::text   AS people`,
  );
  console.log('   broadcast_viewer_sessions: ' + sizes.sessions + ' rows');
  console.log('   broadcast_viewer_people:   ' + sizes.people + ' rows');

  console.log('\n3. PLAN FOR THE ACTIVE-SELECTION QUERY');
  const now = new Date();
  const plan = await q('EXPLAIN ' + ACTIVE_SELECTION, {
    bind: ['00000000-0000-4000-8000-000000000000', new Date(now.getTime() - 45000), new Date(now.getTime() - 20000)],
  });
  const lines = plan.map((r) => r['QUERY PLAN']);
  lines.forEach((l) => console.log('   ' + l));

  const planText = lines.join('\n');
  const usesIndex = planText.includes(EXPECTED_INDEX);
  const seqScan = /Seq Scan on broadcast_viewer_sessions/.test(planText);

  console.log('\n4. READING');
  const small = parseInt(sizes.sessions, 10) < 1000;
  if (usesIndex) {
    console.log('   The planner chose ' + EXPECTED_INDEX + '. This is the intended plan.');
  } else if (seqScan && small) {
    console.log('   Sequential scan, and the table has ' + sizes.sessions + ' rows.');
    console.log('   THIS IS NOT A FAILURE. On a table this small a scan is genuinely cheaper than');
    console.log('   an index read, and Postgres is right to pick it. What this run establishes is');
    console.log('   that the index EXISTS and the query PLANS. Re-run it after a real broadcast');
    console.log('   with a populated table to see the plan that will actually matter.');
  } else {
    console.log('   NEITHER the expected index NOR an explainable small-table scan.');
    console.log('   Worth a look: the query may have drifted away from what the index serves.');
  }

  await sequelize.close();
}
main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
