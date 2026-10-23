#!/usr/bin/env node
/**
 * WHERE WOULD THE UNREGISTERED PROJECTS SIT, if someone had been approving all along?
 *
 * Design: `readiness-and-approval-separation.md` §7. Session CC-20261021-h9v3.
 *
 * ## Why this exists
 *
 * 62 student projects predate the lifecycle registration hook and carry no lifecycle row. 47 of
 * them already have a PUBLISHED plan, so backfilling them all at `discovery` would assert they
 * have not started - false - and, once the enforcement gate is armed, would demand re-approval
 * of work already shipped to students.
 *
 * This answers the question with evidence instead: for each project, how far along the chain do
 * the prerequisites actually hold? That turns the backfill from "insert 62 rows at a stage we
 * picked" into "insert 62 rows at the stage the evidence supports".
 *
 * ## IT WRITES NOTHING
 *
 * Reads only. It never calls `recordReadiness`, never inserts a lifecycle row, never advances a
 * stage. Safe to run against production, which is the point - the data it needs only exists
 * there.
 *
 * ## It uses the REAL predicates
 *
 * `readLifecycleEvidence` and `prerequisiteGaps` from the deployed build, not a reimplementation.
 * A second implementation of "is this stage satisfied" would be measuring itself. The projects
 * have no lifecycle row, so a SYNTHETIC one is handed to the evidence reader - which is sound
 * because that reader locates evidence by `tenant_id` + `student_project_id`, never by the
 * lifecycle row's own id (`lifecycleEvidence.ts:379-388`; the id appears only in a log line).
 *
 * ## Running it on the production backend
 *
 *   scp scripts/lifecycle/measureLegacyLifecycleReadiness.js root@<host>:/tmp/
 *   ssh root@<host> 'docker cp /tmp/measureLegacyLifecycleReadiness.js accelerator-backend:/app/ \
 *     && docker exec accelerator-backend node /app/measureLegacyLifecycleReadiness.js'
 *
 * A deploy empties the container, so restage it each run.
 */
'use strict';

const DIST = process.env.LIFECYCLE_DIST || '/app/dist';

function load(relative) {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(`${DIST}/${relative}`);
}

async function main() {
  const { sequelize } = load('config/database');
  const { readLifecycleEvidence } = load('services/lifecycle/lifecycleEvidence');
  const { prerequisiteGaps, satisfied } = load('services/lifecycle/lifecyclePrerequisites');
  const { LIFECYCLE_STAGES, ADVANCE } = load('services/lifecycle/lifecycleStages');

  const [projects] = await sequelize.query(`
    SELECT p.id, p.tenant_id, p.archived_at, p.created_at,
           (SELECT count(*) FROM build_plans b
             WHERE b.project_id = p.id AND b.status = 'published') AS published_plans
      FROM projects p
      LEFT JOIN project_lifecycle_states l ON l.student_project_id = p.id
     WHERE l.student_project_id IS NULL
     ORDER BY p.created_at
  `);

  console.log(`[legacy-readiness] ${projects.length} student project(s) with no lifecycle row`);
  console.log('[legacy-readiness] READ ONLY — nothing is written\n');

  const distribution = new Map();
  const gapTally = new Map();
  const noTenant = [];

  for (const p of projects) {
    if (!p.tenant_id) {
      // Without a tenant the evidence reader cannot locate anything, and a lifecycle row could
      // not be written anyway (`tenant_id` is NOT NULL). Named rather than silently counted.
      noTenant.push(p.id);
      continue;
    }

    const row = {
      id: '00000000-0000-0000-0000-000000000000', // synthetic; never used to locate evidence
      tenant_id: p.tenant_id,
      student_project_id: p.id,
      delivery_project_id: null,
      stage: 'discovery',
      condition: null,
      condition_reason: null,
    };

    let evidence;
    try {
      // eslint-disable-next-line no-await-in-loop
      evidence = await readLifecycleEvidence(row);
    } catch (err) {
      console.log(`  ERROR  ${p.id}  evidence unreadable: ${err.message}`);
      continue;
    }

    // Walk forward while each successive hop's prerequisites hold. The derived stage is the
    // furthest one reachable by consecutive satisfied hops - not "any stage that happens to be
    // satisfied", because a lifecycle is a path and skipping a gate is not a thing that happened.
    let derived = 'discovery';
    for (;;) {
      const next = ADVANCE[derived];
      if (!next) break;
      if (!satisfied(prerequisiteGaps(next, evidence))) break;
      derived = next;
    }

    const blocked = prerequisiteGaps(ADVANCE[derived] || derived, evidence);
    distribution.set(derived, (distribution.get(derived) || 0) + 1);

    // THE KIND IS THE FINDING, not the count. `unmet` means the project genuinely lacks the
    // thing; `not_assessed` means nobody measured it and the doctrine blocks anyway. A reviewer
    // takes a completely different action in each case, and a bare "blocked by 4" hides which.
    const unmet = blocked.filter((g) => g.kind === 'unmet').length;
    const unassessed = blocked.filter((g) => g.kind === 'not_assessed').length;
    for (const g of blocked) {
      const key = `${g.kind}:${g.rule}`;
      gapTally.set(key, (gapTally.get(key) || 0) + 1);
    }

    console.log(
      `  ${derived.padEnd(24)} ${p.id}  `
      + `published=${p.published_plans}  ${p.archived_at ? 'archived' : 'live  '}  `
      + `unmet=${unmet} not_assessed=${unassessed}`,
    );
  }

  console.log('\n[legacy-readiness] what blocks the next hop, BY KIND AND RULE');
  console.log('  (unmet = the project genuinely lacks it; not_assessed = nobody measured it)');
  for (const [key, n] of [...gapTally.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${String(n).padStart(4)}  ${key}`);
  }

  console.log('\n[legacy-readiness] derived stage distribution');
  for (const stage of LIFECYCLE_STAGES) {
    const n = distribution.get(stage);
    if (n) console.log(`  ${String(n).padStart(3)}  ${stage}`);
  }
  if (noTenant.length) {
    console.log(`\n[legacy-readiness] ${noTenant.length} project(s) have NO tenant and cannot be `
      + 'registered at all:');
    for (const id of noTenant) console.log(`  ${id}`);
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error('[legacy-readiness] failed:', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
