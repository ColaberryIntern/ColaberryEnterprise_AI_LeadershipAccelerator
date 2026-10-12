/**
 * The governed front door: create a project so that it CANNOT exist without a lifecycle.
 *
 * P6-T6. This is the skill's committed script, and it is the thing the skill's acceptance is
 * measured against rather than the Markdown beside it. Cycle 1 of this task asserted the front
 * door over the skill's prose, and the plan audit correctly called that a claim that can pass
 * without any behaviour behind it.
 *
 * ## It does not register anything itself
 *
 * Registration is an `afterCreate` hook on the `DeliveryProject` MODEL. That is the whole design
 * of P6-T1a and the reason this script has no INSERT in it: the hook fires for every creation
 * path, including the one (`services/factory/govDeliveryProject.ts`) that landed three days after
 * the original chokepoint inventory was taken and was therefore missing from it. A front door
 * that did its own registration would be a fourth path to keep in sync.
 *
 * So what this script does is narrower and more useful: it creates through the model, then
 * VERIFIES the lifecycle row landed, and exits non-zero if it did not. A creation that silently
 * failed to register is the exact failure LC-01 forbids, and it is invisible without this check.
 *
 * ## It REFUSES the student path, loudly
 *
 * Student `projects` rows do not register lifecycles yet (P6-T1b, blocked on one decision). A
 * front door that accepted `--kind student` and quietly created an ungoverned project would be
 * worse than no front door, because it would carry the authority of this skill while doing the
 * thing the skill exists to prevent. So it refuses and names the blocker.
 *
 * ## Usage
 *
 *   node .claude/skills/project-lifecycle/scripts/registerGovernedProject.js  *     --kind delivery --tenant <uuid> --engagement <uuid> --name "Acme Intake Automation"
 *
 * Reads `DATABASE_URL` from the environment like every other script in this repo. Never writes
 * to production from a developer machine: point it at a scratch database.
 */

/** Thrown for every refusal, so a caller can tell a refusal from a crash. */
class GovernanceRefusal extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'GovernanceRefusal';
    this.reason = reason;
  }
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

/**
 * Create one governed project and prove it registered.
 *
 * Returns `{ projectId, lifecycleId, stage }`. Throws `GovernanceRefusal` for an ungoverned
 * request, and a plain `Error` if the hook did not produce a row.
 *
 * `deps` is injected by the test so the behaviour under test is this function and not a mock of
 * it. Production passes nothing and the real model and connection are resolved here.
 */
async function registerGovernedProject(input, deps = {}) {
  const kind = input.kind;

  if (kind === 'student') {
    // NAMED, not a generic refusal. An operator reading this has to know it is a known gap with
    // an owner, not a bug in their invocation.
    throw new GovernanceRefusal(
      'student_lifecycle_unregistered',
      'Refusing to create a student project through this front door. Student `projects` rows do '
      + 'not register a lifecycle yet (P6-T1b): there is no tenant column on `projects` and no '
      + 'table on its join path carries one, so the registration hook has nothing to key on. '
      + 'Creating one here would produce an ungoverned project with this skill\'s authority '
      + 'behind it. Use the Student Build Pipeline (`build-student-project`) until P6-T1b lands, '
      + 'and do not treat its output as lifecycle-governed.',
    );
  }
  if (kind !== 'delivery') {
    throw new GovernanceRefusal('unknown_kind', `unknown --kind "${kind}" (expected delivery or student)`);
  }
  for (const field of ['tenantId', 'engagementId', 'name']) {
    if (!input[field]) throw new GovernanceRefusal('missing_input', `--${field} is required`);
  }

  // RESOLVED FROM THE COMPILED OUTPUT, not from `src`. This is a plain Node script and the
  // backend is TypeScript, so `backend/src/...` cannot be required at all -- the first draft of
  // this file pointed there and would have failed on its first real invocation with a module
  // resolution error that reads like a missing file. Every other skill script in this repo that
  // needs a backend module does the same thing (the Basecamp and Case Study scripts require
  // `/app/dist/...` inside the container).
  //
  // `deps` is what the test injects, so the test drives the TypeScript model directly and does
  // not need a build to run.
  const resolveDist = (rel) => {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return require(require('path').resolve(__dirname, '../../../../backend/dist', rel));
    } catch (err) {
      throw new Error(
        `cannot load backend/dist/${rel} (${err.code || err.name}). Build the backend first: `
        + '`cd backend && npx tsc -p tsconfig.json`. This script runs against compiled output '
        + 'because the backend is TypeScript and this is a plain Node script.',
      );
    }
  };
  const sequelize = deps.sequelize ?? resolveDist('config/database').sequelize;
  const DeliveryProject = deps.DeliveryProject ?? resolveDist('models/DeliveryProject').default;

  // THROUGH THE MODEL. The hook is an `afterCreate` on this model, so a raw INSERT here would
  // create exactly the ungoverned row this script exists to make impossible. There is no SQL in
  // this file and a test asserts that there is none.
  const project = await DeliveryProject.create({
    tenant_id: input.tenantId,
    engagement_id: input.engagementId,
    name: input.name,
    slug: input.slug || slugify(input.name),
    project_class: input.projectClass || 'sandbox',
    status: 'discovery',
  });

  // VERIFY, rather than assume the hook fired. The hook deliberately does not catch its own
  // errors, so a failure surfaces as a thrown create -- but a hook that was never WIRED would
  // let the create succeed and register nothing, and that is silent without this read.
  const [row] = await sequelize.query(
    `SELECT id, stage, tenant_id
       FROM project_lifecycle_states
      WHERE delivery_project_id = $1`,
    { bind: [project.id], type: 'SELECT' },
  );
  if (!row) {
    throw new Error(
      `GOVERNANCE FAILURE: delivery project ${project.id} was created with NO lifecycle row. `
      + 'The afterCreate hook on DeliveryProject is not wired, or it was removed. This is the '
      + 'condition LC-01 forbids and the project should be treated as ungoverned.',
    );
  }
  if (row.tenant_id !== input.tenantId) {
    throw new Error(
      `GOVERNANCE FAILURE: lifecycle row for ${project.id} carries tenant ${row.tenant_id}, `
      + `not the requested ${input.tenantId}.`,
    );
  }

  return { projectId: project.id, lifecycleId: row.id, stage: row.stage };
}

/**
 * CLI flags to input fields.
 *
 * EXPLICIT, because the first draft derived the field name from the flag by camel-casing it:
 * `--tenant` became `tenant`, the function required `tenantId`, and the invocation written in
 * this file's own header would have refused with `missing_input` every single time. That is the
 * same defect class a Phase 4 handoff was failed for three times -- a document that disproves
 * its own example -- so `ARG_ALIASES` is the mapping and a test runs the documented command.
 */
const ARG_ALIASES = {
  kind: 'kind',
  tenant: 'tenantId',
  'tenant-id': 'tenantId',
  engagement: 'engagementId',
  'engagement-id': 'engagementId',
  name: 'name',
  slug: 'slug',
  class: 'projectClass',
  'project-class': 'projectClass',
};

function parseArgs(argv) {
  const out = {};
  const unknown = [];
  for (let i = 0; i < argv.length; i += 2) {
    const flag = String(argv[i]).replace(/^--/, '');
    const field = ARG_ALIASES[flag];
    // An unrecognised flag is REPORTED, not dropped. A silently ignored `--tenant-id` would
    // read as a missing argument and send the operator looking in the wrong place.
    if (!field) { unknown.push(flag); continue; }
    out[field] = argv[i + 1];
  }
  if (unknown.length) out.__unknown = unknown;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.__unknown) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      outcome: 'failure', error_class: 'GovernanceRefusal', reason: 'unknown_flag',
      message: `unrecognised flag(s): ${args.__unknown.join(', ')}. Known: `
        + Object.keys(ARG_ALIASES).map((f) => `--${f}`).join(' '),
    }));
    process.exit(1);
  }
  try {
    const result = await registerGovernedProject(args);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ outcome: 'success', ...result }));
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      outcome: 'failure',
      error_class: err.name,
      reason: err.reason || null,
      message: err.message,
    }));
    process.exit(1);
  }
}

module.exports = { registerGovernedProject, GovernanceRefusal, slugify, parseArgs, ARG_ALIASES };

if (require.main === module) main();
