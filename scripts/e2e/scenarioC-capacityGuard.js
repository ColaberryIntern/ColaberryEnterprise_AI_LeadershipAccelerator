#!/usr/bin/env node
/**
 * E2E scenario C — multi-project builder, capacity guard, override, expiry.
 *
 * From `docs/architecture/refactored-delivery-os/E2E_SCENARIOS.md`:
 *
 *     qualified builder -> 3 projects -> capacity model
 *     -> parallel-safe runs -> overload guard -> mentor
 *
 * **Proves it:** the fourth concurrent assignment is refused by `assessOverload`, and a
 * `builder_overloaded` mentor exception appears — then an expiring override lifts the
 * cap and `reliesOnOverride` is true.
 *
 * **Why that observable:** *"the override expiry is the part that rots silently. A run
 * that only tests the refusal would pass forever while the expiry logic quietly broke."*
 *
 * ## Why this could not be written until now
 *
 * `assessOverload` had **zero production callers**, and there was no assignment path at
 * all — so there was nothing to refuse. A script calling the pure function directly would
 * have duplicated `capacityEconomics.test.ts` while looking like an executed scenario.
 *
 * This drives the real HTTP endpoint instead. Every assertion below is about what the
 * SYSTEM does, not what the arithmetic does.
 *
 * ## DEV ONLY
 *
 * Creates projects, an authority profile, memberships and an override. Checks the live
 * database name rather than an environment variable.
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
const CAP = 3;

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: expected ${expected}, got ${actual}`);
};

async function main() {
  const { sequelize } = require(path.join(BACKEND_DIST, 'config/database'));
  const { QueryTypes, Op } = require('sequelize');
  const models = require(path.join(BACKEND_DIST, 'models'));
  const {
    DeliveryProject, DeliveryEngagement, DeliveryProjectMember,
    PlatformIdentity, BuilderAuthorityProfile, DeliveryCapacityOverride,
  } = models;
  const jwt = require('jsonwebtoken');
  const { env } = require(path.join(BACKEND_DIST, 'config/env'));

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', { type: QueryTypes.SELECT });
  if (!ALLOWED_DATABASES.includes(db)) throw new Error(`Refusing to run: connected to "${db}".`);
  console.log(`[C] database: ${db}`);

  const [tenant] = await sequelize.query(
    "SELECT id FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) throw new Error('No refactored tenant.');

  // --- a qualified builder, capped at 3 ----------------------------------------------
  const email = 'e2e-c-builder@colaberry.com';
  let builder = await PlatformIdentity.findOne({ where: { primary_email: email } });
  if (!builder) builder = await PlatformIdentity.create({ primary_email: email, display_name: 'E2E-C Builder' });

  await BuilderAuthorityProfile.destroy({ where: { platform_identity_id: builder.id } });
  await BuilderAuthorityProfile.create({
    platform_identity_id: builder.id,
    builder_level: 'builder',
    max_parallel_projects: CAP,
  });
  console.log(`[C] builder ${builder.id} capped at ${CAP}`);

  // Clean slate, so a rerun does not start already overloaded.
  await DeliveryProjectMember.destroy({ where: { platform_identity_id: builder.id } });
  await DeliveryCapacityOverride.destroy({ where: { builder_identity_id: builder.id } });

  // --- four projects to assign across ------------------------------------------------
  let engagement = await DeliveryEngagement.findOne({ where: { name: 'E2E-C engagement' } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({
      tenant_id: tenant.id, name: 'E2E-C engagement', status: 'active',
    });
  }
  const projects = [];
  for (let i = 1; i <= CAP + 1; i += 1) {
    const slug = `e2e-c-project-${i}`;
    let p = await DeliveryProject.findOne({ where: { slug } });
    if (!p) {
      p = await DeliveryProject.create({
        engagement_id: engagement.id, tenant_id: tenant.id,
        name: `E2E-C project ${i}`, slug, status: 'build', project_class: 'sandbox',
      });
    }
    projects.push(p);
  }

  // --- an admin session to drive the real endpoint ------------------------------------
  const adminToken = jwt.sign(
    { id: 'e2e-c-admin', email: 'e2e-c-admin@colaberry.com', role: 'super_admin' },
    env.jwtSecret,
    { expiresIn: 600 },
  );

  const assign = async (projectId) => {
    const res = await fetch(`${BASE_URL}/api/refactored/admin/projects/${projectId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ builderIdentityId: builder.id, role: 'builder' }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  console.log('\n[C] assertions');

  // --- the first three fit ------------------------------------------------------------
  for (let i = 0; i < CAP; i += 1) {
    const r = await assign(projects[i].id);
    check(`assignment ${i + 1} of ${CAP} is accepted`, r.status, 201);
  }

  // --- the fourth is refused ----------------------------------------------------------
  const fourth = await assign(projects[CAP].id);
  check('the FOURTH assignment is refused', fourth.status, 409);
  check('  refused for capacity, not something else', fourth.body.reason, 'overloaded');

  // The refusal must not have written the row. A guard that says no and assigns anyway
  // is worse than no guard, because it reports safety it did not deliver.
  const afterRefusal = await DeliveryProjectMember.count({
    where: { platform_identity_id: builder.id, delivery_role: 'builder', status: 'active' },
  });
  check('  and nothing was written', afterRefusal, CAP);

  // --- a live override lifts the cap --------------------------------------------------
  await DeliveryCapacityOverride.create({
    builder_identity_id: builder.id,
    granted_by_identity_id: builder.id,
    base_max_parallel_projects: CAP,
    override_max_parallel_projects: CAP + 2,
    reason: 'E2E scenario C — temporary surge cover',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const withOverride = await assign(projects[CAP].id);
  check('a LIVE override admits the fourth', withOverride.status, 201);
  check('  and the reliance is surfaced', withOverride.body.reliesOnOverride, true);

  // --- the part that rots silently ----------------------------------------------------
  // Expire it and try a fifth. If expiry ever broke, everything above would still pass.
  await DeliveryCapacityOverride.update(
    { expires_at: new Date(Date.now() - 60 * 1000) },
    { where: { builder_identity_id: builder.id } },
  );
  // Need a fifth project: the builder now holds 4.
  let fifth = await DeliveryProject.findOne({ where: { slug: 'e2e-c-project-5' } });
  if (!fifth) {
    fifth = await DeliveryProject.create({
      engagement_id: engagement.id, tenant_id: tenant.id,
      name: 'E2E-C project 5', slug: 'e2e-c-project-5', status: 'build', project_class: 'sandbox',
    });
  }
  const afterExpiry = await assign(fifth.id);
  check('an EXPIRED override no longer lifts the cap', afterExpiry.status, 409);
  check('  refused for capacity', afterExpiry.body.reason, 'overloaded');

  // --- a client-side role must not travel this path -----------------------------------
  const clientRole = await fetch(`${BASE_URL}/api/refactored/admin/projects/${fifth.id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ builderIdentityId: builder.id, role: 'client_reviewer' }),
  });
  check('a client-side role is refused by the builder path', clientRole.status, 422);

  console.log(`\n[C] ${failures === 0 ? 'SCENARIO C PASSED' : `SCENARIO C FAILED (${failures})`}`);
  console.log('[C] NOT covered: the builder_overloaded MENTOR EXCEPTION half — mentorExceptions');
  console.log('[C] is still unwired, so no exception is raised by this path yet.');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[C] ERROR: ${err.message}`);
  process.exit(1);
});
