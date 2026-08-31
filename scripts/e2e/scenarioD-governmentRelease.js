#!/usr/bin/env node
/**
 * E2E scenario D — government profile, missing evidence, release blocked.
 *
 * From `docs/architecture/refactored-delivery-os/E2E_SCENARIOS.md`:
 *
 *     government profile -> required accessibility/security/trust
 *     -> missing evidence -> release blocked
 *
 * **Proves it:** `evaluateReleaseGate` returns `ready: false` with an accessibility
 * blocker, **and** the same release becomes ready once a Gate 13 waiver is recorded — with
 * the waiver visible in `waived` rather than folded into `passed`.
 *
 * **Why that observable:** *"the failure mode is not 'the gate does not block'. It is 'the
 * gate stops blocking for a reason nobody can see afterwards.'"*
 *
 * ## Why this could not be written until now
 *
 * `evaluateReleaseGate` and `resolveProfile` had zero production callers because
 * `delivery_releases` did not exist — there was no release to ask about — and even once it
 * did, there was no HTTP surface. Every assertion below drives the real endpoints.
 *
 * ## DEV ONLY
 *
 * Creates an engagement, a project and releases. Checks the live database name.
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

// The full government set, minus the one this scenario deliberately withholds.
const GOVERNMENT_CHECKS = [
  'stories_complete', 'requirements_covered', 'tests', 'browser', 'security',
  'accessibility', 'ai_evals', 'migration_rehearsal', 'rollback', 'client_acceptance',
];
const WITHHELD = 'accessibility';

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
  const { DeliveryProject, DeliveryEngagement, DeliveryRelease, PlatformIdentity } = models;
  const jwt = require('jsonwebtoken');
  const { env } = require(path.join(BACKEND_DIST, 'config/env'));

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', { type: QueryTypes.SELECT });
  if (!ALLOWED_DATABASES.includes(db)) throw new Error(`Refusing to run: connected to "${db}".`);
  console.log(`[D] database: ${db}`);

  const [tenant] = await sequelize.query(
    "SELECT id FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) throw new Error('No refactored tenant.');

  // --- a real identity to approve with -------------------------------------------------
  // approved_by_identity_id is a UUID column, so the approver must be a genuine identity
  // rather than a convenient string.
  const email = 'e2e-d-approver@colaberry.com';
  let approver = await PlatformIdentity.findOne({ where: { primary_email: email } });
  if (!approver) {
    approver = await PlatformIdentity.create({ primary_email: email, display_name: 'E2E-D Approver' });
  }

  // --- a GOVERNMENT project ------------------------------------------------------------
  let engagement = await DeliveryEngagement.findOne({ where: { name: 'E2E-D engagement' } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({
      tenant_id: tenant.id, name: 'E2E-D engagement', status: 'active',
    });
  }
  let project = await DeliveryProject.findOne({ where: { slug: 'e2e-d-gov-project' } });
  if (!project) {
    project = await DeliveryProject.create({
      engagement_id: engagement.id, tenant_id: tenant.id,
      name: 'E2E-D government project', slug: 'e2e-d-gov-project',
      status: 'build', project_class: 'client',
    });
  }
  // Set on the PROJECT, never passed in the request — the request has no say in which
  // checks are mandatory for it.
  await project.update({ delivery_profile_key: 'government_public_sector' });
  console.log(`[D] project ${project.id} on profile government_public_sector`);

  // A fresh version each run, so an earlier run's approved release cannot make this one
  // look ready before it has done anything.
  const version = `1.0.0-e2e-${Date.now()}`;
  await DeliveryRelease.destroy({ where: { delivery_project_id: project.id } });

  const adminToken = jwt.sign(
    {
      id: approver.id,
      platform_identity_id: approver.id,
      email, role: 'super_admin',
    },
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

  console.log('\n[D] assertions');

  // --- the profile comes from the project ----------------------------------------------
  const created = await api('POST', `/api/refactored/admin/projects/${project.id}/releases`, { version });
  check('a release candidate is cut', created.status, 201);
  check('  on the profile from the PROJECT, not the request', created.body.profileKey, 'government_public_sector');
  const releaseId = created.body.releaseId;

  // --- nothing recorded yet: the gate blocks -------------------------------------------
  const empty = await api('GET', `/api/refactored/admin/releases/${releaseId}/gate`);
  check('the empty release is NOT ready', empty.body.ready, false);
  check('  government takes the full check list', (empty.body.mandatory || []).length, GOVERNMENT_CHECKS.length);
  check(
    `  ${WITHHELD} is among the blockers`,
    (empty.body.blockers || []).some((b) => b.check === WITHHELD),
    true,
  );

  // --- record everything EXCEPT accessibility ------------------------------------------
  for (const c of GOVERNMENT_CHECKS.filter((c) => c !== WITHHELD)) {
    const r = await api('POST', `/api/refactored/admin/releases/${releaseId}/checks`, {
      check: c, outcome: 'pass',
    });
    if (r.status !== 201) check(`recording ${c}`, r.status, 201);
  }

  const oneMissing = await api('GET', `/api/refactored/admin/releases/${releaseId}/gate`);
  check('with one check withheld it is still NOT ready', oneMissing.body.ready, false);
  // The control. Without this, "not ready" could mean anything at all was missing, and the
  // test would pass even if the gate had stopped looking at accessibility specifically.
  const checkBlockers = (oneMissing.body.blockers || []).filter((b) => b.check !== '(release)');
  check('  and the ONLY check blocking is the withheld one', checkBlockers.length, 1);
  check('  which is accessibility', checkBlockers[0] && checkBlockers[0].check, WITHHELD);
  check('  because it has no recorded result', checkBlockers[0] && checkBlockers[0].rule, 'check_missing');

  // --- 'not_run' is not 'pass' ---------------------------------------------------------
  // Recording the check without measuring it is the cheapest way to make a gate go quiet.
  await api('POST', `/api/refactored/admin/releases/${releaseId}/checks`, {
    check: WITHHELD, outcome: 'not_run', detail: 'no a11y run configured',
  });
  const notRun = await api('GET', `/api/refactored/admin/releases/${releaseId}/gate`);
  check("a recorded 'not_run' does NOT satisfy the gate", notRun.body.ready, false);
  check(
    '  it blocks as not_run, distinct from missing',
    (notRun.body.blockers || []).find((b) => b.check === WITHHELD)?.rule,
    'check_not_run',
  );

  // --- approval is refused, and writes nothing -----------------------------------------
  const refused = await api('POST', `/api/refactored/admin/releases/${releaseId}/approve`);
  check('approval is refused while the gate blocks', refused.status, 409);
  const afterRefusal = await DeliveryRelease.findOne({ where: { id: releaseId } });
  check('  and NO approver was written', afterRefusal.approved_by_identity_id, null);
  check('  and the status is untouched', afterRefusal.status, 'candidate');

  // --- a waiver without a reason is refused --------------------------------------------
  // The governance half of this scenario. A waiver nobody justified is indistinguishable
  // later from the gate never having applied.
  const bareWaiver = await api('POST', `/api/refactored/admin/releases/${releaseId}/waivers`, {
    check: WITHHELD,
  });
  check('a waiver with NO reason is refused', bareWaiver.status, 422);
  check('  for the right reason', bareWaiver.body.reason, 'waiver_needs_reason');

  // --- a justified waiver -------------------------------------------------------------
  const waiver = await api('POST', `/api/refactored/admin/releases/${releaseId}/waivers`, {
    check: WITHHELD,
    reason: 'Agency accepted a documented WCAG exception for the legacy map embed.',
  });
  check('a JUSTIFIED waiver is accepted', waiver.status, 201);
  check('  and the reason is stored with it', (waiver.body.waived || [])[0]?.reason?.includes('WCAG'), true);

  const waived = await api('GET', `/api/refactored/admin/releases/${releaseId}/gate`);
  // The observable this scenario exists for.
  check('the waived check appears in WAIVED', (waived.body.waived || []).includes(WITHHELD), true);
  check('  and NOT in passed', (waived.body.passed || []).includes(WITHHELD), false);
  const remaining = (waived.body.blockers || []).map((b) => b.rule);
  check('  the only thing left is the human approver', remaining.join(','), 'approver_missing');

  // --- approval now succeeds -----------------------------------------------------------
  const approved = await api('POST', `/api/refactored/admin/releases/${releaseId}/approve`);
  check('approval succeeds once the gate is satisfied', approved.status, 200);
  check('  and the gate reports ready', approved.body.ready, true);

  const finalRow = await DeliveryRelease.findOne({ where: { id: releaseId } });
  check('  the approver is recorded', finalRow.approved_by_identity_id, approver.id);
  check('  with a timestamp', finalRow.approved_at != null, true);
  check('  and the status advanced', finalRow.status, 'approved');
  // The waiver survives approval. If it were folded away at this point, the finished
  // record would claim a clean government release that never had an accessibility run.
  const survivingWaiver = (finalRow.waived_categories || [])[0];
  check('  and the waiver is STILL on the record', survivingWaiver?.check, WITHHELD);
  check('    with its justification intact', survivingWaiver?.reason?.includes('WCAG'), true);

  console.log(`\n[D] ${failures === 0 ? 'SCENARIO D PASSED' : `SCENARIO D FAILED (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[D] ERROR: ${err.message}`);
  process.exit(1);
});
