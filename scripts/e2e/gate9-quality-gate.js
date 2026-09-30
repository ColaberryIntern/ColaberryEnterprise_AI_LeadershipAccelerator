#!/usr/bin/env node
/**
 * Gate 9, end to end: does the quality gate actually block?
 *
 * Not one of the seven named E2E scenarios. This is the narrower question those
 * scenarios depend on and that no unit test can answer: **when a running system is asked
 * about a story with no evidence, does it refuse?**
 *
 * That path — `evidence: []`, fail closed — had never executed outside a test file.
 * `evaluateQualityGate` had zero production callers, `delivery_stories` did not exist as
 * a table, and nothing wrote to `delivery_evidence`.
 *
 * ## The order matters
 *
 * It asks the gate BEFORE recording anything, then again after. A script that only
 * checked the passing case would prove the gate can say yes, which is the less
 * interesting half — a gate that always says yes also passes that test.
 *
 * DEV ONLY. Writes stories and evidence; checks the live database name.
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
const STORY_KEY = 'GATE9-E2E-1';
const SHA = 'a'.repeat(40);

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: expected ${expected}, got ${actual}`);
};

async function main() {
  const { sequelize } = require(path.join(BACKEND_DIST, 'config/database'));
  const { QueryTypes } = require('sequelize');
  const { DeliveryProject, DeliveryStory, DeliveryEvidence } = require(path.join(BACKEND_DIST, 'models'));
  const jwt = require('jsonwebtoken');
  const { env } = require(path.join(BACKEND_DIST, 'config/env'));

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', { type: QueryTypes.SELECT });
  if (!ALLOWED_DATABASES.includes(db)) throw new Error(`Refusing to run: connected to "${db}".`);
  console.log(`[G9] database: ${db}`);

  // The table is created by the boot DDL. If it is missing, everything below would fail
  // confusingly, so say so plainly instead.
  const cols = await sequelize.query(
    "SELECT column_name::text AS c FROM information_schema.columns WHERE table_name = 'delivery_stories'",
    { type: QueryTypes.SELECT },
  );
  check('delivery_stories exists (created by the boot DDL)', cols.length > 0, true);
  if (cols.length === 0) throw new Error('No delivery_stories table — the boot DDL did not run.');

  const project = await DeliveryProject.findOne({ where: { slug: 'dev-demo-engagement' } });
  if (!project) throw new Error('Run seedDevClientReviewer.ts first.');

  // Clean slate so a rerun does not start with evidence already recorded and pass for
  // the wrong reason.
  const prior = await DeliveryStory.findOne({
    where: { delivery_project_id: project.id, story_key: STORY_KEY },
  });
  if (prior) await DeliveryEvidence.destroy({ where: { story_id: prior.id } });
  await DeliveryStory.destroy({ where: { delivery_project_id: project.id, story_key: STORY_KEY } });

  const adminToken = jwt.sign(
    { id: 'gate9-admin', email: 'gate9@colaberry.com', role: 'super_admin' },
    env.jwtSecret,
    { expiresIn: 600 },
  );
  const authed = (extra = {}) => ({
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    ...extra,
  });

  console.log('\n[G9] assertions');

  // --- a contract that misleads is refused, not stored --------------------------------
  const badStory = await fetch(`${BASE_URL}/api/refactored/admin/projects/${project.id}/stories`,
    authed({ method: 'POST', body: JSON.stringify({ contract: { storyId: 'BAD-1', title: '', fulfills: [] } }) }));
  check('a contract with blocking issues is REFUSED', badStory.status, 422);
  const stillAbsent = await DeliveryStory.count({ where: { story_key: 'BAD-1' } });
  check('  and it was not stored', stillAbsent, 0);

  // --- a real story ------------------------------------------------------------------
  const contract = {
    storyId: STORY_KEY,
    title: 'Arrivals board refreshes on a timer',
    fulfills: ['REQ-ARRIVALS-1'],
    businessReason: 'Riders call the depot when the board is stale.',
    riskLevel: 'R2',
    acceptance: ['Refreshes within 30 seconds'],
    failurePaths: ['Feed unavailable: show last-known with a timestamp'],
    testRequirements: ['unit', 'integration'],
  };
  const created = await fetch(`${BASE_URL}/api/refactored/admin/projects/${project.id}/stories`,
    authed({ method: 'POST', body: JSON.stringify({ contract }) }));
  check('a valid contract is stored', created.status, 201);

  // --- THE assertion: no evidence, so the gate refuses --------------------------------
  const empty = await fetch(
    `${BASE_URL}/api/refactored/admin/projects/${project.id}/stories/${STORY_KEY}/quality-gate?sha=${SHA}`,
    authed(),
  );
  const emptyBody = await empty.json();
  check('the gate answers even with nothing recorded', empty.status, 200);
  check('  evidence count is zero', emptyBody.evidenceCount, 0);
  check('  AND THE GATE BLOCKS', emptyBody.gate.passes, false);
  if (emptyBody.gate?.blockingFindings?.length) {
    console.log(`  blocking: ${emptyBody.gate.blockingFindings.map((f) => f.rule).join(', ')}`);
  }

  // --- evidence is idempotent ---------------------------------------------------------
  const body = JSON.stringify({
    storyId: (await DeliveryStory.findOne({ where: { story_key: STORY_KEY } })).id,
    dimension: 'unit_tests',
    evidenceType: 'test_run',
    outcome: 'pass',
    subjectSha: SHA,
    sourceRef: 'gate9-run-1',
  });
  const first = await fetch(`${BASE_URL}/api/refactored/admin/projects/${project.id}/evidence`, authed({ method: 'POST', body }));
  check('evidence is recorded', first.status, 201);
  const replay = await fetch(`${BASE_URL}/api/refactored/admin/projects/${project.id}/evidence`, authed({ method: 'POST', body }));
  check('a REPLAYED callback dedupes rather than writing twice', replay.status, 200);
  check('  and reports itself as deduped', (await replay.json()).deduped, true);

  const rowCount = await DeliveryEvidence.count({
    where: { delivery_project_id: project.id, source_ref: 'gate9-run-1' },
  });
  check('  exactly one row exists', rowCount, 1);

  // --- the gate now sees it ------------------------------------------------------------
  const after = await fetch(
    `${BASE_URL}/api/refactored/admin/projects/${project.id}/stories/${STORY_KEY}/quality-gate?sha=${SHA}`,
    authed(),
  );
  const afterBody = await after.json();
  check('the gate now sees the evidence', afterBody.evidenceCount, 1);

  console.log(`\n[G9] ${failures === 0 ? 'GATE 9 IS WIRED AND BLOCKING' : `FAILED (${failures})`}`);
  console.log('[G9] Note: whether the gate PASSES with full evidence depends on the story');
  console.log('[G9] contract and is deliberately not asserted here - what matters is that it');
  console.log('[G9] refuses when there is nothing, and sees evidence when there is.');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[G9] ERROR: ${err.message}`);
  process.exit(1);
});
