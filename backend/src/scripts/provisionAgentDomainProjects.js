/**
 * provisionAgentDomainProjects — create the ten AI employee domain projects in production.
 *
 * Run `20261007-school-agent-factory` (T19), session CC-20261006-a4k7.
 *
 * ## How to run it
 *
 *   # DRY RUN first, always. Writes nothing; prints what WOULD be written.
 *   docker exec accelerator-backend node src/scripts/provisionAgentDomainProjects.js
 *
 *   # The real run.
 *   docker exec accelerator-backend node src/scripts/provisionAgentDomainProjects.js --apply
 *
 * `--apply` is required because the default has to be the safe one. A script whose default writes
 * is a script that writes when somebody is exploring.
 *
 * ## Why it requires out of `dist`
 *
 * Production runs `node dist/server.js`, so the provisioner is compiled. This is the pattern the
 * repo already uses for scripts that need real services (`auditClassDecks.js:36`,
 * `backfillAgentAttribution.js:30`): require the COMPILED module, so the code that runs here is
 * byte-for-byte the code the server runs — and, critically, so `Project`'s model hooks fire. A
 * re-implementation in this file would be a second path, which is the thing the hooks exist to
 * prevent.
 *
 * ## What it writes, and what it refuses
 *
 * Five tables, declared in `agentDomainProvisionPlan.ts` and enumerated by its test:
 * `projects` (through the model, so the lifecycle hook fires), `agent_domain_projects`,
 * `student_task_lists`, `student_tasks`, and `project_lifecycle_states` — the last written BY THE
 * HOOK inside the same transaction, not by the provisioner.
 *
 * It writes ZERO rows to `agent_domain_build_authorizations`, because an authorization records a
 * named human's approval and nobody has approved a build.
 *
 * It never calls `createNewProjectForEnrollment` (which always creates AND ACTIVATES), never
 * calls `publishBuild`, never writes `enrollments.active_project_id`, never adds to the agent
 * registry and never writes `ai_agents`. Those are asserted by name in the provisioner's test, not
 * promised here.
 *
 * ## Rollback
 *
 * The ten project ids are DERIVED, so they are knowable before the run and printed by the dry run.
 * To undo:
 *
 *   DELETE FROM student_tasks             WHERE project_id         IN (<the ten>);
 *   DELETE FROM student_task_lists        WHERE project_id         IN (<the ten>);
 *   DELETE FROM agent_domain_projects     WHERE student_project_id IN (<the ten>);
 *   DELETE FROM project_lifecycle_states  WHERE student_project_id IN (<the ten>);
 *   DELETE FROM projects                  WHERE id                 IN (<the ten>);
 *
 * In that order: the models' foreign keys do NOT declare ON DELETE CASCADE, so a bare delete of
 * the parent is refused rather than cascading. No legacy row is touched by this script, so there
 * is nothing else to restore.
 *
 * ## Idempotency
 *
 * Safe to re-run. Every id is derived, every insert is `ON CONFLICT DO NOTHING`, and the project
 * goes through `findOrCreate` — so a second run reports zero inserts and `already_present: true`.
 * Proven against real Postgres in `agentDomainProvisioner.concurrency.integration.test.ts`, not
 * asserted here.
 */

const APPLY = process.argv.includes('--apply');
// Rows provisioned before the anchor INSERT carried `manager_can_reach` and `manager_blocker`
// landed with NULL in both. This brings them in line with the registry's measured values; it
// is idempotent and reports how many rows it actually changed.
const RECONCILE = process.argv.includes('--reconcile-anchor-metadata');

async function main() {
  const { sequelize } = require('/app/dist/config/database');
  const {
    provisionAllDomains,
    reconcileAnchorMetadata,
  } = require('/app/dist/services/agentDomain/agentDomainProvisioner');
  const {
    planAllProvisions,
    allPlannedIds,
    PROVISIONER_WRITE_SET,
    TABLE_DELIBERATELY_UNWRITTEN,
  } = require('/app/dist/services/agentDomain/agentDomainProvisionPlan');

  const plans = planAllProvisions();
  const ids = allPlannedIds();

  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY RUN (writes nothing)',
    domains: plans.length,
    releases: plans.reduce((n, p) => n + p.releases.length, 0),
    stories: plans.reduce((n, p) => n + p.stories.length, 0),
    declared_write_set: PROVISIONER_WRITE_SET,
    deliberately_unwritten: TABLE_DELIBERATELY_UNWRITTEN,
  }, null, 2));

  // The rollback record, printed BEFORE anything is written so it exists even if the run fails
  // halfway. Ten transactions, one per domain, so a failure leaves whole projects behind rather
  // than fragments — but the ids are what make either state undoable.
  console.log('\n--- ROLLBACK RECORD: the ten derived project ids ---');
  for (const p of plans) {
    console.log(`${p.domain_key.padEnd(20)} project=${p.project_id}  anchor=${p.anchor_id}`);
  }
  console.log(`\nreleases: ${ids.releases.length}  stories: ${ids.stories.length}`);

  if (RECONCILE) {
    if (!APPLY) {
      console.log('\n--reconcile-anchor-metadata needs --apply as well. Nothing written.');
      await sequelize.close();
      return;
    }
    console.log('\n--- RECONCILING ANCHOR METADATA ---');
    const results = await reconcileAnchorMetadata({ sequelize, provisionedBy: 'CC-20261006-a4k7/T19' });
    for (const r of results) {
      console.log(
        `${r.domain_key.padEnd(20)} ${r.changed ? 'UPDATED' : 'already correct'}  `
        + `can_reach=${r.manager_can_reach}  blocker=${r.manager_blocker ? r.manager_blocker.slice(0, 50) : 'none'}`,
      );
    }
    console.log(JSON.stringify({ changed: results.filter((r) => r.changed).length }, null, 2));
    await sequelize.close();
    return;
  }

  if (!APPLY) {
    console.log('\nDRY RUN complete. Nothing was written. Re-run with --apply to provision.');
    await sequelize.close();
    return;
  }

  console.log('\n--- APPLYING ---');
  const result = await provisionAllDomains({
    sequelize,
    // A real actor string, not a placeholder: this is recorded on every anchor as `provisioned_by`.
    provisionedBy: 'CC-20261006-a4k7/T19',
  });

  console.log('\n--- RESULT ---');
  for (const r of result.provisioned) {
    const total = Object.values(r.inserted).reduce((a, b) => a + b, 0);
    console.log(
      `${r.domain_key.padEnd(20)} ${r.already_present ? 'ALREADY PRESENT' : 'created'}  `
      + `rows=${total}  ${JSON.stringify(r.inserted)}`,
    );
  }
  if (result.failed.length > 0) {
    console.log('\n--- FAILED (named, not counted) ---');
    for (const f of result.failed) {
      console.log(`${f.domain_key.padEnd(20)} ${f.error_class}: ${f.message}`);
    }
  }
  console.log(JSON.stringify({
    provisioned: result.provisioned.length,
    failed: result.failed.length,
    // Said out loud: provisioning is not readiness and not activation.
    note: 'Projects exist at lifecycle stage `discovery`. No agent is built, no autonomy level is '
      + 'set, no access is granted, and no build is authorized.',
  }, null, 2));

  await sequelize.close();
  if (result.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'provision_agent_domain_projects_failed',
    error_class: err && err.constructor ? err.constructor.name : 'UnknownError',
    message: err && err.message ? err.message : String(err),
  }));
  process.exitCode = 1;
});
