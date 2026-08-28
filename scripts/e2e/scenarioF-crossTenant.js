#!/usr/bin/env node
/**
 * E2E scenario F — cross-tenant attack, denied without enumeration.
 *
 * From `docs/architecture/refactored-delivery-os/E2E_SCENARIOS.md`:
 *
 *     AI Flotation user -> CPN/Colaberry foreign project
 *     -> denied without enumeration -> TenantAccessAudit
 *
 * **Proves it:** the response is 404, NOT 403, for a project that genuinely exists in
 * another tenant, and a `TenantAccessAudit` row records the attempt.
 *
 * ## Why this needs to be executed rather than reasoned about
 *
 * The spec says it plainly: 403 confirms the resource exists, and the distinction
 * between "you may not see this" and "this is not here" is the entire difference
 * between a denial and a disclosure. It is invisible unless something asserts on the
 * status code specifically — which no unit test can do, because the property only
 * exists once a real session meets a real foreign row through the real guard.
 *
 * The 404 was previously spot-checked against a RANDOM uuid. That proves less than it
 * looks: an id matching nothing returns 404 from almost any implementation. The
 * scenario requires a project that **actually exists and belongs to someone else**,
 * which is the only case where a 403-shaped implementation would differ.
 *
 * ## DEV ONLY
 *
 * Creates a foreign tenant's project. Refuses to run against anything but the dev
 * database, checked against the live connection rather than an environment variable —
 * `DB_NAME` on the dev container reads `accelerator_prod` while the app genuinely
 * connects to `accelerator_dev1`, so the env var is not evidence.
 *
 * Usage (inside the dev backend container):
 *   node dist/../scripts/e2e/scenarioF-crossTenant.js
 * or via docker exec with the repo mounted.
 */

const ALLOWED_DATABASES = ['accelerator_dev1', 'accelerator_dev', 'accelerator_test'];
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: expected ${expected}, got ${actual}`);
  return ok;
};

async function main() {
  const { sequelize } = require('../../backend/dist/config/database');
  const { QueryTypes } = require('sequelize');
  const {
    DeliveryProject,
    DeliveryEngagement,
    DeliveryProjectMember,
    PlatformIdentity,
    TenantAccessAudit,
  } = require('../../backend/dist/models');
  const {
    CLIENT_TOKEN_AUDIENCE,
    CLIENT_TOKEN_TTL_SECONDS,
    CLIENT_TOKEN_TYPE,
  } = require('../../backend/dist/modules/delivery/clientAuth');
  const jwt = require('jsonwebtoken');
  const { env } = require('../../backend/dist/config/env');

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', {
    type: QueryTypes.SELECT,
  });
  if (!ALLOWED_DATABASES.includes(db)) {
    throw new Error(`Refusing to run: connected to "${db}", not a dev database.`);
  }
  console.log(`[F] database: ${db}`);

  // --- two tenants, and a project in each -------------------------------------------
  const tenants = await sequelize.query(
    "SELECT id, slug, name FROM tenants WHERE slug IN ('refactored','cpn') ORDER BY slug",
    { type: QueryTypes.SELECT },
  );
  if (tenants.length < 2) throw new Error('Need two tenants (refactored, cpn) to run scenario F.');
  const cpn = tenants.find((t) => t.slug === 'cpn');
  const mine = tenants.find((t) => t.slug === 'refactored');
  console.log(`[F] own tenant: ${mine.name} | foreign tenant: ${cpn.name}`);

  const ownProject = await DeliveryProject.findOne({ where: { slug: 'dev-demo-engagement' } });
  if (!ownProject) throw new Error('Run seedDevClientReviewer.ts first — no own project to compare against.');

  // The foreign project must genuinely EXIST. A random id proves nothing.
  let foreignEngagement = await DeliveryEngagement.findOne({
    where: { name: 'E2E-F foreign engagement' },
  });
  if (!foreignEngagement) {
    foreignEngagement = await DeliveryEngagement.create({
      tenant_id: cpn.id,
      name: 'E2E-F foreign engagement',
      status: 'active',
    });
  }
  let foreignProject = await DeliveryProject.findOne({ where: { slug: 'e2e-f-foreign-project' } });
  if (!foreignProject) {
    foreignProject = await DeliveryProject.create({
      engagement_id: foreignEngagement.id,
      tenant_id: cpn.id,
      name: 'Foreign tenant project',
      slug: 'e2e-f-foreign-project',
      status: 'build',
      project_class: 'sandbox',
    });
  }
  console.log(`[F] foreign project exists: ${foreignProject.id}`);

  // --- a real client session, scoped to the OWN project only -------------------------
  const identity = await PlatformIdentity.findOne({ where: { primary_email: 'ali@colaberry.com' } });
  if (!identity) throw new Error('No PlatformIdentity for the test reviewer.');
  const membership = await DeliveryProjectMember.findOne({
    where: { platform_identity_id: identity.id, delivery_project_id: ownProject.id },
  });
  if (!membership) throw new Error('No membership — the session would be refused for the wrong reason.');

  const token = jwt.sign(
    {
      sub: identity.id,
      email: 'ali@colaberry.com',
      display_name: 'ali',
      token_type: CLIENT_TOKEN_TYPE,
      delivery_project_ids: [ownProject.id],
    },
    env.jwtSecret,
    { audience: CLIENT_TOKEN_AUDIENCE, expiresIn: CLIENT_TOKEN_TTL_SECONDS },
  );

  const call = async (id) => {
    const res = await fetch(`${BASE_URL}/api/refactored/client/projects/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.status;
  };

  console.log('\n[F] assertions');

  // Control: without this, a blanket 404 would look like a pass.
  check('own project is reachable', await call(ownProject.id), 200);

  // The scenario. 403 here would confirm the project exists — a disclosure.
  const foreignStatus = await call(foreignProject.id);
  check('EXISTING foreign-tenant project returns 404, not 403', foreignStatus, 404);
  if (foreignStatus === 403) {
    console.log('  ^ 403 confirms the resource exists. That is the enumeration this scenario exists to catch.');
  }

  // A non-existent id must be indistinguishable from a foreign one.
  check(
    'unknown id is indistinguishable from a foreign one',
    await call('00000000-0000-0000-0000-000000000000'),
    foreignStatus,
  );

  // --- the audit row -----------------------------------------------------------------
  // Give the fire-and-forget write a moment; it is deliberately not awaited by the guard.
  await new Promise((r) => setTimeout(r, 750));
  const audits = await TenantAccessAudit.findAll({
    where: { resource_id: foreignProject.id, decision: 'denied' },
    order: [['occurred_at', 'DESC']],
    limit: 1,
  });
  check('the attempt is recorded in TenantAccessAudit', audits.length > 0, true);
  if (audits.length) {
    const a = audits[0];
    console.log(`  recorded: resource_type=${a.resource_type} action=${a.action} reason=${a.reason}`);
  }

  console.log(`\n[F] ${failures === 0 ? 'SCENARIO F PASSED' : `SCENARIO F FAILED (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[F] ERROR: ${err.message}`);
  process.exit(1);
});
