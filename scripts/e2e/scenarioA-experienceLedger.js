#!/usr/bin/env node
/**
 * E2E scenario A — an Experience Ledger claim that is earned, not asserted.
 *
 * From `docs/architecture/refactored-delivery-os/E2E_SCENARIOS.md`:
 *
 *     intern -> idea -> discovery -> requirements -> design -> story
 *     -> Claude Code -> tests -> evidence -> Experience Ledger
 *
 * **Proves it:** an `experience_claims` row that is *earned* — traceable to a
 * `delivery_evidence` row, with `builderDidTheWork` true.
 *
 * **Why that observable:** *"the ledger is the only artifact in the chain that cannot be
 * produced by any single component acting alone."*
 *
 * ## What this covers, and what it HONESTLY does not
 *
 * Covered: the story exists, evidence is recorded against it through the real endpoint, the
 * quality gate is consulted, and a claim is earned from that specific evidence row and is
 * traceable back to it. The refusal paths are covered too, and they are the interesting
 * half.
 *
 * **NOT covered: `-> Claude Code ->`.** The evidence here is recorded through the evidence
 * endpoint, not produced by an autonomous agent run. Nothing in this script proves an agent
 * executed anything. Claiming otherwise would be the exact failure this document warns
 * about — a scenario marked done that quietly tested two thirds of itself.
 *
 * ## DEV ONLY
 *
 * Creates a project, a story, evidence and claims. Checks the live database name.
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
const STORY_KEY = 'E2E-A-1';

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
  const {
    DeliveryProject, DeliveryEngagement, DeliveryStory, DeliveryEvidence,
    DeliveryExperienceClaim, PlatformIdentity,
  } = models;
  const jwt = require('jsonwebtoken');
  const { env } = require(path.join(BACKEND_DIST, 'config/env'));

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', { type: QueryTypes.SELECT });
  if (!ALLOWED_DATABASES.includes(db)) throw new Error(`Refusing to run: connected to "${db}".`);
  console.log(`[A] database: ${db}`);

  const [tenant] = await sequelize.query(
    "SELECT id FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) throw new Error('No refactored tenant.');

  const email = 'e2e-a-intern@colaberry.com';
  let intern = await PlatformIdentity.findOne({ where: { primary_email: email } });
  if (!intern) {
    intern = await PlatformIdentity.create({ primary_email: email, display_name: 'E2E-A Intern' });
  }
  const mentorEmail = 'e2e-a-mentor@colaberry.com';
  let mentor = await PlatformIdentity.findOne({ where: { primary_email: mentorEmail } });
  if (!mentor) {
    mentor = await PlatformIdentity.create({ primary_email: mentorEmail, display_name: 'E2E-A Mentor' });
  }

  let engagement = await DeliveryEngagement.findOne({ where: { name: 'E2E-A engagement' } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({
      tenant_id: tenant.id, name: 'E2E-A engagement', status: 'active',
    });
  }
  let project = await DeliveryProject.findOne({ where: { slug: 'e2e-a-sandbox' } });
  if (!project) {
    project = await DeliveryProject.create({
      engagement_id: engagement.id, tenant_id: tenant.id,
      name: 'E2E-A intern sandbox', slug: 'e2e-a-sandbox',
      status: 'build', project_class: 'sandbox',
    });
  }

  // Clean slate so idempotency assertions are about this run.
  await DeliveryExperienceClaim.destroy({ where: { builder_identity_id: intern.id } });
  await DeliveryEvidence.destroy({ where: { delivery_project_id: project.id } });
  await DeliveryStory.destroy({ where: { delivery_project_id: project.id } });
  console.log(`[A] intern ${intern.id} on project ${project.id}`);

  const adminToken = jwt.sign(
    { id: mentor.id, platform_identity_id: mentor.id, email: mentorEmail, role: 'super_admin' },
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

  console.log('\n[A] assertions');

  // --- the story ------------------------------------------------------------------------
  const story = await api('POST', `/api/refactored/admin/projects/${project.id}/stories`, {
    contract: {
      storyId: STORY_KEY,
      title: 'Intern sandbox: add a CSV export to the reporting page',
      businessOutcome: 'An analyst can take the weekly numbers into a spreadsheet.',
      acceptanceCriteria: [
        'A download button appears on the reporting page.',
        'The file contains the same rows the page displays.',
      ],
      requirements: ['REQ-A-1'],
    },
    isUiStory: true,
  });
  check('a story contract is accepted', story.status, 201);

  // --- evidence, recorded through the real endpoint ---------------------------------------
  const evidence = await api('POST', `/api/refactored/admin/projects/${project.id}/evidence`, {
    dimension: 'requirements_coverage',
    evidenceType: 'pull_request',
    outcome: 'pass',
    sourceRef: 'https://github.com/example/repo/pull/1',
    subjectSha: 'a'.repeat(40),
  });
  check('evidence is recorded', evidence.status, 201);
  const evidenceId = evidence.body.evidenceId || evidence.body.id;

  // --- the claim: refusals first ----------------------------------------------------------
  // Silence is not consent. An omitted attestation would otherwise earn a claim, which is
  // credit for attendance by another name.
  const noAttestation = await api('POST', `/api/refactored/admin/builders/${intern.id}/claims`, {
    claimType: 'requirements_authored', evidenceId,
  });
  check('a claim with NO attestation is refused', noAttestation.status, 422);
  check('  for the right reason', noAttestation.body.reason, 'attestation_required');

  const attendanceOnly = await api('POST', `/api/refactored/admin/builders/${intern.id}/claims`, {
    claimType: 'requirements_authored', evidenceId, builderDidTheWork: false,
  });
  check('an attendance-only claim is refused', attendanceOnly.status, 422);
  check(
    '  as attendance_only',
    (attendanceOnly.body.rejections || []).some((r) => r.rule === 'attendance_only'),
    true,
  );

  // A pull request cannot evidence an architecture decision, whatever the caller says.
  const wrongEvidence = await api('POST', `/api/refactored/admin/builders/${intern.id}/claims`, {
    claimType: 'architecture_decisions', evidenceId, builderDidTheWork: true, humanConfirmed: true,
  });
  check('evidence that cannot substantiate the claim is refused', wrongEvidence.status, 422);
  check(
    '  as evidence_cannot_substantiate',
    (wrongEvidence.body.rejections || []).some((r) => r.rule === 'evidence_cannot_substantiate'),
    true,
  );

  const claimedSoFar = await DeliveryExperienceClaim.count({ where: { builder_identity_id: intern.id } });
  check('  and NOTHING was written by any refusal', claimedSoFar, 0);

  // --- the earned claim ---------------------------------------------------------------------
  const earned = await api('POST', `/api/refactored/admin/builders/${intern.id}/claims`, {
    claimType: 'requirements_authored', evidenceId, builderDidTheWork: true,
  });
  check('the claim is EARNED', earned.status, 201);
  check('  in the application band', earned.body.band, 'application');

  // --- THE observable: traceable to the evidence row ------------------------------------------
  const row = await DeliveryExperienceClaim.findOne({ where: { builder_identity_id: intern.id } });
  check('the claim is traceable to the evidence row', row.evidence_id, evidenceId);
  check('  with the attestation recorded', row.builder_did_the_work, true);
  check('  and who attested it', row.attested_by_identity_id, mentor.id);
  // Copied from the evidence at claim time, so the ledger records what it was judged on.
  check('  and what it was judged on', row.evidence_type, 'pull_request');

  const backing = await DeliveryEvidence.findOne({ where: { id: row.evidence_id } });
  check('  and that evidence row genuinely exists', backing != null, true);
  check('    on the same project', backing.delivery_project_id, project.id);

  // --- the ledger reads back ------------------------------------------------------------------
  const ledger = await api('GET', `/api/refactored/admin/builders/${intern.id}/ledger`);
  check('the ledger reports the earned claim', ledger.body.earnedByType?.requirements_authored, 1);

  // --- replay ----------------------------------------------------------------------------------
  const replay = await api('POST', `/api/refactored/admin/builders/${intern.id}/claims`, {
    claimType: 'requirements_authored', evidenceId, builderDidTheWork: true,
  });
  check('replaying the claim is not a second achievement', replay.status, 200);
  const total = await DeliveryExperienceClaim.count({ where: { builder_identity_id: intern.id } });
  check('  still exactly one claim', total, 1);

  console.log(`\n[A] ${failures === 0 ? 'SCENARIO A PASSED (PARTIAL)' : `SCENARIO A FAILED (${failures})`}`);
  console.log('[A] NOT covered: the "-> Claude Code ->" leg. Evidence here is recorded through');
  console.log('[A] the evidence endpoint, not produced by an autonomous agent run. Nothing in');
  console.log('[A] this script proves an agent executed anything.');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[A] ERROR: ${err.message}`);
  process.exit(1);
});
