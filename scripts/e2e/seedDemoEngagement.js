#!/usr/bin/env node
/**
 * Seed one complete engagement so the client portal has something to show.
 *
 * ## Why this exists
 *
 * Every delivery table is live and every gate is wired, and the delivery tables are
 * **empty** — on production entirely, and on dev only where a scenario left rows behind.
 * So `/client/projects` renders its empty state, correctly, and nobody can look at the
 * thing and judge it.
 *
 * This creates one engagement with the shape a real one has: a project with a stated
 * problem, decisions in both states, a change request, and **a release that shipped with a
 * mandatory check waived** — which is the one case the Releases section was built to render
 * honestly and the one nobody would think to construct by hand.
 *
 * ## DEV ONLY
 *
 * Refuses to run against anything but a known dev database. It writes real rows.
 *
 *   node scripts/e2e/seedDemoEngagement.js <client-email>
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
const CLIENT_EMAIL = process.argv[2] || 'ali@colaberry.com';

async function main() {
  const { sequelize } = require(path.join(BACKEND_DIST, 'config/database'));
  const { QueryTypes } = require('sequelize');
  const models = require(path.join(BACKEND_DIST, 'models'));
  const {
    DeliveryProject, DeliveryEngagement, DeliveryDecision, DeliveryChangeRequest,
    DeliveryRelease, DeliveryProjectMember, PlatformIdentity,
  } = models;

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', { type: QueryTypes.SELECT });
  if (!ALLOWED_DATABASES.includes(db)) throw new Error(`Refusing to seed: connected to "${db}".`);
  console.log(`[seed] database: ${db}`);

  const [tenant] = await sequelize.query(
    "SELECT id FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) throw new Error('No refactored tenant.');

  // The reviewer. Must be a real PlatformIdentity: sign-in stamps project ids onto the
  // token from memberships that already exist, so an identity with no membership gets a
  // session that can reach nothing.
  let identity = await PlatformIdentity.findOne({ where: { primary_email: CLIENT_EMAIL } });
  if (!identity) {
    identity = await PlatformIdentity.create({ primary_email: CLIENT_EMAIL, display_name: 'Client reviewer' });
  }

  let engagement = await DeliveryEngagement.findOne({ where: { name: 'Meridian Freight' } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({
      tenant_id: tenant.id,
      name: 'Meridian Freight',
      status: 'active',
      start_at: new Date('2026-07-14T00:00:00Z'),
      target_end_at: new Date('2026-09-30T00:00:00Z'),
    });
  }

  let project = await DeliveryProject.findOne({ where: { slug: 'meridian-dispatch-intelligence' } });
  if (!project) {
    project = await DeliveryProject.create({
      engagement_id: engagement.id,
      tenant_id: tenant.id,
      name: 'Dispatch Intelligence',
      slug: 'meridian-dispatch-intelligence',
      status: 'build',
      project_class: 'client',
      delivery_profile_key: 'commercial_standard',
    });
  }
  await project.update({
    business_problem:
      'Dispatchers rebuild the same load-assignment spreadsheet every morning, and the answer '
      + 'is stale by the time the first driver calls in.',
    product_idea:
      'A dispatch board that ranks open loads against available drivers continuously, and '
      + 'explains each ranking in a sentence a dispatcher can argue with.',
  });

  // Clean the child rows so re-running is not additive.
  await DeliveryDecision.destroy({ where: { delivery_project_id: project.id } });
  await DeliveryChangeRequest.destroy({ where: { delivery_project_id: project.id } });
  await DeliveryRelease.destroy({ where: { delivery_project_id: project.id } });

  await DeliveryDecision.bulkCreate([
    {
      delivery_project_id: project.id,
      decision_type: 'product',
      question: 'Should the board auto-assign loads, or recommend only?',
      recommendation: 'Recommend only.',
      final_decision: 'Recommend only.',
      rationale:
        'Dispatchers keep the final call, and every recommendation carries its reasoning so it '
        + 'can be overruled with cause.',
      status: 'decided',
      decided_at: new Date('2026-08-04T00:00:00Z'),
    },
    {
      delivery_project_id: project.id,
      decision_type: 'architecture',
      question: 'Which driver-hours source is authoritative?',
      recommendation: 'The ELD feed, over the manual log.',
      rationale:
        'The manual log lags by up to a shift, so building on it would make the board '
        + 'confidently wrong at exactly the moment it matters.',
      status: 'open',
    },
  ]);

  await DeliveryChangeRequest.bulkCreate([
    {
      delivery_project_id: project.id,
      title: 'Show trailer type on the load card',
      description: 'Dispatchers are cross-referencing a second screen to check trailer compatibility.',
      impact_summary: 'Adds a field to the load feed. No change to the ranking logic or the date.',
      status: 'accepted',
      requested_at: new Date('2026-08-22T00:00:00Z'),
    },
    {
      delivery_project_id: project.id,
      title: 'Add a second dispatch region',
      description: 'Extend the board to cover the Gulf region alongside Midwest.',
      impact_summary: 'Doubles the load feed and needs a second ELD connection. Moves the target date.',
      status: 'open',
      requested_at: new Date('2026-08-29T00:00:00Z'),
    },
  ]);

  // The release worth looking at: shipped, with a mandatory check WAIVED and the reason on
  // the record. Everything else about the Releases section is ordinary; this is the case it
  // exists to render honestly.
  await DeliveryRelease.create({
    delivery_project_id: project.id,
    version: 'R1 — Read-only dispatch board',
    status: 'approved',
    profile_key: 'commercial_standard',
    candidate_sha: 'a41f8c2e9b7d4c1f8a3e6b2d9c5f1a8e4b7d2c6f',
    approved_at: new Date('2026-08-19T10:00:00Z'),
    approved_by_identity_id: identity.id,
    check_results: [
      { check: 'stories_complete', outcome: 'pass', detail: null },
      { check: 'requirements_covered', outcome: 'pass', detail: null },
      { check: 'tests', outcome: 'pass', detail: null },
      { check: 'browser', outcome: 'pass', detail: null },
      { check: 'security', outcome: 'pass', detail: null },
      { check: 'client_acceptance', outcome: 'pass', detail: null },
    ],
    waived_categories: [
      {
        check: 'accessibility',
        reason:
          'Internal dispatcher tool behind SSO, not a public surface. Agreed with Meridian to '
          + 'defer the WCAG audit to R2, when the driver-facing view ships.',
        waivedByIdentityId: identity.id,
        waivedAt: new Date('2026-08-18T00:00:00Z').toISOString(),
      },
    ],
  });

  // Membership is what the session is built from.
  const existing = await DeliveryProjectMember.findOne({
    where: { delivery_project_id: project.id, platform_identity_id: identity.id },
  });
  if (!existing) {
    await DeliveryProjectMember.create({
      delivery_project_id: project.id,
      platform_identity_id: identity.id,
      delivery_role: 'client_reviewer',
      status: 'active',
      granted_by_identity_id: identity.id,
    });
  }

  console.log('');
  console.log(`[seed] engagement  ${engagement.name}`);
  console.log(`[seed] project     ${project.name}  (${project.id})`);
  console.log(`[seed] reviewer    ${CLIENT_EMAIL}  (${identity.id})`);
  console.log('[seed] 2 decisions, 2 change requests, 1 release with 1 WAIVED check');
  process.exit(0);
}

main().catch((err) => {
  console.error(`[seed] ERROR: ${err.message}`);
  process.exit(1);
});
