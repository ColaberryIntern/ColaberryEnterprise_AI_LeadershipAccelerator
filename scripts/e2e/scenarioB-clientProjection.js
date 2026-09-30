#!/usr/bin/env node
/**
 * E2E scenario B (projection half) — a client sees the engagement and nothing else.
 *
 * From `docs/architecture/refactored-delivery-os/E2E_SCENARIOS.md`:
 *
 *     **Proves it:** ... a client-surface HTTP response body containing **no**
 *     builder-shaped fields.
 *
 *     **Why that observable:** asserting on the response body rather than the rendered
 *     page is the whole point of Gate 10's server-side projection. A DOM assertion
 *     would pass on a page that received private data and chose not to draw it.
 *
 * ## What this covers, and what it does not
 *
 * B's full chain ends in a `delivery_client_acceptances` row whose snapshots match what
 * the client saw. **Nothing writes acceptances yet**, so that half cannot be executed
 * and is not claimed. This runs the half that can be: the projection.
 *
 * Saying so matters more than the coverage. A scenario marked "executed" that quietly
 * tested a third of itself is worse than one marked "partial", because the first one
 * stops anybody looking again.
 *
 * ## Why it writes private data first
 *
 * A leak test against a project with nothing private in it proves nothing — the
 * response would be clean because there was nothing to leak. So this stamps genuinely
 * private, genuinely builder-shaped values onto the row the client CAN reach, then
 * asserts none of them survive the projection. That is the only version of this test
 * that can fail for the right reason.
 *
 * B's blocker in the spec was client identity, which magic-link sign-in resolved.
 *
 * DEV ONLY — writes to delivery rows and checks the live database name.
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

/** Private values stamped onto the reachable project, each a different leak shape. */
const CANARIES = {
  // A column the client allowlist deliberately omits: our internal analysis of how
  // they work today, not something they asked to be shown.
  workflow_summary: 'CANARY-workflow-internal-analysis',
  existing_system_summary: 'CANARY-existing-system-teardown',
  // Operational fields that describe how WE build, not what they are owed.
  delivery_profile_key: 'CANARY-profile-key',
  trust_profile_key: 'CANARY-trust-key',
};

async function main() {
  const { sequelize } = require(path.join(BACKEND_DIST, 'config/database'));
  const { QueryTypes } = require('sequelize');
  const { DeliveryProject, DeliveryProjectMember, PlatformIdentity, DeliveryRelease, DeliveryClientAcceptance } = require(path.join(BACKEND_DIST, 'models'));
  const { findForbiddenFields, CLIENT_FIELD_ALLOWLIST } = require(path.join(BACKEND_DIST, 'modules/delivery/clientVisibility'));
  const {
    CLIENT_TOKEN_AUDIENCE, CLIENT_TOKEN_TTL_SECONDS, CLIENT_TOKEN_TYPE,
  } = require(path.join(BACKEND_DIST, 'modules/delivery/clientAuth'));
  const jwt = require('jsonwebtoken');
  const { env } = require(path.join(BACKEND_DIST, 'config/env'));

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', { type: QueryTypes.SELECT });
  if (!ALLOWED_DATABASES.includes(db)) throw new Error(`Refusing to run: connected to "${db}".`);
  console.log(`[B] database: ${db}`);

  const project = await DeliveryProject.findOne({ where: { slug: 'dev-demo-engagement' } });
  if (!project) throw new Error('Run seedDevClientReviewer.ts first.');

  // Stamp the canaries. Without them the response is clean for the wrong reason.
  await project.update(CANARIES);
  console.log(`[B] stamped ${Object.keys(CANARIES).length} private values on ${project.id}`);

  const identity = await PlatformIdentity.findOne({ where: { primary_email: 'ali@colaberry.com' } });
  const membership = await DeliveryProjectMember.findOne({
    where: { platform_identity_id: identity.id, delivery_project_id: project.id },
  });
  if (!membership) throw new Error('No membership — the session would be refused for the wrong reason.');

  const token = jwt.sign(
    {
      sub: identity.id,
      email: 'ali@colaberry.com',
      display_name: 'ali',
      token_type: CLIENT_TOKEN_TYPE,
      delivery_project_ids: [project.id],
    },
    env.jwtSecret,
    { audience: CLIENT_TOKEN_AUDIENCE, expiresIn: CLIENT_TOKEN_TTL_SECONDS },
  );

  const res = await fetch(`${BASE_URL}/api/refactored/client/projects/${project.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bodyText = await res.text();
  const body = JSON.parse(bodyText);

  console.log('\n[B] assertions');

  // Control: a 404 here would make every leak assertion below pass vacuously.
  check('the client can actually reach the project', res.status, 200);

  // The scenario's stated observable.
  for (const [field, value] of Object.entries(CANARIES)) {
    check(`"${field}" does not reach the client`, bodyText.includes(value), false);
  }

  // The tripwire's own categories — agent scratchpads, mentor notes, builder
  // assessments, secrets, engineering logs — scanned against the real payload.
  const hits = findForbiddenFields(body);
  check('no forbidden-category field in the response', hits.length, 0);
  if (hits.length) console.log(`  leaked: ${hits.map((h) => `${h.path}:${h.category}`).join(', ')}`);

  // Every key present must be one the allowlist names. This catches a leak the
  // canaries did not anticipate, which is the more likely kind.
  const allowedProjectKeys = new Set(CLIENT_FIELD_ALLOWLIST.project);
  const unexpected = Object.keys(body.project || {}).filter((k) => !allowedProjectKeys.has(k));
  check('no project key outside the allowlist', unexpected.length, 0);
  if (unexpected.length) console.log(`  unexpected keys: ${unexpected.join(', ')}`);

  // Restore, so a demo click-through is not left showing canary text.
  await project.update({
    workflow_summary: null,
    existing_system_summary: null,
    delivery_profile_key: null,
    trust_profile_key: null,
  });
  console.log('[B] canaries removed');

  // --- THE ACCEPTANCE HALF -------------------------------------------------------------
  //
  // B's full observable is a delivery_client_acceptances row whose promised_acceptance,
  // preview_ref and evidence_summary match WHAT THE CLIENT SAW. Nothing wrote acceptances
  // until clientAcceptance.ts, so this half has never run before.
  //
  // The property under test is that the CLIENT does not get to say what they were shown.
  await project.update({ delivery_profile_key: 'commercial_standard' });
  await DeliveryClientAcceptance.destroy({ where: { delivery_project_id: project.id } });
  await DeliveryRelease.destroy({ where: { delivery_project_id: project.id } });

  const release = await DeliveryRelease.create({
    delivery_project_id: project.id,
    version: `9.9.9-e2e-${Date.now()}`,
    status: 'approved',
    profile_key: 'commercial_standard',
    candidate_sha: 'deadbeef',
    check_results: [{ check: 'tests', outcome: 'pass', detail: null }],
    waived_categories: [
      { check: 'accessibility', reason: 'Client accepted a documented WCAG exception.',
        waivedByIdentityId: null, waivedAt: new Date().toISOString() },
    ],
  });

  const acceptUrl = `${BASE_URL}/api/refactored/client/projects/${project.id}/acceptances`;
  const postAccept = async (body) => {
    const r = await fetch(acceptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  // A client cannot describe what they were shown. These fields are ignored - there is no
  // parameter for them - and the snapshot is built from the release.
  const accepted = await postAccept({
    scopeKind: 'release',
    releaseId: release.id,
    status: 'accepted',
    comments: 'Looks right to us.',
    promisedAcceptance: ['I was promised a pony'],
    evidenceSummary: ['everything was perfect'],
  });
  check('the client can record an acceptance', accepted.status, 201);

  const row = await DeliveryClientAcceptance.findOne({
    where: { delivery_project_id: project.id },
  });
  check('an acceptance row exists', row != null, true);
  // THE observable.
  // Compared field by field, not by JSON.stringify: Postgres returns JSONB with its keys
  // alphabetised, so a string comparison fails on identical data. The first version of this
  // assertion did exactly that and reported a defect that was not there.
  check('the snapshot has exactly the release checks', (row.promised_acceptance || []).length, 1);
  check('  the check name is from the release', row.promised_acceptance[0].check, 'tests');
  check('  and its outcome', row.promised_acceptance[0].outcome, 'pass');
  check('  the invented promise from the client did not land', JSON.stringify(row.promised_acceptance).includes('pony'), false);
  check('  the invented evidence from the client did not land', JSON.stringify(row.evidence_summary).includes('perfect'), false);
  check('  preview_ref pins the candidate sha', row.preview_ref, 'sha:deadbeef');
  // A waiver the client signed over must be on the record they signed.
  check('  the WAIVER travelled into the snapshot', JSON.stringify(row.evidence_summary).includes('WCAG'), true);
  // The acceptor is the session, not a body field.
  check('  the acceptor is the session identity', row.accepted_by_identity_id, identity.id);
  check('  and it is timestamped', row.accepted_at != null, true);

  // Idempotent: a second click is not a second acceptance.
  const again = await postAccept({ scopeKind: 'release', releaseId: release.id, status: 'accepted' });
  check('a second click records no second acceptance', again.status, 201);
  const count = await DeliveryClientAcceptance.count({ where: { delivery_project_id: project.id } });
  check('  still exactly one acceptance row', count, 1);

  // An acceptance against a release that does not exist is a signature on nothing.
  const bogus = await postAccept({
    scopeKind: 'release', releaseId: '00000000-0000-4000-8000-000000000000', status: 'accepted',
  });
  check('an acceptance against an unknown release is refused', bogus.status, 404);

  await DeliveryClientAcceptance.destroy({ where: { delivery_project_id: project.id } });
  await DeliveryRelease.destroy({ where: { delivery_project_id: project.id } });
  await project.update({ delivery_profile_key: null });

  console.log(`
[B] ${failures === 0 ? 'SCENARIO B PASSED (both halves)' : `SCENARIO B FAILED (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[B] ERROR: ${err.message}`);
  process.exit(1);
});
