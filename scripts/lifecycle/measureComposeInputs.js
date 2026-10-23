#!/usr/bin/env node
/**
 * CAN A BLUEPRINT BE COMPOSED AT ALL? Read-only inventory of the compose inputs.
 *
 * Session CC-20261021-h9v3. Companion to measureLegacyLifecycleReadiness.js, which proved
 * `operating_blueprint_manifests` is empty. This asks the next question: if someone wrote the
 * caller that has never existed, would it have anything to call with?
 *
 * ## IT WRITES NOTHING
 *
 * SELECTs only. Safe on production, which is the only place the data is.
 *
 * ## What compose needs, and why each column here matters
 *
 * `persistComposedBlueprint` refuses before writing unless ALL of these hold:
 *   - the project has a LIFECYCLE ROW          -> else `no_lifecycle_row`
 *   - refs.sources is non-empty                -> else `no_requirements`
 * and the route only persists when `composeBlueprint` returns ZERO refusals, which additionally
 * requires task-surface bindings, workspace states, control policies with known roles, and a
 * SELECTED DESIGN (`design === null` is a hard `DESIGN_NOT_SELECTED`).
 *
 * Only the first two are database-resident. The rest are authored by the caller, so this script
 * measures the two that can be measured and counts the candidates for the rest.
 */
'use strict';

const DIST = process.env.LIFECYCLE_DIST || '/app/dist';

async function main() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { sequelize } = require(`${DIST}/config/database`);

  const q = async (label, sql) => {
    try {
      const [rows] = await sequelize.query(sql);
      return rows;
    } catch (err) {
      console.log(`  ERROR  ${label}: ${err.message}`);
      return null;
    }
  };

  console.log('[compose-inputs] READ ONLY - nothing is written\n');

  const manifests = await q('manifests', 'SELECT count(*)::int AS n FROM operating_blueprint_manifests');
  if (manifests) console.log(`[compose-inputs] operating_blueprint_manifests rows: ${manifests[0].n}`);

  // THE CANDIDATE SET. A project with no lifecycle row cannot be filed against, so the 62
  // legacy student projects are out by construction, not by choice.
  const states = await q('states', `
    SELECT CASE WHEN student_project_id IS NOT NULL THEN 'student' ELSE 'delivery' END AS kind,
           stage, count(*)::int AS n
      FROM project_lifecycle_states
     GROUP BY 1, 2
     ORDER BY 1, 3 DESC
  `);
  if (states) {
    console.log('\n[compose-inputs] projects WITH a lifecycle row - the only ones a manifest can be filed against');
    for (const r of states) console.log(`  ${String(r.n).padStart(3)}  ${r.kind.padEnd(9)} ${r.stage}`);
    const total = states.reduce((a, r) => a + r.n, 0);
    console.log(`  ${String(total).padStart(3)}  TOTAL`);
  }

  // REQUIREMENT RAW MATERIAL, per kind, for the candidates only. `refs.sources` is built from
  // the body's `requirements`, so this is what a gatherer would have to read.
  const studentReqs = await q('student requirements', `
    SELECT l.student_project_id AS project_id, l.stage,
           (SELECT count(*)::int FROM build_plans b
             WHERE b.project_id = l.student_project_id AND b.status = 'published') AS published_plans
      FROM project_lifecycle_states l
     WHERE l.student_project_id IS NOT NULL
     ORDER BY published_plans DESC
  `);
  if (studentReqs) {
    const withPlan = studentReqs.filter((r) => r.published_plans > 0).length;
    console.log(`\n[compose-inputs] student candidates: ${studentReqs.length}, of which ${withPlan} have a PUBLISHED plan`);
    for (const r of studentReqs.slice(0, 12)) {
      console.log(`  ${r.project_id}  stage=${String(r.stage).padEnd(22)} published_plans=${r.published_plans}`);
    }
  }

  const deliveryReqs = await q('delivery requirements', `
    SELECT l.delivery_project_id AS project_id, l.stage,
           (SELECT count(*)::int FROM contract_requirements c
             WHERE c.delivery_project_id = l.delivery_project_id) AS requirements
      FROM project_lifecycle_states l
     WHERE l.delivery_project_id IS NOT NULL
     ORDER BY requirements DESC
  `);
  if (deliveryReqs) {
    const withReqs = deliveryReqs.filter((r) => r.requirements > 0).length;
    console.log(`\n[compose-inputs] delivery candidates: ${deliveryReqs.length}, of which ${withReqs} have contract requirements`);
    for (const r of deliveryReqs.slice(0, 12)) {
      console.log(`  ${r.project_id}  stage=${String(r.stage).padEnd(22)} requirements=${r.requirements}`);
    }
  }

  // Provenance is what `requirement_without_provenance` blocks on, so an unprovenanced
  // requirement is raw material that still will not pass. Measured separately from the count.
  const provenance = await q('provenance', `
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE source_document IS NOT NULL AND source_document <> '')::int AS with_source,
           count(*) FILTER (WHERE human_confirmed IS TRUE)::int AS human_confirmed
      FROM contract_requirements
     WHERE delivery_project_id IN (SELECT delivery_project_id FROM project_lifecycle_states
                                    WHERE delivery_project_id IS NOT NULL)
  `);
  if (provenance) {
    const p = provenance[0];
    console.log(`\n[compose-inputs] contract requirements on candidates: ${p.total} total, `
      + `${p.with_source} with a source document, ${p.human_confirmed} human confirmed`);
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error('[compose-inputs] failed:', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
