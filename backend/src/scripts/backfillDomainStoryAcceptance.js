/**
 * AF10.2 - write the agent-domain stories' acceptance criteria into the field that grades them.
 *
 * Asked for by Ali on 2026-10-20, after all seven interns connected their repositories and
 * every story they were pointed at turned out to be ungradeable. `student_tasks.acceptance`
 * was empty on all 503 domain stories, and the verification contract refuses vacuous truth,
 * so nothing an intern committed could ever reach `verified`.
 *
 * The 443 release-2 stories already carry an authored criterion in their prose; this moves it
 * into `acceptance`. See `lib/domainStoryAcceptance.js` for why that is a migration and not a
 * generation. The 60 release-0 and release-1 research stories carry none and are DELIBERATELY
 * NOT TOUCHED: writing criteria for them is an authoring decision with a human in it, and
 * hiding that inside a migration would be the dishonest move.
 *
 * Idempotent: only rows whose `acceptance` is still empty are written, so a re-run is a no-op
 * and an interrupted run resumes. An existing value is never overwritten.
 *
 * Run: `node backend/src/scripts/backfillDomainStoryAcceptance.js`           (dry run)
 *      `node backend/src/scripts/backfillDomainStoryAcceptance.js --apply`   (writes)
 *
 * Output: counts to stdout, plus every story id it could not parse.
 */
const { Sequelize, QueryTypes } = require('sequelize');
const { extractCriterion } = require('./lib/domainStoryAcceptance');

const APPLY = process.argv.slice(2).includes('--apply');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set.');
  process.exit(1);
}

const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
const q = (t, b) => sql.query(t, { bind: b || [], type: QueryTypes.SELECT });

/** The releases whose criteria exist in prose. r0/r1 are research stories and have none. */
const MIGRATABLE_RELEASE = 'r2';

const IS_EMPTY = `(acceptance IS NULL OR acceptance::text IN ('null','[]','{}','""'))`;
const IS_DOMAIN = `project_id IN (SELECT student_project_id FROM agent_domain_projects)`;

async function main() {
  console.log(APPLY ? '*** APPLYING ***\n' : '*** DRY RUN - nothing is written ***\n');

  const rows = await q(`
    SELECT id::text AS id, story_id,
           coalesce(narrative,'') AS narrative, coalesce(build,'') AS build
      FROM student_tasks
     WHERE ${IS_DOMAIN} AND release_key = $1 AND ${IS_EMPTY}
     ORDER BY story_id`, [MIGRATABLE_RELEASE]);

  console.log(`${MIGRATABLE_RELEASE} stories with an empty acceptance field: ${rows.length}`);

  const planned = [];
  const unparsed = [];
  for (const r of rows) {
    const text = extractCriterion(`${r.narrative}\n${r.build}`);
    if (text) planned.push({ id: r.id, story_id: r.story_id, text });
    else unparsed.push(r.story_id);
  }

  console.log(`  parsed a criterion:  ${planned.length}`);
  console.log(`  COULD NOT PARSE:     ${unparsed.length}`);
  for (const s of unparsed) console.log(`      ${s}`);

  if (planned.length > 0) {
    const lens = planned.map((p) => p.text.length).sort((a, b) => a - b);
    console.log(`\n  criterion length: min=${lens[0]} median=${lens[Math.floor(lens.length / 2)]} max=${lens[lens.length - 1]}`);
    const sample = planned[0];
    console.log(`  e.g. ${sample.story_id}\n       ${JSON.stringify([sample.text]).slice(0, 300)}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN complete. ${planned.length} row(s) would be written. Re-run with --apply.`);
    return;
  }

  let wrote = 0;
  for (const p of planned) {
    // The emptiness check is repeated in the UPDATE so a concurrent writer cannot be
    // clobbered between the SELECT above and this statement.
    await sql.query(
      `UPDATE student_tasks SET acceptance = $1::jsonb, updated_at = now()
        WHERE id = $2::uuid AND ${IS_EMPTY}`,
      { bind: [JSON.stringify([p.text]), p.id], type: QueryTypes.UPDATE });
    wrote += 1;
    if (wrote % 100 === 0) console.log(`  ${wrote}/${planned.length}`);
  }
  console.log(`\nwrote ${wrote} row(s).`);

  console.log('\n=== read back ===');
  const [after] = await q(`
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE NOT ${IS_EMPTY})::int AS acc
      FROM student_tasks
     WHERE ${IS_DOMAIN} AND release_key = $1`, [MIGRATABLE_RELEASE]);
  console.log(`  ${MIGRATABLE_RELEASE}: ${after.acc} of ${after.n} now carry acceptance criteria`);

  const [research] = await q(`
    SELECT count(*)::int AS n FROM student_tasks
     WHERE ${IS_DOMAIN} AND release_key IN ('r0','r1') AND NOT ${IS_EMPTY}`);
  console.log(`  r0/r1 left alone on purpose, non-empty count: ${research.n} (want 0)`);
}

main()
  .then(async () => { await sql.close(); process.exit(0); })
  .catch(async (e) => {
    console.error('FAILED: ' + e.message);
    try { await sql.close(); } catch (_) { /* pool may already be down */ }
    process.exit(1);
  });
