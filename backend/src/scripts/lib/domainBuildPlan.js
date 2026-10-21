/**
 * Derive a BuildPlan for an agent-domain project FROM ITS OWN TASK ROWS. PURE.
 *
 * ## Why this exists
 *
 * The ten agent-domain projects were created by `agentDomainProvisioner`, never by the Student
 * Build Pipeline's publish path, so they carry ZERO `build_plans` rows. Four things break as a
 * result, and the worst is not the one that got reported:
 *
 *   1. `buildVerificationService` returns `NoPublishedPlan` and stops BEFORE reading any
 *      acceptance criteria, so no intern commit can ever mark anything complete. The whole
 *      grading loop is dead for all seven interns.
 *   2. Documents cannot be downloaded ("finish the build wizard first"). Reported independently
 *      by two interns.
 *   3. The import guard asked `hasPublishedBuild`, which was false for all ten, so a stale
 *      browser tab could overwrite a whole project. Patched by PR #3241; this is the root.
 *   4. No STORY-000 on any of the ten.
 *
 * ## Why DERIVE the plan rather than re-run the build wizard
 *
 * The wizard's publish path RE-MATERIALIZES every task row. The ten projects now hold 503
 * stories carrying acceptance criteria and due dates that took real work, and four interns have
 * connected repositories against them. Re-running it to fix a download button would rewrite work
 * in flight.
 *
 * Deriving the plan from the tasks also makes a stronger guarantee than publishing would: the
 * plan cannot disagree with the tasks about what a story asks for, because it is built from
 * them. That disagreement is exactly what made this bug confusing - the portal read criteria
 * from `student_tasks.acceptance` while the verifier read them from the plan.
 *
 * ## What is honestly absent
 *
 * `requirements` is EMPTY, and that is a true statement rather than a gap being papered over.
 * Measured across all 503 stories: 0 carry a `requirement_key`, 0 carry `fulfills`, 0 carry an
 * `owner_agent`. These projects were provisioned from capability records, not from a
 * requirements document, so there is nothing to trace a story back to. Inventing requirements
 * to fill the field would put fiction into the artifact the gate and the docs both read.
 *
 * Same reasoning for `week_start` / `week_end`: no source column, so 0 rather than a guess.
 */
const { createHash } = require('crypto');

/**
 * Recursively sort object keys. A JS port of `backend/src/utils/canonicalHash.ts`, which is
 * TypeScript and therefore not requirable from a plain `.js` operational script running on the
 * host.
 *
 * `__tests__/domainBuildPlan.test.ts` asserts this produces byte-identical output to the real
 * `canonicalJson`/`hashCanonical` for a set of plans, so the day the two diverge a test fails
 * rather than a publish being rejected as tampered.
 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

/** Stable JSON. The exact bytes that get hashed. */
function canonicalJson(value) {
  const s = JSON.stringify(canonicalize(value));
  return s === undefined ? 'null' : s;
}

/** SHA-256 of the canonical form, matching `planHash.hashPlan`. */
function hashPlan(plan) {
  return createHash('sha256').update(canonicalJson(plan), 'utf8').digest('hex');
}

/**
 * The release label a story's own prompt declares, e.g. `**Release:** Discovery and validation`.
 *
 * Read from the prompt rather than hardcoded, so the plan keeps using the programme's own words
 * even if the release names change. Falls back to the key, which is honest: an unnamed release
 * is better than a name this module made up.
 */
function releaseNameFrom(tasks, releaseKey) {
  for (const t of tasks) {
    if (t.release_key !== releaseKey) continue;
    const m = String(t.build || '').match(/\*\*Release:\*\*\s*([^\n·|]+)/);
    if (m) {
      const name = m[1].trim();
      if (name) return name;
    }
  }
  return releaseKey;
}

const asArray = (v) => (Array.isArray(v) ? v : []);
const asStrings = (v) => asArray(v).filter((x) => typeof x === 'string');

/**
 * Build the plan.
 *
 * @param {object} args
 * @param {string} args.projectName
 * @param {string} args.descriptor    one line describing the domain
 * @param {Array}  args.tasks         rows from `student_tasks`, already scoped to one project
 * @returns {{plan: object, warnings: string[]}}
 */
function buildPlanFromTasks({ projectName, descriptor, tasks }) {
  const warnings = [];
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('refusing to build a plan from zero tasks');
  }

  // Release order is the key's own order (r0, r1, r2 ...), not insertion order, so the plan is
  // stable whatever order the rows arrive in.
  const keys = [...new Set(tasks.map((t) => t.release_key).filter(Boolean))].sort();
  const releases = keys.map((key) => ({
    key,
    name: releaseNameFrom(tasks, key),
    goal: `Deliver every ${key} story for ${projectName}.`,
    demo: `The ${key} documents exist in the repository and their acceptance criteria are met.`,
    // No source column for a week window on these projects. 0 says "unknown" rather than
    // inventing a schedule the programme never set.
    week_start: 0,
    week_end: 0,
  }));

  const stories = tasks
    .slice()
    .sort((a, b) => String(a.story_id).localeCompare(String(b.story_id)))
    .map((t) => {
      const acceptance = asStrings(t.acceptance);
      if (acceptance.length === 0) {
        // A story with no criteria can never be verified: the contract refuses vacuous truth.
        // Report it rather than shipping a plan that silently cannot grade it.
        warnings.push(`${t.story_id}: no acceptance criteria`);
      }
      return {
        id: String(t.story_id),
        release: String(t.release_key || ''),
        title: String(t.title || t.story_id),
        narrative: String(t.narrative || ''),
        // Genuinely empty on these projects; see the header.
        fulfills: asStrings(t.fulfills),
        owner_agent: String(t.owner_agent || ''),
        acceptance,
        task_guidance: String(t.build || ''),
        failure_paths: [],
      };
    });

  const ids = stories.map((s) => s.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`duplicate story ids in plan: ${[...new Set(dupes)].join(', ')}`);

  return {
    plan: {
      project_name: String(projectName),
      descriptor: String(descriptor),
      requirements: [],
      releases,
      stories,
    },
    warnings,
  };
}

module.exports = { buildPlanFromTasks, canonicalJson, hashPlan, canonicalize, releaseNameFrom };
