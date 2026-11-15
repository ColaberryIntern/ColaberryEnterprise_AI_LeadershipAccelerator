/**
 * seedStaging.js - provisions a FRESH staging database so the Our Services journey spec can run against it.
 *
 * Runs INSIDE the staging backend container (it uses the built app's own models and the container's DATABASE_URL):
 *   docker compose -p sv41 -f compose.yml exec -T accelerator-backend node /seed/seedStaging.js
 *
 * What it does, idempotently (a second run changes nothing):
 *   1. Creates any missing table from the Sequelize models. Production boot runs its ALTER-style schema steps BEFORE
 *      any create, so the backend cannot boot on an empty database; this step is what makes a fresh stack bootable.
 *      Models are synced one by one over several passes (foreign keys resolve as their targets appear), and a model
 *      that still fails is REPORTED, never hidden.
 *   2. Ensures the `refactored` tenant and the "Colaberry Government Contracts" workspace exist, which every Our Services
 *      route needs (no workspace = 503).
 *
 * REFUSES to run against anything that does not look like a staging database: the database name must contain
 * "preview" or "staging". Production's database name does not, so pointing this at production exits 2 having written
 * nothing.
 *
 * Exit 0 = seeded · 1 = a step failed · 2 = refused (not a staging database).
 */
const path = require('path');

const APP = process.env.APP_DIST || '/app/dist';
const dbUrl = process.env.DATABASE_URL || '';
const dbName = (() => { try { return new URL(dbUrl).pathname.replace(/^\//, ''); } catch { return ''; } })();
const log = (event, outcome, context = {}) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'our-services-staging-seed', event, outcome, context }));

if (!/(preview|staging)/i.test(dbName)) {
  log('seed_refused', 'failure', { reason: `database "${dbName || '(unset)'}" is not a staging database` });
  process.exit(2);
}

(async () => {
  const models = require(path.join(APP, 'models'));
  const sequelize = models.sequelize || require(path.join(APP, 'config', 'database')).sequelize;

  // 1. Tables. Several passes so a table whose foreign key target is created later in the same pass still lands.
  let pending = Object.values(sequelize.models);
  const errors = {};
  for (let pass = 0; pass < 6 && pending.length; pass += 1) {
    const stillPending = [];
    for (const model of pending) {
      try { await model.sync(); } catch (err) { stillPending.push(model); errors[model.name] = String(err && err.message).slice(0, 160); }
    }
    if (stillPending.length === pending.length) break;
    pending = stillPending;
  }
  log('seed_tables', pending.length ? 'partial' : 'success', { unsynced: pending.map((m) => ({ model: m.name, error: errors[m.name] })) });

  // 2. The gov workspace. ON CONFLICT keeps this a no-op on a re-run.
  // id and timestamps are explicit: a table created from the model (step 1) has no database-side defaults.
  await sequelize.query(
    "INSERT INTO tenants (id, slug, name, tenant_type, status, created_at, updated_at) VALUES (gen_random_uuid(), 'refactored', 'Refactored (staging)', 'commercial', 'active', now(), now()) ON CONFLICT (slug) DO NOTHING");
  const { resolveGovContractsContainer } = require(path.join(APP, 'scripts', 'lib', 'factoryDemoContainer'));
  const container = await resolveGovContractsContainer();
  log('seed_gov_workspace', 'success', { tenant: container.tenant.id, org: container.org.id, engagement: container.engagement.id });
  await sequelize.close();
  process.exit(0);
})().catch((err) => {
  log('seed_failed', 'failure', { error_class: err && err.constructor ? err.constructor.name : 'Error', message: String(err && err.message) });
  process.exit(1);
});
