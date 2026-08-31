#!/usr/bin/env node
/**
 * E2E scenario G — a production signal proposes, and changes nothing.
 *
 * From `docs/architecture/refactored-delivery-os/E2E_SCENARIOS.md`:
 *
 *     operational signal -> candidate story -> review -> release
 *
 * **Proves it:** a real operate signal produces a `SignalCandidate` in status `proposed`,
 * and **no production state changes** until a human converts it through the ordinary gates.
 *
 * **Why that observable:** *"the property under test is an absence — that nothing happened
 * automatically."*
 *
 * ## How an absence is actually tested here
 *
 * Counts of every table a candidate could plausibly have written to are taken before and
 * after: stories, decisions, releases, evidence, project members. A scenario that only
 * asserted "a candidate row exists" would pass just as happily on a system that also
 * silently opened a story.
 *
 * The delivery project's own row is snapshotted with `row_to_json` too, so a signal that
 * quietly stamped a status on it fails here.
 *
 * ## DEV ONLY
 *
 * Creates a delivery project and signal candidates. Checks the live database name.
 */

const path = require('path');

const BACKEND_DIST = (() => {
  const candidates = [
    process.env.BACKEND_DIST,
    path.join(__dirname, '..', '..', 'backend', 'dist'),
    '/app/dist',
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      require.resolve(path.join(dir, 'config', 'database'));
      return dir;
    } catch (_) { /* try the next */ }
  }
  throw new Error(`Could not find the compiled backend. Tried: ${candidates.join(', ')}`);
})();

const ALLOWED_DATABASES = ['accelerator_dev1', 'accelerator_dev', 'accelerator_test'];
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: expected ${expected}, got ${actual}`);
};

async function main() {
  const { sequelize } = require(path.join(BACKEND_DIST, 'config/database'));
  const { QueryTypes } = require('sequelize');
  const models = require(path.join(BACKEND_DIST, 'models'));
  const { DeliveryProject, DeliveryEngagement, DeliverySignalCandidate, PlatformIdentity } = models;
  const jwt = require('jsonwebtoken');
  const { env } = require(path.join(BACKEND_DIST, 'config/env'));

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', { type: QueryTypes.SELECT });
  if (!ALLOWED_DATABASES.includes(db)) throw new Error(`Refusing to run: connected to "${db}".`);
  console.log(`[G] database: ${db}`);

  const [tenant] = await sequelize.query(
    "SELECT id FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) throw new Error('No refactored tenant.');

  let engagement = await DeliveryEngagement.findOne({ where: { name: 'E2E-G engagement' } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({
      tenant_id: tenant.id, name: 'E2E-G engagement', status: 'active',
    });
  }
  let project = await DeliveryProject.findOne({ where: { slug: 'e2e-g-operate-project' } });
  if (!project) {
    project = await DeliveryProject.create({
      engagement_id: engagement.id, tenant_id: tenant.id,
      name: 'E2E-G operate project', slug: 'e2e-g-operate-project',
      status: 'operate', project_class: 'client',
    });
  }
  await DeliverySignalCandidate.destroy({ where: { delivery_project_id: project.id } });
  console.log(`[G] project ${project.id}`);

  // Everything a signal must NOT have touched.
  const productionState = async () => {
    const [row] = await sequelize.query(
      `SELECT
         (SELECT count(*) FROM delivery_stories)         AS stories,
         (SELECT count(*) FROM delivery_decisions)       AS decisions,
         (SELECT count(*) FROM delivery_releases)        AS releases,
         (SELECT count(*) FROM delivery_evidence)        AS evidence,
         (SELECT count(*) FROM delivery_project_members) AS members,
         (SELECT row_to_json(p)::text FROM delivery_projects p WHERE p.id = :id) AS project`,
      { type: QueryTypes.SELECT, replacements: { id: project.id } },
    );
    return JSON.stringify(row);
  };

  const email = 'e2e-g-operator@colaberry.com';
  let operator = await PlatformIdentity.findOne({ where: { primary_email: email } });
  if (!operator) {
    operator = await PlatformIdentity.create({ primary_email: email, display_name: 'E2E-G Operator' });
  }
  const adminToken = jwt.sign(
    { id: operator.id, sub: operator.id, platform_identity_id: operator.id, email, role: 'super_admin' },
    env.jwtSecret,
    { expiresIn: 900 },
  );

  const api = async (method, url, body) => {
    const res = await fetch(`${BASE_URL}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  console.log('\n[G] assertions');

  const before = await productionState();

  // --- a real, observed signal ----------------------------------------------------------
  const raised = await api('POST', `/api/refactored/admin/projects/${project.id}/signals`, {
    kind: 'defect',
    signal: 'errors',
    summary: 'Checkout error rate went from 0.4% to 9% within an hour of the Tuesday deploy.',
    evidence: { status: 'observed', signal: 'errors', value: 0.09 },
  });
  check('an observed signal raises a candidate', raised.status, 201);
  check('  in status proposed', raised.body.status, 'proposed');
  check('  requiring a human', raised.body.requiresHumanReview, true);

  // --- THE observable: nothing else moved ------------------------------------------------
  check('NO production state changed', (await productionState()) === before, true);
  if ((await productionState()) !== before) {
    console.log(`  before: ${before}`);
    console.log(`  after:  ${await productionState()}`);
  }

  // --- the candidate is real and reviewable ---------------------------------------------
  const listed = await api('GET', `/api/refactored/admin/projects/${project.id}/signals`);
  check('the candidate is readable back', (listed.body.candidates || []).length, 1);
  check('  still proposed', (listed.body.candidates || [])[0]?.status, 'proposed');
  check('  with its evidence intact', (listed.body.candidates || [])[0]?.evidence?.value, 0.09);

  // --- a fabrication is refused ----------------------------------------------------------
  // The most valuable refusal in the module: a conclusion from telemetry that was never
  // observed. It reads exactly like a real finding, which is what makes it dangerous.
  const fabricated = await api('POST', `/api/refactored/admin/projects/${project.id}/signals`, {
    kind: 'defect',
    signal: 'latency',
    summary: 'Latency is unacceptable across the board and needs urgent optimisation work.',
    evidence: { status: 'not_observed', signal: 'latency', reason: 'no APM on this project' },
  });
  check('a conclusion from UNOBSERVED telemetry is refused', fabricated.status, 422);
  check(
    '  as no_observation',
    (fabricated.body.refusals || []).some((r) => r.rule === 'no_observation'),
    true,
  );

  const afterRefusal = await api('GET', `/api/refactored/admin/projects/${project.id}/signals`);
  check('  and no candidate row was written', (afterRefusal.body.candidates || []).length, 1);

  // --- but the ABSENCE of telemetry is itself a finding -----------------------------------
  const missing = await api('POST', `/api/refactored/admin/projects/${project.id}/signals`, {
    kind: 'new_requirement',
    signal: 'latency',
    summary: 'This project has no latency instrumentation at all, so we cannot see it.',
    evidence: { status: 'not_observed', signal: 'latency', reason: 'no APM on this project' },
    aboutMissingTelemetry: true,
  });
  check('a candidate ABOUT the missing telemetry is allowed', missing.status, 201);

  // --- a summary nobody could act on ------------------------------------------------------
  const thin = await api('POST', `/api/refactored/admin/projects/${project.id}/signals`, {
    kind: 'defect', signal: 'errors', summary: 'broken',
    evidence: { status: 'observed', signal: 'errors', value: 0.5 },
  });
  check('a summary too thin to act on is refused', thin.status, 422);

  // --- and after all of that, still nothing but candidates ---------------------------------
  const finalState = await productionState();
  check('after every signal, production is STILL untouched', finalState === before, true);
  const total = await DeliverySignalCandidate.count({ where: { delivery_project_id: project.id } });
  check('  exactly two candidates were proposed, and nothing applied', total, 2);

  console.log(`\n[G] ${failures === 0 ? 'SCENARIO G PASSED' : `SCENARIO G FAILED (${failures})`}`);
  console.log('[G] NOT covered: converting a candidate into a story. There is deliberately no');
  console.log('[G] code path that does it - applying a candidate means a person going through');
  console.log('[G] the ordinary gates, which is the control this scenario verifies.');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[G] ERROR: ${err.message}`);
  process.exit(1);
});
