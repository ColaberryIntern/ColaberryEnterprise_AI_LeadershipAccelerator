/**
 * Pull the authored acceptance criterion out of a rendered domain story.
 *
 * WHY THIS EXISTS. The ten agent-domain projects were provisioned by
 * `agentDomainProvisioner`, and `agentDomainStoryTemplates.ts` renders each capability's
 * authored criterion into the story prose as `Acceptance: <text>`, immediately before the
 * `## Before you start` heading. It never wrote that text into `student_tasks.acceptance`,
 * which is the field the verifier actually reads
 * (`services/sbp/verification/storyVerificationRead.ts`). The criteria were therefore real
 * and invisible at the same time, and because
 * `docs/BUILD_VERIFICATION_CONTRACT.md` refuses vacuous truth ("a story the plan gave no
 * acceptance criteria can never be verified"), every one of those stories was permanently
 * ungradeable.
 *
 * So this is a MIGRATION of text a human already wrote, not a generator of criteria. That
 * distinction is the whole point: nothing here invents a standard for somebody else's work.
 *
 * It returns null rather than a guess whenever the shape is not found, so the caller can
 * REPORT an unparsable story instead of silently skipping it. A migration that quietly
 * covers 90% of rows and says "done" is the failure mode this guards against.
 */

/** Shortest text we will accept as a real criterion. Guards against `Acceptance: n/a`. */
const MIN_CRITERION_LENGTH = 20;

const MARKER = 'Acceptance:';

/**
 * @param {string} prose The rendered story text (narrative and/or build prompt).
 * @returns {string|null} The criterion with whitespace collapsed, or null if absent/too short.
 */
function extractCriterion(prose) {
  if (typeof prose !== 'string' || prose.length === 0) return null;

  const at = prose.indexOf(MARKER);
  if (at < 0) return null;

  let rest = prose.slice(at + MARKER.length);

  // The criterion ends at the next markdown heading. The newline is required so that a `#`
  // used mid-sentence ("tracked as issue #3") does not truncate the criterion.
  const heading = rest.search(/\n[ \t]*#{1,6}[ \t]/);
  if (heading >= 0) rest = rest.slice(0, heading);

  const text = rest.replace(/\s+/g, ' ').trim();
  return text.length >= MIN_CRITERION_LENGTH ? text : null;
}

module.exports = { extractCriterion, MIN_CRITERION_LENGTH, MARKER };
