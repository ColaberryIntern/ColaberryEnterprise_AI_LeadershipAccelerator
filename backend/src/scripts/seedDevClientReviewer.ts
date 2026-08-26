/**
 * seedDevClientReviewer — create a demo engagement on DEV and mint one client session.
 *
 * Ali chose this over configuring Google OAuth so he could test the client surface today.
 * It exists because the security model is working as intended: a Google account with no
 * delivery membership gets no session, so testing the surface requires a real membership,
 * and there is no UI that creates one yet.
 *
 * ## This is an operator tool, not a product backdoor
 *
 * It ships **no runtime code path**. Nothing in the running application calls it, and it
 * adds no route, flag or alternate credential. It writes rows the same way an admin
 * eventually will, then mints a token through the **same `jwt.sign` call with the same
 * audience** the real Google route uses. The session it produces is indistinguishable from
 * one earned through Google sign-in — same guard, same 8-hour expiry, same 404 on a
 * foreign project. Authorization is not weakened: the token carries only the memberships
 * that this script actually created.
 *
 * ## It refuses to run against production - and NOT by checking NODE_ENV
 *
 * This script originally hard-refused on `NODE_ENV === 'production'`. Measured against
 * the real containers, that check is not merely unreliable here, it is INVERTED:
 *
 *   dev container   NODE_ENV=production
 *   prod container  NODE_ENV unset
 *
 * So it refused the safe box and would have PERMITTED the dangerous one. It failed safe
 * on dev only by accident. NODE_ENV in this stack describes how the bundle was built, not
 * which environment it is serving, and nothing keeps the two aligned.
 *
 * The guards that remain interrogate the thing that actually matters - the live database
 * connection - and there are two of them, because one is a single typo away from failing:
 *
 *   1. The resolved database name must appear in `ALLOWED_DATABASES` (an allowlist, so an
 *      unrecognised database is refused rather than assumed safe).
 *   2. Neither the database name nor the connection host may contain a production marker
 *      (a denylist, which catches an allowlist entry that someone widens carelessly).
 *
 * Both ask the OPEN CONNECTION what it is attached to, never an environment variable.
 * That matters because of a second real trap here: the dev container's `DB_NAME` reads
 * `accelerator_prod` while compose's `environment:` block makes the app genuinely connect
 * to `accelerator_dev1`. A script trusting that variable would write to the wrong database
 * while believing otherwise.
 *
 * Usage:  npx ts-node src/scripts/seedDevClientReviewer.ts <email>
 */

import jwt from 'jsonwebtoken';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import {
  CLIENT_TOKEN_AUDIENCE,
  CLIENT_TOKEN_TTL_SECONDS,
  CLIENT_TOKEN_TYPE,
} from '../modules/delivery/clientAuth';

/** Databases this script may write to. Anything else is refused, including production. */
const ALLOWED_DATABASES = ['accelerator_dev1', 'accelerator_dev', 'accelerator_test'];

/**
 * Second, independent guard. Substrings that must never appear in the database name or
 * the host being written to, whatever the allowlist says. This exists to catch a future
 * edit that adds a prod-shaped name to ALLOWED_DATABASES without thinking.
 */
const PRODUCTION_MARKERS = ['prod', 'production', 'live'];

const DEMO_PROJECT_SLUG = 'dev-demo-engagement';

async function main(): Promise<void> {

  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Usage: seedDevClientReviewer.ts <email>');
  }

  // Ask the live connection, never the environment variable. See the header.
  const [{ current_database: db }] = await sequelize.query<{ current_database: string }>(
    'SELECT current_database()::text AS current_database',
    { type: QueryTypes.SELECT },
  );
  if (!ALLOWED_DATABASES.includes(db)) {
    throw new Error(
      `Refusing to seed: connected to "${db}", which is not in the allowed dev list.`,
    );
  }

  // Independent of the allowlist above, and checked against the live connection rather
  // than any configured value.
  const host = String((sequelize.config as { host?: unknown })?.host ?? '').toLowerCase();
  const marker = PRODUCTION_MARKERS.find(
    (m) => db.toLowerCase().includes(m) || host.includes(m),
  );
  if (marker) {
    throw new Error(
      `Refusing to seed: connection looks like production (matched "${marker}" in ` +
        `database "${db}" or host "${host}").`,
    );
  }

  console.log(`[seed] database: ${db} (host: ${host || 'unknown'})`);

  const models = require('../models');
  const {
    PlatformIdentity,
    DeliveryEngagement,
    DeliveryProject,
    DeliveryProjectMember,
    DeliveryDecision,
    Organization,
  } = models;

  // --- identity -----------------------------------------------------------------------
  // Idempotent by email: re-running must not create a second identity for the same person,
  // which would make the two-identity refusal fire on a problem this script caused.
  let identity = await PlatformIdentity.findOne({ where: { primary_email: email } });
  if (!identity) {
    identity = await PlatformIdentity.create({
      primary_email: email,
      display_name: email.split('@')[0],
    });
    console.log(`[seed] created PlatformIdentity ${identity.id}`);
  } else {
    console.log(`[seed] reusing PlatformIdentity ${identity.id}`);
  }

  // --- tenant -------------------------------------------------------------------------
  // Resolved by slug from the real tenants table, never invented. `delivery_engagements`
  // declares tenant_id NOT NULL, and a seed that minted its own tenant id would create a
  // row belonging to a tenant that does not exist - which is worse than failing here,
  // because every tenancy-scoped query would then quietly skip it.
  const [tenant] = await sequelize.query<{ id: string; name: string }>(
    "SELECT id, name FROM tenants WHERE slug = 'refactored' LIMIT 1",
    { type: QueryTypes.SELECT },
  );
  if (!tenant) {
    throw new Error(
      "No tenant with slug 'refactored' exists in this database. Refusing to invent one.",
    );
  }
  console.log(`[seed] tenant: ${tenant.name} (${tenant.id})`);

  // --- organization + engagement + project --------------------------------------------
  // ESC-1 in practice: a client organization with no owning enrollment. This row is the
  // reason that column was relaxed to nullable.
  let org = await Organization.findOne({ where: { name: 'Northwind Transit (demo)' } });
  if (!org) {
    org = await Organization.create({
      name: 'Northwind Transit (demo)',
      organization_type: 'client',
      owner_enrollment_id: null,
      tenant_id: tenant.id,
    });
    console.log(`[seed] created client Organization ${org.id}`);
  } else if (!org.tenant_id) {
    // A partial run from before the tenant was resolved. Repair rather than duplicate.
    await org.update({ tenant_id: tenant.id });
    console.log(`[seed] backfilled tenant on Organization ${org.id}`);
  }

  let engagement = await DeliveryEngagement.findOne({ where: { organization_id: org.id } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({
      organization_id: org.id,
      tenant_id: tenant.id,
      name: 'Northwind Transit - arrivals platform',
      status: 'active',
    });
    console.log(`[seed] created DeliveryEngagement ${engagement.id}`);
  }

  let project = await DeliveryProject.findOne({ where: { slug: DEMO_PROJECT_SLUG } });
  if (!project) {
    project = await DeliveryProject.create({
      engagement_id: engagement.id,
      tenant_id: engagement.tenant_id,
      organization_id: org.id,
      name: 'Real-time arrivals board',
      slug: DEMO_PROJECT_SLUG,
      status: 'build',
      project_class: 'sandbox',
      business_problem: 'Riders cannot see accurate arrival times, so they call the depot.',
    });
    console.log(`[seed] created DeliveryProject ${project.id}`);
  }

  // --- membership: the thing that actually grants access ------------------------------
  const [membership, created] = await DeliveryProjectMember.findOrCreate({
    where: { delivery_project_id: project.id, platform_identity_id: identity.id },
    defaults: {
      delivery_project_id: project.id,
      platform_identity_id: identity.id,
      role: 'client_reviewer',
    },
  });
  console.log(`[seed] membership ${membership.id} (${created ? 'created' : 'existing'})`);

  // --- a couple of decisions so the surface has something real to show --------------------
  const decisionSeed = [
    {
      title: 'Arrivals refresh every 30 seconds',
      rationale: "Balances freshness against the transit feed rate limit and data cost.",
      status: 'approved',
      requires_client_approval: false,
    },
    {
      title: 'Screen-reader announcements on arrival change',
      rationale: 'Required for the accessibility commitment in the contract.',
      status: 'proposed',
      requires_client_approval: true,
    },
  ];
  for (const d of decisionSeed) {
    const [, madeNew] = await DeliveryDecision.findOrCreate({
      where: { delivery_project_id: project.id, title: d.title },
      defaults: { delivery_project_id: project.id, decision_type: 'design', ...d },
    });
    if (madeNew) console.log(`[seed] decision: ${d.title}`);
  }

  // --- mint the session, through the real path ----------------------------------------
  // Same audience, same TTL, and NO role claim - exactly what the Google route produces.
  const token = jwt.sign(
    {
      sub: identity.id,
      email,
      display_name: identity.display_name ?? email,
      token_type: CLIENT_TOKEN_TYPE,
      delivery_project_ids: [project.id],
    },
    env.jwtSecret,
    { audience: CLIENT_TOKEN_AUDIENCE, expiresIn: CLIENT_TOKEN_TTL_SECONDS },
  );

  console.log('\n=== CLIENT SESSION (dev only, valid 8 hours) ===');
  console.log(token);
  console.log('\nPaste this into the browser console on the dev host, then reload:');
  console.log(`localStorage.setItem('delivery_client_token','${token}')`);
  console.log('\nThen open: /client/projects');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[seed] FAILED: ${err.message}`);
    process.exit(1);
  });
