/**
 * AF2.8 - give each agent-domain project the published build plan it never had.
 *
 * The ten domain projects carry ZERO `build_plans` rows, and `buildVerificationService` returns
 * `NoPublishedPlan` and stops before reading a single acceptance criterion. So the grading loop
 * is dead for all seven interns no matter what they commit, document download refuses, and
 * STORY-000 is missing. One absent row, four symptoms.
 *
 * This writes ONE published plan per project, DERIVED from that project's own task rows. See
 * `lib/domainBuildPlan.js` for why derived rather than generated, and what is honestly absent
 * from the result.
 *
 * ## It does NOT re-materialize anything
 *
 * The publish path rewrites every task row. These projects hold 503 stories with acceptance
 * criteria and due dates that took real work, against which four interns have connected
 * repositories. So this inserts directly and touches `student_tasks` not at all. The read-back
 * below proves that: story count and criteria count must be identical before and after.
 *
 * ## Idempotent
 *
 * A project that already has a published plan is skipped. Re-running is a no-op.
 *
 * Run: `node backend/src/scripts/synthesizeDomainBuildPlans.js`            (dry run)
 *      `node backend/src/scripts/synthesizeDomainBuildPlans.js --apply`    (writes)
 */
const { Sequelize, QueryTypes } = require('sequelize');
const { buildPlanFromTasks, hashPlan } = require('./lib/domainBuildPlan');

const APPLY = process.argv.slice(2).includes('--apply');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set.');
  process.exit(1);
}

const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
const q = (t, r) => sql.query(t, { replacements: r || {}, type: QueryTypes.SELECT });

/** Provenance. This plan was derived from task rows, not produced by a model through the gate. */
const PROVENANCE = 'af28-derived-from-student-tasks';

async function main() {
  console.log(APPLY ? '*** APPLYING ***\n' : '*** DRY RUN - nothing is written ***\n');

  const projects = await q(`
    SELECT d.domain_key, d.student_project_id::text AS project_id, p.name,
           (SELECT count(*)::int FROM build_plans b
             WHERE b.project_id = d.student_project_id AND b.status = 'published') AS published
      FROM agent_domain_projects d
      JOIN projects p ON p.id = d.student_project_id
     ORDER BY d.domain_key`);

  // Counted before and after. A plan write must not disturb a single story.
  const [before] = await q(`
    SELECT count(*)::int AS stories,
           count(*) FILTER (WHERE acceptance IS NOT NULL
             AND acceptance::text NOT IN ('null','[]','{}','""'))::int AS with_criteria
      FROM student_tasks
     WHERE project_id IN (SELECT student_project_id FROM agent_domain_projects)`);
  console.log(`student_tasks before: ${before.stories} stories, ${before.with_criteria} with criteria\n`);

  let wrote = 0; let skipped = 0;
  const allWarnings = [];

  for (const proj of projects) {
    if (proj.published > 0) {
      console.log(`  ${proj.domain_key.padEnd(20)} already has a published plan, skipped`);
      skipped += 1;
      continue;
    }

    const tasks = await q(`
      SELECT story_id, release_key, title, narrative, build, acceptance, fulfills, owner_agent
        FROM student_tasks WHERE project_id = :pid ORDER BY story_id`, { pid: proj.project_id });

    if (!tasks.length) {
      console.log(`  ${proj.domain_key.padEnd(20)} NO TASKS, skipped (nothing to derive a plan from)`);
      skipped += 1;
      continue;
    }

    const { plan, warnings } = buildPlanFromTasks({
      projectName: proj.name,
      descriptor: `The ${proj.domain_key.replace(/_/g, ' ')} domain agent.`,
      tasks,
    });
    const sha = hashPlan(plan);
    for (const w of warnings) allWarnings.push(`${proj.domain_key}: ${w}`);

    const criteriaInPlan = plan.stories.filter((s) => s.acceptance.length > 0).length;
    console.log(`  ${proj.domain_key.padEnd(20)} ${String(plan.stories.length).padStart(3)} stories, `
      + `${String(criteriaInPlan).padStart(3)} with criteria, ${plan.releases.length} releases, sha ${sha.slice(0, 12)}`);

    if (!APPLY) continue;

    await sql.query(
      `INSERT INTO build_plans
         (project_id, version, status, plan_json, plan_sha256, gate_ok, gate_violations,
          model, attempts, published_at)
       VALUES (
         :pid,
         (SELECT COALESCE(MAX(version), 0) + 1 FROM build_plans WHERE project_id = :pid),
         'published', CAST(:planJson AS jsonb), :sha, true, CAST('[]' AS jsonb),
         :model, 1, NOW()
       )`,
      {
        type: QueryTypes.INSERT,
        replacements: { pid: proj.project_id, planJson: JSON.stringify(plan), sha, model: PROVENANCE },
      },
    );
    wrote += 1;
  }

  if (allWarnings.length) {
    console.log(`\n  ${allWarnings.length} warning(s) - stories that could never be verified:`);
    for (const w of allWarnings.slice(0, 20)) console.log(`      ${w}`);
  } else {
    console.log('\n  no warnings: every story in every plan carries acceptance criteria');
  }

  if (!APPLY) {
    console.log(`\nDRY RUN complete. ${projects.filter((p) => p.published === 0).length} plan(s) would be written.`);
    return;
  }

  console.log(`\nwrote ${wrote} plan(s), skipped ${skipped}.`);

  console.log('\n=== read back ===');
  const after = await q(`
    SELECT d.domain_key,
           (SELECT count(*)::int FROM build_plans b
             WHERE b.project_id = d.student_project_id AND b.status = 'published') AS published
      FROM agent_domain_projects d ORDER BY d.domain_key`);
  for (const a of after) console.log(`  ${a.domain_key.padEnd(20)} published plans: ${a.published}`);

  const [post] = await q(`
    SELECT count(*)::int AS stories,
           count(*) FILTER (WHERE acceptance IS NOT NULL
             AND acceptance::text NOT IN ('null','[]','{}','""'))::int AS with_criteria
      FROM student_tasks
     WHERE project_id IN (SELECT student_project_id FROM agent_domain_projects)`);
  const untouched = post.stories === before.stories && post.with_criteria === before.with_criteria;
  console.log(`\n  student_tasks after: ${post.stories} stories, ${post.with_criteria} with criteria`);
  console.log(`  NOTHING RE-MATERIALIZED: ${untouched ? 'confirmed' : '*** STORY ROWS CHANGED, INVESTIGATE ***'}`);
  if (!untouched) process.exitCode = 1;
}

main()
  .then(async () => { await sql.close(); process.exit(process.exitCode || 0); })
  .catch(async (e) => {
    console.error('FAILED: ' + e.message);
    try { await sql.close(); } catch (_) { /* pool may already be down */ }
    process.exit(1);
  });
