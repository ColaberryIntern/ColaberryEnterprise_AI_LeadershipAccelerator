/**
 * AF12.7 - republish the ten agent-domain plans so the autonomy-rung stories can verify.
 *
 * The plans published on 2026-10-21 by `synthesizeDomainBuildPlans.js` are a snapshot of
 * `student_tasks` as it was BEFORE the autonomy-rung rows existed. `buildPlanFromTasks` is a
 * verbatim pass-through of `student_tasks.story_id`, so re-deriving today emits the rung stories
 * that are currently unverifiable at any effort: `buildVerificationService` grades a commit
 * against the PUBLISHED plan, and a story the plan has never heard of cannot be credited.
 *
 * ## This is a REPUBLISH, which its sibling script is not
 *
 * `synthesizeDomainBuildPlans.js` skips any project that already has a published plan, because
 * it was written for projects that had none. Every one of these projects now has one, so that
 * script is a no-op here by design and this one exists instead. The difference that matters is
 * not the insert, it is that a published plan is the authority a verifier already graded work
 * against - so the question this script answers before writing anything is WHAT MOVES.
 * `lib/domainPlanRepublish.js` computes that; this script measures it against production, gates
 * on it, and only then writes.
 *
 * ## The prerequisite that shipped first
 *
 * Re-deriving makes base and rung ids coexist in the published plans, and until PR #3750 the
 * matcher's subject fallback was `/\b<id>\b/i` - `.` and `:` are non-word characters, so a
 * commit naming `...recording.autonomy:R0` also satisfied `\b...recording\b` and ONE commit
 * verified TWO stories. Measured in production: 964 colliding pairs over 443 distinct stories,
 * and 0 of them reachable in the plans published today precisely because those plans carry no
 * rung ids. This script is what makes all 443 reachable in a single write, which is why the
 * guard was a prerequisite rather than a follow-up. Do not run this against a deployment whose
 * `verifyDecision.ts` predates that fix.
 *
 * ## It does not re-materialize anything
 *
 * `planStore.publishPlan` is pure `build_plans` bookkeeping - supersede-then-promote inside one
 * transaction under `SELECT ... FOR UPDATE` - and contains no reference to `student_tasks`. The
 * warning in the sibling script that "the publish path rewrites every task row" is about
 * `publishBuild` the SERVICE, not `publishPlan` the STORE. The read-back below proves it: story
 * and criteria counts must be identical before and after, and a difference exits non-zero.
 *
 * ## Why it reuses the store rather than writing its own SQL
 *
 * The supersede-before-promote ORDER, the row lock, and the mandatory reviewed-hash check are
 * each the residue of a named incident (see the comments in `planStore.publishPlan`). A script
 * that reimplements them in raw SQL is a second copy of three invariants that were expensive to
 * learn, free to get subtly wrong, and impossible to keep in step. So `--apply` goes through
 * `savePlanDraft` + `publishPlan`. The DRY RUN deliberately does not, so that measuring what
 * would change needs no compiled output and no write credentials.
 *
 * Run (dry run, safe, reads only):
 *   node republishDomainBuildPlans.js
 *   node republishDomainBuildPlans.js --domain=admissions
 * Apply (one domain at a time is the recommended order):
 *   node republishDomainBuildPlans.js --domain=admissions --apply
 *
 * `--apply` needs the compiled backend. In the container the script and its `lib/` siblings are
 * copied to `/app` (plain `.js` under `src/` is not emitted to `dist`, so it is not in the
 * image), where `./dist/...` resolves; run in place from `backend/`, `../../dist/...` does.
 */
const { Sequelize, QueryTypes } = require('sequelize');
const crypto = require('crypto');
const { buildPlanFromTasks, hashPlan } = require('./lib/domainBuildPlan');
const { diffPlanStories, perStoryXp, creditedStories } = require('./lib/domainPlanRepublish');

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');
const ONLY_DOMAIN = (ARGV.find((a) => a.startsWith('--domain=')) || '').split('=')[1] || null;

/** Provenance. Derived from task rows, not produced by a model through the gate. */
const PROVENANCE = 'af127-rederived-from-student-tasks';
const XP_KEY = 'project_story_verified';

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set.');
  process.exit(1);
}

const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
const q = (t, r) => sql.query(t, { replacements: r || {}, type: QueryTypes.SELECT });
/**
 * Bind parameters rather than replacements, for the queries that pass a LIST. Replacements are
 * interpolated as text, so an array becomes a hand-built `{a,b}` literal and a story id
 * containing a quote would end the literal early. `bind` hands the JS array to pg as a real
 * array. Sequelize forbids mixing the two in one query, so these are bind-only.
 */
const qb = (t, b) => sql.query(t, { bind: b, type: QueryTypes.SELECT });

/**
 * `planStore` is TypeScript, so it exists only compiled, and the two supported layouts put
 * `dist` in different places relative to this file. Resolved lazily so a DRY RUN never needs it.
 */
function loadPlanStore() {
  const candidates = ['../../dist/services/sbp/planStore', './dist/services/sbp/planStore'];
  for (const c of candidates) {
    try {
      return require(c);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new Error(
    'cannot load the compiled planStore. --apply needs it; tried '
    + candidates.join(' and ') + ' relative to ' + __dirname
    + '. Build the backend (npm run build:backend), or copy this script and its lib/ siblings '
    + 'to /app inside the container where ./dist exists.',
  );
}

/**
 * Every evidence row that could witness a story having been earned, read once for the whole run.
 *
 * `evidence_records` is the ONLY possible witness, and that is not an accident of how this
 * queries: a removed story is by definition one the published plan has and `student_tasks` does
 * NOT, so no task row can exist to vouch for it. Evidence survives the missing task row - the
 * verifier logs `sbp_verification_task_missing` and continues - which is exactly the case the
 * gate is for.
 *
 * Fetched whole and matched in JS by `creditedStories` rather than filtered by a SQL prefix
 * predicate, so the gate's detector is a tested pure function instead of a second, untestable
 * copy of the matching rule. The table is small enough for this to be the cheap option as well
 * as the correct one. Deliberately NOT scoped to one enrollment or source type: a match anywhere
 * means somebody was paid, and the cheap direction is to refuse.
 */
async function loadEvidence() {
  return q('SELECT source_ref, builder_xp FROM evidence_records WHERE source_ref IS NOT NULL');
}

async function readBudget() {
  const [row] = await q(
    `SELECT builder_xp, config->>'award_model' AS award_model
       FROM points_config
      WHERE scope = 'type_default' AND key = :k AND is_active = true`,
    { k: XP_KEY },
  );
  return row || null;
}

/** The whole report for one project, computed without writing anything. */
async function assess(proj, budget, evidence) {
  const [published] = await q(
    `SELECT version, plan_json, plan_sha256 FROM build_plans
      WHERE project_id = :pid AND status = 'published'`,
    { pid: proj.project_id },
  );
  if (!published) return { proj, skip: 'has NO published plan - synthesizeDomainBuildPlans.js first' };

  const tasks = await q(
    `SELECT story_id, release_key, title, narrative, build, acceptance, fulfills, owner_agent
       FROM student_tasks WHERE project_id = :pid ORDER BY story_id`,
    { pid: proj.project_id },
  );
  if (!tasks.length) return { proj, skip: 'has NO task rows - nothing to derive a plan from' };

  const { plan, warnings } = buildPlanFromTasks({
    projectName: proj.name,
    descriptor: `The ${proj.domain_key.replace(/_/g, ' ')} domain agent.`,
    tasks,
  });
  const sha = hashPlan(plan);

  const currentStories = (published.plan_json && published.plan_json.stories) || [];
  const diff = diffPlanStories(currentStories, plan.stories);
  // The FULL id universe, both plans, so attribution of an evidence row to a story is settled by
  // longest match rather than by a guess about separators. See `creditedStories`.
  const known = [...currentStories, ...plan.stories].map((st) => String(st.id));
  const earned = creditedStories(evidence, diff.removed, known);
  const earnedIds = earned.map((e) => e.story_id);
  // Recomputed WITH the earned set, so `unsafeRemovals` is populated by the gate rather than
  // by this script's own reading of it.
  const gated = diffPlanStories(currentStories, plan.stories, earnedIds);

  return {
    proj, plan, sha, warnings, diff: gated, earned,
    publishedVersion: published.version,
    unchanged: published.plan_sha256 === sha,
    xpBefore: perStoryXp(budget, gated.currentCount),
    xpAfter: perStoryXp(budget, gated.nextCount),
  };
}

function report(a) {
  const key = a.proj.domain_key.padEnd(20);
  if (a.skip) {
    console.log(`  ${key} SKIPPED: ${a.skip}`);
    return;
  }
  if (a.unchanged) {
    console.log(`  ${key} already identical to the derived plan (sha ${a.sha.slice(0, 12)}), nothing to do`);
    return;
  }
  const d = a.diff;
  console.log(`  ${key} v${a.publishedVersion}: ${d.currentCount} -> ${d.nextCount} stories`
    + `   +${d.added.length} added  -${d.removed.length} removed  ~${d.criteriaChanged.length} criteria changed`);
  console.log(`  ${' '.repeat(20)} per-story XP ${a.xpBefore} -> ${a.xpAfter} (whole-build total unchanged)`);
  if (d.removed.length) {
    for (const id of d.removed.slice(0, 8)) {
      const e = a.earned.find((x) => x.story_id === id);
      console.log(`  ${' '.repeat(20)} removed: ${id}${e ? `   *** EARNED: ${e.evidence_rows} evidence row(s), ${e.xp} XP ***` : ''}`);
    }
    if (d.removed.length > 8) console.log(`  ${' '.repeat(20)} ... and ${d.removed.length - 8} more removed`);
  }
  if (d.criteriaChanged.length) {
    for (const id of d.criteriaChanged.slice(0, 5)) {
      console.log(`  ${' '.repeat(20)} criteria moved: ${id}`);
    }
    if (d.criteriaChanged.length > 5) {
      console.log(`  ${' '.repeat(20)} ... and ${d.criteriaChanged.length - 5} more with changed criteria`);
    }
  }
  for (const w of a.warnings.slice(0, 3)) console.log(`  ${' '.repeat(20)} warning: ${w}`);
}

async function main() {
  console.log(APPLY ? '*** APPLYING ***\n' : '*** DRY RUN - nothing is written ***\n');

  const budgetRow = await readBudget();
  if (!budgetRow) {
    console.log(`points_config ${XP_KEY}: ABSENT - per-story XP cannot be reported\n`);
  } else {
    console.log(`points_config ${XP_KEY}: builder_xp=${budgetRow.builder_xp}, `
      + `award_model=${budgetRow.award_model || 'unset'}`);
    if (budgetRow.award_model !== 'budget_per_build') {
      console.log('  NOTE: not a budget_per_build row, so the per-story figures below do not apply');
    }
    console.log('');
  }
  const budget = budgetRow && budgetRow.award_model === 'budget_per_build' ? budgetRow.builder_xp : null;

  const projects = await q(
    `SELECT d.domain_key, d.student_project_id::text AS project_id, p.name
       FROM agent_domain_projects d
       JOIN projects p ON p.id = d.student_project_id
      ${ONLY_DOMAIN ? 'WHERE d.domain_key = :only' : ''}
      ORDER BY d.domain_key`,
    { only: ONLY_DOMAIN },
  );
  if (!projects.length) {
    console.error(`no agent-domain projects matched${ONLY_DOMAIN ? ` --domain=${ONLY_DOMAIN}` : ''}.`);
    process.exitCode = 1;
    return;
  }

  // Counted across the projects in scope, before and after. A plan write must not disturb a story.
  const pids = projects.map((p) => p.project_id);
  const taskCounts = () => qb(
    `SELECT count(*)::int AS stories,
            count(*) FILTER (WHERE acceptance IS NOT NULL
              AND acceptance::text NOT IN ('null','[]','{}','""'))::int AS with_criteria
       FROM student_tasks WHERE project_id = ANY($1::uuid[])`,
    [pids],
  );
  const [before] = await taskCounts();
  console.log(`student_tasks in scope: ${before.stories} stories, ${before.with_criteria} with criteria\n`);

  const evidence = await loadEvidence();
  console.log(`evidence_records with a source_ref: ${evidence.length}\n`);

  const assessments = [];
  for (const proj of projects) {
    const a = await assess(proj, budget, evidence);
    assessments.push(a);
    report(a);
  }

  // THE GATE. A removal of a story somebody was already credited for is never automatically
  // safe, and there is deliberately no flag to override it: an escape hatch on a fail-closed
  // gate is how the gate stops existing. If this ever fires it is an escalation - decide per
  // story whether to keep it in the plan - not a run to force through.
  const unsafe = assessments.filter((a) => a.diff && a.diff.unsafeRemovals.length);
  if (unsafe.length) {
    console.error('\n*** REFUSING: a republish would remove stories that have already been earned ***');
    for (const a of unsafe) {
      for (const id of a.diff.unsafeRemovals) {
        const e = a.earned.find((x) => x.story_id === id);
        console.error(`  ${a.proj.domain_key}: ${id} (${e ? e.evidence_rows : '?'} evidence row(s), ${e ? e.xp : '?'} XP)`);
      }
    }
    console.error('\nNothing was written. Resolve each story above before re-running.');
    process.exitCode = 1;
    return;
  }

  const actionable = assessments.filter((a) => !a.skip && !a.unchanged);
  if (!APPLY) {
    console.log(`\nDRY RUN complete. ${actionable.length} plan(s) would be republished, `
      + `${assessments.length - actionable.length} unchanged or skipped.`);
    return;
  }
  if (!actionable.length) {
    console.log('\nnothing to apply.');
    return;
  }

  const { savePlanDraft, publishPlan } = loadPlanStore();
  const correlationId = crypto.randomUUID();
  console.log(`\n=== applying, correlation_id ${correlationId} ===`);

  let wrote = 0;
  for (const a of actionable) {
    // `gate_ok: true` with no violations matches what AF2.8 wrote for these same plans and means
    // "no violations recorded", NOT "the gate passed" - a derived plan never goes through it.
    // `model` carries that provenance so a reader is not misled by the empty violation list.
    const draft = await savePlanDraft(a.proj.project_id, a.plan, {
      gate: { ok: true, violations: [] },
      model: PROVENANCE,
      attempts: 1,
      correlationId,
    });
    // The hash of the draft THIS run just wrote, so a concurrent publish of a plan this run
    // never measured is refused rather than promoted.
    const pub = await publishPlan(a.proj.project_id, draft.version, draft.plan_sha256);
    console.log(`  ${a.proj.domain_key.padEnd(20)} v${a.publishedVersion} -> v${pub.version} published, `
      + `sha ${pub.plan_sha256.slice(0, 12)}`);
    wrote += 1;
  }

  console.log(`\nrepublished ${wrote} plan(s).`);

  console.log('\n=== read back ===');
  const after = await qb(
    `SELECT d.domain_key,
            count(*) FILTER (WHERE b.status = 'published')::int AS published,
            count(*) FILTER (WHERE b.status = 'superseded')::int AS superseded
       FROM agent_domain_projects d
       LEFT JOIN build_plans b ON b.project_id = d.student_project_id
      WHERE d.student_project_id = ANY($1::uuid[])
      GROUP BY d.domain_key ORDER BY d.domain_key`,
    [pids],
  );
  let ok = true;
  for (const r of after) {
    const flag = r.published === 1 ? '' : '  *** EXPECTED EXACTLY 1 PUBLISHED ***';
    if (r.published !== 1) ok = false;
    console.log(`  ${r.domain_key.padEnd(20)} published ${r.published}, superseded ${r.superseded}${flag}`);
  }

  const [post] = await taskCounts();
  const untouched = post.stories === before.stories && post.with_criteria === before.with_criteria;
  console.log(`\n  student_tasks after: ${post.stories} stories, ${post.with_criteria} with criteria`);
  console.log(`  NOTHING RE-MATERIALIZED: ${untouched ? 'confirmed' : '*** STORY ROWS CHANGED, INVESTIGATE ***'}`);
  if (!untouched || !ok) process.exitCode = 1;
}

main()
  .then(async () => { await sql.close(); process.exit(process.exitCode || 0); })
  .catch(async (e) => {
    console.error('FAILED: ' + e.message);
    try { await sql.close(); } catch (_) { /* pool may already be down */ }
    process.exit(1);
  });
