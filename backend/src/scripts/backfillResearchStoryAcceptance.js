/**
 * AF10.2, part two - write acceptance criteria onto the 60 agent-domain research stories.
 *
 * Companion to `backfillDomainStoryAcceptance.js`, which handles the 443 release-2 stories by
 * MIGRATING criteria a human already wrote. These 60 release-0 and release-1 research stories
 * carry no criterion anywhere, so theirs were AUTHORED; see `lib/researchStoryAcceptance.js`
 * for them and for why they are a faithful restatement of each brief's own stated demands
 * rather than a new standard.
 *
 * The two are separate scripts on purpose. A migration and an authoring decision deserve
 * separate review, and collapsing them would hide the judgement call inside a data move.
 *
 * REFUSES TO GUESS. A story whose family is not in the table is reported and skipped, never
 * given a default set of criteria. A domain added later would otherwise silently inherit
 * somebody else's standard.
 *
 * Idempotent: only rows whose `acceptance` is still empty are written, and the emptiness check
 * is repeated inside the UPDATE so a concurrent writer cannot be clobbered.
 *
 * Run: `node backend/src/scripts/backfillResearchStoryAcceptance.js`           (dry run)
 *      `node backend/src/scripts/backfillResearchStoryAcceptance.js --apply`   (writes)
 */
const { Sequelize, QueryTypes } = require('sequelize');
const { acceptanceFor, RESEARCH_FAMILIES } = require('./lib/researchStoryAcceptance');

const APPLY = process.argv.slice(2).includes('--apply');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set.');
  process.exit(1);
}

const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
const q = (t, b) => sql.query(t, { bind: b || [], type: QueryTypes.SELECT });

const IS_EMPTY = `(acceptance IS NULL OR acceptance::text IN ('null','[]','{}','""'))`;
const IS_DOMAIN = `project_id IN (SELECT student_project_id FROM agent_domain_projects)`;

async function main() {
  console.log(APPLY ? '*** APPLYING ***\n' : '*** DRY RUN - nothing is written ***\n');
  console.log(`families in the table: ${RESEARCH_FAMILIES.length}`);

  const rows = await q(`
    SELECT id::text AS id, story_id, release_key
      FROM student_tasks
     WHERE ${IS_DOMAIN} AND release_key IN ('r0','r1') AND ${IS_EMPTY}
     ORDER BY story_id`);
  console.log(`r0/r1 stories with an empty acceptance field: ${rows.length}\n`);

  const planned = [];
  const unknown = [];
  for (const r of rows) {
    const acceptance = acceptanceFor(r.story_id);
    if (acceptance) planned.push({ ...r, acceptance });
    else unknown.push(r.story_id);
  }

  const perFamily = new Map();
  for (const p of planned) {
    const fam = p.story_id.slice(p.story_id.indexOf('.') + 1);
    perFamily.set(fam, (perFamily.get(fam) || 0) + 1);
  }
  for (const fam of RESEARCH_FAMILIES) {
    console.log(`  ${String(perFamily.get(fam) || 0).padStart(2)}x  ${fam}`);
  }

  console.log(`\n  will write:          ${planned.length}`);
  console.log(`  UNKNOWN FAMILY:      ${unknown.length}`);
  for (const s of unknown) console.log(`      ${s}`);

  if (!APPLY) {
    console.log(`\nDRY RUN complete. ${planned.length} row(s) would be written. Re-run with --apply.`);
    return;
  }

  let wrote = 0;
  for (const p of planned) {
    await sql.query(
      `UPDATE student_tasks SET acceptance = $1::jsonb, updated_at = now()
        WHERE id = $2::uuid AND ${IS_EMPTY}`,
      { bind: [JSON.stringify(p.acceptance), p.id], type: QueryTypes.UPDATE });
    wrote += 1;
  }
  console.log(`\nwrote ${wrote} row(s).`);

  console.log('\n=== read back ===');
  const back = await q(`
    SELECT release_key, count(*)::int AS n,
           count(*) FILTER (WHERE NOT ${IS_EMPTY})::int AS acc
      FROM student_tasks
     WHERE ${IS_DOMAIN} AND release_key IN ('r0','r1')
     GROUP BY release_key ORDER BY release_key`);
  for (const b of back) console.log(`  ${b.release_key}: ${b.acc} of ${b.n} carry acceptance criteria`);

  const [all] = await q(`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT ${IS_EMPTY})::int AS acc
      FROM student_tasks WHERE ${IS_DOMAIN}`);
  console.log(`  all domain stories: ${all.acc} of ${all.n} gradeable`);
}

main()
  .then(async () => { await sql.close(); process.exit(0); })
  .catch(async (e) => {
    console.error('FAILED: ' + e.message);
    try { await sql.close(); } catch (_) { /* pool may already be down */ }
    process.exit(1);
  });
